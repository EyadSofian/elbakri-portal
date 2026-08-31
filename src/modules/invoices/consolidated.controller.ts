import { Request, Response } from 'express';
import fs from 'fs';
import * as XLSX from 'xlsx';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../config/db';
import { ConsolidatedLine, generateConsolidatedInvoicePdf } from './pdf.generator';

const sourceInclude = {
  company: { select: { id: true, name: true } },
  booking: {
    select: {
      refNumber: true,
      type: true,
      hotel: { select: { name: true } },
    },
  },
  activityBooking: {
    select: {
      refNumber: true,
      activity: { select: { name: true } },
    },
  },
  activityPackage: {
    select: {
      refNumber: true,
      clientName: true,
      _count: { select: { items: true } },
    },
  },
  transportBooking: {
    select: {
      refNumber: true,
      fromLocation: true,
      toLocation: true,
    },
  },
  airportReception: {
    select: {
      refNumber: true,
      serviceType: true,
      airport: true,
    },
  },
  cruiseBooking: {
    select: {
      refNumber: true,
      cruise: { select: { name: true } },
    },
  },
  visaApplication: {
    select: {
      refNumber: true,
      applicantName: true,
      destinationCountry: true,
    },
  },
  simRequest: {
    select: {
      refNumber: true,
      clientName: true,
      package: { select: { name: true } },
    },
  },
} as const;

type InvoiceWithSources = Prisma.InvoiceGetPayload<{ include: typeof sourceInclude }>;

export function invoiceLine(inv: InvoiceWithSources): ConsolidatedLine {
  const refNumber = inv.booking?.refNumber
    ?? inv.activityBooking?.refNumber
    ?? inv.activityPackage?.refNumber
    ?? inv.transportBooking?.refNumber
    ?? inv.airportReception?.refNumber
    ?? inv.cruiseBooking?.refNumber
    ?? inv.visaApplication?.refNumber
    ?? inv.simRequest?.refNumber
    ?? '';
  let service = 'Service';
  if (inv.booking) service = inv.booking.hotel?.name ?? inv.booking.type ?? 'Hotel';
  else if (inv.activityBooking) service = `Activity: ${inv.activityBooking.activity?.name ?? ''}`.trim();
  else if (inv.activityPackage) {
    const guest = inv.activityPackage.clientName?.trim();
    service = `Activity Package: ${inv.activityPackage._count.items} item${inv.activityPackage._count.items === 1 ? '' : 's'}${guest ? ` · ${guest}` : ''}`;
  }
  else if (inv.transportBooking) service = `Transport: ${inv.transportBooking.fromLocation} -> ${inv.transportBooking.toLocation}`;
  else if (inv.airportReception) {
    service = `Airport Assist: ${inv.airportReception.serviceType.replace(/_/g, ' ')} (${inv.airportReception.airport})`;
  } else if (inv.cruiseBooking) service = `Nile Cruise: ${inv.cruiseBooking.cruise?.name ?? ''}`.trim();
  else if (inv.visaApplication) {
    service = `Security Approval: ${inv.visaApplication.applicantName} (${inv.visaApplication.destinationCountry})`;
  } else if (inv.simRequest) {
    service = `SIM Card: ${inv.simRequest.package?.name ?? inv.simRequest.clientName}`;
  }
  return {
    invoiceNumber: inv.invoiceNumber,
    refNumber,
    service,
    date: inv.createdAt,
    total: Number(inv.total),
    currency: inv.currency,
    status: inv.status,
  };
}

function invoiceFilters(input: {
  companyId: string;
  status?: string;
  from?: string;
  to?: string;
  eligibleOnly?: boolean;
}) {
  const from = input.from ? new Date(input.from) : null;
  const to = input.to ? new Date(input.to) : null;
  if (to) to.setHours(23, 59, 59, 999);
  return {
    companyId: input.companyId,
    ...(input.status && { status: input.status as 'UNPAID' | 'PAID' | 'OVERDUE' | 'CANCELLED' }),
    ...((from || to) && {
      createdAt: {
        ...(from && { gte: from }),
        ...(to && { lte: to }),
      },
    }),
    ...(input.eligibleOnly && { consolidatedLine: null }),
  };
}

