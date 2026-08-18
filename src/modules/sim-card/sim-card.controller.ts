import { Request, Response } from 'express';
import { prisma } from '../../config/db';
import { Decimal } from '@prisma/client/runtime/library';
import { sendError } from '../../shared/http';
import { generateInvoiceNumber, sanitizeCustomFields } from '../../shared/helpers';
import { resolvePriceContext, applyMarketPrice, resolveMarketMoney } from '../../shared/pricing';
import { explicitMoney, invoiceMoneySnapshotData } from '../../shared/money';
import { generateInvoicePdf } from '../invoices/pdf.generator';
import { buildInvoiceTotals } from '../../shared/invoicing';
import { createVoucherForService } from '../vouchers/vouchers.controller';
import { debitWallet, refundWallet } from '../../shared/wallet';

// ─── Packages (admin managed) ────────────────────────────────────────────────

export async function listPackages(req: Request, res: Response) {
  try {
    const { activeOnly, page = '1', limit = '50' } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;
    const where = activeOnly === 'true' ? { isActive: true } : {};

    const [packages, total] = await Promise.all([
      prisma.simPackage.findMany({ where, orderBy: { createdAt: 'asc' }, skip, take: limitNum }),
      prisma.simPackage.count({ where }),
    ]);

    // Apply explicit price overrides for the caller's market AND company
    const { market, companyId } = await resolvePriceContext(req);
    await applyMarketPrice(packages, {
      entityType: 'SIM', market, companyId, priceField: 'price', currencyField: 'currency',
    });

    res.json({
      success: true,
      data: packages,
      meta: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', undefined, err);
  }
}

export async function createPackage(req: Request, res: Response) {
  try {
    const { name, nameAr, dataSize, minutes, validity, price, currency, isActive } = req.body;
    if (!name || !dataSize || !validity || price === undefined) {
      return res.status(400).json({ success: false, message: 'name, dataSize, validity, price are required' });
    }
    const pkg = await prisma.simPackage.create({
      data: {
        name,
        nameAr: nameAr || null,
        dataSize,
        minutes: minutes || null,
        validity,
        price,
        currency: currency || 'USD',
        isActive: isActive !== undefined ? Boolean(isActive) : true,
      },
    });
    res.status(201).json({ success: true, data: pkg });
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', undefined, err);
  }
}

export async function updatePackage(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { name, nameAr, dataSize, minutes, validity, price, currency, isActive } = req.body;
    const pkg = await prisma.simPackage.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(nameAr !== undefined && { nameAr }),
        ...(dataSize !== undefined && { dataSize }),
        ...(minutes !== undefined && { minutes }),
        ...(validity !== undefined && { validity }),
        ...(price !== undefined && { price }),
        ...(currency !== undefined && { currency }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) }),
      },
    });
    res.json({ success: true, data: pkg });
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', undefined, err);
  }
}

export async function deletePackage(req: Request, res: Response) {
  try {
    await prisma.simPackage.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', undefined, err);
  }
}

// ─── Requests (company users) ────────────────────────────────────────────────

