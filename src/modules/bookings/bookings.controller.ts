import { Request, Response } from 'express';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../config/db';
import { generateBookingRef, generateInvoiceNumber, paginate, paginateMeta } from '../../shared/helpers';
import { sendEmail, bookingConfirmationEmail, bookingStatusEmail } from '../../shared/email.templates';
import { generateInvoicePdf } from '../invoices/pdf.generator';

const bookingInclude = {
  company: { select: { id: true, name: true, email: true } },
  hotel: { select: { id: true, name: true, city: true, country: true } },
  room: { select: { id: true, type: true, pricePerNight: true } },
  createdBy: { select: { id: true, name: true } },
  invoice: { select: { id: true, invoiceNumber: true, status: true, total: true } },
};

export async function listBookings(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const page = parseInt(String(req.query.page ?? '1'));
  const limit = parseInt(String(req.query.limit ?? '20'));
  const { skip, take } = paginate(page, limit);

  const companyFilter =
    caller.role === 'SUPERADMIN'
      ? req.query.companyId ? { companyId: String(req.query.companyId) } : {}
      : { companyId: caller.companyId! };

  const where = {
    ...companyFilter,
    ...(req.query.status && { status: req.query.status as 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' }),
    ...(req.query.type && { type: req.query.type as 'HOTEL' | 'FLIGHT' | 'PACKAGE' }),
    ...(req.query.from && { createdAt: { gte: new Date(String(req.query.from)) } }),
    ...(req.query.to && { createdAt: { lte: new Date(String(req.query.to)) } }),
  };

  const [bookings, total] = await Promise.all([
    prisma.booking.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: bookingInclude }),
    prisma.booking.count({ where }),
  ]);

  res.json({ success: true, data: bookings, meta: paginateMeta(total, page, limit) });
}

export async function createBooking(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const body = req.body as {
    type: 'HOTEL' | 'FLIGHT' | 'PACKAGE';
    companyId?: string; hotelId?: string; roomId?: string;
    checkIn?: string; checkOut?: string; nights?: number;
    origin?: string; destination?: string;
    departureDate?: string; returnDate?: string;
    airline?: string; flightNumber?: string;
    cabinClass?: 'ECONOMY' | 'BUSINESS' | 'FIRST';
    passengerNames?: string[];
    adultsCount?: number; childrenCount?: number; infantsCount?: number;
    baseAmount: number; discount?: number; currency?: string; notes?: string;
  };

  const companyId = caller.role === 'SUPERADMIN' ? (body.companyId ?? caller.companyId!) : caller.companyId!;
  if (!companyId) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'companyId is required' });
    return;
  }

  const baseAmount = new Decimal(body.baseAmount);
  const discount = new Decimal(body.discount ?? 0);
  const totalAmount = baseAmount.sub(discount);

  let result: { booking: { id: string; refNumber: string }; invoice: { id: string; invoiceNumber: string } };

  try {
    result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { balance: true, creditLimit: true, isActive: true },
      });

      if (!company.isActive) throw new Error('COMPANY_INACTIVE');
      if (company.balance.lt(totalAmount)) throw new Error('INSUFFICIENT_BALANCE');

      const refNumber = await generateBookingRef(prisma);
      const invoiceNumber = await generateInvoiceNumber(prisma);

      const balanceBefore = company.balance;
      const balanceAfter = company.balance.sub(totalAmount);

      await tx.company.update({ where: { id: companyId }, data: { balance: balanceAfter } });

      const booking = await tx.booking.create({
        data: {
          refNumber,
          type: body.type,
          companyId,
          createdById: caller.id,
          hotelId: body.hotelId,
          roomId: body.roomId,
          checkIn: body.checkIn ? new Date(body.checkIn) : null,
          checkOut: body.checkOut ? new Date(body.checkOut) : null,
          nights: body.nights,
          origin: body.origin,
          destination: body.destination,
          departureDate: body.departureDate ? new Date(body.departureDate) : null,
          returnDate: body.returnDate ? new Date(body.returnDate) : null,
          airline: body.airline,
          flightNumber: body.flightNumber,
          cabinClass: body.cabinClass,
          passengerNames: body.passengerNames ?? [],
          adultsCount: body.adultsCount ?? 1,
          childrenCount: body.childrenCount ?? 0,
          infantsCount: body.infantsCount ?? 0,
          baseAmount,
          discount,
          totalAmount,
          currency: body.currency ?? 'USD',
          notes: body.notes,
        },
      });

      await tx.walletTransaction.create({
        data: {
          companyId,
          type: 'DEBIT',
          amount: totalAmount,
          balanceBefore,
          balanceAfter,
          reference: refNumber,
          description: `Booking ${refNumber}`,
          createdById: caller.id,
        },
      });

      const subtotal = totalAmount;
      const taxAmount = subtotal.mul(new Decimal('0.14'));
      const total = subtotal.add(taxAmount);

      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber,
          bookingId: booking.id,
          companyId,
          subtotal,
          taxAmount,
          total,
          currency: body.currency ?? 'USD',
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      return { booking, invoice };
    });
  } catch (err) {
    const message = String((err as Error).message);
    if (message === 'COMPANY_INACTIVE') {
      res.status(400).json({ success: false, error: 'COMPANY_INACTIVE', message: 'Company account is inactive' });
    } else if (message === 'INSUFFICIENT_BALANCE') {
      res.status(400).json({ success: false, error: 'INSUFFICIENT_BALANCE', message: 'Insufficient wallet balance' });
    } else {
      console.error(err);
      res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
    return;
  }

  const fullBooking = await prisma.booking.findUnique({ where: { id: result.booking.id }, include: bookingInclude });
  const fullInvoice = await prisma.invoice.findUnique({
    where: { id: result.invoice.id },
    include: {
      booking: {
        include: {
          company: true,
          hotel: true,
        },
      },
    },
  });

  if (fullInvoice) {
    generateInvoicePdf(fullInvoice as Parameters<typeof generateInvoicePdf>[0])
      .then(async ({ path: pdfPath }) => {
        await prisma.invoice.update({ where: { id: fullInvoice.id }, data: { pdfPath } });
      })
      .catch(console.error);
  }

  if (fullBooking) {
    const { subject, html } = bookingConfirmationEmail(fullBooking);
    const company = fullBooking.company;
    if (company) {
      sendEmail([company.email, process.env.INTERNAL_TEAM_EMAIL!], subject, html).catch(console.error);
    }
  }

  res.status(201).json({ success: true, data: fullBooking });
}