export async function listEligibleConsolidatedInvoices(req: Request, res: Response): Promise<void> {
  const companyId = String(req.query.companyId ?? '');
  if (!companyId) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'companyId required' });
    return;
  }
  const invoices = await prisma.invoice.findMany({
    where: invoiceFilters({
      companyId,
      status: req.query.status ? String(req.query.status) : undefined,
      from: req.query.from ? String(req.query.from) : undefined,
      to: req.query.to ? String(req.query.to) : undefined,
      eligibleOnly: true,
    }),
    orderBy: { createdAt: 'asc' },
    include: sourceInclude,
  });
  res.json({ success: true, data: invoices.map((invoice) => ({ ...invoice, summary: invoiceLine(invoice) })) });
}

export async function listConsolidatedInvoices(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const companyId = caller.role === 'SUPERADMIN'
    ? (req.query.companyId ? String(req.query.companyId) : undefined)
    : caller.companyId ?? undefined;
  if (caller.role !== 'SUPERADMIN' && !companyId) {
    res.status(403).json({ success: false, error: 'FORBIDDEN' });
    return;
  }
  const rows = await prisma.consolidatedInvoice.findMany({
    where: {
      ...(companyId && { companyId }),
      ...(req.query.status && { status: req.query.status as 'UNPAID' | 'PAID' | 'OVERDUE' | 'CANCELLED' }),
    },
    include: {
      company: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      _count: { select: { lines: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ success: true, data: rows });
}

export async function createConsolidatedInvoice(req: Request, res: Response): Promise<void> {
  const body = req.body as {
    companyId?: string;
    invoiceIds?: string[];
    status?: string;
    from?: string;
    to?: string;
    notes?: string;
  };
  if (!body.companyId) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'companyId required' });
    return;
  }

  const company = await prisma.company.findUnique({
    where: { id: body.companyId },
    select: { id: true, name: true, email: true, address: true, taxId: true, phone: true },
  });
  if (!company) {
    res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Company not found' });
    return;
  }

  const invoices = await prisma.invoice.findMany({
    where: body.invoiceIds?.length
      ? { companyId: body.companyId, id: { in: body.invoiceIds }, consolidatedLine: null }
      : invoiceFilters({
          companyId: body.companyId,
          status: body.status,
          from: body.from,
          to: body.to,
          eligibleOnly: true,
        }),
    include: sourceInclude,
    orderBy: { createdAt: 'asc' },
  });
  if (!invoices.length) {
    res.status(400).json({ success: false, error: 'NO_ELIGIBLE_INVOICES', message: 'No unconsolidated invoices were selected' });
    return;
  }

  const currencies = [...new Set(invoices.map((invoice) => invoice.currency))];
  if (currencies.length !== 1) {
    res.status(400).json({
      success: false,
      error: 'MIXED_CURRENCY',
      message: `Create a separate statement for each currency: ${currencies.join(', ')}`,
    });
    return;
  }

  const lines = invoices.map(invoiceLine);
  const subtotal = invoices.reduce((sum, invoice) => sum.add(invoice.subtotal), new Decimal(0));
  const total = invoices.reduce((sum, invoice) => sum.add(invoice.total), new Decimal(0));
  const statementStatus = invoices.every((invoice) => invoice.status === 'PAID') ? 'PAID' : 'UNPAID';
  const statementNumber = `CINV-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`;

  const created = await prisma.consolidatedInvoice.create({
    data: {
      statementNumber,
      companyId: body.companyId,
      createdById: req.user!.id,
      periodFrom: body.from ? new Date(body.from) : null,
      periodTo: body.to ? new Date(body.to) : null,
      subtotal,
      total,
      currency: currencies[0],
      status: statementStatus,
      notes: body.notes?.trim() || null,
      lines: {
        create: invoices.map((invoice, index) => ({
          invoiceId: invoice.id,
          invoiceNumber: lines[index].invoiceNumber,
          refNumber: lines[index].refNumber || null,
          service: lines[index].service,
          serviceDate: lines[index].date,
          amount: invoice.total,
          currency: invoice.currency,
          status: invoice.status,
        })),
      },
    },
    include: { lines: true },
  });

  let pdfPath: string | null = null;
  try {
    const generated = await generateConsolidatedInvoicePdf({
      company,
      period: { from: body.from ?? null, to: body.to ?? null },
      generatedAt: created.createdAt,
      lines,
    });
    pdfPath = generated.path;
  } catch (error) {
    console.error('Failed to generate consolidated invoice PDF', error);
  }
  const saved = await prisma.consolidatedInvoice.update({
    where: { id: created.id },
    data: { pdfPath },
    include: { company: { select: { id: true, name: true } }, _count: { select: { lines: true } } },
  });
  res.status(201).json({ success: true, data: saved, warning: pdfPath ? undefined : 'PDF will be generated on first download' });
}

