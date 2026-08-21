import { ProcessingType, VisaStatus, VisaType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { Request, Response } from 'express';
import { prisma } from '../../config/db';
import { sendEmail } from '../../shared/email.templates';
import {
  generateInvoiceNumber,
  generateRef,
  paginate,
  paginateMeta,
  sanitizeCustomFields,
  escapeHtml,
} from '../../shared/helpers';
import { explicitMoney, invoiceMoneySnapshotData } from '../../shared/money';
import { SECURITY_DESTINATIONS, isSecurityDestination } from '../../shared/security-destinations';
import { generateInvoicePdf } from '../invoices/pdf.generator';
import { buildInvoiceTotals } from '../../shared/invoicing';
import { createVoucherForService } from '../vouchers/vouchers.controller';
import { UpdateVisaApplicationInput } from './visa.schema';

const visaInclude = {
  company: { select: { id: true, name: true, email: true } },
  createdBy: { select: { id: true, name: true } },
  confirmedBy: { select: { id: true, name: true } },
  invoice: { select: { id: true, invoiceNumber: true, status: true, total: true } },
  voucher: { select: { id: true, voucherNumber: true } },
};

const destinationAliases: Record<string, string[]> = {
  SSH: ['SSH', 'Sharm El Sheikh', 'Sharm', 'شرم الشيخ'],
  CAI: ['CAI', 'Cairo', 'القاهرة'],
  HBE: ['HBE', 'Borg El Arab', 'Borg Al Arab', 'برج العرب'],
};

/**
 * The price of one approval.
 *
 * A fee row narrows on two things, either of which the admin may leave blank to
 * mean "any": the arrival airport, and the destination the guests are staying
 * in. The most specific row that matches wins, so a general price can stand for
 * everything while one destination is priced differently:
 *
 *   3  this airport AND this destination
 *   2  this destination, any airport
 *   1  this airport, any destination
 *   0  any airport, any destination
 *
 * A destination beats an airport at the same count of matches because it is what
 * the approval is actually filed for. Ties go to the most recently edited row.
 */
async function resolveVisaFee(
  visaType: VisaType,
  destinationCountry: string,
  destinationCity: string | null | undefined,
  processingType: ProcessingType,
  paxCount: number,
) {
  const aliases = destinationAliases[destinationCountry.toUpperCase()] ?? [destinationCountry];
  const candidates = await prisma.visaFee.findMany({
    where: {
      visaType,
      processingType,
      isActive: true,
      // A blank narrower on the row matches anything; a filled one has to match.
      AND: [
        { OR: [{ destinationCountry: null }, { destinationCountry: { in: aliases } }] },
        // A request that never named a destination can only take a row that does
        // not name one either — otherwise it would inherit another area's price.
        destinationCity
          ? { OR: [{ destinationCity: null }, { destinationCity }] }
          : { destinationCity: null },
      ],
    },
    orderBy: { updatedAt: 'desc' },
  });
  const specificity = (row: { destinationCountry: string | null; destinationCity: string | null }) =>
    (row.destinationCity ? 2 : 0) + (row.destinationCountry ? 1 : 0);
  const fee = candidates.reduce<(typeof candidates)[number] | null>(
    (best, row) => (best && specificity(best) >= specificity(row) ? best : row),
    null,
  );
  if (!fee) throw new Error('PRICE_NOT_CONFIGURED');
  return {
    amount: fee.fee.mul(Math.max(1, paxCount)),
    currency: fee.currency,
  };
}

async function generateVisaInvoicePdf(invoiceId: string): Promise<void> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { visaApplication: { include: { company: true } }, company: true },
  });
  if (!invoice || invoice.pdfPath) return;
  const generated = await generateInvoicePdf(invoice as Parameters<typeof generateInvoicePdf>[0]);
  await prisma.invoice.update({ where: { id: invoice.id }, data: { pdfPath: generated.path } });
}

/** The areas an approval can be filed for, so both portals offer the same three
 *  the API accepts instead of each keeping its own copy of the list. */
export function listSecurityDestinations(_req: Request, res: Response): void {
  res.json({ success: true, data: SECURITY_DESTINATIONS });
}

