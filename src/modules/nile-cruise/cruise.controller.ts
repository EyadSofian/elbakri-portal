import { BookingStatus, CruiseRoute, ShipType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { Request, Response } from 'express';
import { prisma } from '../../config/db';
import { sendEmail } from '../../shared/email.templates';
import { generateInvoiceNumber, generateRef, paginate, paginateMeta } from '../../shared/helpers';
import { setJsonStringArray } from '../../shared/json-array';
import { explicitMoney, invoiceMoneySnapshotData } from '../../shared/money';
import { resolvePriceContext, resolveMarketPriceMap } from '../../shared/pricing';
import { generateInvoicePdf } from '../invoices/pdf.generator';
import { buildInvoiceTotals } from '../../shared/invoicing';
import { debitWallet, refundWallet } from '../../shared/wallet';
import {
  Occupancy,
  applicableRates,
  fromPrice,
  isOccupancy,
  priceCruiseBooking,
} from '../../shared/cruise-rates';
import { readItinerary } from '../../shared/itinerary';
import { readTransferAddOn } from '../../shared/transfer-addon';

const cruiseInclude = {
  cruise: { select: { id: true, name: true, route: true, shipType: true } },
  cabinRate: { select: { id: true, cabinName: true, cabinType: true, currency: true } },
  schedule: { select: { id: true, departureDay: true, returnDay: true, nights: true, label: true, labelAr: true } },
  addOns: { orderBy: { displayOrder: 'asc' as const } },
  company: { select: { id: true, name: true, email: true } },
  createdBy: { select: { id: true, name: true } },
  confirmedBy: { select: { id: true, name: true } },
  invoice: { select: { id: true, invoiceNumber: true, status: true, total: true } },
};

async function generateCruiseInvoicePdf(invoiceId: string): Promise<void> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { cruiseBooking: { include: { company: true, cruise: true } }, company: true },
  });
  if (!invoice || invoice.pdfPath) return;
  const generated = await generateInvoicePdf(invoice as Parameters<typeof generateInvoicePdf>[0]);
  await prisma.invoice.update({ where: { id: invoice.id }, data: { pdfPath: generated.path } });
}

export async function listCruises(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const where = {
    isActive: true,
    ...(req.query.route && { route: req.query.route as CruiseRoute }),
    ...(req.query.shipType && { shipType: req.query.shipType as ShipType }),
  };
  const cruises = await prisma.nileCruise.findMany({
    where,
    orderBy: { name: 'asc' },
    include: {
      cabinRates: { where: { isActive: true }, orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }] },
      schedules: { where: { isActive: true }, orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }] },
    },
  });
  // The programme is normalised on the way out as well as in: a boat whose rows
  // were written before this existed, or edited straight in the database, still
  // reaches every reader as one ordered, gap-free list.
  if (caller.role === 'SUPERADMIN') {
    res.json({
      success: true,
      data: cruises.map((cruise) => ({ ...cruise, itinerary: readItinerary(cruise.itinerary) })),
    });
    return;
  }

  // A sailing date narrows the rate rows to the period they cover, the same way
  // a hotel stay does. Without one the agent is browsing, so today decides.
  const on = req.query.date ? new Date(String(req.query.date)) : new Date();
  const sailingDate = Number.isNaN(on.getTime()) ? new Date() : on;

  const { market, companyId } = await resolvePriceContext(req);
  const marketOverrides = await resolveMarketPriceMap('CRUISE', cruises.map((cruise) => cruise.id), { market, companyId });
  const data = cruises.map((cruise) => {
    const ov = marketOverrides.get(cruise.id);
    // The rate rows are the price. `priceFrom` on the row is only a headline an
    // operator may have typed years ago, so it is the last fallback, not the
    // first — a boat with a rate table is quoted from its rate table.
    const rates = applicableRates(cruise.cabinRates, market, sailingDate);
    const cheapest = fromPrice(cruise.cabinRates, market, sailingDate);
    const headline = cheapest?.amount ?? ov?.amount ?? cruise.priceFrom;
    return {
      ...cruise,
      itinerary: readItinerary(cruise.itinerary),
      cabinRates: cruise.showPriceToAgents ? rates : [],
      // Whether this boat HAS a priced rate table, regardless of whether the
      // agent may see it. Without this the portal cannot tell "nobody has
      // priced this boat" from "the prices are hidden from you", and it told
      // the agent the first when it meant the second.
      hasRateMatrix: rates.length > 0,
      priceFrom: cruise.showPriceToAgents ? headline : null,
      currency: cheapest?.currency ?? ov?.currency ?? cruise.currency,
      priceVisible: cruise.showPriceToAgents,
      canRequestQuote: cruise.allowQuoteRequest,
    };
  });
  res.json({ success: true, data });
}

