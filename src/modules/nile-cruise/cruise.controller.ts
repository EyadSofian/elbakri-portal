import { BookingStatus, CruiseRoute, ShipType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { Request, Response } from 'express';
import { prisma } from '../../config/db';
import { sendEmail } from '../../shared/email.templates';
import { generateInvoiceNumber, generateRef, paginate, paginateMeta } from '../../shared/helpers';
import { convertMoney, invoiceMoneySnapshotData } from '../../shared/money';
import { resolveCallerMarket, resolveMarketPrices } from '../../shared/pricing';
import { generateInvoicePdf } from '../invoices/pdf.generator';
import { buildInvoiceTotals } from '../../shared/invoicing';

const cruiseInclude = {
  cruise: { select: { id: true, name: true, route: true, shipType: true } },
  company: { select: { id: true, name: true, email: true } },
  createdBy: { select: { id: true, name: true } },
  confirmedBy: { select: { id: true, name: true } },
  invoice: { select: { id: true, invoiceNumber: true, status: true, total: true } },
};

async function generateCruiseInvoicePdf(invoiceId: string): Promise<void> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { cruiseBooking: { include: { company: true, cruise: true } }, company: true },
  });
  if (!invoice || invoice.pdfPath) return;
  const generated = await generateInvoicePdf(invoice as Parameters<typeof generateInvoicePdf>[0]);
  await prisma.invoice.update({ where: { id: invoice.id }, data: { pdfPath: generated.path } });
}

export async function listCruises(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const where = {
    isActive: true,
    ...(req.query.route && { route: req.query.route as CruiseRoute }),
    ...(req.query.shipType && { shipType: req.query.shipType as ShipType }),
  };
  const cruises = await prisma.nileCruise.findMany({ where, orderBy: { priceFrom: 'asc' } });
  if (caller.role === 'SUPERADMIN') {
    res.json({ success: true, data: cruises });
    return;
  }

  const market = await resolveCallerMarket(req);
  const marketOverrides = await resolveMarketPrices('CRUISE', cruises.map((cruise) => cruise.id), market);
  const data = cruises.map((cruise) => ({
    ...cruise,
    priceFrom: cruise.showPriceToAgents
      ? (marketOverrides.get(cruise.id) ?? cruise.priceFrom)
      : null,
    currency: marketOverrides.has(cruise.id) ? 'USD' : cruise.currency,
    priceVisible: cruise.showPriceToAgents,
    canRequestQuote: cruise.allowQuoteRequest,
  }));
  res.json({ success: true, data });
}

export async function createCruise(req: Request, res: Response): Promise<void> {
  const cruise = await prisma.nileCruise.create({ data: req.body });
  res.status(201).json({ success: true, data: cruise });
}

export async function updateCruise(req: Request, res: Response): Promise<void> {
  const cruise = await prisma.nileCruise.update({
    where: { id: req.params.id },
    data: req.body,
  });
  res.json({ success: true, data: cruise });
}

export async function deleteCruise(req: Request, res: Response): Promise<void> {
  await prisma.nileCruise.update({
    where: { id: req.params.id },
    data: { isActive: false },
  });
  res.json({ success: true });
}

export async function listCruiseBookings(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const page = parseInt(String(req.query.page ?? '1'));
  const limit = parseInt(String(req.query.limit ?? '20'));
  const { skip, take } = paginate(page, limit);
  const companyFilter = caller.role === 'SUPERADMIN'
    ? (req.query.companyId ? { companyId: String(req.query.companyId) } : {})
    : { companyId: caller.companyId! };
  const where = {
    ...companyFilter,
    ...(req.query.status && { status: req.query.status as BookingStatus }),
  };
  const [bookings, total] = await Promise.all([
    prisma.cruiseBooking.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: cruiseInclude,
    }),
    prisma.cruiseBooking.count({ where }),
  ]);
  res.json({ success: true, data: bookings, meta: paginateMeta(total, page, limit) });
}