export async function getVisaQuote(req: Request, res: Response): Promise<void> {
  const visaType = String(req.query.visaType ?? 'TOURIST') as VisaType;
  const destinationCountry = String(req.query.destinationCountry ?? '');
  const destinationCity = req.query.destinationCity ? String(req.query.destinationCity) : null;
  const processingType = String(req.query.processingType ?? 'NORMAL') as ProcessingType;
  const paxCount = Math.max(1, parseInt(String(req.query.paxCount ?? '1'), 10));
  if (!destinationCountry) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'destinationCountry required' });
    return;
  }
  try {
    const source = await resolveVisaFee(
      visaType,
      destinationCountry,
      destinationCity,
      processingType,
      paxCount,
    );
    const charge = explicitMoney(source.amount, source.currency);
    res.json({
      success: true,
      data: {
        totalAmount: Number(charge.totalAmount),
        currency: charge.currency,
        paxCount,
      },
    });
  } catch (error) {
    if (String((error as Error).message) === 'PRICE_NOT_CONFIGURED') {
      res.status(404).json({ success: false, error: 'PRICE_NOT_CONFIGURED' });
      return;
    }
    console.error(error);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
}

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

  const [applications, total, statusCounts] = await Promise.all([
    prisma.visaApplication.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: visaInclude,
    }),
    prisma.visaApplication.count({ where }),
    prisma.visaApplication.groupBy({
      by: ['status'],
      where: companyFilter,
      _count: { id: true },
    }),
  ]);
  const stats = Object.fromEntries(statusCounts.map((row) => [row.status, row._count.id]));
  res.json({ success: true, data: applications, meta: paginateMeta(total, page, limit), stats });
}

