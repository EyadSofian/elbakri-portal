import { Request, Response } from 'express';
import { Decimal } from '@prisma/client/runtime/library';
import { QuoteRequestStatus, QuoteServiceType } from '@prisma/client';
import { prisma } from '../../config/db';
import { paginate, paginateMeta } from '../../shared/helpers';
import { sendEmail } from '../../shared/email.templates';

const quoteInclude = {
  company: { select: { id: true, name: true, email: true, tier: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  destination: { select: { id: true, name: true, nameAr: true, slug: true } },
  hotel: { select: { id: true, name: true, city: true, stars: true } },
  assignedTo: { select: { id: true, name: true, email: true } },
};

/** Generate a unique QR-YYYY-NNNN reference */
async function generateQuoteRef(): Promise<string> {
  const year = new Date().getFullYear();
  const counter = await prisma.$transaction(async (tx) => {
    return tx.quoteRequestCounter.upsert({
      where: { year },
      update: { lastSeq: { increment: 1 } },
      create: { year, lastSeq: 1 },
    });
  });
  return `QR-${year}-${String(counter.lastSeq).padStart(4, '0')}`;
}

export async function listQuoteRequests(req: Request, res: Response): Promise<void> {
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
    ...(req.query.status && { status: req.query.status as QuoteRequestStatus }),
    ...(req.query.serviceType && { serviceType: req.query.serviceType as QuoteServiceType }),
    ...(req.query.assignedToId && { assignedToId: String(req.query.assignedToId) }),
    ...(req.query.destinationId && { destinationId: String(req.query.destinationId) }),
    ...(req.query.from && { createdAt: { gte: new Date(String(req.query.from)) } }),
    ...(req.query.to && { createdAt: { lte: new Date(String(req.query.to)) } }),
  };

  const [quotes, total] = await Promise.all([
    prisma.quoteRequest.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: quoteInclude,
    }),
    prisma.quoteRequest.count({ where }),
  ]);

  res.json({ success: true, data: quotes, meta: paginateMeta(total, page, limit) });
}

export async function getQuoteRequest(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const quote = await prisma.quoteRequest.findUnique({
    where: { id: req.params.id },
    include: quoteInclude,
  });

  if (!quote) {
    res.status(404).json({ success: false, error: 'NOT_FOUND' });
    return;
  }

  if (caller.role !== 'SUPERADMIN' && quote.companyId !== caller.companyId) {
    res.status(403).json({ success: false, error: 'FORBIDDEN' });
    return;
  }

  res.json({ success: true, data: quote });
}

export async function createQuoteRequest(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const body = req.body as {
    serviceType: QuoteServiceType;
    companyId?: string;
    destinationId?: string;
    destinationName?: string;
    hotelId?: string;
    // Service identity for non-hotel services
    serviceId?: string;
    serviceName?: string;
    cruiseId?: string;
    activityId?: string;
    checkIn?: string;
    checkOut?: string;
    adultsCount?: number;
    childrenCount?: number;
    infantsCount?: number;
    roomsCount?: number;
    nationality?: string;
    travelFrom?: string;
    budget?: number;
    currency?: string;
    customerNotes?: string;
    contactPreference?: string;
  };

  const companyId =
    caller.role === 'SUPERADMIN' ? (body.companyId ?? caller.companyId!) : caller.companyId!;

  if (!companyId) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'companyId is required' });
    return;
  }
  if (!body.serviceType) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'serviceType is required' });
    return;
  }

  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { isActive: true } });
  if (!company?.isActive) {
    res.status(400).json({ success: false, error: 'COMPANY_INACTIVE' });
    return;
  }

  const refNumber = await generateQuoteRef();

  const quote = await prisma.quoteRequest.create({
    data: {
      refNumber,
      serviceType: body.serviceType,
      companyId,
      createdById: caller.id,
      destinationId: body.destinationId ?? null,
      destinationName: body.destinationName ?? null,
      hotelId: body.hotelId ?? null,
      serviceId: body.serviceId ?? body.cruiseId ?? body.activityId ?? null,
      serviceName: body.serviceName ?? null,
      cruiseId: body.cruiseId ?? null,
      activityId: body.activityId ?? null,
      checkIn: body.checkIn ? new Date(body.checkIn) : null,
      checkOut: body.checkOut ? new Date(body.checkOut) : null,
      adultsCount: body.adultsCount ?? 1,
      childrenCount: body.childrenCount ?? 0,
      infantsCount: body.infantsCount ?? 0,
      roomsCount: body.roomsCount ?? null,
      nationality: body.nationality ?? null,
      travelFrom: body.travelFrom ?? null,
      budget: body.budget ? new Decimal(body.budget) : null,
      currency: body.currency ?? 'USD',
      customerNotes: body.customerNotes ?? null,
      contactPreference: body.contactPreference ?? null,
    },
    include: quoteInclude,
  });

  // Notify internal team
  const teamEmail = process.env.INTERNAL_TEAM_EMAIL;
  if (teamEmail) {
    const subject = `New Quote Request ${quote.refNumber} — ${quote.serviceType}`;
    const html = `
      <p><strong>New quote request received</strong></p>
      <table>
        <tr><td><strong>Ref:</strong></td><td>${quote.refNumber}</td></tr>
        <tr><td><strong>Type:</strong></td><td>${quote.serviceType}</td></tr>
        <tr><td><strong>Company:</strong></td><td>${quote.company.name}</td></tr>
        <tr><td><strong>Destination:</strong></td><td>${quote.destination?.name ?? body.destinationName ?? 'N/A'}</td></tr>
        <tr><td><strong>Check-in:</strong></td><td>${body.checkIn ?? 'TBD'}</td></tr>
        <tr><td><strong>Check-out:</strong></td><td>${body.checkOut ?? 'TBD'}</td></tr>
        <tr><td><strong>Adults:</strong></td><td>${body.adultsCount ?? 1}</td></tr>
        <tr><td><strong>Nationality:</strong></td><td>${body.nationality ?? 'N/A'}</td></tr>
        <tr><td><strong>Travelling from:</strong></td><td>${body.travelFrom ?? 'N/A'}</td></tr>
        <tr><td><strong>Notes:</strong></td><td>${body.customerNotes ?? ''}</td></tr>
      </table>
    `;
    sendEmail([teamEmail], subject, html).catch(console.error);
  }

  res.status(201).json({ success: true, data: quote });
}

