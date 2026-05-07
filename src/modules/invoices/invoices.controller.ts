import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { prisma } from '../../config/db';
import { paginate, paginateMeta } from '../../shared/helpers';
import { generateInvoicePdf } from './pdf.generator';
import { sendEmail, invoiceEmail } from '../../shared/email.templates';

const invoiceInclude = {
  company: { select: { id: true, name: true, email: true } },
  booking: {
    select: {
      id: true, refNumber: true, type: true, totalAmount: true,
      currency: true, checkIn: true, checkOut: true, nights: true,
      origin: true, destination: true, adultsCount: true,
      company: true,
      hotel: { select: { id: true, name: true, city: true, country: true } },
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

  const { subject, html } = invoiceEmail(invoice, invoice.booking);
  const emails = [invoice.company.email, process.env.INTERNAL_TEAM_EMAIL!].filter(Boolean);
  sendEmail(emails, subject, html).catch(console.error);

  res.json({ success: true, data: invoice });
}
