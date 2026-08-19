import { Request, Response } from 'express';
import { Decimal } from '@prisma/client/runtime/library';
import { ActivityCategory, BookingStatus } from '@prisma/client';
import { prisma } from '../../config/db';
import { generateRef, generateInvoiceNumber, paginate, paginateMeta, escapeHtml } from '../../shared/helpers';
import { setJsonStringArray } from '../../shared/json-array';
import { resolvePriceContext, applyMarketPrice, resolveMarketMoney } from '../../shared/pricing';
import { sendEmail } from '../../shared/email.templates';
import { generateInvoicePdf } from '../invoices/pdf.generator';
import { applyGroupAdjustment, findApplicableGroupTypes } from '../group-types/group-types.service';
import { explicitMoney, invoiceMoneySnapshotData } from '../../shared/money';
import { buildInvoiceTotals } from '../../shared/invoicing';
import { createVoucherForService } from '../vouchers/vouchers.controller';
import { debitWallet, refundWallet } from '../../shared/wallet';

const activityInclude = {
  activity: { select: { id: true, name: true, city: true, category: true } },
  company: { select: { id: true, name: true, email: true } },
  createdBy: { select: { id: true, name: true } },
  confirmedBy: { select: { id: true, name: true } },
  groupType: { select: { id: true, code: true, labelEn: true, labelAr: true } },
  invoice: { select: { id: true, invoiceNumber: true, status: true, total: true } },
  voucher: { select: { id: true, voucherNumber: true } },
};

export async function listActivities(req: Request, res: Response): Promise<void> {
  // An admin managing the catalogue must be able to see (and reinstate) the
  // rows they deactivated — deleteActivity only flips isActive, so without this
  // a "deleted" excursion would vanish from the admin screen for good.
  const wantsInactive = req.query.includeInactive === 'true' && req.user?.role === 'SUPERADMIN';
  const where = {
    ...(wantsInactive ? {} : { isActive: true }),
    // city is now a free-text field (case-insensitive contains)
    ...(req.query.city && { city: { contains: String(req.query.city), mode: 'insensitive' as const } }),
    ...(req.query.category && { category: req.query.category as ActivityCategory }),
    ...(req.query.destinationId && { destinationId: String(req.query.destinationId) }),
    ...(req.query.confirmableOnly && { isConfirmableInApp: true }),
  };
  const activities = await prisma.activity.findMany({
    where,
    orderBy: { name: 'asc' },
    include: {
      destination: { select: { id: true, name: true, nameAr: true, slug: true } },
    },
  });
  // Apply explicit price overrides (adult + child) for the caller's market AND company
  const { market, companyId } = await resolvePriceContext(req);
  await applyMarketPrice(activities, {
    entityType: 'ACTIVITY_ADULT', market, companyId, priceField: 'priceAdult', currencyField: 'currency',
  });
  await applyMarketPrice(activities, {
    entityType: 'ACTIVITY_CHILD', market, companyId, priceField: 'priceChild', currencyField: 'currency',
  });
  res.json({ success: true, data: activities });
}

/** Every way an excursion can be priced. A blank field means "not sold this
 *  way" — it must stay null rather than becoming a zero, or the activity would
 *  read as free. */
const ACTIVITY_PRICE_FIELDS = ['priceAdult', 'priceChild', 'priceSingle', 'priceDouble', 'priceTriple'] as const;

function priceOrNull(v: unknown): Decimal | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? new Decimal(n) : null;
}

/** Array-like fields the form sends as a list (or as delimited text). */
const ACTIVITY_LIST_FIELDS = ['timeSlots', 'includes', 'excludes', 'galleryUrls'] as const;

/**
 * The catalogue is organised by destination, so `destinationId` is the field
 * that decides where an excursion appears. `city` stays as the human label and
 * is kept in step with the chosen destination — it is what the agency search,
 * the vouchers and the older imported rows all read. Picking "Cairo" therefore
 * files the activity under Cairo AND labels it "Cairo", with no second field to
 * fill in by hand; clearing the destination leaves the last label in place.
 */
async function syncDestinationCity(
  data: Record<string, unknown>,
  destinationId: unknown,
): Promise<void> {
  if (destinationId === undefined) return;
  if (!destinationId) { data.destinationId = null; return; }
  const destination = await prisma.destination.findUnique({
    where: { id: String(destinationId) },
    select: { id: true, name: true },
  });
  if (!destination) throw new Error('DESTINATION_NOT_FOUND');
  data.destinationId = destination.id;
  // An explicitly typed city wins; otherwise the destination names the row.
  if (!String(data.city ?? '').trim()) data.city = destination.name;
}

