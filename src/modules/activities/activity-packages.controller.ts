import { Request, Response } from 'express';
import { Decimal } from '@prisma/client/runtime/library';
import { BookingStatus } from '@prisma/client';
import { prisma } from '../../config/db';
import { generateInvoiceNumber, paginate, paginateMeta, sanitizeCustomFields } from '../../shared/helpers';
import { resolveMarketMoney } from '../../shared/pricing';
import { applyGroupAdjustment, findApplicableGroupTypes } from '../group-types/group-types.service';
import { convertMoney, invoiceMoneySnapshotData } from '../../shared/money';
import { buildInvoiceTotals } from '../../shared/invoicing';
import { generateInvoicePdf } from '../invoices/pdf.generator';
import { createVoucherForService } from '../vouchers/vouchers.controller';

const packageInclude = {
  company: { select: { id: true, name: true, email: true } },
  createdBy: { select: { id: true, name: true } },
  confirmedBy: { select: { id: true, name: true } },
  items: {
    orderBy: { displayOrder: 'asc' as const },
    include: { activity: { select: { id: true, name: true, city: true } } },
  },
  invoice: { select: { id: true, invoiceNumber: true, status: true, total: true } },
  voucher: { select: { id: true, voucherNumber: true } },
};

// ── helpers ────────────────────────────────────────────────────────────────

async function genPackageRef(): Promise<string> {
  const year = new Date().getFullYear();
  const c = await prisma.activityPackageCounter.upsert({
    where: { year },
    update: { lastSeq: { increment: 1 } },
    create: { year, lastSeq: 1 },
  });
  return `PKG-${year}-${String(c.lastSeq).padStart(4, '0')}`;
}

/** Parse "08:00 AM" / "14:30" / "8:00" into minutes since midnight (or null). */
function parseTimeToMinutes(s?: string | null): number | null {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ap = m[3]?.toUpperCase();
  if (ap === 'PM' && h < 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

const DEFAULT_DURATION_MIN = 180;

interface ItemInput {
  activityId: string;
  activityDate: string;
  selectedTime?: string;
  endTime?: string;
  groupTypeId?: string;
  adultsCount?: number;
  childrenCount?: number;
  childAges?: number[];
  hotelName?: string;
  clientPhone?: string;
  transferIncluded?: boolean;
  notes?: string;
}

/** Returns the first overlapping pair of items on the same date, or null. */
function findTimeConflict(items: ItemInput[]): { a: number; b: number } | null {
  const buckets = new Map<string, { idx: number; start: number; end: number }[]>();
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const start = parseTimeToMinutes(it.selectedTime);
    if (start == null) continue; // no parseable time → can't conflict
    const end = parseTimeToMinutes(it.endTime ?? null) ?? start + DEFAULT_DURATION_MIN;
    const dateKey = new Date(it.activityDate).toISOString().slice(0, 10);
    const arr = buckets.get(dateKey) ?? [];
    for (const other of arr) {
      if (start < other.end && other.start < end) return { a: other.idx, b: i };
    }
    arr.push({ idx: i, start, end });
    buckets.set(dateKey, arr);
  }
  return null;
}

// ── list / detail ────────────────────────────────────────────────────────────

export async function listActivityPackages(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const page = parseInt(String(req.query.page ?? '1'));
  const limit = parseInt(String(req.query.limit ?? '20'));
  const { skip, take } = paginate(page, limit);

  const companyFilter = caller.role === 'SUPERADMIN'
    ? (req.query.companyId ? { companyId: String(req.query.companyId) } : {})
    : { companyId: caller.companyId! };
  const where = { ...companyFilter, ...(req.query.status && { status: req.query.status as BookingStatus }) };

  const [packages, total] = await Promise.all([
    prisma.activityPackage.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: packageInclude }),
    prisma.activityPackage.count({ where }),
  ]);
  res.json({ success: true, data: packages, meta: paginateMeta(total, page, limit) });
}

export async function getActivityPackage(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const pkg = await prisma.activityPackage.findUnique({ where: { id: req.params.id }, include: packageInclude });
  if (!pkg) { res.status(404).json({ success: false, error: 'NOT_FOUND' }); return; }
  if (caller.role !== 'SUPERADMIN' && pkg.companyId !== caller.companyId) {
    res.status(403).json({ success: false, error: 'FORBIDDEN' }); return;
  }
  res.json({ success: true, data: pkg });
}

