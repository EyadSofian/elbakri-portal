import { Request, Response } from 'express';
import { Decimal } from '@prisma/client/runtime/library';
import { BookingStatus, ShipType, CruiseRoute } from '@prisma/client';
import { prisma } from '../../config/db';
import { generateRef, paginate, paginateMeta } from '../../shared/helpers';
import { resolveCallerMarket, resolveMarketPrices } from '../../shared/pricing';
import { sendEmail } from '../../shared/email.templates';

const cruiseInclude = {
  cruise: { select: { id: true, name: true, route: true, shipType: true } },
  company: { select: { id: true, name: true, email: true } },
  createdBy: { select: { id: true, name: true } },
};

// ── Cruise catalog ────────────────────────────────────────────────────────────

export async function listCruises(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const where = {
    isActive: true,
    ...(req.query.route && { route: req.query.route as CruiseRoute }),
    ...(req.query.shipType && { shipType: req.query.shipType as ShipType }),
  };
  const cruises = await prisma.nileCruise.findMany({ where, orderBy: { priceFrom: 'asc' } });

  // SUPERADMIN sees full data
  if (caller.role === 'SUPERADMIN') {
    res.json({ success: true, data: cruises });
    return;
  }

  // Company users: mask price when showPriceToAgents=false; apply market override
  const market = await resolveCallerMarket(req);
  const marketOverrides = await resolveMarketPrices('CRUISE', cruises.map(c => c.id), market);
  const data = cruises.map(cruise => ({
    ...cruise,
    priceFrom: cruise.showPriceToAgents ? (marketOverrides.get(cruise.id) ?? cruise.priceFrom) : null,
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
  const cruise = await prisma.nileCruise.update({ where: { id: req.params.id }, data: req.body });
  res.json({ success: true, data: cruise });
}

export async function deleteCruise(req: Request, res: Response): Promise<void> {
  await prisma.nileCruise.update({ where: { id: req.params.id }, data: { isActive: false } });
  res.json({ success: true });
}

// ── Cruise bookings ───────────────────────────────────────────────────────────

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
    prisma.cruiseBooking.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: cruiseInclude }),
    prisma.cruiseBooking.count({ where }),
  ]);

  res.json({ success: true, data: bookings, meta: paginateMeta(total, page, limit) });
}

export async function createCruiseBooking(req: Request, res: Response): Promise<void> {
  const caller = req.user!;

  // Customers must use the quote request flow — cruise bookings are SUPERADMIN-only operations
  if (caller.role !== 'SUPERADMIN') {
    res.status(400).json({
      success: false,
      error: 'USE_QUOTE_REQUEST',
      message: 'Cruise bookings are managed by the operations team. Please submit a quote request via /api/quote-requests.',
    });
    return;
  }

  const body = req.body as {
    cruiseId: string; companyId?: string;
    checkIn: string; checkOut: string;
    cabinType?: string; passengerNames?: string[];
    adultsCount?: number; childrenCount?: number;
    totalAmount: number; currency?: string; notes?: string;
  };

  const companyId = body.companyId ?? caller.companyId!;
  if (!companyId) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'companyId required' });
    return;
  }

  const totalAmount = new Decimal(body.totalAmount);

  try {
    const refNumber = await generateRef(prisma, 'CRZ');

    const booking = await prisma.$transaction(async (tx) => {
      const company = await tx.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { balance: true, isActive: true, email: true },
      });
      if (!company.isActive) throw new Error('COMPANY_INACTIVE');
      if (company.balance.lt(totalAmount)) throw new Error('INSUFFICIENT_BALANCE');

      const balanceBefore = company.balance;
      const balanceAfter = company.balance.sub(totalAmount);

      await tx.company.update({ where: { id: companyId }, data: { balance: balanceAfter } });
      await tx.walletTransaction.create({
        data: {
          companyId, type: 'DEBIT', amount: totalAmount,
          balanceBefore, balanceAfter,
          reference: refNumber,
          description: `Cruise booking ${refNumber}`,
          createdById: caller.id,
        },
      });

      return tx.cruiseBooking.create({
        data: {
          refNumber, cruiseId: body.cruiseId, companyId,
          createdById: caller.id,
          checkIn: new Date(body.checkIn),
          checkOut: new Date(body.checkOut),
          cabinType: (body.cabinType as 'STANDARD' | 'DELUXE' | 'SUITE' | 'PRESIDENTIAL') ?? 'STANDARD',
          passengerNames: body.passengerNames ?? [],
          adultsCount: body.adultsCount ?? 1,
          childrenCount: body.childrenCount ?? 0,
          totalAmount, currency: body.currency ?? 'USD',
          notes: body.notes,
        },
        include: cruiseInclude,
      });
    });

    const companyEmail = (await prisma.company.findUnique({ where: { id: companyId }, select: { email: true } }))?.email;
    if (companyEmail && process.env.INTERNAL_TEAM_EMAIL) {
      sendEmail(
        [companyEmail, process.env.INTERNAL_TEAM_EMAIL],
        `Cruise Booking Confirmed — ${booking.refNumber}`,
        `<p>Your cruise booking <strong>${booking.refNumber}</strong> has been created successfully.</p>`,
      ).catch(console.error);
    }

    res.status(201).json({ success: true, data: booking });
  } catch (err) {
    const msg = String((err as Error).message);
    if (msg === 'COMPANY_INACTIVE') res.status(400).json({ success: false, error: 'COMPANY_INACTIVE' });
    else if (msg === 'INSUFFICIENT_BALANCE') res.status(400).json({ success: false, error: 'INSUFFICIENT_BALANCE', message: 'Insufficient wallet balance' });
    else { console.error(err); res.status(500).json({ success: false, error: 'INTERNAL_ERROR' }); }
  }
}

export async function confirmCruiseBooking(req: Request, res: Response): Promise<void> {
  const booking = await prisma.cruiseBooking.update({
    where: { id: req.params.id },
    data: { status: 'CONFIRMED' },
    include: cruiseInclude,
  });
  res.json({ success: true, data: booking });
}

export async function cancelCruiseBooking(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const booking = await prisma.cruiseBooking.findUniqueOrThrow({ where: { id: req.params.id } });

  if (['CONFIRMED', 'PENDING'].includes(booking.status)) {
    await prisma.$transaction(async (tx) => {
      const company = await tx.company.findUniqueOrThrow({ where: { id: booking.companyId } });
      const balanceBefore = company.balance;
      const balanceAfter = balanceBefore.add(booking.totalAmount);
      await tx.company.update({ where: { id: booking.companyId }, data: { balance: balanceAfter } });
      await tx.walletTransaction.create({
        data: {
          companyId: booking.companyId, type: 'REFUND',
          amount: booking.totalAmount, balanceBefore, balanceAfter,
          reference: booking.refNumber,
          description: `Refund for cancelled cruise booking ${booking.refNumber}`,
          createdById: caller.id,
        },
      });
    });
  }

  const updated = await prisma.cruiseBooking.update({
    where: { id: req.params.id },
    data: { status: 'CANCELLED' },
    include: cruiseInclude,
  });
  res.json({ success: true, data: updated });
}