export async function createActivity(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const data: Record<string, unknown> = { ...body };
  for (const f of ACTIVITY_PRICE_FIELDS) data[f] = priceOrNull(body[f]);
  for (const f of ACTIVITY_LIST_FIELDS) {
    if (body[f] !== undefined) data[f] = setJsonStringArray(body[f]);
  }
  data.isConfirmableInApp = body.isConfirmableInApp !== undefined && body.isConfirmableInApp !== null
    ? Boolean(body.isConfirmableInApp)
    : true;
  try {
    await syncDestinationCity(data, body.destinationId);
  } catch {
    res.status(400).json({ success: false, error: 'DESTINATION_NOT_FOUND', message: 'Unknown destination' });
    return;
  }
  data.city = String(data.city ?? '').trim();
  if (!data.city) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'Pick a destination or type a city' });
    return;
  }
  const activity = await prisma.activity.create({
    data: data as Parameters<typeof prisma.activity.create>[0]['data'],
    include: { destination: { select: { id: true, name: true, nameAr: true } } },
  });
  res.status(201).json({ success: true, data: activity });
}

export async function updateActivity(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const data: Record<string, unknown> = { ...body };
  for (const f of ACTIVITY_PRICE_FIELDS) {
    if (body[f] !== undefined) data[f] = priceOrNull(body[f]);
  }
  for (const f of ACTIVITY_LIST_FIELDS) {
    if (body[f] !== undefined) data[f] = setJsonStringArray(body[f]);
  }
  if (body.isConfirmableInApp !== undefined) data.isConfirmableInApp = Boolean(body.isConfirmableInApp);
  if (body.isActive !== undefined && body.isActive !== null) data.isActive = Boolean(body.isActive);
  try {
    await syncDestinationCity(data, body.destinationId);
  } catch {
    res.status(400).json({ success: false, error: 'DESTINATION_NOT_FOUND', message: 'Unknown destination' });
    return;
  }
  if (data.city !== undefined) {
    const city = String(data.city ?? '').trim();
    if (!city) { delete data.city; } else { data.city = city; }
  }
  const activity = await prisma.activity.update({
    where: { id: req.params.id },
    data,
    include: { destination: { select: { id: true, name: true, nameAr: true } } },
  });
  res.json({ success: true, data: activity });
}

export async function deleteActivity(req: Request, res: Response): Promise<void> {
  await prisma.activity.update({ where: { id: req.params.id }, data: { isActive: false } });
  res.json({ success: true });
}

export async function listActivityBookings(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const page = parseInt(String(req.query.page ?? '1'));
  const limit = parseInt(String(req.query.limit ?? '20'));
  const { skip, take } = paginate(page, limit);

  const companyFilter = caller.role === 'SUPERADMIN'
    ? (req.query.companyId ? { companyId: String(req.query.companyId) } : {})
    : { companyId: caller.companyId! };

  const where = { ...companyFilter, ...(req.query.status && { status: req.query.status as BookingStatus }) };

  const [bookings, total] = await Promise.all([
    prisma.activityBooking.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, include: activityInclude }),
    prisma.activityBooking.count({ where }),
  ]);
  res.json({ success: true, data: bookings, meta: paginateMeta(total, page, limit) });
}

