import { Request, Response } from 'express';
import { Decimal } from '@prisma/client/runtime/library';
import { BookingStatus, ReceptionType } from '@prisma/client';
import { prisma } from '../../config/db';
import { generateRef, paginate, paginateMeta, sanitizeCustomFields } from '../../shared/helpers';
import { sendEmail } from '../../shared/email.templates';

const receptionInclude = {
  company: { select: { id: true, name: true, email: true } },
  createdBy: { select: { id: true, name: true } },
};

export async function listReceptions(req: Request, res: Response): Promise<void> {
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
    ...(req.query.serviceType && { serviceType: req.query.serviceType as ReceptionType }),
  };

  const [receptions, total] = await Promise.all([
    prisma.airportReception.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: receptionInclude }),
    prisma.airportReception.count({ where }),
  ]);
  res.json({ success: true, data: receptions, meta: paginateMeta(total, page, limit) });
}

export async function createReception(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const body = req.body as {
    companyId?: string;
    serviceType: 'MEET_AND_GREET' | 'AHLAN_SERVICE' | 'VIP_LOUNGE' | 'FULL_ASSISTANCE';
    airport: 'CAI' | 'HRG' | 'SSH' | 'LXR' | 'ASW' | 'HBE' | 'MHH';
    flightNumber: string; flightDateTime: string;
    guestName: string; guestCount?: number;
    passengerNames?: string[]; signboardName?: string;
    hotelName?: string; specialRequests?: string;
    totalAmount: number; currency?: string; notes?: string;
    phone?: string; ticketUrl?: string; travelDetails?: string;
    customFields?: unknown;
  };

  const companyId = caller.role === 'SUPERADMIN' ? (body.companyId ?? caller.companyId!) : caller.companyId!;
  if (!companyId) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'companyId required' });
    return;
  }

  const totalAmount = new Decimal(body.totalAmount);

  try {
    const refNumber = await generateRef(prisma, 'RCP');

    const reception = await prisma.$transaction(async (tx) => {
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
          reference: refNumber, description: `Airport reception ${refNumber}`, createdById: caller.id,
        },
      });

      return tx.airportReception.create({
        data: {
          refNumber, companyId, createdById: caller.id,
          serviceType: body.serviceType, airport: body.airport,
          flightNumber: body.flightNumber,
          flightDateTime: new Date(body.flightDateTime),
          guestName: body.guestName,
          guestCount: body.guestCount ?? 1,
          passengerNames: body.passengerNames ?? [],
          signboardName: body.signboardName,
          hotelName: body.hotelName,
          specialRequests: body.specialRequests,
          totalAmount, currency: body.currency ?? 'USD', notes: body.notes,
          phone: body.phone,
          ticketUrl: body.ticketUrl,
          travelDetails: body.travelDetails,
          customFields: sanitizeCustomFields(body.customFields) ?? undefined,
        },
        include: receptionInclude,
      });
    });

    const companyEmail = (await prisma.company.findUnique({ where: { id: companyId }, select: { email: true } }))?.email;
    if (companyEmail && process.env.INTERNAL_TEAM_EMAIL) {
      sendEmail([companyEmail, process.env.INTERNAL_TEAM_EMAIL], `Airport Reception — ${reception.refNumber}`, `<p>Airport reception <strong>${reception.refNumber}</strong> for ${body.guestName} confirmed.</p>`).catch(console.error);
    }

    res.status(201).json({ success: true, data: reception });
  } catch (err) {
    const msg = String((err as Error).message);
    if (msg === 'COMPANY_INACTIVE') res.status(400).json({ success: false, error: 'COMPANY_INACTIVE' });
    else if (msg === 'INSUFFICIENT_BALANCE') res.status(400).json({ success: false, error: 'INSUFFICIENT_BALANCE', message: 'Insufficient wallet balance' });
    else { console.error(err); res.status(500).json({ success: false, error: 'INTERNAL_ERROR' }); }
  }
}

export async function confirmReception(req: Request, res: Response): Promise<void> {
  const reception = await prisma.airportReception.update({
    where: { id: req.params.id }, data: { status: 'CONFIRMED' }, include: receptionInclude,
  });
  res.json({ success: true, data: reception });
}

export async function cancelReception(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const reception = await prisma.airportReception.findUniqueOrThrow({ where: { id: req.params.id } });

  if (['CONFIRMED', 'PENDING'].includes(reception.status)) {
    await prisma.$transaction(async (tx) => {
      const company = await tx.company.findUniqueOrThrow({ where: { id: reception.companyId } });
      const balanceBefore = company.balance;
      const balanceAfter = balanceBefore.add(reception.totalAmount);
      await tx.company.update({ where: { id: reception.companyId }, data: { balance: balanceAfter } });
      await tx.walletTransaction.create({
        data: {
          companyId: reception.companyId, type: 'REFUND',
          amount: reception.totalAmount, balanceBefore, balanceAfter,
          reference: reception.refNumber, description: `Refund reception ${reception.refNumber}`, createdById: caller.id,
        },
      });
    });
  }

  const updated = await prisma.airportReception.update({
    where: { id: req.params.id }, data: { status: 'CANCELLED' }, include: receptionInclude,
  });
  res.json({ success: true, data: updated });
}