export async function getBooking(req: Request, res: Response): Promise<void> {
  const booking = await prisma.booking.findUnique({
    where: { id: req.params.id },
    include: bookingInclude,
  });

  if (!booking) {
    res.status(404).json({ success: false, error: 'NOT_FOUND' });
    return;
  }

  res.json({ success: true, data: booking });
}

export async function confirmBooking(req: Request, res: Response): Promise<void> {
  const booking = await prisma.booking.update({
    where: { id: req.params.id },
    data: { status: 'CONFIRMED', confirmedAt: new Date() },
    include: bookingInclude,
  });

  const { subject, html } = bookingStatusEmail(booking, 'CONFIRMED');
  if (booking.company) {
    sendEmail([booking.company.email, process.env.INTERNAL_TEAM_EMAIL!], subject, html).catch(console.error);
  }

  res.json({ success: true, data: booking });
}

export async function cancelBooking(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const { reason } = req.body as { reason: string };

  const booking = await prisma.booking.findUniqueOrThrow({ where: { id: req.params.id } });

  if (caller.role !== 'SUPERADMIN' && booking.status !== 'PENDING') {
    res.status(400).json({ success: false, error: 'INVALID_STATUS', message: 'Can only cancel PENDING bookings' });
    return;
  }

  if (['CONFIRMED', 'PENDING'].includes(booking.status)) {
    await prisma.$transaction(async (tx) => {
      const company = await tx.company.findUniqueOrThrow({ where: { id: booking.companyId } });
      const balanceBefore = company.balance;
      const balanceAfter = balanceBefore.add(booking.totalAmount);

      await tx.company.update({ where: { id: booking.companyId }, data: { balance: balanceAfter } });
      await tx.walletTransaction.create({
        data: {
          companyId: booking.companyId,
          type: 'REFUND',
          amount: booking.totalAmount,
          balanceBefore,
          balanceAfter,
          reference: booking.refNumber,
          description: `Refund for cancelled booking ${booking.refNumber}`,
          createdById: caller.id,
        },
      });
      await tx.invoice.updateMany({
        where: { bookingId: booking.id },
        data: { status: 'CANCELLED' },
      });
    });
  }

  const updated = await prisma.booking.update({
    where: { id: req.params.id },
    data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: reason },
    include: bookingInclude,
  });

  const { subject, html } = bookingStatusEmail(updated, 'CANCELLED');
  if (updated.company) {
    sendEmail([updated.company.email, process.env.INTERNAL_TEAM_EMAIL!], subject, html).catch(console.error);
  }

  res.json({ success: true, data: updated });
}
