import { Request, Response } from 'express';
import { Decimal } from '@prisma/client/runtime/library';
import { BookingStatus, ReceptionType, EgyptAirport } from '@prisma/client';
import { prisma } from '../../config/db';
import { generateRef, generateInvoiceNumber, paginate, paginateMeta, sanitizeCustomFields } from '../../shared/helpers';
import { sendEmail } from '../../shared/email.templates';
import { generateInvoicePdf } from '../invoices/pdf.generator';

const receptionInclude = {
  company: { select: { id: true, name: true, email: true } },
  createdBy: { select: { id: true, name: true } },
  confirmedBy: { select: { id: true, name: true } },
  invoice: { select: { id: true, invoiceNumber: true, status: true, total: true } },
};

/**
 * Resolve the airport-reception price SERVER-SIDE from ReceptionServiceRate.
 * Prefers an airport-specific active rate, falling back to a generic
 * (airport = null) rate for the service. Price is per guest × guestCount.
 * Returns a zero total (found:false) when no rate is configured — the request
 * is then treated as price-on-request (no wallet debit, no invoice).
 */
async function resolveReceptionRate(
  serviceType: ReceptionType,
  airport: EgyptAirport,
  guestCount: number,
): Promise<{ found: boolean; unitPrice: Decimal; total: Decimal; currency: string }> {
  const rates = await prisma.receptionServiceRate.findMany({
    where: { serviceType, isActive: true, OR: [{ airport }, { airport: null }] },
  });
  const rate = rates.find((r) => r.airport === airport) ?? rates.find((r) => r.airport === null) ?? null;
  if (!rate) {
    return { found: false, unitPrice: new Decimal(0), total: new Decimal(0), currency: 'USD' };
  }
  const qty = Math.max(1, guestCount);
  return {
    found: true,
    unitPrice: rate.rate,
    total: rate.rate.mul(qty),
    currency: rate.currency,
  };
}

export async function listReceptions(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const page = parseInt(String(req.query.page ?? '1'));
  const limit = parseInt(String(req.query.limit ?? '20'));
  const { skip, take } = paginate(page, limit);

  const companyFilter = caller.role === 'SUPERADMIN'
    ? (req.query.companyId ? { companyId: String(req.query.companyId) } : {})
    : { companyId: caller.companyId! };

  const where = {
    ...companyFilter,
    ...(req.query.status && { status: req.query.status as BookingStatus }),
    ...(req.query.serviceType && { serviceType: req.query.serviceType as ReceptionType }),
  };

  const [receptions, total] = await Promise.all([
    prisma.airportReception.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: receptionInclude }),
    prisma.airportReception.count({ where }),
  ]);
  res.json({ success: true, data: receptions, meta: paginateMeta(total, page, limit) });
}

/** GET /api/airport-receptions/quote — server-authoritative price preview. */
export async function getReceptionQuote(req: Request, res: Response): Promise<void> {
  const serviceType = String(req.query.serviceType ?? '') as ReceptionType;
  const airport = String(req.query.airport ?? '') as EgyptAirport;
  const pax = Math.max(1, parseInt(String(req.query.pax ?? '1'), 10));

  if (!serviceType || !airport) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'serviceType and airport are required' });
    return;
  }

  const { found, unitPrice, total, currency } = await resolveReceptionRate(serviceType, airport, pax);
  res.json({
    success: true,
    data: { found, unitPrice: Number(unitPrice), totalAmount: Number(total), currency, pax },
  });
}