/**
 * The fields the catalogue form owns. Named explicitly rather than handing
 * `req.body` to Prisma: the boat now has rate rows and schedules hanging off
 * it, and a stray key in a payload must not be able to reach them.
 */
const CRUISE_TEXT_FIELDS = [
  'name', 'nameAr', 'operator', 'description', 'descriptionAr', 'imageUrl',
  'transferNote', 'transferNoteAr',
] as const;
const CRUISE_LIST_FIELDS = ['departureDays', 'galleryUrls'] as const;

function cruiseData(body: Record<string, unknown>, forCreate: boolean): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const field of CRUISE_TEXT_FIELDS) {
    if (body[field] === undefined) continue;
    const text = String(body[field] ?? '').trim();
    data[field] = text || (field === 'name' ? undefined : null);
  }
  for (const field of CRUISE_LIST_FIELDS) {
    if (body[field] !== undefined) data[field] = setJsonStringArray(body[field]);
  }
  if (body.shipType !== undefined) data.shipType = body.shipType as ShipType;
  if (body.route !== undefined) data.route = body.route as CruiseRoute;
  if (body.cabins !== undefined) data.cabins = Math.max(0, Number(body.cabins) || 0);
  if (body.duration !== undefined) data.duration = Math.max(1, Number(body.duration) || 1);
  if (body.currency !== undefined) {
    data.currency = String(body.currency ?? 'USD').trim().toUpperCase().slice(0, 3) || 'USD';
  }
  // The rate rows are the price now, so a blank headline is a real answer —
  // it must reach the column as null rather than as a zero that reads "free".
  if (body.priceFrom !== undefined) {
    const raw = body.priceFrom;
    const n = raw === null || raw === '' ? null : Number(raw);
    data.priceFrom = n !== null && Number.isFinite(n) && n >= 0 ? new Decimal(n) : null;
  }
  // The programme is normalised on the way in — blank rows dropped, days
  // numbered and ordered — so every reader downstream gets the same list and
  // none of them has to re-derive it. An explicit empty list clears it.
  if (body.itinerary !== undefined) {
    data.itinerary = body.itinerary === null ? undefined : readItinerary(body.itinerary);
  }
  if (body.transferIncluded !== undefined) data.transferIncluded = Boolean(body.transferIncluded);
  if (body.showPriceToAgents !== undefined) data.showPriceToAgents = Boolean(body.showPriceToAgents);
  if (body.allowQuoteRequest !== undefined) data.allowQuoteRequest = Boolean(body.allowQuoteRequest);
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
  if (forCreate && !data.name) throw new Error('NAME_REQUIRED');
  return data;
}

export async function createCruise(req: Request, res: Response): Promise<void> {
  let data: Record<string, unknown>;
  try {
    data = cruiseData(req.body as Record<string, unknown>, true);
  } catch {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'A cruise name is required' });
    return;
  }
  const cruise = await prisma.nileCruise.create({
    data: data as Parameters<typeof prisma.nileCruise.create>[0]['data'],
  });
  res.status(201).json({ success: true, data: cruise });
}

export async function updateCruise(req: Request, res: Response): Promise<void> {
  const cruise = await prisma.nileCruise.update({
    where: { id: req.params.id },
    data: cruiseData(req.body as Record<string, unknown>, false),
  });
  res.json({ success: true, data: cruise });
}

export async function deleteCruise(req: Request, res: Response): Promise<void> {
  await prisma.nileCruise.update({
    where: { id: req.params.id },
    data: { isActive: false },
  });
  res.json({ success: true });
}

export async function listCruiseBookings(req: Request, res: Response): Promise<void> {
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
  };
  const [bookings, total] = await Promise.all([
    prisma.cruiseBooking.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: cruiseInclude,
    }),
    prisma.cruiseBooking.count({ where }),
  ]);
  res.json({ success: true, data: bookings, meta: paginateMeta(total, page, limit) });
}