async function findForCaller(req: Request) {
  const row = await prisma.consolidatedInvoice.findUnique({
    where: { id: req.params.id },
    include: {
      company: { select: { id: true, name: true, email: true, address: true, taxId: true, phone: true } },
      lines: { orderBy: { serviceDate: 'asc' } },
    },
  });
  if (!row) return null;
  if (req.user!.role !== 'SUPERADMIN' && row.companyId !== req.user!.companyId) return false;
  return row;
}

export async function downloadConsolidatedPdf(req: Request, res: Response): Promise<void> {
  const row = await findForCaller(req);
  if (row === false) {
    res.status(403).json({ success: false, error: 'FORBIDDEN' });
    return;
  }
  if (!row) {
    res.status(404).json({ success: false, error: 'NOT_FOUND' });
    return;
  }
  let pdfPath = row.pdfPath;
  if (!pdfPath || !fs.existsSync(pdfPath)) {
    const generated = await generateConsolidatedInvoicePdf({
      company: row.company,
      period: {
        from: row.periodFrom?.toISOString() ?? null,
        to: row.periodTo?.toISOString() ?? null,
      },
      generatedAt: row.createdAt,
      lines: row.lines.map((line) => ({
        invoiceNumber: line.invoiceNumber,
        refNumber: line.refNumber ?? '',
        service: line.service,
        date: line.serviceDate,
        total: Number(line.amount),
        currency: line.currency,
        status: line.status,
      })),
    });
    pdfPath = generated.path;
    await prisma.consolidatedInvoice.update({ where: { id: row.id }, data: { pdfPath } });
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${row.statementNumber}.pdf"`);
  fs.createReadStream(pdfPath).pipe(res);
}

export async function downloadConsolidatedExcel(req: Request, res: Response): Promise<void> {
  const row = await findForCaller(req);
  if (row === false) {
    res.status(403).json({ success: false, error: 'FORBIDDEN' });
    return;
  }
  if (!row) {
    res.status(404).json({ success: false, error: 'NOT_FOUND' });
    return;
  }
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(row.lines.map((line) => ({
    'Invoice Number': line.invoiceNumber,
    'Booking Reference': line.refNumber ?? '',
    Service: line.service,
    Date: line.serviceDate.toISOString().slice(0, 10),
    Amount: Number(line.amount),
    Currency: line.currency,
    Status: line.status,
  })));
  worksheet['!cols'] = [
    { wch: 20 }, { wch: 20 }, { wch: 42 }, { wch: 14 },
    { wch: 14 }, { wch: 12 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Invoices');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${row.statementNumber}.xlsx"`);
  res.send(buffer);
}
