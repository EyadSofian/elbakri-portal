import { Request, Response } from 'express';
import { Decimal } from '@prisma/client/runtime/library';
import { ActivityCity, ActivityCategory, BookingStatus } from '@prisma/client';
import { prisma } from '../../config/db';
import { generateRef, paginate, paginateMeta } from '../../shared/helpers';
import { sendEmail } from '../../shared/email.templates';

const activityInclude = {
  activity: { select: { id: true, name: true, city: true, category: true } },
  company: { select: { id: true, name: true, email: true } },
  createdBy: { select: { id: true, name: true } },
};

export async function listActivities(req: Request, res: Response): Promise<void> {
  const where = {
    isActive: true,
    ...(req.query.city && { city: req.query.city as ActivityCity }),
    ...(req.query.category && { category: req.query.category as ActivityCategory }),
  };
  const activities = await prisma.activity.findMany({ where, orderBy: { name: 'asc' } });
  res.json({ success: true, data: activities });
}

export async function createActivity(req: Request, res: Response): Promise<void> {
  const activity = await prisma.activity.create({ data: req.body });
  res.status(201).json({ success: true, data: activity });
}

export async function updateActivity(req: Request, res: Response): Promise<void> {
  const activity = await prisma.activity.update({ where: { id: req.params.id }, data: req.body });
  res.json({ success: true, data: activity });
}

export async function deleteActivity(req: Request, res: Response): Promise<void> {
  await prisma.activity.update({ where: { id: req.params.id }, data: { isActive: false } });
  res.json({ success: true });
}

export async function listActivityBookings(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const page = parseInt(String(req.query.page ?? '1'));
  const limit = parseInt(String(req.query.limit ?? '20'));
  const { skip, take } = paginate(page, limit);

  const companyFilter = caller.role === 'SUPERADMIN'
    ? (req.query.companyId ? { companyId: String(req.query.companyId) } : {})
    : { companyId: caller.companyId! };

  const where = { ...companyFilter, ...(req.query.status && { status: req.query.status as BookingStatus }) };

  const [bookings, total] = await Promise.all([
    prisma.activityBooking.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: activityInclude }),
    prisma.activityBooking.count({ where }),
  ]);
  res.json({ success: true, data: bookings, meta: paginateMeta(total, page, limit) });
}

export async function createActivityBooking(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const body = req.body as {
    activityId: string; companyId?: string;
    activityDate: string;
    adultsCount?: number; childrenCount?: number;
    passengerNames?: string[];
    totalAmount: number; currency?: string; notes?: string;
  };

  const companyId = caller.role === 'SUPERADMIN' ? (body.companyId ?? caller.companyId!) : caller.companyId!;
  if (!companyId) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'companyId required' });
    return;
  }

  const totalAmount = new Decimal(body.totalAmount);

  try {
    const refNumber = await generateRef(prisma, 'ACT');

    const booking = await prisma.$transaction(async (tx) => {
      const company = await tx.company.findUniqueOrThrow({
        where: { id: companyId }, select: { balance: true, isActive: true },
      });
      if (!company.isActive) throw new Error('COMPANY_INACTIVE');
      if (company.balance.lt(totalAmount)) throw new Error('INSUFFICIENT_BALANCE');

      const balanceBefore = company.balance;
      const balanceAfter = company.balance.sub(totalAmount);

      await tx.company.update({ where: { id: companyId }, data: { balance: balanceAfter } });
      await tx.walletTransaction.create({
        data: {
          companyId, type: 'DEBIT', amount: totalAmount, balanceBefore, balanceAfter,
          reference: refNumber, description: `Activity booking ${refNumber}`, createdById: caller.id,
        },
      });

      return tx.activityBooking.create({
        data: {
          refNumber, activityId: body.activityId, companyId, createdById: caller.id,
          activityDate: new Date(body.activityDate),
          adultsCount: body.adultsCount ?? 1,
          childrenCount: body.childrenCount ?? 0,
          passengerNames: body.passengerNames ?? [],
          totalAmount, currency: body.currency ?? 'USD', notes: body.notes,
        },
        include: activityInclude,
      });
    });

    const companyEmail = (await prisma.company.findUnique({ where: { id: companyId }, select: { email: true } }))?.email;
    if (companyEmail && process.env.INTERNAL_TEAM_EMAIL) {
      sendEmail([companyEmail, process.env.INTERNAL_TEAM_EMAIL], `Activity Booking — ${booking.refNumber}`, `<p>Activity booking <strong>${booking.refNumber}</strong> created.</p>`).catch(console.error);
    }

    res.status(201).json({ success: true, data: booking });
  } catch (err) {
    const msg = String((err as Error).message);
    if (msg === 'COMPANY_INACTIVE') res.status(400).json({ success: false, error: 'COMPANY_INACTIVE' });
    else if (msg === 'INSUFFICIENT_BALANCE') res.status(400).json({ success: false, error: 'INSUFFICIENT_BALANCE', message: 'Insufficient wallet balance' });
    else { console.error(err); res.status(500).json({ success: false, error: 'INTERNAL_ERROR' }); }
  }
}

export async function confirmActivityBooking(req: Request, res: Response): Promise<void> {
  const booking = await prisma.activityBooking.update({
    where: { id: req.params.id }, data: { status: 'CONFIRMED' }, include: activityInclude,
  });
  res.json({ success: true, data: booking });
}

export async function cancelActivityBooking(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const booking = await prisma.activityBooking.findUniqueOrThrow({ where: { id: req.params.id } });

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
          reference: booking.refNumber, description: `Refund activity ${booking.refNumber}`, createdById: caller.id,
        },
      });
    });
  }

  const updated = await prisma.activityBooking.update({
    where: { id: req.params.id }, data: { status: 'CANCELLED' }, include: activityInclude,
  });
  res.json({ success: true, data: updated });
}
