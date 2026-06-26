import { Request, Response } from 'express';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../config/db';
import { generateBookingRef, generateInvoiceNumber, paginate, paginateMeta } from '../../shared/helpers';
import { sendEmail, bookingConfirmationEmail, bookingRequestEmail, bookingStatusEmail } from '../../shared/email.templates';
import { generateInvoicePdf } from '../invoices/pdf.generator';
import { explicitMoney, invoiceMoneySnapshotData } from '../../shared/money';
import { resolveMarketMoney } from '../../shared/pricing';
import { buildInvoiceTotals } from '../../shared/invoicing';
import { debitWallet, refundWallet } from '../../shared/wallet';

const bookingInclude = {
  company: { select: { id: true, name: true, email: true } },
  hotel: { select: { id: true, name: true, city: true, country: true, commissionPercent: true } },
  room: { select: { id: true, type: true, pricePerNight: true } },
  createdBy: { select: { id: true, name: true } },
  confirmedBy: { select: { id: true, name: true } },
  invoice: { select: { id: true, invoiceNumber: true, status: true, total: true } },
};

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDateInput(value?: string): Date | null {
  if (!value) return null;
  const date = new Date(value.includes('T') ? value : `${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error('INVALID_DATE');
  return date;
}

function nightsBetween(checkIn: Date, checkOut: Date): number {
  return Math.ceil((checkOut.getTime() - checkIn.getTime()) / DAY_MS);
}

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
    ...(req.query.status && { status: req.query.status as 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'REJECTED' | 'COMPLETED' }),
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
    roomsCount?: number;
    baseAmount?: number; discount?: number; currency?: string; notes?: string;
  };

  // Hotel and Package bookings are now handled via QuoteRequest — not direct booking creation.
  // Only FLIGHT bookings (or SUPERADMIN manual overrides) can still use this endpoint.
  if (caller.role !== 'SUPERADMIN') {
    res.status(400).json({
      success: false,
      error: 'USE_QUOTE_REQUEST',
      message: 'Company users must submit quote requests. Use POST /api/quote-requests instead.',
    });
    return;
  }

  const companyId = caller.role === 'SUPERADMIN' ? (body.companyId ?? caller.companyId!) : caller.companyId!;
  if (!companyId) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'companyId is required' });
    return;
  }

  let result: { booking: { id: string; refNumber: string } };

  try {
    const company = await prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { isActive: true, market: true, currency: true },
    });
    if (!company.isActive) throw new Error('COMPANY_INACTIVE');

    const adultsCount = body.adultsCount ?? 1;
    const childrenCount = body.childrenCount ?? 0;
    const infantsCount = body.infantsCount ?? 0;
    const hotelId = body.hotelId;
    const roomId = body.roomId;
    const checkIn = parseDateInput(body.checkIn);
    const checkOut = parseDateInput(body.checkOut);
    const departureDate = parseDateInput(body.departureDate);
    const returnDate = parseDateInput(body.returnDate);
    let nights = body.nights ?? null;
    let roomsCount = body.roomsCount ?? 1;
    let sourceBaseAmount = new Decimal(0);
    let sourceCurrency = String(body.currency ?? 'USD').toUpperCase();
    let commissionPercent = new Decimal(0);
    let availableRooms = 0;

    if (body.type === 'HOTEL') {
      if (!hotelId) throw new Error('HOTEL_REQUIRED');
      if (!checkIn || !checkOut || checkOut <= checkIn) throw new Error('INVALID_HOTEL_DATES');
      const hotel = await prisma.hotel.findUnique({
        where: { id: hotelId },
        select: {
          id: true,
          pricePerNight: true,
          currency: true,
          commissionPercent: true,
          availableRooms: true,
          maxGuestsPerRoom: true,
          isActive: true,
        },
      });
      if (!hotel?.isActive) throw new Error('HOTEL_NOT_AVAILABLE');
      const datedPrice = await prisma.hotelPricing.findFirst({
        where: {
          hotelId,
          isActive: true,
          validFrom: { lte: checkIn },
          validTo: { gte: checkOut },
        },
        orderBy: { pricePerNight: 'asc' },
      });
      nights = nightsBetween(checkIn, checkOut);
      roomsCount = Math.max(
        1,
        Math.ceil(Math.max(1, adultsCount + childrenCount) / Math.max(1, hotel.maxGuestsPerRoom || 2)),
      );
      const marketMoney = await resolveMarketMoney(
        'HOTEL',
        hotel.id,
        { market: company.market, companyId, pax: adultsCount + childrenCount, date: checkIn },
        datedPrice?.pricePerNight ?? hotel.pricePerNight,
        datedPrice?.currency ?? hotel.currency ?? 'USD',
      );
      sourceBaseAmount = marketMoney.amount.mul(nights).mul(roomsCount);
      sourceCurrency = marketMoney.currency;
      commissionPercent = hotel.commissionPercent ?? new Decimal(0);
      availableRooms = hotel.availableRooms ?? 0;
    } else {
      if (!body.baseAmount || body.baseAmount <= 0) throw new Error('BASE_AMOUNT_REQUIRED');
      sourceBaseAmount = new Decimal(body.baseAmount);
    }

    const sourceCommission = sourceBaseAmount.mul(commissionPercent).div(100);
    const sourceDiscount = new Decimal(body.discount ?? 0);
    const sourceTotal = sourceBaseAmount.add(sourceCommission).sub(sourceDiscount);
    if (sourceTotal.lte(0)) throw new Error('INVALID_TOTAL');
    // Explicit admin price — used verbatim, NO FX (sourceCurrency is authoritative).
    const charge = explicitMoney(sourceTotal, sourceCurrency);
    const baseAmount = sourceBaseAmount.mul(charge.exchangeRate).toDecimalPlaces(2);
    const commissionAmount = sourceCommission.mul(charge.exchangeRate).toDecimalPlaces(2);
    const discount = sourceDiscount.mul(charge.exchangeRate).toDecimalPlaces(2);
    const refNumber = await generateBookingRef(prisma);

    result = await prisma.$transaction(async (tx) => {
      if (body.type === 'HOTEL' && hotelId && checkIn && checkOut && availableRooms > 0) {
        const occupied = await tx.booking.aggregate({
          _sum: { roomsCount: true },
          where: {
            hotelId,
            status: { in: ['PENDING', 'CONFIRMED', 'COMPLETED'] },
            checkIn: { lt: checkOut },
            checkOut: { gt: checkIn },
          },
        });
        if ((occupied._sum.roomsCount ?? 0) + roomsCount > availableRooms) {
          throw new Error('HOTEL_NOT_AVAILABLE');
        }
      }

      const booking = await tx.booking.create({
        data: {
          refNumber,
          type: body.type,
          companyId,
          createdById: caller.id,
          hotelId,
          roomId,
          checkIn,
          checkOut,
          nights,
          origin: body.origin,
          destination: body.destination,
          departureDate,
          returnDate,
          airline: body.airline,
          flightNumber: body.flightNumber,
          cabinClass: body.cabinClass,
          passengerNames: body.passengerNames ?? [],
          adultsCount,
          childrenCount,
          infantsCount,
          roomsCount,
          baseAmount,
          commissionPercent,
          commissionAmount,
          discount,
          totalAmount: charge.totalAmount,
          currency: charge.currency,
          sourceAmount: charge.sourceAmount,
          sourceCurrency: charge.sourceCurrency,
          exchangeRate: charge.exchangeRate,
          exchangeRateAt: charge.exchangeRateAt,
          notes: body.notes,
        },
      });
      return { booking };
    });
  } catch (err) {
    const message = String((err as Error).message);
    if (message === 'COMPANY_INACTIVE') {
      res.status(400).json({ success: false, error: 'COMPANY_INACTIVE', message: 'Company account is inactive' });
    } else if (['HOTEL_REQUIRED', 'INVALID_DATE', 'INVALID_HOTEL_DATES', 'BASE_AMOUNT_REQUIRED', 'INVALID_TOTAL'].includes(message)) {
      res.status(400).json({ success: false, error: message, message: 'Please complete the booking details' });
    } else if (message === 'HOTEL_NOT_AVAILABLE') {
      res.status(400).json({ success: false, error: 'HOTEL_NOT_AVAILABLE', message: 'Hotel is not available for the selected dates and guests' });
    } else {
      console.error(err);
      res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
    return;
  }

  const fullBooking = await prisma.booking.findUnique({ where: { id: result.booking.id }, include: bookingInclude });
  if (fullBooking) {
    const { subject, html } = bookingRequestEmail(fullBooking);
    const recipients = [process.env.INTERNAL_TEAM_EMAIL!].filter(Boolean);
    if (recipients.length) sendEmail(recipients, subject, html).catch(console.error);
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
  if (req.user!.role !== 'SUPERADMIN' && booking.companyId !== req.user!.companyId) {
    res.status(403).json({ success: false, error: 'FORBIDDEN' });
    return;
  }

  res.json({ success: true, data: booking });
}

export async function confirmBooking(req: Request, res: Response): Promise<void> {
  let bookingId = req.params.id;

  try {
    await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUniqueOrThrow({
        where: { id: bookingId },
        include: { company: true, invoice: true },
      });

      if (booking.status !== 'PENDING') throw new Error('INVALID_STATUS');
      if (!booking.company.isActive) throw new Error('COMPANY_INACTIVE');

      if (booking.hotelId && booking.checkIn && booking.checkOut) {
        const hotel = await tx.hotel.findUnique({
          where: { id: booking.hotelId },
          select: { availableRooms: true },
        });
        if ((hotel?.availableRooms ?? 0) > 0) {
          const occupied = await tx.booking.aggregate({
            _sum: { roomsCount: true },
            where: {
              id: { not: booking.id },
              hotelId: booking.hotelId,
              status: { in: ['CONFIRMED', 'COMPLETED'] },
              checkIn: { lt: booking.checkOut },
              checkOut: { gt: booking.checkIn },
            },
          });
          const occupiedRooms = occupied._sum.roomsCount ?? 0;
          if (occupiedRooms + booking.roomsCount > (hotel?.availableRooms ?? 0)) throw new Error('HOTEL_NOT_AVAILABLE');
        }
      }

      if (!booking.invoice) {
        await debitWallet(tx, {
          companyId: booking.companyId,
          amount: booking.totalAmount,
          reference: booking.refNumber,
          description: `Approved booking ${booking.refNumber}`,
          createdById: req.user!.id,
        });

        const invoiceNumber = await generateInvoiceNumber(prisma);
        const invoiceTotals = buildInvoiceTotals(booking.totalAmount);
        await tx.invoice.create({
          data: {
            invoiceNumber,
            bookingId: booking.id,
            companyId: booking.companyId,
            ...invoiceTotals,
            currency: booking.currency,
            ...invoiceMoneySnapshotData({
              sourceAmount: booking.sourceAmount ?? booking.totalAmount,
              sourceCurrency: booking.sourceCurrency ?? booking.currency,
              totalAmount: booking.totalAmount,
              currency: booking.currency,
              exchangeRate: booking.exchangeRate ?? new Decimal(1),
              exchangeRateAt: booking.exchangeRateAt ?? booking.createdAt,
            }),
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        });
      }

      await tx.booking.update({
        where: { id: booking.id },
        data: {
          status: 'CONFIRMED',
          confirmedAt: booking.confirmedAt ?? new Date(),
          confirmedById: booking.confirmedById ?? req.user!.id,
        },
      });
    });
  } catch (err) {
    const message = String((err as Error).message);
    if (message === 'INVALID_STATUS') {
      res.status(400).json({ success: false, error: 'INVALID_STATUS', message: 'Only pending requests can be approved' });
    } else if (message === 'COMPANY_INACTIVE') {
      res.status(400).json({ success: false, error: 'COMPANY_INACTIVE', message: 'Company account is inactive' });
    } else if (message === 'INSUFFICIENT_BALANCE') {
      res.status(400).json({ success: false, error: 'INSUFFICIENT_BALANCE', message: 'Insufficient wallet balance' });
    } else if (message === 'HOTEL_NOT_AVAILABLE') {
      res.status(400).json({ success: false, error: 'HOTEL_NOT_AVAILABLE', message: 'Hotel is not available for the selected dates and guests' });
    } else {
      console.error(err);
      res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
    return;
  }

  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: bookingInclude });
  const fullInvoice = await prisma.invoice.findUnique({
    where: { bookingId },
    include: { booking: { include: { company: true, hotel: true } } },
  });

  if (fullInvoice && !fullInvoice.pdfPath) {
    generateInvoicePdf(fullInvoice as unknown as Parameters<typeof generateInvoicePdf>[0])
      .then(async ({ path: pdfPath }) => {
        await prisma.invoice.update({ where: { id: fullInvoice.id }, data: { pdfPath } });
      })
      .catch(console.error);
  }

  if (booking) {
    const { subject, html } = bookingConfirmationEmail(booking);
    const emails = [booking.company?.email, process.env.INTERNAL_TEAM_EMAIL!].filter(Boolean) as string[];
    if (emails.length) sendEmail(emails, subject, html).catch(console.error);
  }

  res.json({ success: true, data: booking });
}

export async function cancelBooking(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const { reason } = req.body as { reason: string };

  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: req.params.id },
    include: { invoice: true },
  });

  if (caller.role !== 'SUPERADMIN' && booking.companyId !== caller.companyId) {
    res.status(403).json({ success: false, error: 'FORBIDDEN' });
    return;
  }

  if (caller.role !== 'SUPERADMIN' && booking.status !== 'PENDING') {
    res.status(400).json({ success: false, error: 'INVALID_STATUS', message: 'Can only cancel PENDING bookings' });
    return;
  }
  if (!['PENDING', 'CONFIRMED'].includes(booking.status)) {
    res.status(400).json({ success: false, error: 'INVALID_STATUS', message: 'Only pending or confirmed bookings can be cancelled' });
    return;
  }

  // Refund once (idempotent — only when a DEBIT exists and no REFUND yet).
  await prisma.$transaction((tx) =>
    refundWallet(tx, {
      companyId: booking.companyId,
      amount: booking.totalAmount,
      reference: booking.refNumber,
      description: `Refund for cancelled booking ${booking.refNumber}`,
      createdById: caller.id,
    }),
  );

  const updated = await prisma.$transaction(async (tx) => {
    await tx.invoice.updateMany({
      where: { bookingId: booking.id },
      data: { status: 'CANCELLED' },
    });
    return tx.booking.update({
      where: { id: req.params.id },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: reason },
      include: bookingInclude,
    });
  });

  const { subject, html } = bookingStatusEmail(updated, 'CANCELLED');
  if (updated.company) {
    sendEmail([updated.company.email, process.env.INTERNAL_TEAM_EMAIL!], subject, html).catch(console.error);
  }

  res.json({ success: true, data: updated });
}

export async function rejectBooking(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const { reason } = req.body as { reason: string };

  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: req.params.id },
    include: { invoice: true },
  });

  if (booking.status !== 'PENDING') {
    res.status(400).json({ success: false, error: 'INVALID_STATUS', message: 'Only pending requests can be rejected' });
    return;
  }

  const [debit, priorRefund] = await Promise.all([
    prisma.walletTransaction.findFirst({
      where: { reference: booking.refNumber, type: 'DEBIT' },
      select: { id: true },
    }),
    prisma.walletTransaction.findFirst({
      where: { reference: booking.refNumber, type: 'REFUND' },
      select: { id: true },
    }),
  ]);
  if (debit && !priorRefund) {
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
          description: `Refund for rejected booking ${booking.refNumber}`,
          createdById: caller.id,
        },
      });
    });
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.invoice.updateMany({
      where: { bookingId: booking.id },
      data: { status: 'CANCELLED' },
    });
    return tx.booking.update({
      where: { id: req.params.id },
      data: { status: 'REJECTED', cancelledAt: new Date(), cancellationReason: reason || 'Rejected by admin' },
      include: bookingInclude,
    });
  });

  const { subject, html } = bookingStatusEmail(updated, 'REJECTED');
  if (updated.company) {
    sendEmail([updated.company.email, process.env.INTERNAL_TEAM_EMAIL!], subject, html).catch(console.error);
  }

  res.json({ success: true, data: updated });
}