async function generateSimRef(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.simRequest.count();
  // Use count + timestamp suffix to guarantee uniqueness even under rapid creation
  return `SIM-${year}-${String(count + 1).padStart(4, '0')}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
}

export async function listRequests(req: Request, res: Response) {
  try {
    const user = req.user!;
    const isSuperAdmin = user.role === 'SUPERADMIN';
    const { status, page = '1', limit = '50', search } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const where: Record<string, unknown> = {};
    if (!isSuperAdmin && user.companyId) where.companyId = user.companyId;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { refNumber: { contains: search, mode: 'insensitive' as const } },
        { clientName: { contains: search, mode: 'insensitive' as const } },
        { phone: { contains: search, mode: 'insensitive' as const } },
      ];
    }

    const [requests, total] = await Promise.all([
      prisma.simRequest.findMany({
        where,
        include: {
          package: true,
          company: { select: { name: true } },
          confirmedBy: { select: { id: true, name: true } },
          invoice: { select: { id: true, invoiceNumber: true, status: true, total: true } },
          voucher: { select: { id: true, voucherNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.simRequest.count({ where }),
    ]);

    res.json({
      success: true,
      data: requests,
      meta: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', undefined, err);
  }
}

export async function createRequest(req: Request, res: Response) {
  try {
    const user = req.user!;
    if (!user.companyId) return res.status(400).json({ success: false, message: 'No company associated' });

    const { packageId, clientName, phone, quantity, arrivalDate, notes, customFields } = req.body;
    if (!clientName || !phone) {
      return res.status(400).json({ success: false, message: 'clientName and phone are required' });
    }

    const pkg = packageId
      ? await prisma.simPackage.findFirst({ where: { id: packageId, isActive: true } })
      : null;
    if (packageId && !pkg) {
      return res.status(404).json({ success: false, error: 'PACKAGE_NOT_AVAILABLE' });
    }
    // Validate quantity — must be a whole number within sane bounds (Finding 4)
    const MAX_SIM_QTY = 100;
    const qtyNum = quantity === undefined || quantity === null || quantity === '' ? 1 : Number(quantity);
    if (!Number.isInteger(qtyNum) || qtyNum < 1 || qtyNum > MAX_SIM_QTY) {
      return res.status(400).json({ success: false, error: 'INVALID_QUANTITY', message: `Quantity must be a whole number between 1 and ${MAX_SIM_QTY}` });
    }
    const qty = qtyNum;
    // Server-authoritative unit price using the company's market + company tier
    const company = await prisma.company.findUnique({
      where: { id: user.companyId },
      select: { market: true, currency: true, isActive: true },
    });
    if (!company?.isActive) {
      return res.status(400).json({ success: false, error: 'COMPANY_INACTIVE' });
    }
    // Explicit unit price — used verbatim, NO FX. total = unit × qty in the unit's own currency.
    const unit = pkg
      ? await resolveMarketMoney('SIM', pkg.id, { market: company.market, companyId: user.companyId, pax: qty }, pkg.price, pkg.currency)
      : { amount: new Decimal(0), currency: company.currency ?? 'USD' };
    const unitAmount = unit.amount.toDecimalPlaces(2);
    const charge = explicitMoney(unitAmount.mul(qty), unit.currency);
    const totalAmount = charge.totalAmount;
    const currency = charge.currency;

    const [refNumber, invoiceNumber] = await Promise.all([
      generateSimRef(),
      generateInvoiceNumber(prisma),
    ]);
    const simReq = await prisma.$transaction(async (tx) => {
      const created = await tx.simRequest.create({
        data: {
          refNumber,
          companyId: user.companyId!,
          createdById: user.id,
          packageId: packageId || null,
          clientName,
          phone,
          quantity: qty,
          unitAmount,
          arrivalDate: arrivalDate ? new Date(arrivalDate) : null,
          notes: notes || null,
          customFields: sanitizeCustomFields(customFields) ?? undefined,
          totalAmount,
          currency,
          sourceAmount: charge.sourceAmount,
          sourceCurrency: charge.sourceCurrency,
          exchangeRate: charge.exchangeRate,
          exchangeRateAt: charge.exchangeRateAt,
          status: 'PENDING',
        },
      });
      if (totalAmount.gt(0)) {
        const invoiceTotals = buildInvoiceTotals(totalAmount);
        await tx.invoice.create({
          data: {
            invoiceNumber,
            simRequestId: created.id,
            companyId: user.companyId!,
            ...invoiceTotals,
            currency,
            ...invoiceMoneySnapshotData(charge),
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        });
      }
      return tx.simRequest.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          package: true,
          invoice: { select: { id: true, invoiceNumber: true, status: true, total: true } },
        },
      });
    });

    if (simReq.invoice) {
      const invoice = await prisma.invoice.findUnique({
        where: { id: simReq.invoice.id },
        include: { simRequest: { include: { company: true, package: true } }, company: true },
      });
      if (invoice) {
        generateInvoicePdf(invoice as Parameters<typeof generateInvoicePdf>[0])
          .then(({ path }) => prisma.invoice.update({ where: { id: invoice.id }, data: { pdfPath: path } }))
          .catch(console.error);
      }
    }

    // Generate the customer voucher (no price) before responding so the company
    // portal can show "Download Voucher" immediately after the request is created.
    const voucherId = await createVoucherForService({
      type: 'sim',
      simRequestId: simReq.id,
      companyId: user.companyId!,
      clientName,
    });
    const responseSim = voucherId
      ? await prisma.simRequest.findUnique({
          where: { id: simReq.id },
          include: {
            package: true,
            invoice: { select: { id: true, invoiceNumber: true, status: true, total: true } },
            voucher: { select: { id: true, voucherNumber: true } },
          },
        })
      : simReq;

    res.status(201).json({
      success: true,
      data: responseSim ?? simReq,
      pricing: { unitPrice: unitAmount, quantity: qty, total: totalAmount, currency },
    });
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', undefined, err);
  }
}

export async function updateRequestStatus(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const status = String(req.body.status ?? '').toUpperCase();
    if (!['CONFIRMED', 'CANCELLED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ success: false, error: 'INVALID_STATUS' });
    }
    await prisma.$transaction(async (tx) => {
      const existing = await tx.simRequest.findUniqueOrThrow({
        where: { id },
        include: { company: true, invoice: true },
      });
      if (existing.status === status) return;

      if (status === 'CONFIRMED') {
        if (existing.status !== 'PENDING') throw new Error('INVALID_STATUS');
        if (!existing.company.isActive) throw new Error('COMPANY_INACTIVE');
        await debitWallet(tx, {
          companyId: existing.companyId,
          amount: existing.totalAmount,
          reference: existing.refNumber,
          description: `Confirmed SIM request ${existing.refNumber}`,
          createdById: req.user!.id,
        });
        if (!existing.invoice && existing.totalAmount.gt(0)) {
          const invoiceNumber = await generateInvoiceNumber(prisma);
          const invoiceTotals = buildInvoiceTotals(existing.totalAmount);
          await tx.invoice.create({
            data: {
              invoiceNumber,
              simRequestId: existing.id,
              companyId: existing.companyId,
              ...invoiceTotals,
              currency: existing.currency,
              ...invoiceMoneySnapshotData({
                sourceAmount: existing.sourceAmount ?? existing.totalAmount,
                sourceCurrency: existing.sourceCurrency ?? existing.currency,
                totalAmount: existing.totalAmount,
                currency: existing.currency,
                exchangeRate: existing.exchangeRate ?? new Decimal(1),
                exchangeRateAt: existing.exchangeRateAt ?? existing.createdAt,
              }),
              dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            },
          });
        }
        await tx.simRequest.update({
          where: { id },
          data: {
            status: 'CONFIRMED',
            confirmedAt: existing.confirmedAt ?? new Date(),
            confirmedById: existing.confirmedById ?? req.user!.id,
          },
        });
        return;
      }

      if (existing.status === 'CONFIRMED') {
        await refundWallet(tx, {
          companyId: existing.companyId,
          amount: existing.totalAmount,
          reference: existing.refNumber,
          description: `Refund SIM request ${existing.refNumber}`,
          createdById: req.user!.id,
        });
      }
      if (existing.invoice) {
        await tx.invoice.update({ where: { id: existing.invoice.id }, data: { status: 'CANCELLED' } });
      }
      await tx.simRequest.update({ where: { id }, data: { status: status as 'CANCELLED' | 'REJECTED' } });
    });

    // Ensure a customer voucher exists once the request is confirmed (idempotent).
    if (status === 'CONFIRMED') {
      const sim = await prisma.simRequest.findUnique({
        where: { id },
        select: { companyId: true, clientName: true },
      });
      if (sim) {
        await createVoucherForService({
          type: 'sim',
          simRequestId: id,
          companyId: sim.companyId,
          clientName: sim.clientName,
        });
      }
    }

    const updated = await prisma.simRequest.findUniqueOrThrow({
      where: { id },
      include: {
        package: true,
        company: { select: { name: true } },
        confirmedBy: { select: { id: true, name: true } },
        invoice: { select: { id: true, invoiceNumber: true, status: true, total: true } },
        voucher: { select: { id: true, voucherNumber: true } },
      },
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    const message = String((err as Error).message);
    if (message === 'INVALID_STATUS' || message === 'COMPANY_INACTIVE') {
      res.status(400).json({ success: false, error: message });
    } else if (message === 'INSUFFICIENT_BALANCE') {
      res.status(400).json({ success: false, error: message, message: 'Insufficient wallet balance' });
    } else {
      res.status(500).json({ success: false, message });
    }
  }
}
