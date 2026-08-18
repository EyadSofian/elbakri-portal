import { Request, Response } from 'express';
import { Decimal } from '@prisma/client/runtime/library';
import { BookingStatus, TransportType } from '@prisma/client';
import { prisma } from '../../config/db';
import { generateRef, generateInvoiceNumber, paginate, paginateMeta, sanitizeCustomFields, escapeHtml } from '../../shared/helpers';
import { setJsonStringArray } from '../../shared/json-array';
import { resolvePriceContext, resolveMarketPriceMap, resolveMarketMoney } from '../../shared/pricing';
import { resolveTransportRate, pickDualPrice, usesDualPricing } from './transport.resolve';
import { sendEmail } from '../../shared/email.templates';
import { generateInvoicePdf } from '../invoices/pdf.generator';
import { applyGroupAdjustment, findApplicableGroupTypes } from '../group-types/group-types.service';
import { explicitMoney, invoiceMoneySnapshotData } from '../../shared/money';
import { buildInvoiceTotals } from '../../shared/invoicing';
import { createVoucherForService } from '../vouchers/vouchers.controller';
import { debitWallet, refundWallet } from '../../shared/wallet';

const transportInclude = {
  company: { select: { id: true, name: true, email: true } },
  createdBy: { select: { id: true, name: true } },
  confirmedBy: { select: { id: true, name: true } },
  groupType: { select: { id: true, code: true, labelEn: true, labelAr: true } },
  invoice: { select: { id: true, invoiceNumber: true, status: true, total: true } },
  voucher: { select: { id: true, voucherNumber: true } },
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
  const q = req.query;
  const vehicleType = String(q.vehicleType ?? '').trim();
  const pax         = Math.max(1, parseInt(String(q.pax ?? '1'), 10));
  const roundTrip   = q.roundTrip === 'true';
  const groupTypeId = String(q.groupTypeId ?? '').trim();
  const date        = q.date ? new Date(String(q.date)) : undefined;

  // Typed endpoints (preferred) with legacy free-text fallback (from/to → name).
  const fromRef = { type: str(q.fromType), id: str(q.fromId), name: str(q.fromName) || str(q.from) };
  const toRef   = { type: str(q.toType),   id: str(q.toId),   name: str(q.toName)   || str(q.to) };

  const match = await resolveTransportRate({
    rateId: str(q.rateId),
    from: fromRef,
    to: toRef,
    vehicleType: vehicleType || null,
    pax,
    transportType: str(q.type),
    destinationId: str(q.destinationId),
  });

  if (!match) {
    res.json({ success: true, data: { found: false, message: 'PRICE_ON_REQUEST' } });
    return;
  }
  const { rate, matchedDirection } = match;

  const { market, companyId } = await resolvePriceContext(req);
  const priceCtx = { market, companyId, pax, date };

  // Group-type adjustment (optional — no error when none applies).
  const applicableTypes = await findApplicableGroupTypes({
    scope: 'TRANSPORT',
    transportRateId: rate.id,
    destinationId: rate.destinationId ?? undefined,
    pax,
    date,
  });
  const groupType = groupTypeId
    ? applicableTypes.find((option) => option.id === groupTypeId)
    : applicableTypes[0];
  const adjust = (amount: Decimal) => (groupType ? applyGroupAdjustment(amount, groupType) : amount);

  // Sale price: dual-currency model when the rate opts in (NO FX, missing →
  // price on request); otherwise the legacy MarketPrice/base resolution.
  let oneWayBase: Decimal;
  let roundTripBase: Decimal;
  let currency: string;
  let roundTripIsEstimated: boolean;
  if (usesDualPricing(rate)) {
    const p = pickDualPrice(rate, market);
    if (!p.found || p.oneWay == null) {
      res.json({ success: true, data: { found: false, message: 'PRICE_ON_REQUEST', currency: p.currency, rateId: rate.id, matchedDirection } });
      return;
    }
    oneWayBase = p.oneWay;
    roundTripBase = p.roundTrip ?? p.oneWay.mul(2);
    currency = p.currency;
    roundTripIsEstimated = p.roundTripIsEstimated;
  } else {
    const oneWayMoney = await resolveMarketMoney('TRANSPORT', rate.id, priceCtx, rate.rate, rate.currency);
    const rtMoney = rate.roundTripRate
      ? await resolveMarketMoney('TRANSPORT_RT', rate.id, priceCtx, rate.roundTripRate, rate.currency)
      : { amount: oneWayMoney.amount.mul(2), currency: oneWayMoney.currency };
    oneWayBase = oneWayMoney.amount;
    roundTripBase = rtMoney.amount;
    currency = oneWayMoney.currency;
    roundTripIsEstimated = !rate.roundTripRate;
  }

  const oneWayRate = adjust(oneWayBase).toDecimalPlaces(2);
  const roundTripRate = adjust(roundTripBase).toDecimalPlaces(2);
  const totalAmount = roundTrip ? roundTripRate : oneWayRate;

  res.json({
    success: true,
    data: {
      found: true,
      rateId: rate.id,
      matchedDirection,
      oneWayRate,
      roundTripRate,
      roundTripIsEstimated,
      totalAmount,
      currency,
      serviceMode: rate.serviceMode,
      vehicleType: rate.vehicleType,
      rateType: rate.type,
      groupType: groupType ?? null,
      notes: rate.notes,
    },
  });
}

