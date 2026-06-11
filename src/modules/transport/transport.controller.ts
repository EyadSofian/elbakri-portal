import { Request, Response } from 'express';
import { Decimal } from '@prisma/client/runtime/library';
import { BookingStatus, TransportType } from '@prisma/client';
import { prisma } from '../../config/db';
import { generateRef, generateInvoiceNumber, paginate, paginateMeta, sanitizeCustomFields } from '../../shared/helpers';
import { resolveCallerMarket, resolveMarketPrices, resolveMarketMoney } from '../../shared/pricing';
import { sendEmail } from '../../shared/email.templates';
import { generateInvoicePdf } from '../invoices/pdf.generator';
import { applyGroupAdjustment, findApplicableGroupTypes } from '../group-types/group-types.service';
import { convertMoney, invoiceMoneySnapshotData } from '../../shared/money';
import { buildInvoiceTotals } from '../../shared/invoicing';

const transportInclude = {
  company: { select: { id: true, name: true, email: true } },
  createdBy: { select: { id: true, name: true } },
  confirmedBy: { select: { id: true, name: true } },
  groupType: { select: { id: true, code: true, labelEn: true, labelAr: true } },
  invoice: { select: { id: true, invoiceNumber: true, status: true, total: true } },
};

export async function listTransportBookings(req: Request, res: Response): Promise<void> {
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
    ...(req.query.type && { type: req.query.type as TransportType }),
  };

  const [bookings, total] = await Promise.all([
    prisma.transportBooking.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: transportInclude }),
    prisma.transportBooking.count({ where }),
  ]);
  res.json({ success: true, data: bookings, meta: paginateMeta(total, page, limit) });
}

/** GET /api/transport-rates/quote — client-side price preview (server-authoritative) */
export async function getTransportQuote(req: Request, res: Response): Promise<void> {
  const from        = String(req.query.from       ?? '').trim();
  const to          = String(req.query.to         ?? '').trim();
  const vehicleType = String(req.query.vehicleType ?? '').trim();
  const pax         = Math.max(1, parseInt(String(req.query.pax ?? '1'), 10));
  const roundTrip   = req.query.roundTrip === 'true';
  const groupTypeId = String(req.query.groupTypeId ?? '').trim();

  const where: Record<string, unknown> = {
    isActive: true,
    minCapacity: { lte: pax },
    OR: [{ maxCapacity: null }, { maxCapacity: { gte: pax } }],
  };
  if (from)        (where as any).fromLocation = { equals: from, mode: 'insensitive' };
  if (to)          (where as any).toLocation   = { equals: to,   mode: 'insensitive' };
  if (vehicleType) (where as any).vehicleType  = vehicleType;

  const rate = await prisma.transportRate.findFirst({
    where: where as any,
    orderBy: { rate: 'asc' },
  });

  if (!rate) {
    res.json({ success: true, data: { found: false, message: 'PRICE_ON_REQUEST' } });
    return;
  }

  // Apply the caller's market price tier (USD)
  const market = await resolveCallerMarket(req);
  const company = req.user?.companyId
    ? await prisma.company.findUnique({ where: { id: req.user.companyId }, select: { currency: true } })
    : null;
  const targetCurrency = company?.currency ?? rate.currency;
  const oneWayMoney = await resolveMarketMoney('TRANSPORT', rate.id, market, rate.rate, rate.currency);
  const roundTripMoney = rate.roundTripRate
    ? await resolveMarketMoney('TRANSPORT_RT', rate.id, market, rate.roundTripRate, rate.currency)
    : { amount: oneWayMoney.amount.mul(2), currency: oneWayMoney.currency, overridden: oneWayMoney.overridden };
  const applicableTypes = await findApplicableGroupTypes({
    scope: 'TRANSPORT',
    transportRateId: rate.id,
    destinationId: rate.destinationId ?? undefined,
    pax,
    date: req.query.date ? new Date(String(req.query.date)) : undefined,
  });
  const groupType = groupTypeId
    ? applicableTypes.find((option) => option.id === groupTypeId)
    : applicableTypes[0];
  if (!groupType) {
    res.status(400).json({ success: false, error: 'INVALID_GROUP_TYPE', message: 'Selected transport type is not available' });
    return;
  }
  const [oneWayCharge, roundTripCharge] = await Promise.all([
    convertMoney(applyGroupAdjustment(oneWayMoney.amount, groupType), oneWayMoney.currency, targetCurrency),
    convertMoney(applyGroupAdjustment(roundTripMoney.amount, groupType), roundTripMoney.currency, targetCurrency),
  ]);
  const oneWayRate = oneWayCharge.totalAmount;
  const roundTripRate = roundTripCharge.totalAmount;
  const totalAmount = roundTrip ? roundTripRate : oneWayRate;

  res.json({
    success: true,
    data: {
      found: true,
      rateId: rate.id,
      oneWayRate,
      roundTripRate,
      totalAmount,
      currency: targetCurrency,
      vehicleType: rate.vehicleType,
      rateType: rate.type,
      groupType,
      notes: rate.notes,
    },
  });
}

