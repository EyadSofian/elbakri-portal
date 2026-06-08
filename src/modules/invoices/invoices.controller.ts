import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { prisma } from '../../config/db';
import { paginate, paginateMeta } from '../../shared/helpers';
import { generateInvoicePdf, generateConsolidatedInvoicePdf, ConsolidatedLine } from './pdf.generator';
import { sendEmail } from '../../shared/email.templates';

const invoiceInclude = {
  company: { select: { id: true, name: true, email: true, address: true, taxId: true, phone: true } },
  booking: {
    select: {
      id: true, refNumber: true, type: true, totalAmount: true,
      currency: true, checkIn: true, checkOut: true, nights: true,
      origin: true, destination: true, adultsCount: true,
      company: { select: { name: true, address: true, taxId: true, email: true, phone: true } },
      hotel: { select: { id: true, name: true, city: true, country: true } },
    },
  },
  activityBooking: {
    select: {
      id: true, refNumber: true, activityDate: true, adultsCount: true, childrenCount: true,
      totalAmount: true, currency: true,
      activity: { select: { id: true, name: true, city: true, category: true } },
      company: { select: { name: true, address: true, taxId: true, email: true, phone: true } },
    },
  },
  transportBooking: {
    select: {
      id: true, refNumber: true, type: true, vehicleType: true,
      fromLocation: true, toLocation: true, pickupDateTime: true, passengerCount: true,
      totalAmount: true, currency: true,
      company: { select: { name: true, address: true, taxId: true, email: true, phone: true } },
    },
  },
};

export async function listInvoices(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const page = parseInt(String(req.query.page ?? '1'));
  const limit = parseInt(String(req.query.limit ?? '20'));
  const { skip, take } = paginate(page, limit);

  const where = {
    ...(caller.role !== 'SUPERADMIN' ? { companyId: caller.companyId! } : {}),
    ...(caller.role === 'SUPERADMIN' && req.query.companyId ? { companyId: String(req.query.companyId) } : {}),
    ...(req.query.status && { status: req.query.status as 'UNPAID' | 'PAID' | 'OVERDUE' | 'CANCELLED' }),
    ...(req.query.from && { createdAt: { gte: new Date(String(req.query.from)) } }),
  };

  const [invoices, total] = await Promise.all([
    prisma.invoice.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: invoiceInclude }),
    prisma.invoice.count({ where }),
  ]);

  res.json({ success: true, data: invoices, meta: paginateMeta(total, page, limit) });
}

/**
 * GET /api/invoices/consolidated?companyId=&status=&from=&to=
 * SUPERADMIN only. Aggregates a company's invoices (same filters as the Excel
 * export) into ONE downloadable PDF statement. Per-booking invoices unchanged.
 */
export async function consolidatedInvoice(req: Request, res: Response): Promise<void> {
  const companyId = String(req.query.companyId ?? '');
  if (!companyId) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'companyId required' });
    return;
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { name: true, email: true, address: true, taxId: true, phone: true },
  });
  if (!company) {
    res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Company not found' });
    return;
  }

  const from = req.query.from ? new Date(String(req.query.from)) : null;
  const to = req.query.to ? new Date(String(req.query.to)) : null;
  const where = {
    companyId,
    ...(req.query.status && { status: req.query.status as 'UNPAID' | 'PAID' | 'OVERDUE' | 'CANCELLED' }),
    ...((from || to) && {
      createdAt: {
        ...(from && { gte: from }),
        ...(to && { lte: to }),
      },
    }),
  };

  const invoices = await prisma.invoice.findMany({ where, orderBy: { createdAt: 'asc' }, include: invoiceInclude });
  if (!invoices.length) {
    res.status(404).json({ success: false, error: 'NO_INVOICES', message: 'No invoices match the selected filters' });
    return;
  }

  const lines: ConsolidatedLine[] = invoices.map((inv) => {
    const ref = inv.booking?.refNumber ?? inv.activityBooking?.refNumber ?? inv.transportBooking?.refNumber ?? '';
    let service = 'Service';
    if (inv.booking) service = `${inv.booking.hotel?.name ?? inv.booking.type ?? 'Hotel'}`;
    else if (inv.activityBooking) service = `Activity: ${inv.activityBooking.activity?.name ?? ''}`.trim();
    else if (inv.transportBooking) service = `Transport: ${inv.transportBooking.fromLocation} → ${inv.transportBooking.toLocation}`;
    return {
      invoiceNumber: inv.invoiceNumber,
      refNumber: ref,
      service,
      date: inv.createdAt,
      total: Number(inv.total),
      currency: inv.currency,
      status: inv.status,
    };
  });

  const { path: pdfPath } = await generateConsolidatedInvoicePdf({
    company: { name: company.name, email: company.email, phone: company.phone, address: company.address, taxId: company.taxId },
    period: { from: req.query.from ? String(req.query.from) : null, to: req.query.to ? String(req.query.to) : null },
    generatedAt: new Date(),
    lines,
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${path.basename(pdfPath)}"`);
  const stream = fs.createReadStream(pdfPath);
  stream.on('error', (error) => {
    console.error(error);
    if (!res.headersSent) res.status(500).json({ success: false, error: 'PDF_READ_FAILED' });
  });
  stream.pipe(res);
}

export async function downloadPdf(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const invoice = await prisma.invoice.findUnique({
    where: { id: req.params.id },
    include: invoiceInclude,
  });

  if (!invoice) {
    res.status(404).json({ success: false, error: 'NOT_FOUND' });
    return;
  }

  if (caller.role !== 'SUPERADMIN' && invoice.companyId !== caller.companyId) {
    res.status(403).json({ success: false, error: 'FORBIDDEN' });
    return;
  }

  let pdfPath = invoice.pdfPath;

  if (!pdfPath || !fs.existsSync(pdfPath)) {
    const { path: generatedPath } = await generateInvoicePdf(invoice as Parameters<typeof generateInvoicePdf>[0]);
    pdfPath = generatedPath;
    await prisma.invoice.update({ where: { id: invoice.id }, data: { pdfPath } });
  }

  const filename = path.basename(pdfPath);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  const stream = fs.createReadStream(pdfPath);
  stream.on('error', (error) => {
    console.error(error);
    if (!res.headersSent) res.status(500).json({ success: false, error: 'PDF_READ_FAILED' });
  });
  stream.pipe(res);
}

export async function markPaid(req: Request, res: Response): Promise<void> {
  const invoice = await prisma.invoice.update({
    where: { id: req.params.id },
    data: { status: 'PAID', paidAt: new Date() },
    include: invoiceInclude,
  });

  // Notify company about payment confirmation
  const companyEmail = invoice.company.email
    ?? invoice.booking?.company.email
    ?? invoice.activityBooking?.company.email
    ?? invoice.transportBooking?.company.email;

  const teamEmail = process.env.INTERNAL_TEAM_EMAIL;
  const recipients = [companyEmail, teamEmail].filter(Boolean) as string[];
  if (recipients.length) {
    sendEmail(
      recipients,
      `Invoice ${invoice.invoiceNumber} — Marked as Paid`,
      `<p>Invoice <strong>${invoice.invoiceNumber}</strong> has been marked as PAID. Thank you!</p>`,
    ).catch(console.error);
  }

  res.json({ success: true, data: invoice });
}