export async function createActivityBooking(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const body = req.body as {
    activityId: string; companyId?: string;
    activityDate: string;
    selectedTime?: string;
    groupTypeId?: string;
    adultsCount?: number; childrenCount?: number;
    childAges?: number[];
    clientName?: string;
    clientPhone?: string;
    hotelName?: string;
    passengerNames?: string[];
    // PER_PERSON (adult/child) or SINGLE | DOUBLE | TRIPLE for a flat party rate.
    pricingBasis?: string;
    // totalAmount is intentionally ignored — computed server-side from activity prices
    notes?: string;
  };

  const companyId = caller.role === 'SUPERADMIN' ? (body.companyId ?? caller.companyId!) : caller.companyId!;
  if (!companyId) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'companyId required' });
    return;
  }

  // Resolve activity to compute amount server-side — never trust client totals
  const activity = await prisma.activity.findUnique({
    where: { id: body.activityId },
    select: {
      priceAdult: true,
      priceChild: true,
      priceSingle: true,
      priceDouble: true,
      priceTriple: true,
      currency: true,
      isActive: true,
      isConfirmableInApp: true,
      destinationId: true,
    },
  });
  if (!activity || !activity.isActive) {
    res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Activity not found or inactive' });
    return;
  }
  if (!activity.isConfirmableInApp) {
    res.status(400).json({ success: false, error: 'USE_QUOTE_REQUEST', message: 'This activity requires a quote request' });
    return;
  }

  // Verify company is active — no wallet debit at creation; booking is PENDING
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { isActive: true, email: true, market: true, currency: true },
  });
  if (!company?.isActive) {
    res.status(400).json({ success: false, error: 'COMPANY_INACTIVE' });
    return;
  }

  const adultsCount = Math.max(1, body.adultsCount ?? 1);
  const childrenCount = Math.max(0, body.childrenCount ?? 0);
  // Server-side calculation — authoritative amount, using the company's market price tier
  const activityDate = new Date(body.activityDate);
  const applicableTypes = await findApplicableGroupTypes({
    scope: 'ACTIVITY',
    activityId: body.activityId,
    destinationId: activity.destinationId ?? undefined,
    pax: adultsCount + childrenCount,
    date: activityDate,
  });
  const groupType = body.groupTypeId
    ? applicableTypes.find((option) => option.id === body.groupTypeId)
    : applicableTypes[0];
  if (!groupType) {
    res.status(400).json({ success: false, error: 'INVALID_GROUP_TYPE', message: 'Selected activity type is not available' });
    return;
  }

  const pax = adultsCount + childrenCount;
  // Full pricing context — company override beats market row beats default (Finding 6)
  const priceCtx = { market: company.market, companyId, pax, date: activityDate };
  // An excursion is sold either per head or as a whole party at a flat rate —
  // a private tour for two costs what it costs regardless of who is in the car.
  // The basis decides which of the activity's prices applies; a blank price
  // means the trip is not sold that way, and pricing it at zero would give it
  // away, so those cases are refused and routed to a quote request.
  const PARTY_PRICE: Record<string, Decimal | null> = {
    SINGLE: activity.priceSingle,
    DOUBLE: activity.priceDouble,
    TRIPLE: activity.priceTriple,
  };
  const basis = String(body.pricingBasis ?? 'PER_PERSON').toUpperCase();
  if (basis !== 'PER_PERSON' && !(basis in PARTY_PRICE)) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'Unknown pricing basis.' });
    return;
  }

  let sourceAmountRaw: Decimal;
  let priceCurrency: string;

  if (basis === 'PER_PERSON') {
    if (adultsCount > 0 && activity.priceAdult == null) {
      res.status(400).json({
        success: false,
        error: 'PRICE_ON_REQUEST',
        message: 'This activity has no per-adult price configured. Please submit a quote request.',
      });
      return;
    }
    if (childrenCount > 0 && activity.priceChild == null) {
      res.status(400).json({
        success: false,
        error: 'PRICE_ON_REQUEST',
        message: 'This activity has no per-child price configured. Please submit a quote request.',
      });
      return;
    }
    const [adultPrice, childPrice] = await Promise.all([
      resolveMarketMoney('ACTIVITY_ADULT', body.activityId, priceCtx, activity.priceAdult ?? new Decimal(0), activity.currency),
      resolveMarketMoney('ACTIVITY_CHILD', body.activityId, priceCtx, activity.priceChild ?? new Decimal(0), activity.currency),
    ]);
    // Explicit admin prices are used verbatim — the sale price is NEVER FX-converted (Finding 5).
    if (childrenCount > 0 && adultPrice.currency !== childPrice.currency) {
      res.status(400).json({ success: false, error: 'MIXED_CURRENCY', message: 'Adult and child prices are configured in different currencies for this activity. Align them or use a quote request.' });
      return;
    }
    sourceAmountRaw = adultPrice.amount.mul(adultsCount).add(childPrice.amount.mul(childrenCount));
    priceCurrency = adultPrice.currency;
  } else {
    const partyPrice = PARTY_PRICE[basis];
    if (partyPrice == null) {
      res.status(400).json({
        success: false,
        error: 'PRICE_ON_REQUEST',
        message: 'This activity is not sold at that party size. Please submit a quote request.',
      });
      return;
    }
    // One flat price for the whole party — never multiplied by the head count.
    sourceAmountRaw = partyPrice;
    priceCurrency = activity.currency;
  }

  const snap = explicitMoney(applyGroupAdjustment(sourceAmountRaw, groupType), priceCurrency);
  const { currency, sourceCurrency, sourceAmount, totalAmount, exchangeRate, exchangeRateAt } = snap;

  try {
    const refNumber = await generateRef(prisma, 'ACT');

    const booking = await prisma.activityBooking.create({
      data: {
        refNumber,
        activityId: body.activityId,
        companyId,
        createdById: caller.id,
        activityDate,
        selectedTime: body.selectedTime ?? null,
        pricingBasis: basis,
        activityType: groupType.code,
        groupTypeId: groupType.id,
        groupTypeLabel: groupType.labelEn,
        adultsCount,
        childrenCount,
        childAges: body.childAges ?? undefined,
        clientName: body.clientName ?? null,
        clientPhone: body.clientPhone ?? null,
        hotelName: body.hotelName ?? null,
        passengerNames: setJsonStringArray(body.passengerNames),
        totalAmount,   // server-calculated
        currency,
        sourceAmount,
        sourceCurrency,
        exchangeRate,
        exchangeRateAt,
        notes: body.notes,
        status: 'PENDING',
      },
      include: activityInclude,
    });

    // Generate customer voucher (no price) before responding when possible so
    // the company portal can show "Download Voucher" after creation/refresh.
    const voucherId = await createVoucherForService({
      type: 'activity',
      bookingId: booking.id,
      companyId,
      clientName: body.clientName ?? null,
    });
    const responseBooking = voucherId
      ? await prisma.activityBooking.findUnique({ where: { id: booking.id }, include: activityInclude })
      : booking;

    // Rich email notification
    if (company.email && process.env.INTERNAL_TEAM_EMAIL) {
      sendEmail(
        [company.email, process.env.INTERNAL_TEAM_EMAIL],
        `🎯 Activity Booking — ${booking.refNumber}`,
        `<table style="font-family:sans-serif;font-size:14px;border-collapse:collapse">
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Activity</td><td style="padding:6px 12px">${escapeHtml(booking.activity?.name ?? body.activityId)}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Date</td><td style="padding:6px 12px">${escapeHtml(body.activityDate)}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Time</td><td style="padding:6px 12px">${escapeHtml(body.selectedTime ?? '—')}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Type</td><td style="padding:6px 12px">${escapeHtml(groupType.labelEn)}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Client</td><td style="padding:6px 12px">${escapeHtml(body.clientName ?? '—')}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Phone</td><td style="padding:6px 12px">${escapeHtml(body.clientPhone ?? '—')}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Hotel</td><td style="padding:6px 12px">${escapeHtml(body.hotelName ?? '—')}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Adults</td><td style="padding:6px 12px">${adultsCount}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Children</td><td style="padding:6px 12px">${childrenCount}${body.childAges?.length ? ' (ages: ' + escapeHtml(body.childAges.join(', ')) + ')' : ''}</td></tr>
          <tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Total</td><td style="padding:6px 12px">${totalAmount} ${escapeHtml(currency)}</td></tr>
          ${body.notes ? `<tr><td style="padding:6px 12px;font-weight:bold;background:#f0f4f8">Notes</td><td style="padding:6px 12px">${escapeHtml(body.notes)}</td></tr>` : ''}
        </table>`,
      ).catch(console.error);
    }

    res.status(201).json({ success: true, data: responseBooking ?? booking });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
  }
}