// ── create ─────────────────────────────────────────────────────────────────

export async function createActivityPackage(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const body = req.body as {
    companyId?: string;
    clientName?: string;
    clientPhone?: string;
    hotelName?: string;
    adultsCount?: number;
    childrenCount?: number;
    childAges?: number[];
    notes?: string;
    customFields?: unknown;
    items: ItemInput[];
  };

  const companyId = caller.role === 'SUPERADMIN' ? (body.companyId ?? caller.companyId!) : caller.companyId!;
  if (!companyId) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'companyId required' });
    return;
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'A package needs at least one activity' });
    return;
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { isActive: true, email: true, market: true, currency: true },
  });
  if (!company?.isActive) { res.status(400).json({ success: false, error: 'COMPANY_INACTIVE' }); return; }

  // Time-conflict validation (server-authoritative)
  const conflict = findTimeConflict(body.items);
  if (conflict) {
    res.status(400).json({
      success: false,
      error: 'TIME_CONFLICT',
      message: `Activities #${conflict.a + 1} and #${conflict.b + 1} overlap on the same date. Adjust their times.`,
      conflict,
    });
    return;
  }

  // Resolve + price every line server-side
  const currency = company.currency;
  const lines: {
    activityId: string; activityName: string; city: string | null;
    activityDate: Date; selectedTime: string | null; endTime: string | null;
    adultsCount: number; childrenCount: number; childAges: number[] | null;
    hotelName: string | null; clientPhone: string | null;
    groupTypeId: string | null; groupTypeLabel: string | null; activityType: string | null;
    transferIncluded: boolean | null; notes: string | null; lineAmount: Decimal;
  }[] = [];
  let packageTotal = new Decimal(0);

  for (let i = 0; i < body.items.length; i++) {
    const it = body.items[i];
    const activity = await prisma.activity.findUnique({
      where: { id: it.activityId },
      select: { id: true, name: true, city: true, priceAdult: true, priceChild: true, currency: true,
        isActive: true, isConfirmableInApp: true, destinationId: true },
    });
    if (!activity || !activity.isActive) {
      res.status(404).json({ success: false, error: 'NOT_FOUND', message: `Activity #${i + 1} not found or inactive` });
      return;
    }
    if (!activity.isConfirmableInApp) {
      res.status(400).json({ success: false, error: 'USE_QUOTE_REQUEST', message: `Activity "${activity.name}" requires a quote request and cannot be packaged` });
      return;
    }

    const adults = Math.max(1, it.adultsCount ?? body.adultsCount ?? 1);
    const children = Math.max(0, it.childrenCount ?? body.childrenCount ?? 0);
    const activityDate = new Date(it.activityDate);

    const applicableTypes = await findApplicableGroupTypes({
      scope: 'ACTIVITY',
      activityId: activity.id,
      destinationId: activity.destinationId ?? undefined,
      pax: adults + children,
      date: activityDate,
    });
    const groupType = it.groupTypeId
      ? applicableTypes.find((o) => o.id === it.groupTypeId)
      : applicableTypes[0];

    const [adultPrice, childPrice] = await Promise.all([
      resolveMarketMoney('ACTIVITY_ADULT', activity.id, company.market, activity.priceAdult, activity.currency, companyId),
      resolveMarketMoney('ACTIVITY_CHILD', activity.id, company.market, activity.priceChild, activity.currency, companyId),
    ]);
    const [adultCharge, childCharge] = await Promise.all([
      convertMoney(adultPrice.amount, adultPrice.currency, currency),
      convertMoney(childPrice.amount, childPrice.currency, currency),
    ]);
    let lineAmount = adultCharge.totalAmount.mul(adults).add(childCharge.totalAmount.mul(children));
    if (groupType) lineAmount = applyGroupAdjustment(lineAmount, groupType);
    packageTotal = packageTotal.add(lineAmount);

    lines.push({
      activityId: activity.id,
      activityName: activity.name,
      city: activity.city ?? null,
      activityDate,
      selectedTime: it.selectedTime ?? null,
      endTime: it.endTime ?? null,
      adultsCount: adults,
      childrenCount: children,
      childAges: Array.isArray(it.childAges) ? it.childAges : null,
      hotelName: it.hotelName ?? body.hotelName ?? null,
      clientPhone: it.clientPhone ?? body.clientPhone ?? null,
      groupTypeId: groupType?.id ?? null,
      groupTypeLabel: groupType?.labelEn ?? null,
      activityType: groupType?.code ?? null,
      transferIncluded: it.transferIncluded ?? null,
      notes: it.notes ?? null,
      lineAmount,
    });
  }

  try {
    const refNumber = await genPackageRef();
    const invoiceNumber = await generateInvoiceNumber(prisma);

    const created = await prisma.$transaction(async (tx) => {
      const pkg = await tx.activityPackage.create({
        data: {
          refNumber,
          companyId,
          createdById: caller.id,
          clientName: body.clientName ?? null,
          clientPhone: body.clientPhone ?? null,
          hotelName: body.hotelName ?? null,
          adultsCount: Math.max(1, body.adultsCount ?? 1),
          childrenCount: Math.max(0, body.childrenCount ?? 0),
          childAges: Array.isArray(body.childAges) ? body.childAges : undefined,
          notes: body.notes ?? null,
          customFields: sanitizeCustomFields(body.customFields) ?? undefined,
          totalAmount: packageTotal,
          currency,
          sourceAmount: packageTotal,
          sourceCurrency: currency,
          exchangeRate: new Decimal(1),
          exchangeRateAt: new Date(),
          status: 'PENDING',
          items: {
            create: lines.map((l, idx) => ({
              activityId: l.activityId,
              activityName: l.activityName,
              city: l.city,
              activityDate: l.activityDate,
              selectedTime: l.selectedTime,
              endTime: l.endTime,
              adultsCount: l.adultsCount,
              childrenCount: l.childrenCount,
              childAges: l.childAges ?? undefined,
              hotelName: l.hotelName,
              clientPhone: l.clientPhone,
              groupTypeId: l.groupTypeId,
              groupTypeLabel: l.groupTypeLabel,
              activityType: l.activityType,
              transferIncluded: l.transferIncluded,
              notes: l.notes,
              lineAmount: l.lineAmount,
              currency,
              displayOrder: idx,
            })),
          },
        },
      });

      if (packageTotal.gt(0)) {
        const invoiceTotals = buildInvoiceTotals(packageTotal);
        await tx.invoice.create({
          data: {
            invoiceNumber,
            activityPackageId: pkg.id,
            companyId,
            ...invoiceTotals,
            currency,
            ...invoiceMoneySnapshotData({
              sourceAmount: packageTotal,
              sourceCurrency: currency,
              totalAmount: packageTotal,
              currency,
              exchangeRate: new Decimal(1),
              exchangeRateAt: new Date(),
            }),
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        });
      }
      return pkg;
    });

    // Background invoice PDF
    const inv = await prisma.invoice.findFirst({ where: { activityPackageId: created.id } });
    if (inv && !inv.pdfPath) {
      const full = await prisma.invoice.findUnique({
        where: { id: inv.id },
        include: { activityPackage: { include: { company: true, items: true } }, company: true },
      });
      if (full) {
        generateInvoicePdf(full as Parameters<typeof generateInvoicePdf>[0])
          .then(({ path }) => prisma.invoice.update({ where: { id: inv.id }, data: { pdfPath: path } }))
          .catch(console.error);
      }
    }

    // One combined package voucher (no prices)
    await createVoucherForService({
      type: 'package',
      packageId: created.id,
      companyId,
      clientName: body.clientName ?? null,
    });

    const responsePkg = await prisma.activityPackage.findUnique({ where: { id: created.id }, include: packageInclude });
    res.status(201).json({ success: true, data: responsePkg });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
}

// ── confirm / reject / cancel ──────────────────────────────────────────────────

export async function confirmActivityPackage(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  try {
    await prisma.$transaction(async (tx) => {
      const pkg = await tx.activityPackage.findUniqueOrThrow({ where: { id }, include: { company: true, invoice: true } });
      if (pkg.status !== 'PENDING') throw new Error('INVALID_STATUS');
      if (!pkg.company.isActive) throw new Error('COMPANY_INACTIVE');

      const alreadyDebited = await tx.walletTransaction.findFirst({ where: { reference: pkg.refNumber, type: 'DEBIT' } });
      if (!alreadyDebited && pkg.totalAmount.gt(0)) {
        if (pkg.company.balance.lt(pkg.totalAmount)) throw new Error('INSUFFICIENT_BALANCE');
        const balanceBefore = pkg.company.balance;
        const balanceAfter = balanceBefore.sub(pkg.totalAmount);
        await tx.company.update({ where: { id: pkg.companyId }, data: { balance: balanceAfter } });
        await tx.walletTransaction.create({
          data: {
            companyId: pkg.companyId, type: 'DEBIT', amount: pkg.totalAmount,
            balanceBefore, balanceAfter, reference: pkg.refNumber,
            description: `Confirmed activity package ${pkg.refNumber}`, createdById: req.user!.id,
          },
        });
      }
      if (!pkg.invoice && pkg.totalAmount.gt(0)) {
        const invoiceNumber = await generateInvoiceNumber(prisma);
        await tx.invoice.create({
          data: {
            invoiceNumber, activityPackageId: pkg.id, companyId: pkg.companyId,
            ...buildInvoiceTotals(pkg.totalAmount), currency: pkg.currency,
            ...invoiceMoneySnapshotData({
              sourceAmount: pkg.sourceAmount ?? pkg.totalAmount, sourceCurrency: pkg.sourceCurrency ?? pkg.currency,
              totalAmount: pkg.totalAmount, currency: pkg.currency,
              exchangeRate: pkg.exchangeRate ?? new Decimal(1), exchangeRateAt: pkg.exchangeRateAt ?? pkg.createdAt,
            }),
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        });
      }
      await tx.activityPackage.update({
        where: { id },
        data: { status: 'CONFIRMED', confirmedAt: pkg.confirmedAt ?? new Date(), confirmedById: pkg.confirmedById ?? req.user!.id },
      });
    });
  } catch (err) {
    const msg = String((err as Error).message);
    if (['INVALID_STATUS', 'COMPANY_INACTIVE', 'INSUFFICIENT_BALANCE'].includes(msg)) {
      res.status(400).json({ success: false, error: msg });
    } else {
      console.error(err);
      res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
    return;
  }

  await createVoucherForService({ type: 'package', packageId: id, companyId: (await prisma.activityPackage.findUnique({ where: { id }, select: { companyId: true } }))!.companyId });
  const updated = await prisma.activityPackage.findUnique({ where: { id }, include: packageInclude });
  res.json({ success: true, data: updated });
}

export async function cancelActivityPackage(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const status = String(req.body?.status ?? 'CANCELLED').toUpperCase();
  const pkg = await prisma.activityPackage.findUniqueOrThrow({ where: { id: req.params.id }, include: { invoice: true } });
  if (caller.role !== 'SUPERADMIN' && pkg.companyId !== caller.companyId) {
    res.status(403).json({ success: false, error: 'FORBIDDEN' }); return;
  }
  if (!['PENDING', 'CONFIRMED'].includes(pkg.status)) {
    res.status(400).json({ success: false, error: 'INVALID_STATUS' }); return;
  }
  const newStatus = status === 'REJECTED' ? 'REJECTED' : 'CANCELLED';

  const [debit, priorRefund] = await Promise.all([
    prisma.walletTransaction.findFirst({ where: { reference: pkg.refNumber, type: 'DEBIT' }, select: { id: true } }),
    prisma.walletTransaction.findFirst({ where: { reference: pkg.refNumber, type: 'REFUND' }, select: { id: true } }),
  ]);
  if (debit && !priorRefund) {
    await prisma.$transaction(async (tx) => {
      const company = await tx.company.findUniqueOrThrow({ where: { id: pkg.companyId } });
      const balanceBefore = company.balance;
      const balanceAfter = balanceBefore.add(pkg.totalAmount);
      await tx.company.update({ where: { id: pkg.companyId }, data: { balance: balanceAfter } });
      await tx.walletTransaction.create({
        data: {
          companyId: pkg.companyId, type: 'REFUND', amount: pkg.totalAmount,
          balanceBefore, balanceAfter, reference: pkg.refNumber,
          description: `Refund ${newStatus.toLowerCase()} package ${pkg.refNumber}`, createdById: caller.id,
        },
      });
    });
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.invoice.updateMany({ where: { activityPackageId: pkg.id }, data: { status: 'CANCELLED' } });
    return tx.activityPackage.update({ where: { id: req.params.id }, data: { status: newStatus as BookingStatus }, include: packageInclude });
  });
  res.json({ success: true, data: updated });
}