export async function createVisaApplication(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const body = req.body as {
    companyId?: string;
    applicantName: string;
    nationality: string;
    passportNumber: string;
    passportExpiry: string;
    visaType: VisaType;
    destinationCountry: string;
    travelDate: string;
    processingType?: ProcessingType;
    notes?: string;
    phone?: string;
    hotelName?: string;
    destinationCity?: string;
    paxCount?: number;
    passportUrl?: string;
    flightTicketUrl?: string;
    customFields?: unknown;
  };
  const companyId = caller.role === 'SUPERADMIN'
    ? (body.companyId ?? caller.companyId!)
    : caller.companyId!;
  if (!companyId) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'companyId required' });
    return;
  }
  // Where the guests stay is optional — a template built before the question
  // existed never asks for it — but a value that is not one of the areas we
  // file approvals for is a mistake, not a new area.
  if (body.destinationCity && !isSecurityDestination(body.destinationCity)) {
    res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'destinationCity must be one of CAIRO, SHARM_EL_SHEIKH, NORTH_COAST',
    });
    return;
  }

  try {
    const paxCount = Math.max(1, Number(body.paxCount ?? 1));
    const processingType = body.processingType ?? 'NORMAL';
    const company = await prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { isActive: true, currency: true, email: true },
    });
    if (!company.isActive) throw new Error('COMPANY_INACTIVE');

    const sourcePrice = await resolveVisaFee(
      body.visaType,
      body.destinationCountry,
      body.destinationCity,
      processingType,
      paxCount,
    );
    const charge = explicitMoney(sourcePrice.amount, sourcePrice.currency);
    const [refNumber, invoiceNumber] = await Promise.all([
      generateRef(prisma, 'VIS'),
      generateInvoiceNumber(prisma),
    ]);

    const application = await prisma.$transaction(async (tx) => {
      const created = await tx.visaApplication.create({
        data: {
          refNumber,
          companyId,
          createdById: caller.id,
          applicantName: body.applicantName,
          nationality: body.nationality,
          passportNumber: body.passportNumber,
          passportExpiry: new Date(body.passportExpiry),
          visaType: body.visaType,
          destinationCountry: body.destinationCountry,
          travelDate: new Date(body.travelDate),
          processingType,
          totalAmount: charge.totalAmount,
          currency: charge.currency,
          sourceAmount: charge.sourceAmount,
          sourceCurrency: charge.sourceCurrency,
          exchangeRate: charge.exchangeRate,
          exchangeRateAt: charge.exchangeRateAt,
          notes: body.notes,
          phone: body.phone,
          hotelName: body.hotelName,
          destinationCity: body.destinationCity,
          paxCount,
          passportUrl: body.passportUrl,
          flightTicketUrl: body.flightTicketUrl,
          customFields: sanitizeCustomFields(body.customFields) ?? undefined,
        },
      });
      const invoiceTotals = buildInvoiceTotals(charge.totalAmount);
      await tx.invoice.create({
        data: {
          invoiceNumber,
          visaApplicationId: created.id,
          companyId,
          ...invoiceTotals,
          currency: charge.currency,
          ...invoiceMoneySnapshotData(charge),
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
      return tx.visaApplication.findUniqueOrThrow({
        where: { id: created.id },
        include: visaInclude,
      });
    });

    if (application.invoice) {
      generateVisaInvoicePdf(application.invoice.id).catch(console.error);
    }
    // Generate customer voucher (no price) before responding when possible so
    // the company portal can show the voucher action immediately.
    const voucherId = await createVoucherForService({
      type: 'visa',
      appId: application.id,
      companyId,
      clientName: body.applicantName,
    });
    const responseApplication = voucherId
      ? await prisma.visaApplication.findUnique({ where: { id: application.id }, include: visaInclude })
      : application;
    const recipients = [company.email, process.env.INTERNAL_TEAM_EMAIL].filter(Boolean) as string[];
    if (recipients.length) {
      sendEmail(
        recipients,
        `Security Approval - ${application.refNumber}`,
        `<p>Security approval <strong>${escapeHtml(application.refNumber)}</strong> was submitted for ${escapeHtml(body.applicantName)}.</p>`,
      ).catch(console.error);
    }
    res.status(201).json({ success: true, data: responseApplication ?? application });
  } catch (error) {
    const message = String((error as Error).message);
    if (message === 'COMPANY_INACTIVE') {
      res.status(400).json({ success: false, error: message });
    } else if (message === 'PRICE_NOT_CONFIGURED') {
      res.status(400).json({
        success: false,
        error: message,
        message: 'No active security approval fee is configured for this type',
      });
    } else {
      console.error(error);
      res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
  }
}

/** Editing any of these changes what the approval costs, so the fee and the
 *  invoice behind it have to be recalculated rather than left stale. */
const REPRICING_FIELDS = [
  'visaType', 'destinationCountry', 'destinationCity', 'processingType', 'paxCount',
] as const;

export async function updateVisaApplication(req: Request, res: Response): Promise<void> {
  const body = req.body as UpdateVisaApplicationInput;
  const existing = await prisma.visaApplication.findUnique({
    where: { id: req.params.id },
    include: { invoice: { select: { id: true, status: true } } },
  });
  if (!existing) {
    res.status(404).json({ success: false, error: 'NOT_FOUND' });
    return;
  }

  const data: Record<string, unknown> = { ...body };
  // Dates arrive as strings from the form; Prisma wants real Dates.
  for (const key of ['passportExpiry', 'travelDate', 'arrivalTime'] as const) {
    if (body[key] === undefined) continue;
    const raw = body[key];
    if (!raw) { data[key] = key === 'arrivalTime' ? null : undefined; continue; }
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: `${key} is not a valid date` });
      return;
    }
    data[key] = parsed;
  }
  // passportExpiry and travelDate are NOT NULL — a blank one means "unchanged".
  for (const key of ['passportExpiry', 'travelDate'] as const) {
    if (data[key] === undefined) delete data[key];
  }

  // Reprice when a pricing input moved — but never rewrite an invoice that has
  // already been paid, since the money on it has moved.
  const repriced = REPRICING_FIELDS.some((f) => body[f] !== undefined && body[f] !== (existing as Record<string, unknown>)[f]);
  let didReprice = false;
  if (repriced) {
    if (existing.invoice && existing.invoice.status === 'PAID') {
      res.status(400).json({
        success: false,
        error: 'INVOICE_ALREADY_PAID',
        message: 'This approval is already paid — its price can no longer be changed',
      });
      return;
    }
    const paxCount = Number(body.paxCount ?? existing.paxCount);
    try {
      const sourcePrice = await resolveVisaFee(
        (body.visaType ?? existing.visaType) as VisaType,
        body.destinationCountry ?? existing.destinationCountry,
        // null is a real value here — "clear the destination" — so only an
        // absent key falls back to what the approval already carries.
        body.destinationCity !== undefined ? body.destinationCity : existing.destinationCity,
        (body.processingType ?? existing.processingType) as ProcessingType,
        paxCount,
      );
      const charge = explicitMoney(sourcePrice.amount, sourcePrice.currency);
      Object.assign(data, {
        totalAmount: charge.totalAmount,
        currency: charge.currency,
        sourceAmount: charge.sourceAmount,
        sourceCurrency: charge.sourceCurrency,
        exchangeRate: charge.exchangeRate,
        exchangeRateAt: charge.exchangeRateAt,
      });
      if (existing.invoice) {
        const invoiceTotals = buildInvoiceTotals(charge.totalAmount);
        await prisma.invoice.update({
          where: { id: existing.invoice.id },
          data: {
            ...invoiceTotals,
            currency: charge.currency,
            ...invoiceMoneySnapshotData(charge),
            // The stored PDF shows the old total, so drop it and let it regenerate.
            pdfPath: null,
          },
        });
      }
      didReprice = true;
    } catch (error) {
      if (String((error as Error).message) === 'PRICE_NOT_CONFIGURED') {
        res.status(400).json({
          success: false,
          error: 'PRICE_NOT_CONFIGURED',
          message: 'No active security approval fee is configured for this location and type',
        });
        return;
      }
      throw error;
    }
  }

  const application = await prisma.visaApplication.update({
    where: { id: req.params.id },
    data,
    include: visaInclude,
  });
  if (didReprice && application.invoice) {
    generateVisaInvoicePdf(application.invoice.id).catch(console.error);
  }
  res.json({ success: true, data: application, repriced: didReprice });
}