export async function createCruiseBooking(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  if (caller.role !== 'SUPERADMIN') {
    res.status(400).json({
      success: false,
      error: 'USE_QUOTE_REQUEST',
      message: 'Cruise bookings are managed by the operations team. Please submit a quote request.',
    });
    return;
  }

  const body = req.body as {
    cruiseId: string;
    companyId?: string;
    checkIn: string;
    checkOut: string;
    cabinType?: string;
    passengerNames?: string[];
    adultsCount?: number;
    childrenCount?: number;
    totalAmount: number;
    currency?: string;
    notes?: string;
  };
  const companyId = body.companyId ?? caller.companyId!;
  if (!companyId) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'companyId required' });
    return;
  }

  try {
    if (!body.totalAmount || body.totalAmount <= 0) throw new Error('INVALID_TOTAL');
    const company = await prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { isActive: true, currency: true, email: true },
    });
    if (!company.isActive) throw new Error('COMPANY_INACTIVE');
    const cruise = await prisma.nileCruise.findFirst({
      where: { id: body.cruiseId, isActive: true },
      select: { id: true },
    });
    if (!cruise) throw new Error('CRUISE_NOT_AVAILABLE');

    const charge = await convertMoney(
      new Decimal(body.totalAmount),
      body.currency ?? 'USD',
      company.currency,
    );
    const [refNumber, invoiceNumber] = await Promise.all([
      generateRef(prisma, 'CRZ'),
      generateInvoiceNumber(prisma),
    ]);
    const booking = await prisma.$transaction(async (tx) => {
      const created = await tx.cruiseBooking.create({
        data: {
          refNumber,
          cruiseId: body.cruiseId,
          companyId,
          createdById: caller.id,
          checkIn: new Date(body.checkIn),
          checkOut: new Date(body.checkOut),
          cabinType: (body.cabinType as 'STANDARD' | 'DELUXE' | 'SUITE' | 'PRESIDENTIAL') ?? 'STANDARD',
          passengerNames: body.passengerNames ?? [],
          adultsCount: Math.max(1, body.adultsCount ?? 1),
          childrenCount: Math.max(0, body.childrenCount ?? 0),
          totalAmount: charge.totalAmount,
          currency: charge.currency,
          sourceAmount: charge.sourceAmount,
          sourceCurrency: charge.sourceCurrency,
          exchangeRate: charge.exchangeRate,
          exchangeRateAt: charge.exchangeRateAt,
          notes: body.notes,
        },
      });
      const invoiceTotals = buildInvoiceTotals(charge.totalAmount);
      await tx.invoice.create({
        data: {
          invoiceNumber,
          cruiseBookingId: created.id,
          companyId,
          ...invoiceTotals,
          currency: charge.currency,
          ...invoiceMoneySnapshotData(charge),
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
      return tx.cruiseBooking.findUniqueOrThrow({
        where: { id: created.id },
        include: cruiseInclude,
      });
    });

    if (booking.invoice) generateCruiseInvoicePdf(booking.invoice.id).catch(console.error);
    const recipients = [company.email, process.env.INTERNAL_TEAM_EMAIL].filter(Boolean) as string[];
    if (recipients.length) {
      sendEmail(
        recipients,
        `Cruise Booking Request - ${booking.refNumber}`,
        `<p>Cruise booking <strong>${booking.refNumber}</strong> is pending confirmation.</p>`,
      ).catch(console.error);
    }
    res.status(201).json({ success: true, data: booking });
  } catch (error) {
    const message = String((error as Error).message);
    if (['COMPANY_INACTIVE', 'INVALID_TOTAL', 'CRUISE_NOT_AVAILABLE'].includes(message)) {
      res.status(400).json({ success: false, error: message });
    } else {
      console.error(error);
      res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
  }
}

export async function confirmCruiseBooking(req: Request, res: Response): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      const booking = await tx.cruiseBooking.findUniqueOrThrow({
        where: { id: req.params.id },
        include: { company: true, invoice: true },
      });
      if (booking.status !== 'PENDING') throw new Error('INVALID_STATUS');
      if (!booking.company.isActive) throw new Error('COMPANY_INACTIVE');

      const alreadyDebited = await tx.walletTransaction.findFirst({
        where: { reference: booking.refNumber, type: 'DEBIT' },
      });
      if (!alreadyDebited) {
        if (booking.company.balance.lt(booking.totalAmount)) throw new Error('INSUFFICIENT_BALANCE');
        const balanceBefore = booking.company.balance;
        const balanceAfter = balanceBefore.sub(booking.totalAmount);
        await tx.company.update({ where: { id: booking.companyId }, data: { balance: balanceAfter } });
        await tx.walletTransaction.create({
          data: {
            companyId: booking.companyId,
            type: 'DEBIT',
            amount: booking.totalAmount,
            balanceBefore,
            balanceAfter,
            reference: booking.refNumber,
            description: `Confirmed cruise booking ${booking.refNumber}`,
            createdById: req.user!.id,
          },
        });
      }

      if (!booking.invoice) {
        const invoiceNumber = await generateInvoiceNumber(prisma);
        const invoiceTotals = buildInvoiceTotals(booking.totalAmount);
        await tx.invoice.create({
          data: {
            invoiceNumber,
            cruiseBookingId: booking.id,
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
      await tx.cruiseBooking.update({
        where: { id: booking.id },
        data: {
          status: 'CONFIRMED',
          confirmedAt: booking.confirmedAt ?? new Date(),
          confirmedById: booking.confirmedById ?? req.user!.id,
        },
      });
    });
  } catch (error) {
    const message = String((error as Error).message);
    if (message === 'INVALID_STATUS' || message === 'COMPANY_INACTIVE') {
      res.status(400).json({ success: false, error: message });
    } else if (message === 'INSUFFICIENT_BALANCE') {
      res.status(400).json({ success: false, error: message, message: 'Insufficient wallet balance' });
    } else {
      console.error(error);
      res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
    return;
  }
  const booking = await prisma.cruiseBooking.findUniqueOrThrow({
    where: { id: req.params.id },
    include: cruiseInclude,
  });
  res.json({ success: true, data: booking });
}

export async function cancelCruiseBooking(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const booking = await prisma.cruiseBooking.findUniqueOrThrow({
    where: { id: req.params.id },
    include: { invoice: true },
  });
  if (caller.role !== 'SUPERADMIN' && booking.companyId !== caller.companyId) {
    res.status(403).json({ success: false, error: 'FORBIDDEN' });
    return;
  }
  if (!['PENDING', 'CONFIRMED'].includes(booking.status)) {
    res.status(400).json({ success: false, error: 'INVALID_STATUS' });
    return;
  }

  const [debit, priorRefund] = await Promise.all([
    prisma.walletTransaction.findFirst({ where: { reference: booking.refNumber, type: 'DEBIT' }, select: { id: true } }),
    prisma.walletTransaction.findFirst({ where: { reference: booking.refNumber, type: 'REFUND' }, select: { id: true } }),
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
          description: `Refund for cancelled cruise booking ${booking.refNumber}`,
          createdById: caller.id,
        },
      });
    });
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.invoice.updateMany({
      where: { cruiseBookingId: booking.id },
      data: { status: 'CANCELLED' },
    });
    return tx.cruiseBooking.update({
      where: { id: booking.id },
      data: { status: 'CANCELLED' },
      include: cruiseInclude,
    });
  });
  res.json({ success: true, data: updated });
}