export async function createCruiseBooking(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  if (caller.role !== 'SUPERADMIN') {
    res.status(400).json({
      success: false,
      error: 'USE_QUOTE_REQUEST',
      message: 'Cruise bookings are managed by the operations team. Please submit a quote request.',
    });
    return;
  }

  const body = req.body as {
    cruiseId: string;
    companyId?: string;
    checkIn: string;
    checkOut: string;
    cabinType?: string;
    // Priced from a rate row when one is named — occupancy and cabin count are
    // what the row is multiplied by. `totalAmount` stays accepted for the boats
    // that have no rate table yet, where the desk still types the figure.
    cabinRateId?: string;
    occupancy?: string;
    cabinCount?: number;
    scheduleId?: string;
    passengerNames?: string[];
    adultsCount?: number;
    childrenCount?: number;
    // Tours the client asked for on top of the cruise itself.
    addOns?: {
      activityId?: string;
      name?: string;
      description?: string;
      activityDate?: string;
      paxCount?: number;
      amount?: number;
    }[];
    totalAmount: number;
    currency?: string;
    notes?: string;
    // The added transfer leg — only honoured when the fare does not already
    // collect the guests. Same keys as an activity booking sends.
    transferRequested?: boolean;
    transferFromType?: string;
    transferFromName?: string;
    transferToType?: string;
    transferToName?: string;
    transferPickupTime?: string;
    transferReturnTime?: string;
    transferNotes?: string;
  };
  const companyId = body.companyId ?? caller.companyId!;
  if (!companyId) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'companyId required' });
    return;
  }

  try {
    const company = await prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { isActive: true, currency: true, email: true },
    });
    if (!company.isActive) throw new Error('COMPANY_INACTIVE');
    const cruise = await prisma.nileCruise.findFirst({
      where: { id: body.cruiseId, isActive: true },
      select: { id: true, transferIncluded: true },
    });
    if (!cruise) throw new Error('CRUISE_NOT_AVAILABLE');

    const adultsCount = Math.max(1, body.adultsCount ?? 1);
    const childrenCount = Math.max(0, body.childrenCount ?? 0);
    const pax = adultsCount + childrenCount;

    // Where the money comes from. A boat with a rate table is priced FROM that
    // table — the row, the occupancy and the number of cabins — so a typo in a
    // hand-typed total cannot quietly undercut a contract. Only a boat with no
    // rate row still takes the figure the desk enters.
    const rate = body.cabinRateId
      ? await prisma.cruiseCabinRate.findFirst({
        where: { id: body.cabinRateId, cruiseId: body.cruiseId, isActive: true },
      })
      : null;
    if (body.cabinRateId && !rate) throw new Error('RATE_NOT_AVAILABLE');

    let occupancy: Occupancy | null = null;
    let cabinCount = Math.max(1, body.cabinCount ?? 1);
    let sourceAmount: Decimal;
    let sourceCurrency: string;

    if (rate) {
      const requested = String(body.occupancy ?? 'DOUBLE').toUpperCase();
      if (!isOccupancy(requested)) throw new Error('INVALID_OCCUPANCY');
      occupancy = requested as Occupancy;
      const priced = priceCruiseBooking({ row: rate, occupancy, pax, cabins: body.cabinCount });
      // A blank occupancy price means the cabin is not sold that way — pricing
      // it at zero would give the cabin away.
      if (!priced) throw new Error('OCCUPANCY_NOT_SOLD');
      cabinCount = priced.cabins;
      sourceAmount = priced.total;
      sourceCurrency = priced.currency;
    } else {
      if (!body.totalAmount || body.totalAmount <= 0) throw new Error('INVALID_TOTAL');
      sourceAmount = new Decimal(body.totalAmount);
      sourceCurrency = body.currency ?? 'USD';
    }

    // Tours added on top. A line with no name says nothing on a voucher, so it
    // is dropped; a line with a price adds to the bill in the SAME currency —
    // mixing currencies inside one booking would produce a meaningless total.
    const addOns = (Array.isArray(body.addOns) ? body.addOns : [])
      .map((a) => ({ ...a, name: String(a.name ?? '').trim() }))
      .filter((a) => a.name.length > 0);
    for (const addOn of addOns) {
      const amount = Number(addOn.amount ?? 0);
      if (Number.isFinite(amount) && amount > 0) sourceAmount = sourceAmount.add(new Decimal(amount));
    }

    // A fare that already collects its guests can never carry an added
    // transfer, whatever the payload says, so the boat's own flag — not the
    // request — has the last word and the voucher cannot promise the same car
    // twice.
    const transfer = readTransferAddOn(body as unknown as Record<string, unknown>, {
      transferIncluded: cruise.transferIncluded,
    });

    // Explicit price in an explicit currency — used verbatim, no FX.
    const charge = explicitMoney(sourceAmount, sourceCurrency);
    const [refNumber, invoiceNumber] = await Promise.all([
      generateRef(prisma, 'CRZ'),
      generateInvoiceNumber(prisma),
    ]);
    const booking = await prisma.$transaction(async (tx) => {
      const created = await tx.cruiseBooking.create({
        data: {
          refNumber,
          cruiseId: body.cruiseId,
          companyId,
          createdById: caller.id,
          checkIn: new Date(body.checkIn),
          checkOut: new Date(body.checkOut),
          cabinType: rate?.cabinType
            ?? (body.cabinType as 'STANDARD' | 'DELUXE' | 'SUITE' | 'PRESIDENTIAL')
            ?? 'STANDARD',
          cabinRateId: rate?.id ?? null,
          occupancy,
          cabinCount,
          scheduleId: body.scheduleId ?? null,
          passengerNames: setJsonStringArray(body.passengerNames),
          adultsCount,
          childrenCount,
          ...transfer,
          addOns: {
            create: addOns.map((a, index) => ({
              activityId: a.activityId ?? null,
              name: a.name,
              description: a.description ? String(a.description).trim() : null,
              activityDate: a.activityDate ? new Date(a.activityDate) : null,
              paxCount: Math.max(1, Number(a.paxCount ?? pax) || 1),
              amount: Number(a.amount) > 0 ? new Decimal(Number(a.amount)) : null,
              currency: charge.currency,
              displayOrder: index,
            })),
          },
          totalAmount: charge.totalAmount,
          currency: charge.currency,
          sourceAmount: charge.sourceAmount,
          sourceCurrency: charge.sourceCurrency,
          exchangeRate: charge.exchangeRate,
          exchangeRateAt: charge.exchangeRateAt,
          notes: body.notes,
        },
      });
      const invoiceTotals = buildInvoiceTotals(charge.totalAmount);
      await tx.invoice.create({
        data: {
          invoiceNumber,
          cruiseBookingId: created.id,
          companyId,
          ...invoiceTotals,
          currency: charge.currency,
          ...invoiceMoneySnapshotData(charge),
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
      return tx.cruiseBooking.findUniqueOrThrow({
        where: { id: created.id },
        include: cruiseInclude,
      });
    });

    if (booking.invoice) generateCruiseInvoicePdf(booking.invoice.id).catch(console.error);
    const recipients = [company.email, process.env.INTERNAL_TEAM_EMAIL].filter(Boolean) as string[];
    if (recipients.length) {
      sendEmail(
        recipients,
        `Cruise Booking Request - ${booking.refNumber}`,
        `<p>Cruise booking <strong>${booking.refNumber}</strong> is pending confirmation.</p>`,
      ).catch(console.error);
    }
    res.status(201).json({ success: true, data: booking });
  } catch (error) {
    const message = String((error as Error).message);
    if ([
      'COMPANY_INACTIVE', 'INVALID_TOTAL', 'CRUISE_NOT_AVAILABLE',
      'RATE_NOT_AVAILABLE', 'INVALID_OCCUPANCY', 'OCCUPANCY_NOT_SOLD',
    ].includes(message)) {
      res.status(400).json({ success: false, error: message });
    } else {
      console.error(error);
      res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
  }
}

export async function confirmCruiseBooking(req: Request, res: Response): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      const booking = await tx.cruiseBooking.findUniqueOrThrow({
        where: { id: req.params.id },
        include: { company: true, invoice: true },
      });
      if (booking.status !== 'PENDING') throw new Error('INVALID_STATUS');
      if (!booking.company.isActive) throw new Error('COMPANY_INACTIVE');

      await debitWallet(tx, {
        companyId: booking.companyId,
        amount: booking.totalAmount,
        reference: booking.refNumber,
        description: `Confirmed cruise booking ${booking.refNumber}`,
        createdById: req.user!.id,
      });

      if (!booking.invoice) {
        const invoiceNumber = await generateInvoiceNumber(prisma);
        const invoiceTotals = buildInvoiceTotals(booking.totalAmount);
        await tx.invoice.create({
          data: {
            invoiceNumber,
            cruiseBookingId: booking.id,
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
      await tx.cruiseBooking.update({
        where: { id: booking.id },
        data: {
          status: 'CONFIRMED',
          confirmedAt: booking.confirmedAt ?? new Date(),
          confirmedById: booking.confirmedById ?? req.user!.id,
        },
      });
    });
  } catch (error) {
    const message = String((error as Error).message);
    if (message === 'INVALID_STATUS' || message === 'COMPANY_INACTIVE') {
      res.status(400).json({ success: false, error: message });
    } else if (message === 'INSUFFICIENT_BALANCE') {
      res.status(400).json({ success: false, error: message, message: 'Insufficient wallet balance' });
    } else {
      console.error(error);
      res.status(500).json({ success: false, error: 'INTERNAL_ERROR' });
    }
    return;
  }
  const booking = await prisma.cruiseBooking.findUniqueOrThrow({
    where: { id: req.params.id },
    include: cruiseInclude,
  });
  res.json({ success: true, data: booking });
}

export async function cancelCruiseBooking(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const booking = await prisma.cruiseBooking.findUniqueOrThrow({
    where: { id: req.params.id },
    include: { invoice: true },
  });
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
      description: `Refund for cancelled cruise booking ${booking.refNumber}`,
      createdById: caller.id,
    }),
  );

  const updated = await prisma.$transaction(async (tx) => {
    await tx.invoice.updateMany({
      where: { cruiseBookingId: booking.id },
      data: { status: 'CANCELLED' },
    });
    return tx.cruiseBooking.update({
      where: { id: booking.id },
      data: { status: 'CANCELLED' },
      include: cruiseInclude,
    });
  });
  res.json({ success: true, data: updated });
}
