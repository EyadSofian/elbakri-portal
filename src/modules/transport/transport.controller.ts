import { Request, Response } from 'express';
import { Decimal } from '@prisma/client/runtime/library';
import { BookingStatus, TransportType } from '@prisma/client';
import { prisma } from '../../config/db';
import { generateRef, paginate, paginateMeta } from '../../shared/helpers';
import { sendEmail } from '../../shared/email.templates';

const transportInclude = {
  company: { select: { id: true, name: true, email: true } },
  createdBy: { select: { id: true, name: true } },
};

export async function listTransportBookings(req: Request, res: Response): Promise<void> {
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
    ...(req.query.type && { type: req.query.type as TransportType }),
  };

  const [bookings, total] = await Promise.all([
    prisma.transportBooking.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: transportInclude }),
    prisma.transportBooking.count({ where }),
  ]);
  res.json({ success: true, data: bookings, meta: paginateMeta(total, page, limit) });
}

export async function createTransportBooking(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const body = req.body as {
    companyId?: string;
    type: 'AIRPORT_TRANSFER' | 'PRIVATE_TRANSFER' | 'DAY_TOUR_TRANSPORT' | 'INTERCITY';
    vehicleType?: 'SEDAN' | 'SUV' | 'VAN_6' | 'VAN_12' | 'MINIBUS_20' | 'BUS_45' | 'LUXURY_LIMO';
    fromLocation: string; toLocation: string;
    pickupDateTime: string; returnDateTime?: string;
    isRoundTrip?: boolean; passengerCount?: number;
    passengerNames?: string[]; flightNumber?: string;
    totalAmount: number; currency?: string; notes?: string;
  };

  const companyId = caller.role === 'SUPERADMIN' ? (body.companyId ?? caller.companyId!) : caller.companyId!;
  if (!companyId) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'companyId required' });
    return;
  }

  const totalAmount = new Decimal(body.totalAmount);

  try {
    const refNumber = await generateRef(prisma, 'TRN');

    const booking = await prisma.$transaction(async (tx) => {
      const company = await tx.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { balance: true, isActive: true },
      });
      if (!company.isActive) throw new Error('COMPANY_INACTIVE');
      if (company.balance.lt(totalAmount)) throw new Error('INSUFFICIENT_BALANCE');

      const balanceBefore = company.balance;
      const balanceAfter = company.balance.sub(totalAmount);

      await tx.company.update({ where: { id: companyId }, data: { balance: balanceAfter } });
      await tx.walletTransaction.create({
        data: {
          companyId, type: 'DEBIT', amount: totalAmount, balanceBefore, balanceAfter,
          reference: refNumber, description: `Transport booking ${refNumber}`, createdById: caller.id,
        },
      });

      return tx.transportBooking.create({
        data: {
          refNumber, companyId, createdById: caller.id,
          type: body.type,
          vehicleType: body.vehicleType ?? 'SEDAN',
          fromLocation: body.fromLocation, toLocation: body.toLocation,
          pickupDateTime: new Date(body.pickupDateTime),
          returnDateTime: body.returnDateTime ? new Date(body.returnDateTime) : null,
          isRoundTrip: body.isRoundTrip ?? false,
          passengerCount: body.passengerCount ?? 1,
          passengerNames: body.passengerNames ?? [],
          flightNumber: body.flightNumber,
          totalAmount, currency: body.currency ?? 'USD', notes: body.notes,
        },
        include: transportInclude,
      });
    });

    const companyEmail = (await prisma.company.findUnique({ where: { id: companyId }, select: { email: true } }))?.email;
    if (companyEmail && process.env.INTERNAL_TEAM_EMAIL) {
      sendEmail(
        [companyEmail, process.env.INTERNAL_TEAM_EMAIL],
        `Transport Booking — ${booking.refNumber}`,
        `<p>Transport booking <strong>${booking.refNumber}</strong> created.</p>`,
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

export async function confirmTransportBooking(req: Request, res: Response): Promise<void> {
  const booking = await prisma.transportBooking.update({
    where: { id: req.params.id }, data: { status: 'CONFIRMED' }, include: transportInclude,
  });
  res.json({ success: true, data: booking });
}

export async function cancelTransportBooking(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const booking = await prisma.transportBooking.findUniqueOrThrow({ where: { id: req.params.id } });

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
          description: `Refund cancelled transport ${booking.refNumber}`,
          createdById: caller.id,
        },
      });
    });
  }

  const updated = await prisma.transportBooking.update({
    where: { id: req.params.id }, data: { status: 'CANCELLED' }, include: transportInclude,
  });
  res.json({ success: true, data: updated });
}