/**
 * Remove an approval outright. Its invoice and voucher are `onDelete: Restrict`
 * relations, so they have to go first — inside one transaction, so a failure
 * halfway cannot leave an invoice pointing at a row that no longer exists. A
 * paid or already-invoiced-onto-a-statement approval is refused: money has
 * moved against it, and the honest action there is to cancel, not to erase.
 */
export async function deleteVisaApplication(req: Request, res: Response): Promise<void> {
  const existing = await prisma.visaApplication.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      voucher: { select: { id: true } },
      invoice: { select: { id: true, status: true, consolidatedLine: { select: { id: true } } } },
    },
  });
  if (!existing) {
    res.status(404).json({ success: false, error: 'NOT_FOUND' });
    return;
  }
  if (existing.invoice?.status === 'PAID') {
    res.status(400).json({
      success: false,
      error: 'INVOICE_ALREADY_PAID',
      message: 'This approval is already paid — cancel it instead of deleting it',
    });
    return;
  }
  if (existing.invoice?.consolidatedLine) {
    res.status(400).json({
      success: false,
      error: 'INVOICE_ON_STATEMENT',
      message: 'This approval is on a consolidated statement — remove it from the statement first',
    });
    return;
  }
  await prisma.$transaction(async (tx) => {
    if (existing.voucher) await tx.voucher.delete({ where: { id: existing.voucher.id } });
    if (existing.invoice) await tx.invoice.delete({ where: { id: existing.invoice.id } });
    await tx.visaApplication.delete({ where: { id: existing.id } });
  });
  res.json({ success: true });
}

export async function submitVisa(req: Request, res: Response): Promise<void> {
  const existing = await prisma.visaApplication.findUniqueOrThrow({
    where: { id: req.params.id },
    select: { companyId: true, status: true },
  });
  if (req.user!.role !== 'SUPERADMIN' && existing.companyId !== req.user!.companyId) {
    res.status(403).json({ success: false, error: 'FORBIDDEN' });
    return;
  }
  if (existing.status !== 'PENDING') {
    res.status(400).json({ success: false, error: 'INVALID_STATUS' });
    return;
  }
  const application = await prisma.visaApplication.update({
    where: { id: req.params.id },
    data: { status: 'SUBMITTED', submittedAt: new Date() },
    include: visaInclude,
  });
  res.json({ success: true, data: application });
}

