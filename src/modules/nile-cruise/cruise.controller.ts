import { BookingStatus, CruiseRoute, Prisma, ShipType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { Request, Response } from 'express';
import { prisma } from '../../config/db';
import { sendEmail } from '../../shared/email.templates';
import { generateInvoiceNumber, generateRef, paginate, paginateMeta } from '../../shared/helpers';
import { setJsonStringArray } from '../../shared/json-array';
import { explicitMoney, invoiceMoneySnapshotData } from '../../shared/money';
import { resolvePriceContext } from '../../shared/pricing';
import { generateInvoicePdf } from '../invoices/pdf.generator';
import { buildInvoiceTotals } from '../../shared/invoicing';
import { debitWallet, refundWallet } from '../../shared/wallet';
import {
  Occupancy,
  applyCruiseSupplements,
  applicableRates,
  cruiseAudience,
  fromPrice,
  isOccupancy,
  priceCruiseProgrammePerPerson,
  priceCruisePerPerson,
  priceCruiseTransfer,
  validateCruiseStayDates,
} from '../../shared/cruise-rates';
import { readItinerary } from '../../shared/itinerary';
import { readTransferAddOn } from '../../shared/transfer-addon';

const cruiseInclude = {
  cruise: { select: { id: true, name: true, route: true, shipType: true } },
  cabinRate: { select: { id: true, cabinName: true, cabinType: true, currency: true } },
  programme: { select: { id: true, name: true, nameAr: true, transferFromName: true, transferToName: true } },
  programmeRate: { select: { id: true, market: true, currency: true } },
  transferRate: { select: { id: true, fromLocation: true, toLocation: true, tripType: true, vehicleType: true, vehicleCapacity: true, amount: true, currency: true } },
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
      programmes: {
        where: { isActive: true },
        include: { rates: { where: { isActive: true }, orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }] } },
        orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
      },
      transferRates: { where: { isActive: true }, orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }] },
    },
  });
  // The programme is normalised on the way out as well as in: a boat whose rows
  // were written before this existed, or edited straight in the database, still
  // reaches every reader as one ordered, gap-free list.
  if (caller.role === 'SUPERADMIN') {
    res.json({
      success: true,
      data: cruises.map((cruise) => ({
        ...cruise,
        itinerary: readItinerary(cruise.itinerary),
        programmes: cruise.programmes.map((programme) => ({
          ...programme,
          itinerary: readItinerary(programme.itinerary),
        })),
      })),
    });
    return;
  }

  // A sailing date narrows the rate rows to the period they cover, the same way
  // a hotel stay does. Without one the agent is browsing, so today decides.
  const on = req.query.date ? new Date(String(req.query.date)) : new Date();
  const sailingDate = Number.isNaN(on.getTime()) ? new Date() : on;

  const { market } = await resolvePriceContext(req);
  const cruiseMarket = cruiseAudience(market) === 'EGYPTIAN' ? 'EGYPTIAN' : 'FOREIGN';
  const data = cruises.map((cruise) => {
    // The period rows are the price. The retired headline amount and its old
    // generic market overrides never substitute for a missing cabin period.
    const rates = applicableRates(cruise.cabinRates, cruiseMarket, sailingDate);
    const programmes = cruise.programmes.map((programme) => {
      const programmeRates = applicableRates(programme.rates.map((rate) => ({
        ...rate,
        cabinName: programme.name,
      })), cruiseMarket, sailingDate).map((rate) => ({
        ...rate,
        // Existing rows may have been entered through the old occupancy UI.
        // Until the shared catalogue is saved, expose their first real adult
        // amount as the programme's one per-person price.
        singlePrice: rate.singlePrice ?? rate.doublePrice ?? rate.triplePrice,
        doublePrice: null,
        triplePrice: null,
      }));
      return {
        ...programme,
        itinerary: readItinerary(programme.itinerary),
        rates: cruise.showPriceToAgents ? programmeRates : [],
        hasRates: programmeRates.length > 0,
      };
    });
    const transferRates = cruise.transferRates.filter((rate) => {
      if (rate.market !== cruiseMarket) return false;
      if (rate.validFrom && rate.validFrom > sailingDate) return false;
      if (rate.validTo && rate.validTo < sailingDate) return false;
      return true;
    });
    const baseCheapest = fromPrice(cruise.cabinRates, cruiseMarket, sailingDate);
    const programmeCheapest = programmes.reduce<{ amount: Decimal; currency: string } | null>((best, programme) => {
      const candidate = fromPrice((programme.rates || []).map((rate) => ({ ...rate, cabinName: programme.name })), cruiseMarket, sailingDate);
      if (!candidate) return best;
      return !best || candidate.amount.lt(best.amount) ? candidate : best;
    }, null);
    const cheapest = !baseCheapest ? programmeCheapest
      : !programmeCheapest || baseCheapest.amount.lte(programmeCheapest.amount) ? baseCheapest : programmeCheapest;
    return {
      ...cruise,
      itinerary: readItinerary(cruise.itinerary),
      cabinRates: cruise.showPriceToAgents ? rates : [],
      programmes,
      transferRates: cruise.showPriceToAgents ? transferRates : [],
      pricingAudience: cruiseMarket,
      pricingBasis: 'PER_PERSON',
      // Whether this boat HAS a priced rate table, regardless of whether the
      // agent may see it. Without this the portal cannot tell "nobody has
      // priced this boat" from "the prices are hidden from you", and it told
      // the agent the first when it meant the second.
      hasRateMatrix: rates.length > 0 || programmes.some((programme) => programme.hasRates),
      priceFrom: cruise.showPriceToAgents ? (cheapest?.amount ?? null) : null,
      currency: cheapest?.currency ?? cruise.currency,
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
    programmeId?: string;
    programmeRateId?: string;
    transferRateId?: string;
    selectedSupplements?: string[];
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
    transferTripType?: string;
    transferPaxCount?: number;
    transferVehicleType?: string;
    transferVehicleCapacity?: number;
    transferVehicleCount?: number;
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
      select: { isActive: true, currency: true, email: true, market: true },
    });
    if (!company.isActive) throw new Error('COMPANY_INACTIVE');
    const cruise = await prisma.nileCruise.findFirst({
      where: { id: body.cruiseId, isActive: true },
      select: { id: true, transferIncluded: true },
    });
    if (!cruise) throw new Error('CRUISE_NOT_AVAILABLE');

    const checkIn = new Date(body.checkIn);
    const checkOut = new Date(body.checkOut);
    if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime()) || checkOut <= checkIn) {
      throw new Error('INVALID_DATES');
    }
    const schedule = body.scheduleId
      ? await prisma.cruiseSchedule.findFirst({ where: { id: body.scheduleId, cruiseId: body.cruiseId, isActive: true } })
      : null;
    if (body.scheduleId && !schedule) throw new Error('SCHEDULE_NOT_AVAILABLE');
    if (schedule) {
      const stayError = validateCruiseStayDates(checkIn, checkOut, schedule);
      if (stayError) throw new Error(stayError);
    }

    const adultsCount = Math.max(1, body.adultsCount ?? 1);
    const childrenCount = Math.max(0, body.childrenCount ?? 0);
    const pax = adultsCount + childrenCount;

    // Cruise-only and programme fares share one rule: Single / Double / Triple
    // are per-person amounts for the selected sharing arrangement.
    const rate = body.cabinRateId
      ? await prisma.cruiseCabinRate.findFirst({
        where: { id: body.cabinRateId, cruiseId: body.cruiseId, isActive: true },
      })
      : null;
    if (body.cabinRateId && !rate) throw new Error('RATE_NOT_AVAILABLE');
    if (rate?.scheduleId && rate.scheduleId !== body.scheduleId) throw new Error('RATE_NOT_AVAILABLE');
    if (Boolean(body.programmeId) !== Boolean(body.programmeRateId) || (body.programmeId && !body.scheduleId)) {
      throw new Error('PROGRAMME_RATE_NOT_AVAILABLE');
    }
    const programmeRate = body.programmeRateId
      ? await prisma.cruiseProgrammeRate.findFirst({
        where: {
          id: body.programmeRateId,
          isActive: true,
          programme: {
            id: body.programmeId,
            cruiseId: body.cruiseId,
            isActive: true,
            ...(body.scheduleId ? { scheduleId: body.scheduleId } : {}),
          },
        },
        include: { programme: true },
      })
      : null;
    if (body.programmeRateId && !programmeRate) throw new Error('PROGRAMME_RATE_NOT_AVAILABLE');
    if (rate && programmeRate) throw new Error('PICK_ONE_FARE');

    const expectedMarket = cruiseAudience(company.market) === 'EGYPTIAN' ? 'EGYPTIAN' : 'FOREIGN';
    const chosenRate = programmeRate ?? rate;
    if (chosenRate?.market && chosenRate.market !== expectedMarket
      && !(expectedMarket === 'FOREIGN' && chosenRate.market === 'INTERNATIONAL')) {
      throw new Error('RATE_NOT_AVAILABLE');
    }
    if (chosenRate && ((chosenRate.validFrom && chosenRate.validFrom > checkIn)
      || (chosenRate.validTo && chosenRate.validTo < checkIn))) throw new Error('RATE_NOT_AVAILABLE');

    let occupancy: Occupancy | null = null;
    const cabinCount = 1; // legacy export field; never a price multiplier
    let sourceAmount: Decimal;
    let sourceCurrency: string;
    let adultUnitPrice: Decimal | null = null;
    let childUnitPrice: Decimal | null = null;
    let selectedSupplements: Record<string, unknown>[] = [];

    if (programmeRate) {
      // A programme is one product per traveller. Its legacy `singlePrice`
      // column now holds the adult per-person tariff; the client never chooses
      // a Single/Double/Triple sharing basis for a programme.
      const priced = priceCruiseProgrammePerPerson({
        adultPrice: programmeRate.singlePrice,
        childPrice: programmeRate.childPrice,
        currency: programmeRate.currency,
        adults: adultsCount,
        children: childrenCount,
      });
      if (!priced) throw new Error(childrenCount > 0 ? 'CHILD_RATE_NOT_AVAILABLE' : 'PROGRAMME_RATE_NOT_AVAILABLE');
      adultUnitPrice = priced.adultUnitPrice;
      childUnitPrice = priced.childUnitPrice;
      sourceAmount = priced.total;
      sourceCurrency = priced.currency;

      const availableSupplements = Array.isArray(programmeRate.supplements)
        ? programmeRate.supplements as Record<string, unknown>[] : [];
      const wanted = new Set((body.selectedSupplements || []).map(String));
      selectedSupplements = availableSupplements.filter((supplement) => wanted.has(String(supplement.name ?? '')));
      const supplemented = applyCruiseSupplements(sourceAmount, pax, sourceCurrency, selectedSupplements.map((supplement) => ({
        name: String(supplement.name ?? ''),
        type: String(supplement.type ?? 'TEXT_ONLY') as 'FIXED_AMOUNT' | 'PERCENTAGE' | 'TOTAL_PRICE' | 'TEXT_ONLY',
        amount: supplement.amount as number | string | null | undefined,
        currency: supplement.currency as string | null | undefined,
      })));
      if (!supplemented) throw new Error('INVALID_SUPPLEMENT');
      sourceAmount = supplemented;
    } else if (chosenRate) {
      const requested = String(body.occupancy ?? 'DOUBLE').toUpperCase();
      if (!isOccupancy(requested)) throw new Error('INVALID_OCCUPANCY');
      occupancy = requested as Occupancy;
      const row = { ...chosenRate, cabinName: rate?.cabinName ?? 'Cruise fare' };
      const priced = priceCruisePerPerson({ row, occupancy, adults: adultsCount, children: childrenCount });
      if (!priced) throw new Error('OCCUPANCY_NOT_SOLD');
      sourceAmount = priced.total;
      sourceCurrency = priced.currency;
      adultUnitPrice = priced.adultUnitPrice;
      childUnitPrice = priced.childUnitPrice;

      const availableSupplements = Array.isArray(chosenRate.supplements)
        ? chosenRate.supplements as Record<string, unknown>[] : [];
      const wanted = new Set((body.selectedSupplements || []).map(String));
      selectedSupplements = availableSupplements.filter((supplement) => wanted.has(String(supplement.name ?? '')));
      const supplemented = applyCruiseSupplements(sourceAmount, pax, sourceCurrency, selectedSupplements.map((supplement) => ({
        name: String(supplement.name ?? ''),
        type: String(supplement.type ?? 'TEXT_ONLY') as 'FIXED_AMOUNT' | 'PERCENTAGE' | 'TOTAL_PRICE' | 'TEXT_ONLY',
        amount: supplement.amount as number | string | null | undefined,
        currency: supplement.currency as string | null | undefined,
      })));
      if (!supplemented) throw new Error('INVALID_SUPPLEMENT');
      sourceAmount = supplemented;
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

    // A programme already includes its transfer. Cruise-only customers may add
    // one explicit, admin-priced From → To route; free-text transfer prices are
    // never trusted by the booking API.
    let transferRate = null;
    const transferPaxCount = Math.max(1, Math.floor(Number(body.transferPaxCount ?? pax)) || pax);
    if (!programmeRate && body.transferRateId) {
      if (!body.scheduleId) throw new Error('SCHEDULE_NOT_AVAILABLE');
      transferRate = await prisma.cruiseTransferRate.findFirst({
        where: {
          id: body.transferRateId,
          cruiseId: body.cruiseId,
          market: expectedMarket,
          isActive: true,
          scheduleId: body.scheduleId,
        },
      });
      if (!transferRate) throw new Error('TRANSFER_RATE_NOT_AVAILABLE');
      if ((transferRate.validFrom && transferRate.validFrom > checkIn)
        || (transferRate.validTo && transferRate.validTo < checkIn)) throw new Error('TRANSFER_RATE_NOT_AVAILABLE');
      if (transferRate.currency !== sourceCurrency) throw new Error('MIXED_CURRENCY');
      const transferPrice = priceCruiseTransfer({
        amount: transferRate.amount,
        capacity: transferRate.vehicleCapacity,
        pax: transferPaxCount,
      });
      if (!transferPrice) throw new Error('TRANSFER_RATE_NOT_AVAILABLE');
      sourceAmount = sourceAmount.add(transferPrice.total);
    }
    if (!programmeRate && body.transferRequested && !transferRate) throw new Error('TRANSFER_RATE_REQUIRED');
    const transfer = programmeRate
      ? readTransferAddOn({}, { transferIncluded: true })
      : transferRate
        ? {
          transferRequested: true,
          transferFromType: 'ADDRESS', transferFromName: transferRate.fromLocation,
          transferToType: 'ADDRESS', transferToName: transferRate.toLocation,
          transferPickupTime: body.transferPickupTime ?? null,
          transferReturnTime: body.transferReturnTime ?? null,
          transferTripType: transferRate.tripType,
          transferPaxCount,
          transferVehicleType: transferRate.vehicleType,
          transferVehicleCapacity: transferRate.vehicleCapacity,
          transferVehicleCount: Math.ceil(transferPaxCount / transferRate.vehicleCapacity),
          transferNotes: body.transferNotes ?? transferRate.notes,
        }
        : readTransferAddOn(body as unknown as Record<string, unknown>, { transferIncluded: false });

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
          checkIn,
          checkOut,
          cabinType: rate?.cabinType
            ?? (body.cabinType as 'STANDARD' | 'DELUXE' | 'SUITE' | 'PRESIDENTIAL')
            ?? 'STANDARD',
          cabinRateId: rate?.id ?? null,
          programmeId: programmeRate?.programme.id ?? null,
          programmeRateId: programmeRate?.id ?? null,
          transferRateId: transferRate?.id ?? null,
          selectedSupplements: selectedSupplements.length
            ? selectedSupplements as unknown as Prisma.InputJsonValue
            : undefined,
          adultUnitPrice,
          childUnitPrice,
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
      'INVALID_DATES', 'INVALID_SCHEDULE', 'DEPARTURE_DAY_MISMATCH',
      'STAY_LENGTH_MISMATCH', 'RETURN_DAY_MISMATCH', 'SCHEDULE_NOT_AVAILABLE',
      'RATE_NOT_AVAILABLE', 'PROGRAMME_RATE_NOT_AVAILABLE', 'PICK_ONE_FARE',
      'INVALID_OCCUPANCY', 'OCCUPANCY_NOT_SOLD', 'INVALID_SUPPLEMENT',
      'TRANSFER_RATE_NOT_AVAILABLE', 'TRANSFER_RATE_REQUIRED', 'MIXED_CURRENCY',
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
