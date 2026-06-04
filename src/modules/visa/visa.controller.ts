import { Request, Response } from 'express';
import { Decimal } from '@prisma/client/runtime/library';
import { VisaStatus, VisaType } from '@prisma/client';
import { prisma } from '../../config/db';
import { generateRef, paginate, paginateMeta } from '../../shared/helpers';
import { sendEmail } from '../../shared/email.templates';

const visaInclude = {
  company: { select: { id: true, name: true, email: true } },
  createdBy: { select: { id: true, name: true } },
};

export async function listVisaApplications(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const page = parseInt(String(req.query.page ?? '1'));
  const limit = parseInt(String(req.query.limit ?? '20'));
  const { skip, take } = paginate(page, limit);

  const companyFilter = caller.role === 'SUPERADMIN'
    ? (req.query.companyId ? { companyId: String(req.query.companyId) } : {})
    : { companyId: caller.companyId! };

  const where = {
    ...companyFilter,
    ...(req.query.status && { status: req.query.status as VisaStatus }),
    ...(req.query.visaType && { visaType: req.query.visaType as VisaType }),
  };

  const [applications, total] = await Promise.all([
    prisma.visaApplication.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: visaInclude }),
    prisma.visaApplication.count({ where }),
  ]);

  // Count by status for stats
  const statusCounts = await prisma.visaApplication.groupBy({
    by: ['status'],
    where: companyFilter,
    _count: { id: true },
  });
  const stats = Object.fromEntries(statusCounts.map(r => [r.status, r._count.id]));

  res.json({ success: true, data: applications, meta: paginateMeta(total, page, limit), stats });
}

export async function createVisaApplication(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const body = req.body as {
    companyId?: string;
    applicantName: string; nationality: string;
    passportNumber: string; passportExpiry: string;
    visaType: string; destinationCountry: string; travelDate: string;
    processingType?: string;
    totalAmount: number; currency?: string; notes?: string;
    phone?: string; hotelName?: string; paxCount?: number;
    passportUrl?: string; flightTicketUrl?: string;
  };

  const companyId = caller.role === 'SUPERADMIN' ? (body.companyId ?? caller.companyId!) : caller.companyId!;
  if (!companyId) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'companyId required' });
    return;
  }

  const totalAmount = new Decimal(body.totalAmount);

  try {
    const refNumber = await generateRef(prisma, 'VIS');

    const application = await prisma.$transaction(async (tx) => {
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
          reference: refNumber, description: `Visa application ${refNumber}`, createdById: caller.id,
        },
      });

      return tx.visaApplication.create({
        data: {
          refNumber, companyId, createdById: caller.id,
          applicantName: body.applicantName,
          nationality: body.nationality,
          passportNumber: body.passportNumber,
          passportExpiry: new Date(body.passportExpiry),
          visaType: body.visaType as 'TOURIST' | 'BUSINESS' | 'TRANSIT' | 'STUDENT' | 'MEDICAL' | 'UMRAH' | 'HAJJ',
          destinationCountry: body.destinationCountry,
          travelDate: new Date(body.travelDate),
          processingType: (body.processingType as 'NORMAL' | 'EXPRESS' | 'URGENT') ?? 'NORMAL',
          totalAmount, currency: body.currency ?? 'USD', notes: body.notes,
          phone: body.phone,
          hotelName: body.hotelName,
          paxCount: body.paxCount ?? 1,
          passportUrl: body.passportUrl,
          flightTicketUrl: body.flightTicketUrl,
        },
        include: visaInclude,
      });
    });

    const companyEmail = (await prisma.company.findUnique({ where: { id: companyId }, select: { email: true } }))?.email;
    if (companyEmail && process.env.INTERNAL_TEAM_EMAIL) {
      sendEmail([companyEmail, process.env.INTERNAL_TEAM_EMAIL], `Visa Application — ${application.refNumber}`, `<p>Visa application <strong>${application.refNumber}</strong> submitted for ${body.applicantName}.</p>`).catch(console.error);
    }

    res.status(201).json({ success: true, data: application });
  } catch (err) {
    const msg = String((err as Error).message);
    if (msg === 'COMPANY_INACTIVE') res.status(400).json({ success: false, error: 'COMPANY_INACTIVE' });
    else if (msg === 'INSUFFICIENT_BALANCE') res.status(400).json({ success: false, error: 'INSUFFICIENT_BALANCE', message: 'Insufficient wallet balance' });
    else { console.error(err); res.status(500).json({ success: false, error: 'INTERNAL_ERROR' }); }
  }
}

export async function updateVisaApplication(req: Request, res: Response): Promise<void> {
  const application = await prisma.visaApplication.update({
    where: { id: req.params.id }, data: req.body, include: visaInclude,
  });
  res.json({ success: true, data: application });
}

export async function submitVisa(req: Request, res: Response): Promise<void> {
  const application = await prisma.visaApplication.update({
    where: { id: req.params.id },
    data: { status: 'SUBMITTED', submittedAt: new Date() },
    include: visaInclude,
  });
  res.json({ success: true, data: application });
}

export async function approveVisa(req: Request, res: Response): Promise<void> {
  const application = await prisma.visaApplication.update({
    where: { id: req.params.id },
    data: { status: 'APPROVED', approvedAt: new Date() },
    include: visaInclude,
  });
  res.json({ success: true, data: application });
}

export async function rejectVisa(req: Request, res: Response): Promise<void> {
  const { reason } = req.body as { reason: string };
  const application = await prisma.visaApplication.update({
    where: { id: req.params.id },
    data: { status: 'REJECTED', rejectedAt: new Date(), rejectionReason: reason },
    include: visaInclude,
  });
  res.json({ success: true, data: application });
}