export async function approveVisa(req: Request, res: Response): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      const application = await tx.visaApplication.findUniqueOrThrow({
        where: { id: req.params.id },
        include: { company: true, invoice: true },
      });
      if (application.status !== 'PENDING' && application.status !== 'SUBMITTED') {
        throw new Error('INVALID_STATUS');
      }
      if (!application.company.isActive) throw new Error('COMPANY_INACTIVE');

      const alreadyDebited = await tx.walletTransaction.findFirst({
        where: { reference: application.refNumber, type: 'DEBIT' },
      });
      if (!alreadyDebited) {
        if (application.company.balance.lt(application.totalAmount)) {
          throw new Error('INSUFFICIENT_BALANCE');
        }
        const balanceBefore = application.company.balance;
        const balanceAfter = balanceBefore.sub(application.totalAmount);
        await tx.company.update({
          where: { id: application.companyId },
          data: { balance: balanceAfter },
        });
        await tx.walletTransaction.create({
          data: {
            companyId: application.companyId,
            type: 'DEBIT',
            amount: application.totalAmount,
            balanceBefore,
            balanceAfter,
            reference: application.refNumber,
            description: `Approved security request ${application.refNumber}`,
            createdById: req.user!.id,
          },
        });
      }

      if (!application.invoice) {
        const invoiceNumber = await generateInvoiceNumber(prisma);
        const invoiceTotals = buildInvoiceTotals(application.totalAmount);
        await tx.invoice.create({
          data: {
            invoiceNumber,
            visaApplicationId: application.id,
            companyId: application.companyId,
            ...invoiceTotals,
            currency: application.currency,
            ...invoiceMoneySnapshotData({
              sourceAmount: application.sourceAmount ?? application.totalAmount,
              sourceCurrency: application.sourceCurrency ?? application.currency,
              totalAmount: application.totalAmount,
              currency: application.currency,
              exchangeRate: application.exchangeRate ?? new Decimal(1),
              exchangeRateAt: application.exchangeRateAt ?? application.createdAt,
            }),
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        });
      }

      await tx.visaApplication.update({
        where: { id: application.id },
        data: {
          status: 'APPROVED',
          approvedAt: new Date(),
          confirmedAt: application.confirmedAt ?? new Date(),
          confirmedById: application.confirmedById ?? req.user!.id,
        },
      });
    });
  } catch (error) {
    const message = String((error as Error).message);
    if (message === 'INVALID_STATUS' || message === 'COMPANY_INACTIVE') {
      res.status(400).json({ success: false, error: message });
    } else if (message === 'INSUFFICIENT_BALANCE') {
      res.status(400).json({
        success: false,
        error: message,
        message: 'Insufficient wallet balance',
      });
    } else {
      console.error(error);
      res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
    return;
  }

  const application = await prisma.visaApplication.findUniqueOrThrow({
    where: { id: req.params.id },
    include: visaInclude,
  });
  res.json({ success: true, data: application });
}

export async function rejectVisa(req: Request, res: Response): Promise<void> {
  const { reason } = req.body as { reason?: string };
  const existing = await prisma.visaApplication.findUniqueOrThrow({
    where: { id: req.params.id },
    select: { status: true },
  });
  if (existing.status !== 'PENDING' && existing.status !== 'SUBMITTED') {
    res.status(400).json({ success: false, error: 'INVALID_STATUS' });
    return;
  }
  const application = await prisma.$transaction(async (tx) => {
    await tx.invoice.updateMany({
      where: { visaApplicationId: req.params.id },
      data: { status: 'CANCELLED' },
    });
    return tx.visaApplication.update({
      where: { id: req.params.id },
      data: {
        status: 'REJECTED',
        rejectedAt: new Date(),
        rejectionReason: reason?.trim() || 'Rejected by admin',
      },
      include: visaInclude,
    });
  });
  res.json({ success: true, data: application });
}