export async function createReception(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const body = req.body as {
    companyId?: string;
    serviceType: 'MEET_AND_GREET' | 'AHLAN_SERVICE' | 'VIP_LOUNGE' | 'FULL_ASSISTANCE';
    airport: 'CAI' | 'HRG' | 'SSH' | 'LXR' | 'ASW' | 'HBE' | 'MHH';
    flightNumber: string; flightDateTime: string;
    guestName: string; guestCount?: number;
    passengerNames?: string[]; signboardName?: string;
    hotelName?: string; specialRequests?: string;
    // totalAmount / currency intentionally NOT accepted — resolved server-side from ReceptionServiceRate
    notes?: string;
    phone?: string; ticketUrl?: string; travelDetails?: string;
    customFields?: unknown;
  };

  const companyId = caller.role === 'SUPERADMIN' ? (body.companyId ?? caller.companyId!) : caller.companyId!;
  if (!companyId) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'companyId required' });
    return;
  }

  const guestCount = Math.max(1, body.guestCount ?? 1);
  // Server-authoritative price — the browser-submitted total is ignored entirely.
  const { total: totalAmount, currency } = await resolveReceptionRate(body.serviceType, body.airport, guestCount);
  const priced = totalAmount.gt(0);

  try {
    const refNumber = await generateRef(prisma, 'RCP');

    const reception = await prisma.$transaction(async (tx) => {
      const company = await tx.company.findUniqueOrThrow({
        where: { id: companyId }, select: { balance: true, isActive: true },
      });
      if (!company.isActive) throw new Error('COMPANY_INACTIVE');

      // Only move money when the service is actually priced.
      if (priced) {
        if (company.balance.lt(totalAmount)) throw new Error('INSUFFICIENT_BALANCE');
        const balanceBefore = company.balance;
        const balanceAfter = company.balance.sub(totalAmount);
        await tx.company.update({ where: { id: companyId }, data: { balance: balanceAfter } });
        await tx.walletTransaction.create({
          data: {
            companyId, type: 'DEBIT', amount: totalAmount, balanceBefore, balanceAfter,
            reference: refNumber, description: `Airport reception ${refNumber}`, createdById: caller.id,
          },
        });
      }

      const created = await tx.airportReception.create({
        data: {
          refNumber, companyId, createdById: caller.id,
          serviceType: body.serviceType, airport: body.airport,
          flightNumber: body.flightNumber,
          flightDateTime: new Date(body.flightDateTime),
          guestName: body.guestName,
          guestCount,
          passengerNames: body.passengerNames ?? [],
          signboardName: body.signboardName,
          hotelName: body.hotelName,
          specialRequests: body.specialRequests,
          totalAmount, currency, notes: body.notes,
          phone: body.phone,
          ticketUrl: body.ticketUrl,
          travelDetails: body.travelDetails,
          customFields: sanitizeCustomFields(body.customFields) ?? undefined,
        },
      });

      // Issue an invoice only when the service is priced.
      if (priced) {
        const subtotal = totalAmount;
        const taxAmount = subtotal.mul(new Decimal('0.14'));
        const invoiceNumber = await generateInvoiceNumber(prisma);
        await tx.invoice.create({
          data: {
            invoiceNumber,
            airportReceptionId: created.id,
            companyId,
            subtotal,
            taxAmount,
            total: subtotal.add(taxAmount),
            currency,
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        });
      }

      return tx.airportReception.findUniqueOrThrow({ where: { id: created.id }, include: receptionInclude });
    });

    // Generate the invoice PDF in the background (best-effort).
    if (reception.invoice) {
      const fullInvoice = await prisma.invoice.findUnique({
        where: { id: (reception.invoice as { id: string }).id },
        include: { airportReception: { include: { company: true } }, company: true },
      });
      if (fullInvoice && !fullInvoice.pdfPath) {
        generateInvoicePdf(fullInvoice as Parameters<typeof generateInvoicePdf>[0])
          .then(({ path: pdfPath }) => prisma.invoice.update({ where: { id: fullInvoice.id }, data: { pdfPath } }))
          .catch(console.error);
      }
    }

    // Notify company + the operations inbox (RECEPTION_NOTIFY_EMAIL, else the team inbox).
    const companyEmail = (await prisma.company.findUnique({ where: { id: companyId }, select: { email: true } }))?.email;
    const recipients = [companyEmail, process.env.RECEPTION_NOTIFY_EMAIL ?? process.env.INTERNAL_TEAM_EMAIL].filter(Boolean) as string[];
    if (recipients.length) {
      sendEmail(
        recipients,
        `🛬 Airport Assist — ${reception.refNumber}`,
        `<table style="font-family:sans-serif;font-size:14px;border-collapse:collapse">
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Ref</td><td style="padding:6px 12px">${reception.refNumber}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Service</td><td style="padding:6px 12px">${body.serviceType.replace(/_/g, ' ')}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Airport</td><td style="padding:6px 12px">${body.airport}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Guest</td><td style="padding:6px 12px">${body.guestName} (${guestCount})</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Flight</td><td style="padding:6px 12px">${body.flightNumber} — ${body.flightDateTime}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Total</td><td style="padding:6px 12px">${priced ? `${totalAmount} ${currency}` : 'Price on request'}</td></tr>
        </table>`,
      ).catch(console.error);
    }

    res.status(201).json({ success: true, data: reception });
  } catch (err) {
    const msg = String((err as Error).message);
    if (msg === 'COMPANY_INACTIVE') res.status(400).json({ success: false, error: 'COMPANY_INACTIVE' });
    else if (msg === 'INSUFFICIENT_BALANCE') res.status(400).json({ success: false, error: 'INSUFFICIENT_BALANCE', message: 'Insufficient wallet balance' });
    else { console.error(err); res.status(500).json({ success: false, error: 'INTERNAL_ERROR' }); }
  }
}

export async function confirmReception(req: Request, res: Response): Promise<void> {
  const existing = await prisma.airportReception.findUniqueOrThrow({
    where: { id: req.params.id }, select: { confirmedAt: true, confirmedById: true },
  });
  const reception = await prisma.airportReception.update({
    where: { id: req.params.id },
    data: {
      status: 'CONFIRMED',
      confirmedAt: existing.confirmedAt ?? new Date(),
      confirmedById: existing.confirmedById ?? req.user!.id,
    },
    include: receptionInclude,
  });
  res.json({ success: true, data: reception });
}

export async function cancelReception(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const reception = await prisma.airportReception.findUniqueOrThrow({ where: { id: req.params.id }, include: { invoice: true } });

  // Refund the wallet (only priced receptions ever debited it) and void the invoice.
  if (['CONFIRMED', 'PENDING'].includes(reception.status) && reception.totalAmount.gt(0)) {
    await prisma.$transaction(async (tx) => {
      const company = await tx.company.findUniqueOrThrow({ where: { id: reception.companyId } });
      const balanceBefore = company.balance;
      const balanceAfter = balanceBefore.add(reception.totalAmount);
      await tx.company.update({ where: { id: reception.companyId }, data: { balance: balanceAfter } });
      await tx.walletTransaction.create({
        data: {
          companyId: reception.companyId, type: 'REFUND',
          amount: reception.totalAmount, balanceBefore, balanceAfter,
          reference: reception.refNumber, description: `Refund reception ${reception.refNumber}`, createdById: caller.id,
        },
      });
      if (reception.invoice) {
        await tx.invoice.updateMany({ where: { airportReceptionId: reception.id }, data: { status: 'CANCELLED' } });
      }
    });
  }

  const updated = await prisma.airportReception.update({
    where: { id: req.params.id }, data: { status: 'CANCELLED' }, include: receptionInclude,
  });
  res.json({ success: true, data: updated });
}