/** Admin: confirm an activity booking → debit wallet + generate invoice */
export async function confirmActivityBooking(req: Request, res: Response): Promise<void> {
  const bookingId = req.params.id;

  try {
    await prisma.$transaction(async (tx) => {
      const booking = await tx.activityBooking.findUniqueOrThrow({
        where: { id: bookingId },
        include: { company: true, invoice: true },
      });

      if (booking.status !== 'PENDING') throw new Error('INVALID_STATUS');
      if (!booking.company.isActive) throw new Error('COMPANY_INACTIVE');

      if (!booking.invoice) {
        await debitWallet(tx, {
          companyId: booking.companyId,
          amount: booking.totalAmount,
          reference: booking.refNumber,
          description: `Confirmed activity booking ${booking.refNumber}`,
          createdById: req.user!.id,
        });

        const invoiceNumber = await generateInvoiceNumber(prisma);
        const invoiceTotals = buildInvoiceTotals(booking.totalAmount);

        await tx.invoice.create({
          data: {
            invoiceNumber,
            activityBookingId: booking.id,
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

      await tx.activityBooking.update({
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

  const updated = await prisma.activityBooking.findUnique({ where: { id: bookingId }, include: activityInclude });

  // Generate PDF in background
  if (updated?.invoice) {
    const fullInvoice = await prisma.invoice.findUnique({
      where: { id: (updated.invoice as { id: string }).id },
      include: { activityBooking: { include: { company: true, activity: true } }, company: true },
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

export async function cancelActivityBooking(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const booking = await prisma.activityBooking.findUniqueOrThrow({ where: { id: req.params.id }, include: { invoice: true } });
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
      description: `Refund activity ${booking.refNumber}`,
      createdById: caller.id,
    }),
  );

  const updated = await prisma.$transaction(async (tx) => {
    await tx.invoice.updateMany({
      where: { activityBookingId: booking.id },
      data: { status: 'CANCELLED' },
    });
    return tx.activityBooking.update({
      where: { id: req.params.id },
      data: { status: 'CANCELLED' },
      include: activityInclude,
    });
  });
  res.json({ success: true, data: updated });
}