function str(v: unknown): string {
  return String(v ?? '').trim();
}

/** GET /api/transport-rates/locations — unique from/to values for dropdowns */
export async function getTransportLocations(_req: Request, res: Response): Promise<void> {
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
    rateId?: string;           // authoritative priced product (preferred over route match)
    serviceMode?: string;
    type: 'AIRPORT_TRANSFER' | 'PRIVATE_TRANSFER' | 'DAY_TOUR_TRANSPORT' | 'INTERCITY';
    vehicleType?: 'SEDAN' | 'SUV' | 'VAN_6' | 'VAN_12' | 'MINIBUS_20' | 'BUS_45' | 'LUXURY_LIMO';
    fromLocation?: string; toLocation?: string;
    fromType?: string; toType?: string;
    // Typed endpoint soft refs + display names (AIRPORT | HOTEL | DESTINATION)
    fromId?: string; fromName?: string; toId?: string; toName?: string;
    returnFromId?: string; returnToId?: string;
    // Structured journey (independent of the rate's display labels)
    pickupType?: string; pickupLocation?: string; pickupAddress?: string; pickupHotelName?: string;
    dropoffType?: string; dropoffLocation?: string; dropoffAddress?: string; dropoffHotelName?: string;
    pickupDateTime: string; returnDateTime?: string;
    isRoundTrip?: boolean; sameRouteReversed?: boolean; passengerCount?: number;
    // Return leg (independent endpoints)
    returnFromLocation?: string; returnToLocation?: string;
    returnFromType?: string; returnToType?: string;
    returnPickupHotelName?: string; returnPickupAddress?: string;
    returnDropoffHotelName?: string; returnDropoffAddress?: string;
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
  const pickupDateTime = new Date(body.pickupDateTime);
  const returnDateTime = body.returnDateTime ? new Date(body.returnDateTime) : null;

  // ── Resolve the priced product FIRST. rateId is authoritative; otherwise the
  //    typed-endpoint resolver matches EXACT then REVERSED (bidirectional) — so
  //    "Airport → Cairo" also prices "Cairo → Airport".
  const match = await resolveTransportRate({
    rateId: body.rateId ?? null,
    from: { type: body.fromType, id: body.fromId, name: body.fromName || body.fromLocation },
    to: { type: body.toType, id: body.toId, name: body.toName || body.toLocation },
    vehicleType: body.vehicleType ?? null,
    pax: passengerCount,
    transportType: body.rateId ? null : body.type,
    destinationId: body.rateId ? null : body.destinationId,
  });
  if (!match) {
    res.status(400).json({
      success: false,
      error: 'USE_QUOTE_REQUEST',
      message: 'No matching transport rate found for the selected service and vehicle. Please submit a quote request via /api/quote-requests.',
    });
    return;
  }
  const matchingRate = match.rate;
  const matchedDirection = match.matchedDirection;

  // The rate is the priced product; its service mode drives field validation.
  const serviceMode = matchingRate.serviceMode;
  const isDisposal = serviceMode === 'HOURLY_CHARTER' || serviceMode === 'DAY_USE';
  const T = (t?: string | null) => String(t ?? '').toUpperCase();
  const isHotel = (t?: string | null) => T(t) === 'HOTEL';
  const fail = (message: string, error = 'VALIDATION_ERROR') =>
    res.status(400).json({ success: false, error, message });

  // Effective journey endpoints (structured fields preferred; typed-endpoint
  // names + legacy from/to as fallbacks).
  const pickupType = body.pickupType ?? body.fromType ?? null;
  const dropoffType = body.dropoffType ?? body.toType ?? null;
  const pickupHotelName = body.pickupHotelName?.trim() || null;
  const pickupAddress = body.pickupAddress?.trim() || null;
  const pickupLocation = body.pickupLocation?.trim() || body.fromName?.trim() || body.fromLocation?.trim() || null;
  const dropoffHotelName = body.dropoffHotelName?.trim() || null;
  const dropoffAddress = body.dropoffAddress?.trim() || null;
  const dropoffLocation = body.dropoffLocation?.trim() || body.toName?.trim() || body.toLocation?.trim() || null;

  // For hourly / day-use disposal, the rate's "from" is just the service label
  // (e.g. "Cairo (8 hours)") — a REAL, different pickup point is required. For a
  // normal transfer the typed endpoint IS the pickup, so no exclusion applies.
  const rateLabels = new Set(
    [matchingRate.fromLocation, matchingRate.toLocation, matchingRate.serviceArea, matchingRate.serviceNameEn, matchingRate.serviceNameAr]
      .filter(Boolean)
      .map((s) => String(s).trim().toLowerCase()),
  );
  const pickupIsJustLabel = !!pickupLocation && rateLabels.has(pickupLocation.trim().toLowerCase());
  const effectivePickupLoc = isDisposal ? (pickupIsJustLabel ? null : pickupLocation) : pickupLocation;
  const hasRealPickup = isHotel(pickupType) ? !!pickupHotelName : !!(pickupAddress || effectivePickupLoc);
  if (isDisposal && !hasRealPickup) {
    fail('A real pickup location (hotel, address, airport or landmark) is required for hourly / day-use transport.', 'PICKUP_REQUIRED');
    return;
  }
  if (!isDisposal) {
    if (!hasRealPickup) { fail('A pickup location is required.', 'PICKUP_REQUIRED'); return; }
    const hasRealDropoff = isHotel(dropoffType) ? !!dropoffHotelName : !!(dropoffAddress || dropoffLocation);
    if (!hasRealDropoff) { fail('A drop-off location is required.', 'DROPOFF_REQUIRED'); return; }
  }
  if (isHotel(pickupType) && !pickupHotelName) { fail('Pickup hotel name is required when the pickup is a hotel.'); return; }
  if (isHotel(dropoffType) && !dropoffHotelName) { fail('Drop-off hotel name is required when the destination is a hotel.'); return; }

  // ── Round-trip validation (Finding 2 / §3) — independent return leg.
  const sameRouteReversed = body.sameRouteReversed !== false; // default true
  if (body.isRoundTrip) {
    if (!returnDateTime) { fail('Return date and time are required for a round trip.'); return; }
    if (returnDateTime <= pickupDateTime) { fail('Return date/time must be later than the outbound pickup date/time.', 'RETURN_BEFORE_OUTBOUND'); return; }
    if (!sameRouteReversed) {
      const rFromHotel = body.returnPickupHotelName?.trim() || null;
      const rToHotel = body.returnDropoffHotelName?.trim() || null;
      const rFromLoc = body.returnFromLocation?.trim() || body.returnPickupAddress?.trim() || null;
      const rToLoc = body.returnToLocation?.trim() || body.returnDropoffAddress?.trim() || null;
      if (!(rFromHotel || rFromLoc)) { fail('Return pickup location is required for a different return route.', 'RETURN_PICKUP_REQUIRED'); return; }
      if (!(rToHotel || rToLoc)) { fail('Return drop-off location is required for a different return route.', 'RETURN_DROPOFF_REQUIRED'); return; }
      if (isHotel(body.returnFromType) && !rFromHotel) { fail('Return pickup hotel name is required when the return pickup is a hotel.'); return; }
      if (isHotel(body.returnToType) && !rToHotel) { fail('Return drop-off hotel name is required when the return destination is a hotel.'); return; }
    }
  }

  // ── Group type (service tier) — optional. When the route has no configured
  //    group types we price without any tier adjustment.
  const applicableTypes = await findApplicableGroupTypes({
    scope: 'TRANSPORT',
    transportRateId: matchingRate.id,
    destinationId: matchingRate.destinationId ?? undefined,
    pax: passengerCount,
    date: pickupDateTime,
  });
  const groupType = body.groupTypeId
    ? applicableTypes.find((option) => option.id === body.groupTypeId)
    : applicableTypes[0];
  if (body.groupTypeId && !groupType) {
    res.status(400).json({ success: false, error: 'INVALID_GROUP_TYPE', message: 'Selected transport type is not available' });
    return;
  }
  const adjust = (amount: Decimal) => (groupType ? applyGroupAdjustment(amount, groupType) : amount);

  // ── Pricing: explicit admin price, NO FX. Dual-currency rates resolve EGP for
  //    Egyptian companies / USD otherwise (missing → quote request). Legacy rates
  //    keep MarketPrice/base resolution. Round trip = explicit RT price or two legs.
  const priceCtx = { market: company.market, companyId, pax: passengerCount, date: pickupDateTime };
  const dual = usesDualPricing(matchingRate);

  let outboundOneWayAmt: Decimal;
  let priceCurrency: string;
  if (dual) {
    const p = pickDualPrice(matchingRate, company.market);
    if (!p.found || p.oneWay == null) {
      res.status(400).json({ success: false, error: 'PRICE_ON_REQUEST', message: `No ${p.currency} price is configured for this route. Please submit a quote request.` });
      return;
    }
    outboundOneWayAmt = p.oneWay;
    priceCurrency = p.currency;
  } else {
    const m = await resolveMarketMoney('TRANSPORT', matchingRate.id, priceCtx, matchingRate.rate, matchingRate.currency);
    outboundOneWayAmt = m.amount;
    priceCurrency = m.currency;
  }

  let sourceAmountRaw = adjust(outboundOneWayAmt);
  let pricingRule = 'ONE_WAY';

  if (body.isRoundTrip) {
    if (sameRouteReversed) {
      if (dual) {
        const p = pickDualPrice(matchingRate, company.market);
        const rt = p.roundTrip ?? outboundOneWayAmt.mul(2);
        sourceAmountRaw = adjust(rt);
        pricingRule = p.roundTripIsEstimated ? 'ROUND_TRIP_TWO_ONE_WAY' : 'ROUND_TRIP_EXPLICIT';
      } else if (matchingRate.roundTripRate) {
        const rt = await resolveMarketMoney('TRANSPORT_RT', matchingRate.id, priceCtx, matchingRate.roundTripRate, matchingRate.currency);
        sourceAmountRaw = adjust(rt.amount);
        priceCurrency = rt.currency;
        pricingRule = 'ROUND_TRIP_EXPLICIT';
      } else {
        sourceAmountRaw = adjust(outboundOneWayAmt.mul(2));
        pricingRule = 'ROUND_TRIP_TWO_ONE_WAY';
      }
    } else {
      const returnMatch = await resolveTransportRate({
        from: { type: body.returnFromType, id: body.returnFromId, name: body.returnPickupHotelName || body.returnFromLocation },
        to: { type: body.returnToType, id: body.returnToId, name: body.returnDropoffHotelName || body.returnToLocation },
        vehicleType: body.vehicleType ?? null,
        pax: passengerCount,
      });
      if (!returnMatch) {
        res.status(400).json({ success: false, error: 'RETURN_PRICE_ON_REQUEST', message: 'No price is configured for the different return route. Please submit a quote request for this round trip.' });
        return;
      }
      let returnOneWayAmt: Decimal;
      let returnCurrency: string;
      if (usesDualPricing(returnMatch.rate)) {
        const rp = pickDualPrice(returnMatch.rate, company.market);
        if (!rp.found || rp.oneWay == null) {
          res.status(400).json({ success: false, error: 'RETURN_PRICE_ON_REQUEST', message: 'No price is configured for the return route in your currency. Please submit a quote request.' });
          return;
        }
        returnOneWayAmt = rp.oneWay;
        returnCurrency = rp.currency;
      } else {
        const rm = await resolveMarketMoney('TRANSPORT', returnMatch.rate.id, priceCtx, returnMatch.rate.rate, returnMatch.rate.currency);
        returnOneWayAmt = rm.amount;
        returnCurrency = rm.currency;
      }
      if (returnCurrency !== priceCurrency) {
        res.status(400).json({ success: false, error: 'MIXED_CURRENCY', message: `Outbound (${priceCurrency}) and return (${returnCurrency}) legs use different currencies. They must match.` });
        return;
      }
      sourceAmountRaw = adjust(outboundOneWayAmt).add(adjust(returnOneWayAmt));
      pricingRule = 'ROUND_TRIP_TWO_LEGS';
    }
  }

  const charge = explicitMoney(sourceAmountRaw, priceCurrency);
  const totalAmount = charge.totalAmount;
  const currency = charge.currency;

  // Stored route summary + return leg (reversed-outbound by default; independent when unlocked).
  const fromLocationStore = pickupHotelName || pickupLocation || pickupAddress || matchingRate.serviceNameEn || matchingRate.serviceArea || matchingRate.fromLocation || 'Pickup';
  const toLocationStore = dropoffHotelName || dropoffLocation || dropoffAddress || (isDisposal ? (matchingRate.serviceNameEn || matchingRate.serviceArea || 'At disposal') : (matchingRate.toLocation || 'Drop-off'));
  const ret = body.isRoundTrip
    ? (sameRouteReversed
        ? { fromLocation: toLocationStore, toLocation: fromLocationStore, fromType: dropoffType, toType: pickupType, pickupHotelName: dropoffHotelName, pickupAddress: dropoffAddress, dropoffHotelName: pickupHotelName, dropoffAddress: pickupAddress }
        : { fromLocation: body.returnFromLocation?.trim() || body.returnPickupAddress?.trim() || toLocationStore, toLocation: body.returnToLocation?.trim() || body.returnDropoffAddress?.trim() || fromLocationStore, fromType: body.returnFromType ?? null, toType: body.returnToType ?? null, pickupHotelName: body.returnPickupHotelName?.trim() || null, pickupAddress: body.returnPickupAddress?.trim() || null, dropoffHotelName: body.returnDropoffHotelName?.trim() || null, dropoffAddress: body.returnDropoffAddress?.trim() || null })
    : null;

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
          rateId: matchingRate.id,
          matchedDirection,
          serviceMode,
          fromLocation: fromLocationStore,
          toLocation: toLocationStore,
          fromType: pickupType,
          toType: dropoffType,
          pickupType,
          pickupLocation,
          pickupAddress,
          pickupHotelName,
          dropoffType,
          dropoffLocation,
          dropoffAddress,
          dropoffHotelName,
          pickupDateTime,
          returnDateTime,
          isRoundTrip: body.isRoundTrip ?? false,
          sameRouteReversed: body.isRoundTrip ? sameRouteReversed : true,
          returnFromLocation: ret?.fromLocation ?? null,
          returnToLocation: ret?.toLocation ?? null,
          returnFromType: ret?.fromType ?? null,
          returnToType: ret?.toType ?? null,
          returnPickupHotelName: ret?.pickupHotelName ?? null,
          returnPickupAddress: ret?.pickupAddress ?? null,
          returnDropoffHotelName: ret?.dropoffHotelName ?? null,
          returnDropoffAddress: ret?.dropoffAddress ?? null,
          passengerCount,
          passengerNames: setJsonStringArray(body.passengerNames),
          passengerName: body.passengerName ?? null,
          flightNumber: body.flightNumber ?? null,
          airlineName: body.airlineName ?? null,
          returnFlightNumber: body.returnFlightNumber ?? null,
          returnAirlineName: body.returnAirlineName ?? null,
          contactNumber: body.contactNumber ?? null,
          groupTypeId: groupType?.id ?? null,
          groupTypeLabel: groupType?.labelEn ?? null,
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

    // Generate customer voucher (no price) before responding when possible so
    // the company portal can show "Download Voucher" immediately.
    const voucherId = await createVoucherForService({
      type: 'transport',
      bookingId: booking.id,
      companyId,
      clientName: body.passengerName ?? null,
    });
    const responseBooking = voucherId
      ? await prisma.transportBooking.findUnique({ where: { id: booking.id }, include: transportInclude })
      : booking;

    // Notify the configured recipient(s). TRANSPORT_NOTIFY_EMAIL is the
    // optional operations inbox configured in Railway.
    const recipients = [company.email, process.env.TRANSPORT_NOTIFY_EMAIL].filter(Boolean) as string[];
    if (recipients.length) {
      sendEmail(
        recipients,
        `🚐 Transport Booking — ${booking.refNumber}`,
        `<table style="font-family:sans-serif;font-size:14px;border-collapse:collapse">
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Ref</td><td style="padding:6px 12px">${escapeHtml(booking.refNumber)}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Route</td><td style="padding:6px 12px">${escapeHtml(fromLocationStore)} → ${escapeHtml(toLocationStore)}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Vehicle</td><td style="padding:6px 12px">${escapeHtml(body.vehicleType ?? 'SEDAN')}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Service Type</td><td style="padding:6px 12px">${escapeHtml(groupType?.labelEn ?? '—')}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Pickup</td><td style="padding:6px 12px">${escapeHtml(body.pickupDateTime)}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Pax</td><td style="padding:6px 12px">${passengerCount}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Lead Pax</td><td style="padding:6px 12px">${escapeHtml(body.passengerName ?? '—')}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Contact</td><td style="padding:6px 12px">${escapeHtml(body.contactNumber ?? '—')}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Flight</td><td style="padding:6px 12px">${escapeHtml(body.airlineName ?? '')} ${escapeHtml(body.flightNumber ?? '—')}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Round Trip</td><td style="padding:6px 12px">${body.isRoundTrip ? 'Yes' : 'No'}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Total</td><td style="padding:6px 12px">${totalAmount} ${escapeHtml(currency)}</td></tr>
          ${body.notes ? `<tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Notes</td><td style="padding:6px 12px">${escapeHtml(body.notes)}</td></tr>` : ''}
        </table>`,
      ).catch(console.error);
    }

    res.status(201).json({
      success: true,
      data: responseBooking ?? booking,
      pricing: { rule: pricingRule, total: totalAmount, currency, serviceMode },
    });
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

      // Debit the wallet once (idempotent on the DEBIT transaction; a proforma
      // invoice already exists from booking time). Throws INSUFFICIENT_BALANCE,
      // mapped to a 400 in the catch below.
      await debitWallet(tx, {
        companyId: booking.companyId,
        amount: booking.totalAmount,
        reference: booking.refNumber,
        description: `Confirmed transport booking ${booking.refNumber}`,
        createdById: req.user!.id,
      });

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

  // Refund once (idempotent — only when a DEBIT exists and no REFUND yet).
  await prisma.$transaction((tx) =>
    refundWallet(tx, {
      companyId: booking.companyId,
      amount: booking.totalAmount,
      reference: booking.refNumber,
      description: `Refund cancelled transport ${booking.refNumber}`,
      createdById: caller.id,
    }),
  );

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
  // Apply explicit price overrides for the caller's market AND company (verbatim, no FX)
  const { market, companyId } = await resolvePriceContext(req);
  const ids = rates.map(r => r.id);
  const [oneWayOv, rtOv] = await Promise.all([
    resolveMarketPriceMap('TRANSPORT', ids, { market, companyId }),
    resolveMarketPriceMap('TRANSPORT_RT', ids, { market, companyId }),
  ]);
  for (const r of rates) {
    const ow = oneWayOv.get(r.id);
    if (ow != null) {
      r.rate = ow.amount;
      r.currency = ow.currency;
    }
    const rt = rtOv.get(r.id);
    if (rt != null) {
      r.roundTripRate = rt.amount;
      r.currency = rt.currency;
    }
  }
  res.json({ success: true, data: rates });
}