/** GET /api/transport-rates/locations — unique from/to values for dropdowns */
export async function getTransportLocations(req: Request, res: Response): Promise<void> {
  const rates = await prisma.transportRate.findMany({
    where: { isActive: true },
    select: { fromLocation: true, toLocation: true, vehicleType: true, type: true },
    orderBy: { fromLocation: 'asc' },
  });

  const froms = [...new Set(rates.map(r => r.fromLocation).filter(Boolean) as string[])].sort();
  const tos   = [...new Set(rates.map(r => r.toLocation).filter(Boolean)   as string[])].sort();
  const vehicles = [...new Set(rates.map(r => r.vehicleType))].sort();

  res.json({ success: true, data: { fromLocations: froms, toLocations: tos, vehicleTypes: vehicles } });
}

export async function createTransportBooking(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const body = req.body as {
    companyId?: string;
    type: 'AIRPORT_TRANSFER' | 'PRIVATE_TRANSFER' | 'DAY_TOUR_TRANSPORT' | 'INTERCITY';
    vehicleType?: 'SEDAN' | 'SUV' | 'VAN_6' | 'VAN_12' | 'MINIBUS_20' | 'BUS_45' | 'LUXURY_LIMO';
    fromLocation: string; toLocation: string;
    fromType?: string; toType?: string;
    pickupDateTime: string; returnDateTime?: string;
    isRoundTrip?: boolean; passengerCount?: number;
    passengerNames?: string[];
    passengerName?: string;    // lead passenger
    flightNumber?: string;
    airlineName?: string;
    returnFlightNumber?: string;
    returnAirlineName?: string;
    contactNumber?: string;
    destinationId?: string;
    groupTypeId?: string;
    // totalAmount / currency intentionally not accepted — resolved server-side from TransportRate
    notes?: string;
    customFields?: unknown;
  };

  const companyId = caller.role === 'SUPERADMIN' ? (body.companyId ?? caller.companyId!) : caller.companyId!;
  if (!companyId) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'companyId required' });
    return;
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { isActive: true, email: true, market: true, currency: true },
  });
  if (!company?.isActive) {
    res.status(400).json({ success: false, error: 'COMPANY_INACTIVE' });
    return;
  }

  const passengerCount = Math.max(1, body.passengerCount ?? 1);
  if (body.isRoundTrip && !body.returnDateTime) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'Return date and time are required for a round trip' });
    return;
  }

  // Resolve price server-side — client totalAmount is ignored entirely
  const matchingRate = await prisma.transportRate.findFirst({
    where: {
      isActive: true,
      type: body.type,
      ...(body.vehicleType && { vehicleType: body.vehicleType }),
      ...(body.fromLocation && { fromLocation: { equals: body.fromLocation, mode: 'insensitive' as const } }),
      ...(body.toLocation && { toLocation: { equals: body.toLocation, mode: 'insensitive' as const } }),
      ...(body.destinationId && { destinationId: body.destinationId }),
      minCapacity: { lte: passengerCount },
      OR: [
        { maxCapacity: null },
        { maxCapacity: { gte: passengerCount } },
      ],
    },
    orderBy: { rate: 'asc' }, // cheapest matching rate wins
  });

  if (!matchingRate) {
    res.status(400).json({
      success: false,
      error: 'USE_QUOTE_REQUEST',
      message: 'No matching transport rate found for the selected route and vehicle. Please submit a quote request via /api/quote-requests.',
    });
    return;
  }

  // Server-authoritative price using the company's market tier (USD)
  const applicableTypes = await findApplicableGroupTypes({
    scope: 'TRANSPORT',
    transportRateId: matchingRate.id,
    destinationId: matchingRate.destinationId ?? undefined,
    pax: passengerCount,
    date: new Date(body.pickupDateTime),
  });
  const groupType = body.groupTypeId
    ? applicableTypes.find((option) => option.id === body.groupTypeId)
    : applicableTypes[0];
  if (!groupType) {
    res.status(400).json({ success: false, error: 'INVALID_GROUP_TYPE', message: 'Selected transport type is not available' });
    return;
  }

  const sourceMoney = body.isRoundTrip && matchingRate.roundTripRate
    ? await resolveMarketMoney('TRANSPORT_RT', matchingRate.id, company.market, matchingRate.roundTripRate, matchingRate.currency)
    : await resolveMarketMoney('TRANSPORT', matchingRate.id, company.market, matchingRate.rate, matchingRate.currency);
  if (body.isRoundTrip && !matchingRate.roundTripRate) sourceMoney.amount = sourceMoney.amount.mul(2);
  const charge = await convertMoney(
    applyGroupAdjustment(sourceMoney.amount, groupType),
    sourceMoney.currency,
    company.currency,
  );
  const totalAmount = charge.totalAmount;
  const currency = company.currency;

  try {
    const refNumber = await generateRef(prisma, 'TRN');

    // Create the booking + a proforma invoice together so the client can
    // download the invoice immediately. Wallet is NOT debited here — that
    // happens on admin confirm (see confirmTransportBooking).
    let booking = await prisma.$transaction(async (tx) => {
      const created = await tx.transportBooking.create({
        data: {
          refNumber,
          companyId,
          createdById: caller.id,
          type: body.type,
          vehicleType: body.vehicleType ?? 'SEDAN',
          fromLocation: body.fromLocation,
          toLocation: body.toLocation,
          fromType: body.fromType ?? null,
          toType: body.toType ?? null,
          pickupDateTime: new Date(body.pickupDateTime),
          returnDateTime: body.returnDateTime ? new Date(body.returnDateTime) : null,
          isRoundTrip: body.isRoundTrip ?? false,
          passengerCount,
          passengerNames: body.passengerNames ?? [],
          passengerName: body.passengerName ?? null,
          flightNumber: body.flightNumber ?? null,
          airlineName: body.airlineName ?? null,
          returnFlightNumber: body.returnFlightNumber ?? null,
          returnAirlineName: body.returnAirlineName ?? null,
          contactNumber: body.contactNumber ?? null,
          groupTypeId: groupType.id,
          groupTypeLabel: groupType.labelEn,
          totalAmount,  // server-calculated from TransportRate
          currency,
          sourceAmount: charge.sourceAmount,
          sourceCurrency: charge.sourceCurrency,
          exchangeRate: charge.exchangeRate,
          exchangeRateAt: charge.exchangeRateAt,
          notes: body.notes,
          customFields: sanitizeCustomFields(body.customFields) ?? undefined,
          status: 'PENDING',
        },
      });

      const invoiceTotals = buildInvoiceTotals(totalAmount);
      const invoiceNumber = await generateInvoiceNumber(prisma);
      await tx.invoice.create({
        data: {
          invoiceNumber,
          transportBookingId: created.id,
          companyId,
          ...invoiceTotals,
          currency,
          ...invoiceMoneySnapshotData({
            ...charge,
            totalAmount,
            currency,
          }),
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      return tx.transportBooking.findUniqueOrThrow({ where: { id: created.id }, include: transportInclude });
    });

    // Generate the invoice PDF in the background (best-effort).
    if (booking.invoice) {
      const fullInvoice = await prisma.invoice.findUnique({
        where: { id: (booking.invoice as { id: string }).id },
        include: { transportBooking: { include: { company: true } }, company: true },
      });
      if (fullInvoice && !fullInvoice.pdfPath) {
        generateInvoicePdf(fullInvoice as Parameters<typeof generateInvoicePdf>[0])
          .then(({ path: pdfPath }) => prisma.invoice.update({ where: { id: fullInvoice.id }, data: { pdfPath } }))
          .catch(console.error);
      }
    }

    // Notify the configured recipient(s). TRANSPORT_NOTIFY_EMAIL is the
    // optional operations inbox configured in Railway.
    const recipients = [company.email, process.env.TRANSPORT_NOTIFY_EMAIL].filter(Boolean) as string[];
    if (recipients.length) {
      sendEmail(
        recipients,
        `🚐 Transport Booking — ${booking.refNumber}`,
        `<table style="font-family:sans-serif;font-size:14px;border-collapse:collapse">
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Ref</td><td style="padding:6px 12px">${booking.refNumber}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Route</td><td style="padding:6px 12px">${body.fromLocation} → ${body.toLocation}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Vehicle</td><td style="padding:6px 12px">${body.vehicleType ?? 'SEDAN'}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Service Type</td><td style="padding:6px 12px">${groupType.labelEn}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Pickup</td><td style="padding:6px 12px">${body.pickupDateTime}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Pax</td><td style="padding:6px 12px">${passengerCount}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Lead Pax</td><td style="padding:6px 12px">${body.passengerName ?? '—'}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Contact</td><td style="padding:6px 12px">${body.contactNumber ?? '—'}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Flight</td><td style="padding:6px 12px">${body.airlineName ?? ''} ${body.flightNumber ?? '—'}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Round Trip</td><td style="padding:6px 12px">${body.isRoundTrip ? 'Yes' : 'No'}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Total</td><td style="padding:6px 12px">${totalAmount} ${currency}</td></tr>
          ${body.notes ? `<tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Notes</td><td style="padding:6px 12px">${body.notes}</td></tr>` : ''}
        </table>`,
      ).catch(console.error);
    }

    res.status(201).json({ success: true, data: booking });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
}

/** Admin: confirm a transport booking → debit wallet + generate invoice */
export async function confirmTransportBooking(req: Request, res: Response): Promise<void> {
  const bookingId = req.params.id;

  try {
    await prisma.$transaction(async (tx) => {
      const booking = await tx.transportBooking.findUniqueOrThrow({
        where: { id: bookingId },
        include: { company: true, invoice: true },
      });

      if (booking.status !== 'PENDING') throw new Error('INVALID_STATUS');
      if (!booking.company.isActive) throw new Error('COMPANY_INACTIVE');

      // Debit the wallet once. A proforma invoice is created at booking time,
      // so we key idempotency on the DEBIT transaction, not on invoice absence.
      const alreadyDebited = await tx.walletTransaction.findFirst({
        where: { reference: booking.refNumber, type: 'DEBIT' },
      });
      if (!alreadyDebited) {
        if (booking.company.balance.lt(booking.totalAmount)) throw new Error('INSUFFICIENT_BALANCE');

        const balanceBefore = booking.company.balance;
        const balanceAfter = balanceBefore.sub(booking.totalAmount);

        await tx.company.update({ where: { id: booking.companyId }, data: { balance: balanceAfter } });
        await tx.walletTransaction.create({
          data: {
            companyId: booking.companyId,
            type: 'DEBIT',
            amount: booking.totalAmount,
            balanceBefore,
            balanceAfter,
            reference: booking.refNumber,
            description: `Confirmed transport booking ${booking.refNumber}`,
            createdById: req.user!.id,
          },
        });
      }

      // Create the invoice only if one wasn't already generated at booking time.
      if (!booking.invoice) {
        const invoiceTotals = buildInvoiceTotals(booking.totalAmount);
        const invoiceNumber = await generateInvoiceNumber(prisma);

        await tx.invoice.create({
          data: {
            invoiceNumber,
            transportBookingId: booking.id,
            companyId: booking.companyId,
            ...invoiceTotals,
            currency: booking.currency,
            ...invoiceMoneySnapshotData({
              sourceAmount: booking.sourceAmount ?? booking.totalAmount,
              sourceCurrency: booking.sourceCurrency ?? booking.currency,
              totalAmount: booking.totalAmount,
              currency: booking.currency,
              exchangeRate: booking.exchangeRate ?? new Decimal(1),
              exchangeRateAt: booking.exchangeRateAt ?? booking.createdAt,
            }),
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        });
      }

      await tx.transportBooking.update({
        where: { id: bookingId },
        data: {
          status: 'CONFIRMED',
          confirmedAt: booking.confirmedAt ?? new Date(),
          confirmedById: booking.confirmedById ?? req.user!.id,
        },
      });
    });
  } catch (err) {
    const msg = String((err as Error).message);
    if (msg === 'INVALID_STATUS') {
      res.status(400).json({ success: false, error: 'INVALID_STATUS', message: 'Only pending bookings can be confirmed' });
    } else if (msg === 'COMPANY_INACTIVE') {
      res.status(400).json({ success: false, error: 'COMPANY_INACTIVE' });
    } else if (msg === 'INSUFFICIENT_BALANCE') {
      res.status(400).json({ success: false, error: 'INSUFFICIENT_BALANCE', message: 'Insufficient wallet balance' });
    } else {
      console.error(err);
      res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
    return;
  }

  const updated = await prisma.transportBooking.findUnique({ where: { id: bookingId }, include: transportInclude });

  // Generate PDF in background
  if (updated?.invoice) {
    const fullInvoice = await prisma.invoice.findUnique({
      where: { id: (updated.invoice as { id: string }).id },
      include: { transportBooking: { include: { company: true } }, company: true },
    });
    if (fullInvoice && !fullInvoice.pdfPath) {
      generateInvoicePdf(fullInvoice as Parameters<typeof generateInvoicePdf>[0])
        .then(async ({ path: pdfPath }) => {
          await prisma.invoice.update({ where: { id: fullInvoice.id }, data: { pdfPath } });
        })
        .catch(console.error);
    }
  }

  res.json({ success: true, data: updated });
}

export async function cancelTransportBooking(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const booking = await prisma.transportBooking.findUniqueOrThrow({ where: { id: req.params.id }, include: { invoice: true } });
  if (caller.role !== 'SUPERADMIN' && booking.companyId !== caller.companyId) {
    res.status(403).json({ success: false, error: 'FORBIDDEN' });
    return;
  }
  if (!['PENDING', 'CONFIRMED'].includes(booking.status)) {
    res.status(400).json({ success: false, error: 'INVALID_STATUS' });
    return;
  }

  const [debit, priorRefund] = await Promise.all([
    prisma.walletTransaction.findFirst({ where: { reference: booking.refNumber, type: 'DEBIT' }, select: { id: true } }),
    prisma.walletTransaction.findFirst({ where: { reference: booking.refNumber, type: 'REFUND' }, select: { id: true } }),
  ]);
  if (debit && !priorRefund) {
    await prisma.$transaction(async (tx) => {
      const company = await tx.company.findUniqueOrThrow({ where: { id: booking.companyId } });
      const balanceBefore = company.balance;
      const balanceAfter = balanceBefore.add(booking.totalAmount);
      await tx.company.update({ where: { id: booking.companyId }, data: { balance: balanceAfter } });
      await tx.walletTransaction.create({
        data: {
          companyId: booking.companyId,
          type: 'REFUND',
          amount: booking.totalAmount,
          balanceBefore,
          balanceAfter,
          reference: booking.refNumber,
          description: `Refund cancelled transport ${booking.refNumber}`,
          createdById: caller.id,
        },
      });
    });
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.invoice.updateMany({
      where: { transportBookingId: booking.id },
      data: { status: 'CANCELLED' },
    });
    return tx.transportBooking.update({
      where: { id: req.params.id },
      data: { status: 'CANCELLED' },
      include: transportInclude,
    });
  });
  res.json({ success: true, data: updated });
}

// Transport rates (read-only for agents)
export async function listTransportRates(req: Request, res: Response): Promise<void> {
  const where = {
    isActive: true,
    ...(req.query.type && { type: req.query.type as TransportType }),
    ...(req.query.from && { fromLocation: { contains: String(req.query.from), mode: 'insensitive' as const } }),
    ...(req.query.to && { toLocation: { contains: String(req.query.to), mode: 'insensitive' as const } }),
    ...(req.query.destinationId && { destinationId: String(req.query.destinationId) }),
  };

  const rates = await prisma.transportRate.findMany({
    where,
    orderBy: { rate: 'asc' },
    include: { destination: { select: { id: true, name: true, slug: true } } },
  });
  // Apply explicit per-market price overrides for the caller's market
  const market = await resolveCallerMarket(req);
  const ids = rates.map(r => r.id);
  const [oneWayOv, rtOv] = await Promise.all([
    resolveMarketPrices('TRANSPORT', ids, market),
    resolveMarketPrices('TRANSPORT_RT', ids, market),
  ]);
  for (const r of rates) {
    const ow = oneWayOv.get(r.id);
    if (ow != null) {
      r.rate = ow;
      r.currency = 'USD';
    }
    const rt = rtOv.get(r.id);
    if (rt != null) {
      r.roundTripRate = rt;
      r.currency = 'USD';
    }
  }
  res.json({ success: true, data: rates });
}