/** Admin: update status, assign, add internal notes, set quoted amount */
export async function updateQuoteRequest(req: Request, res: Response): Promise<void> {
  const body = req.body as {
    status?: QuoteRequestStatus;
    assignedToId?: string | null;
    internalNotes?: string;
    quotedAmount?: number;
    respondedAt?: string;
    closedAt?: string;
  };

  const update: Record<string, unknown> = {};
  if (body.status !== undefined) {
    update.status = body.status;
    if (body.status === 'QUOTED' || body.status === 'ACCEPTED') {
      update.respondedAt = new Date();
    }
    if (body.status === 'CLOSED' || body.status === 'CANCELLED') {
      update.closedAt = new Date();
    }
  }
  if (body.assignedToId !== undefined) update.assignedToId = body.assignedToId;
  if (body.internalNotes !== undefined) update.internalNotes = body.internalNotes;
  if (body.quotedAmount !== undefined) update.quotedAmount = new Decimal(body.quotedAmount);

  const quote = await prisma.quoteRequest.update({
    where: { id: req.params.id },
    data: update,
    include: quoteInclude,
  });

  // Notify company if status changed to QUOTED
  if (body.status === 'QUOTED' && quote.company.email) {
    const subject = `Your Quote Request ${quote.refNumber} Has Been Responded`;
    const html = `
      <p>Dear ${quote.company.name},</p>
      <p>We have reviewed your quote request <strong>${quote.refNumber}</strong> and will be in touch shortly with the full quote details.</p>
      <p>Thank you for choosing Elbakri Overseas.</p>
    `;
    sendEmail([quote.company.email], subject, html).catch(console.error);
  }

  res.json({ success: true, data: quote });
}

export async function cancelQuoteRequest(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const quote = await prisma.quoteRequest.findUnique({ where: { id: req.params.id } });

  if (!quote) {
    res.status(404).json({ success: false, error: 'NOT_FOUND' });
    return;
  }

  if (caller.role !== 'SUPERADMIN' && quote.companyId !== caller.companyId) {
    res.status(403).json({ success: false, error: 'FORBIDDEN' });
    return;
  }

  if (['CLOSED', 'CANCELLED'].includes(quote.status)) {
    res.status(400).json({ success: false, error: 'INVALID_STATUS', message: 'Quote is already closed or cancelled' });
    return;
  }

  const updated = await prisma.quoteRequest.update({
    where: { id: req.params.id },
    data: { status: 'CANCELLED', closedAt: new Date() },
    include: quoteInclude,
  });

  res.json({ success: true, data: updated });
}
