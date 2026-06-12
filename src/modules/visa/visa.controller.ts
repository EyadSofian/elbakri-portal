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
} from '../../shared/helpers';
import { convertMoney, invoiceMoneySnapshotData } from '../../shared/money';
import { generateInvoicePdf } from '../invoices/pdf.generator';
import { buildInvoiceTotals } from '../../shared/invoicing';
import { createVoucherForService } from '../vouchers/vouchers.controller';

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

async function resolveVisaFee(
  visaType: VisaType,
  destinationCountry: string,
  processingType: ProcessingType,
  paxCount: number,
) {
  const aliases = destinationAliases[destinationCountry.toUpperCase()] ?? [destinationCountry];
  const fee = await prisma.visaFee.findFirst({
    where: {
      visaType,
      processingType,
      isActive: true,
      OR: aliases.map((value) => ({
        destinationCountry: { equals: value, mode: 'insensitive' as const },
      })),
    },
    orderBy: { updatedAt: 'desc' },
  });
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

export async function getVisaQuote(req: Request, res: Response): Promise<void> {
  const visaType = String(req.query.visaType ?? 'TOURIST') as VisaType;
  const destinationCountry = String(req.query.destinationCountry ?? '');
  const processingType = String(req.query.processingType ?? 'NORMAL') as ProcessingType;
  const paxCount = Math.max(1, parseInt(String(req.query.paxCount ?? '1'), 10));
  if (!destinationCountry) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'destinationCountry required' });
    return;
  }
  try {
    const source = await resolveVisaFee(visaType, destinationCountry, processingType, paxCount);
    const company = req.user?.companyId
      ? await prisma.company.findUnique({
          where: { id: req.user.companyId },
          select: { currency: true },
        })
      : null;
    const charge = await convertMoney(source.amount, source.currency, company?.currency ?? source.currency);
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
      processingType,
      paxCount,
    );
    const charge = await convertMoney(sourcePrice.amount, sourcePrice.currency, company.currency);
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
    // Generate customer voucher (no price) in background
    createVoucherForService({
      type: 'visa',
      appId: application.id,
      companyId,
      clientName: body.applicantName,
    }).catch(console.error);
    const recipients = [company.email, process.env.INTERNAL_TEAM_EMAIL].filter(Boolean) as string[];
    if (recipients.length) {
      sendEmail(
        recipients,
        `Security Approval - ${application.refNumber}`,
        `<p>Security approval <strong>${application.refNumber}</strong> was submitted for ${body.applicantName}.</p>`,
      ).catch(console.error);
    }
    res.status(201).json({ success: true, data: application });
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

export async function updateVisaApplication(req: Request, res: Response): Promise<void> {
  const application = await prisma.visaApplication.update({
    where: { id: req.params.id },
    data: req.body,
    include: visaInclude,
  });
  res.json({ success: true, data: application });
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
