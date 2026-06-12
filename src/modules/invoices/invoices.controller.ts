import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { prisma } from '../../config/db';
import { paginate, paginateMeta } from '../../shared/helpers';
import { generateInvoicePdf } from './pdf.generator';
import { sendEmail } from '../../shared/email.templates';

const invoiceInclude = {
  company: { select: { id: true, name: true, email: true, address: true, taxId: true, phone: true } },
  booking: {
    select: {
      id: true, refNumber: true, type: true, totalAmount: true,
      currency: true, checkIn: true, checkOut: true, nights: true,
      origin: true, destination: true, adultsCount: true,
      requestedAt: true, confirmedAt: true,
      company: { select: { name: true, address: true, taxId: true, email: true, phone: true } },
      hotel: { select: { id: true, name: true, city: true, country: true } },
    },
  },
  activityBooking: {
    select: {
      id: true, refNumber: true, activityDate: true, adultsCount: true, childrenCount: true,
      totalAmount: true, currency: true,
      requestedAt: true, confirmedAt: true,
      activity: { select: { id: true, name: true, city: true, category: true } },
      company: { select: { name: true, address: true, taxId: true, email: true, phone: true } },
      voucher: { select: { id: true, voucherNumber: true } },
    },
  },
  transportBooking: {
    select: {
      id: true, refNumber: true, type: true, vehicleType: true,
      fromLocation: true, toLocation: true, pickupDateTime: true, passengerCount: true,
      totalAmount: true, currency: true,
      requestedAt: true, confirmedAt: true,
      company: { select: { name: true, address: true, taxId: true, email: true, phone: true } },
      voucher: { select: { id: true, voucherNumber: true } },
    },
  },
  airportReception: {
    select: {
      id: true, refNumber: true, serviceType: true, airport: true,
      flightNumber: true, flightDateTime: true, guestName: true, guestCount: true,
      totalAmount: true, currency: true,
      requestedAt: true, confirmedAt: true,
      company: { select: { name: true, address: true, taxId: true, email: true, phone: true } },
      voucher: { select: { id: true, voucherNumber: true } },
    },
  },
  cruiseBooking: {
    select: {
      id: true, refNumber: true, checkIn: true, checkOut: true,
      adultsCount: true, childrenCount: true, totalAmount: true, currency: true,
      requestedAt: true, confirmedAt: true,
      cruise: { select: { id: true, name: true, route: true } },
      company: { select: { name: true, address: true, taxId: true, email: true, phone: true } },
    },
  },
  visaApplication: {
    select: {
      id: true, refNumber: true, applicantName: true, destinationCountry: true,
      paxCount: true, totalAmount: true, currency: true,
      requestedAt: true, confirmedAt: true,
      company: { select: { name: true, address: true, taxId: true, email: true, phone: true } },
      voucher: { select: { id: true, voucherNumber: true } },
    },
  },
  simRequest: {
    select: {
      id: true, refNumber: true, clientName: true, quantity: true,
      totalAmount: true, currency: true, requestedAt: true, confirmedAt: true,
      package: { select: { name: true } },
      company: { select: { name: true, address: true, taxId: true, email: true, phone: true } },
      voucher: { select: { id: true, voucherNumber: true } },
    },
  },
  consolidatedLine: {
    select: { consolidatedInvoiceId: true },
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
    ?? invoice.transportBooking?.company.email
    ?? invoice.airportReception?.company.email
    ?? invoice.cruiseBooking?.company.email
    ?? invoice.visaApplication?.company.email
    ?? invoice.simRequest?.company.email;

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
