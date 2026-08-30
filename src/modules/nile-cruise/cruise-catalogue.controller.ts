import { Request, Response } from 'express';
import { Decimal } from '@prisma/client/runtime/library';
import { CabinType, HotelSupplementType, Market, Prisma, VehicleType } from '@prisma/client';
import { prisma } from '../../config/db';
import {
  normalizeWeekday,
  nightsBetween,
  programmePeriodsHaveBothAudiences,
  validateCruiseRateInput,
} from '../../shared/cruise-rates';
import { readItinerary } from '../../shared/itinerary';

/**
 * The catalogue half of a Nile cruise: the cabin rate rows that price it, and
 * the schedules that say when the boat actually sails.
 *
 * Both are saved as a whole set (delete + recreate inside one transaction),
 * which is how the hotel rate matrix already works — the editor is a list the
 * admin reorders and deletes rows from freely, and a per-row PATCH API would
 * make that four calls instead of one.
 */

const CABIN_TYPES: CabinType[] = ['STANDARD', 'DELUXE', 'SUITE', 'PRESIDENTIAL'];
const VEHICLE_TYPES: VehicleType[] = ['SEDAN', 'SUV', 'VAN_6', 'VAN_12', 'MINIBUS_20', 'BUS_45', 'LUXURY_LIMO'];
const VEHICLE_DEFAULT_CAPACITY: Record<VehicleType, number> = {
  SEDAN: 3, SUV: 5, VAN_6: 6, VAN_12: 12, MINIBUS_20: 20, BUS_45: 45, LUXURY_LIMO: 3,
};

/** Nile cruises intentionally have only two tariffs. Any non-Egyptian legacy
 * market is folded into the one FOREIGN/USD audience on the next save. */
function asCruiseMarket(value: unknown): Market {
  return String(value ?? '').trim().toUpperCase() === 'EGYPTIAN' ? 'EGYPTIAN' : 'FOREIGN';
}

function cruiseCurrency(market: Market): 'EGP' | 'USD' {
  return market === 'EGYPTIAN' ? 'EGP' : 'USD';
}
function asCabinType(value: unknown): CabinType {
  const s = String(value ?? '').trim().toUpperCase();
  return (CABIN_TYPES as string[]).includes(s) ? (s as CabinType) : 'STANDARD';
}
function decOrNull(value: unknown): Decimal | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? new Decimal(n) : null;
}
function dateOrNull(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}
function textOrNull(value: unknown, max = 200): string | null {
  const s = String(value ?? '').trim();
  return s ? s.slice(0, max) : null;
}

const SUPPLEMENT_TYPES: HotelSupplementType[] = ['FIXED_AMOUNT', 'PERCENTAGE', 'TOTAL_PRICE', 'TEXT_ONLY'];

function cleanSupplements(value: unknown, currency: string): Prisma.InputJsonValue | undefined {
  if (!Array.isArray(value)) return undefined;
  const rows = value.map((raw) => {
    const row = (raw ?? {}) as Record<string, unknown>;
    const name = String(row.name ?? '').trim();
    const type = String(row.type ?? 'FIXED_AMOUNT').toUpperCase() as HotelSupplementType;
    if (!name || !SUPPLEMENT_TYPES.includes(type)) return null;
    const amount = decOrNull(row.amount);
    return {
      name: name.slice(0, 200),
      type,
      amount: amount?.toNumber() ?? null,
      currency: type === 'PERCENTAGE' || type === 'TEXT_ONLY' ? null : currency,
      notes: textOrNull(row.notes, 1000),
    };
  }).filter((row): row is NonNullable<typeof row> => row !== null);
  return rows as Prisma.InputJsonValue;
}

interface CabinRateInput {
  cabinName?: string;
  cabinType?: string;
  scheduleId?: string | null;
  market?: string | null;
  currency?: string;
  singlePrice?: number | string | null;
  doublePrice?: number | string | null;
  triplePrice?: number | string | null;
  childPrice?: number | string | null;
  supplements?: unknown;
  validFrom?: string | null;
  validTo?: string | null;
  isActive?: boolean;
  notes?: string | null;
}

interface ScheduleInput {
  departureDay?: string;
  returnDay?: string;
  nights?: number | string | null;
  label?: string | null;
  labelAr?: string | null;
  isActive?: boolean;
}

/** GET /api/cruises/:id/rates — the full rate table, for the admin editor. */
export async function listCruiseRates(req: Request, res: Response): Promise<void> {
  const rates = await prisma.cruiseCabinRate.findMany({
    where: { cruiseId: req.params.id },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
  });
  res.json({ success: true, data: rates });
}

/** PUT /api/cruises/:id/rates — replace the whole rate set for one boat. */
export async function saveCruiseRates(req: Request, res: Response): Promise<void> {
  const cruiseId = req.params.id;
  const cruise = await prisma.nileCruise.findUnique({
    where: { id: cruiseId },
    select: { id: true, schedules: { select: { id: true } } },
  });
  if (!cruise) {
    res.status(404).json({ success: false, error: 'NOT_FOUND' });
    return;
  }
  const posted = Array.isArray(req.body?.rates) ? (req.body.rates as CabinRateInput[]) : [];
  // A row with no cabin name names nothing an agent could pick, so it is dropped
  // rather than saved as an unlabelled price.
  const clean = posted
    .map((r) => ({ ...r, cabinName: String(r.cabinName ?? '').trim() }))
    .filter((r) => r.cabinName.length > 0);
  const invalid = clean.map(validateCruiseRateInput).find((error) => error !== null);
  if (invalid) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: invalid });
    return;
  }
  const scheduleIds = new Set(cruise.schedules.map((schedule) => schedule.id));
  if (clean.some((rate) => !rate.scheduleId || !scheduleIds.has(String(rate.scheduleId)))) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'Every fare must belong to this cruise schedule' });
    return;
  }

  const rates = await prisma.$transaction(async (tx) => {
    await tx.cruiseCabinRate.deleteMany({ where: { cruiseId } });
    for (let i = 0; i < clean.length; i++) {
      const r = clean[i];
      const market = asCruiseMarket(r.market);
      const currency = cruiseCurrency(market);
      await tx.cruiseCabinRate.create({
        data: {
          cruiseId,
          scheduleId: r.scheduleId ? String(r.scheduleId) : null,
          cabinName: r.cabinName,
          cabinType: asCabinType(r.cabinType),
          market,
          currency,
          singlePrice: decOrNull(r.singlePrice),
          doublePrice: decOrNull(r.doublePrice),
          triplePrice: decOrNull(r.triplePrice),
          childPrice: decOrNull(r.childPrice),
          supplements: cleanSupplements(r.supplements, currency),
          validFrom: dateOrNull(r.validFrom),
          validTo: dateOrNull(r.validTo),
          isActive: r.isActive !== false,
          notes: textOrNull(r.notes, 1000),
          displayOrder: i,
        },
      });
    }
    return tx.cruiseCabinRate.findMany({
      where: { cruiseId },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
  });
  res.json({ success: true, data: rates });
}

/** GET /api/cruises/:id/schedules — when this boat leaves and when it is back. */
export async function listCruiseSchedules(req: Request, res: Response): Promise<void> {
  const schedules = await prisma.cruiseSchedule.findMany({
    where: { cruiseId: req.params.id },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
  });
  res.json({ success: true, data: schedules });
}

/** PUT /api/cruises/:id/schedules — replace the sailing schedule for one boat. */
export async function saveCruiseSchedules(req: Request, res: Response): Promise<void> {
  const cruiseId = req.params.id;
  const cruise = await prisma.nileCruise.findUnique({ where: { id: cruiseId }, select: { id: true } });
  if (!cruise) {
    res.status(404).json({ success: false, error: 'NOT_FOUND' });
    return;
  }
  const posted = Array.isArray(req.body?.schedules) ? (req.body.schedules as ScheduleInput[]) : [];
  // A leg is a departure day AND a return day; one without the other is half an
  // answer and would show the client a sailing with no way home.
  const clean = posted
    .map((s) => ({
      raw: s,
      departureDay: normalizeWeekday(s.departureDay),
      returnDay: normalizeWeekday(s.returnDay),
    }))
    .filter((s): s is { raw: ScheduleInput; departureDay: NonNullable<ReturnType<typeof normalizeWeekday>>; returnDay: NonNullable<ReturnType<typeof normalizeWeekday>> } =>
      s.departureDay !== null && s.returnDay !== null);
  if (!clean.length || clean.length !== posted.length) {
    res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Every cruise needs at least one valid From / Back sailing schedule',
    });
    return;
  }

  // Capture the reusable catalogue before replacing schedules (the replacement
  // cascades old materialised programme/transfer rows).
  const sharedCatalogue = await ensureSharedCatalogue();

  const schedules = await prisma.$transaction(async (tx) => {
    await tx.cruiseSchedule.deleteMany({ where: { cruiseId } });
    for (let i = 0; i < clean.length; i++) {
      const s = clean[i];
      const posted = Number(s.raw.nights);
      await tx.cruiseSchedule.create({
        data: {
          cruiseId,
          departureDay: s.departureDay,
          returnDay: s.returnDay,
          // The two days already say how long the leg is, so the night count is
          // derived unless the operator overrode it with something sensible.
          nights: Number.isFinite(posted) && posted > 0
            ? Math.floor(posted)
            : nightsBetween(s.departureDay, s.returnDay),
          label: textOrNull(s.raw.label),
          labelAr: textOrNull(s.raw.labelAr),
          isActive: s.raw.isActive !== false,
          displayOrder: i,
        },
      });
    }
    const saved = await tx.cruiseSchedule.findMany({
      where: { cruiseId },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
    // Keep the legacy summary columns truthful for exports and older sheet
    // integrations. The structured schedule remains the source of truth.
    await tx.nileCruise.update({
      where: { id: cruiseId },
      data: {
        departureDays: saved.map((s) => s.departureDay),
        duration: saved[0]?.nights ?? 1,
      },
    });
    await materialiseSharedCatalogue(tx, sharedCatalogue, cruiseId);
    return saved;
  });
  res.json({ success: true, data: schedules });
}

interface ProgrammeRateInput {
  market?: string;
  adultPrice?: number | string | null;
  singlePrice?: number | string | null;
  doublePrice?: number | string | null;
  triplePrice?: number | string | null;
  childPrice?: number | string | null;
  supplements?: unknown;
  validFrom?: string | null;
  validTo?: string | null;
  notes?: string | null;
  isActive?: boolean;
}

interface ProgrammeInput {
  route?: string;
  nights?: number | string | null;
  scheduleId?: string;
  name?: string;
  nameAr?: string | null;
  description?: string | null;
  descriptionAr?: string | null;
  itinerary?: unknown;
  transferFromName?: string | null;
  transferToName?: string | null;
  isActive?: boolean;
  rates?: ProgrammeRateInput[];
}

interface TransferRateInput {
  route?: string;
  nights?: number | string | null;
  scheduleId?: string;
  market?: string;
  fromLocation?: string;
  toLocation?: string;
  amount?: number | string | null;
  tripType?: string;
  vehicleType?: string;
  vehicleCapacity?: number | string | null;
  oneWayAmount?: number | string | null;
  roundTripAmount?: number | string | null;
  validFrom?: string | null;
  validTo?: string | null;
  notes?: string | null;
  isActive?: boolean;
}

const CRUISE_ROUTES = ['LUXOR_ASWAN', 'ASWAN_LUXOR', 'LUXOR_ASWAN_LUXOR'] as const;
type SharedProgramme = ProgrammeInput & { route: string; nights: number; rates: ProgrammeRateInput[] };
type SharedTransfer = TransferRateInput & {
  route: string;
  nights: number;
  market: string;
  fromLocation: string;
  toLocation: string;
  tripType: 'ONE_WAY' | 'ROUND_TRIP';
  vehicleType: VehicleType;
  vehicleCapacity: number;
  amount: number;
};

function asVehicleType(value: unknown): VehicleType {
  const candidate = String(value ?? '').trim().toUpperCase() as VehicleType;
  return VEHICLE_TYPES.includes(candidate) ? candidate : 'VAN_6';
}

function asTransferTripType(value: unknown): 'ONE_WAY' | 'ROUND_TRIP' {
  return String(value ?? '').trim().toUpperCase() === 'ROUND_TRIP' ? 'ROUND_TRIP' : 'ONE_WAY';
}

function cleanSharedProgramme(raw: ProgrammeInput): SharedProgramme | null {
  const route = String(raw.route ?? '').toUpperCase();
  const nights = Math.floor(Number(raw.nights));
  const name = String(raw.name ?? '').trim();
  if (!(CRUISE_ROUTES as readonly string[]).includes(route) || !Number.isFinite(nights) || nights < 1 || !name) return null;
  const rates = (Array.isArray(raw.rates) ? raw.rates : []).map((rate) => ({
    ...rate,
    market: asCruiseMarket(rate.market),
    adultPrice: rate.adultPrice ?? rate.singlePrice ?? null,
    singlePrice: rate.adultPrice ?? rate.singlePrice ?? null,
    doublePrice: null,
    triplePrice: null,
  }));
  return { ...raw, route, nights, name, rates };
}

function cleanSharedTransfer(raw: TransferRateInput): SharedTransfer | null {
  const route = String(raw.route ?? '').toUpperCase();
  const nights = Math.floor(Number(raw.nights));
  const fromLocation = String(raw.fromLocation ?? '').trim();
  const toLocation = String(raw.toLocation ?? '').trim();
  const vehicleType = asVehicleType(raw.vehicleType);
  const vehicleCapacity = Math.floor(Number(raw.vehicleCapacity ?? VEHICLE_DEFAULT_CAPACITY[vehicleType]));
  const tripType = asTransferTripType(raw.tripType);
  const amount = Number(raw.amount ?? (tripType === 'ROUND_TRIP' ? raw.roundTripAmount : raw.oneWayAmount));
  if (!(CRUISE_ROUTES as readonly string[]).includes(route)
    || !Number.isFinite(nights) || nights < 1 || !fromLocation || !toLocation
    || !Number.isFinite(amount) || amount < 0
    || !Number.isFinite(vehicleCapacity) || vehicleCapacity < 1 || vehicleCapacity > 99) return null;
  return {
    route,
    nights,
    market: asCruiseMarket(raw.market),
    fromLocation,
    toLocation,
    tripType,
    vehicleType,
    vehicleCapacity,
    amount,
    validFrom: raw.validFrom ?? null,
    validTo: raw.validTo ?? null,
    notes: raw.notes ?? null,
    isActive: raw.isActive !== false,
  };
}

/** Upgrade the catalogue written by the old per-person editor. A legacy row
 * with two prices becomes two independent vehicle products, so no price is
 * guessed and old production data remains visible after deployment. */
function normalizeSharedTransfers(value: unknown): SharedTransfer[] {
  if (!Array.isArray(value)) return [];
  const result: SharedTransfer[] = [];
  for (const rawValue of value) {
    const raw = (rawValue ?? {}) as TransferRateInput;
    if (!raw.tripType && raw.roundTripAmount !== null && raw.roundTripAmount !== undefined && raw.roundTripAmount !== '') {
      const oneWay = cleanSharedTransfer({ ...raw, tripType: 'ONE_WAY', amount: raw.oneWayAmount ?? raw.amount });
      const roundTrip = cleanSharedTransfer({ ...raw, tripType: 'ROUND_TRIP', amount: raw.roundTripAmount });
      if (oneWay) result.push(oneWay);
      if (roundTrip) result.push(roundTrip);
      continue;
    }
    const clean = cleanSharedTransfer(raw);
    if (clean) result.push(clean);
  }
  return result;
}

async function deriveSharedCatalogue(): Promise<{ programmes: SharedProgramme[]; transferRates: SharedTransfer[] }> {
  const [programmes, transfers] = await Promise.all([
    prisma.cruiseProgramme.findMany({
      include: { cruise: { select: { route: true } }, schedule: { select: { nights: true } }, rates: true },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.cruiseTransferRate.findMany({
      include: { cruise: { select: { route: true } }, schedule: { select: { nights: true } } },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    }),
  ]);
  const programmeMap = new Map<string, SharedProgramme>();
  programmes.forEach((programme) => {
    const key = `${programme.cruise.route}|${programme.schedule.nights}|${programme.name.trim().toLowerCase()}`;
    if (programmeMap.has(key)) return;
    programmeMap.set(key, {
      route: programme.cruise.route,
      nights: programme.schedule.nights,
      name: programme.name,
      nameAr: programme.nameAr,
      description: programme.description,
      descriptionAr: programme.descriptionAr,
      itinerary: readItinerary(programme.itinerary),
      transferFromName: programme.transferFromName,
      transferToName: programme.transferToName,
      isActive: programme.isActive,
      rates: programme.rates.map((rate) => ({
        market: rate.market,
        adultPrice: rate.singlePrice?.toNumber() ?? rate.doublePrice?.toNumber() ?? rate.triplePrice?.toNumber() ?? null,
        childPrice: rate.childPrice?.toNumber() ?? null,
        supplements: rate.supplements,
        validFrom: rate.validFrom?.toISOString() ?? null,
        validTo: rate.validTo?.toISOString() ?? null,
        notes: rate.notes,
        isActive: rate.isActive,
      })),
    });
  });
  const transferMap = new Map<string, SharedTransfer>();
  transfers.forEach((rate) => {
    const add = (tripType: 'ONE_WAY' | 'ROUND_TRIP', amount: number) => {
      const key = `${rate.cruise.route}|${rate.schedule.nights}|${rate.market}|${rate.fromLocation.toLowerCase()}|${rate.toLocation.toLowerCase()}|${tripType}|${rate.vehicleType}|${rate.vehicleCapacity}`;
      if (transferMap.has(key)) return;
      transferMap.set(key, {
        route: rate.cruise.route,
        nights: rate.schedule.nights,
        market: rate.market,
        fromLocation: rate.fromLocation,
        toLocation: rate.toLocation,
        tripType,
        vehicleType: rate.vehicleType,
        vehicleCapacity: rate.vehicleCapacity,
        amount,
        validFrom: rate.validFrom?.toISOString() ?? null,
        validTo: rate.validTo?.toISOString() ?? null,
        notes: rate.notes,
        isActive: rate.isActive,
      });
    };
    add(asTransferTripType(rate.tripType), rate.amount.toNumber());
    if (rate.tripType === 'ONE_WAY' && rate.roundTripAmount != null) add('ROUND_TRIP', rate.roundTripAmount.toNumber());
  });
  return { programmes: [...programmeMap.values()], transferRates: [...transferMap.values()] };
}

async function ensureSharedCatalogue(): Promise<{ programmes: SharedProgramme[]; transferRates: SharedTransfer[] }> {
  const stored = await prisma.cruiseSharedCatalogue.findUnique({ where: { id: 'default' } });
  if (stored) return {
    programmes: Array.isArray(stored.programmes) ? stored.programmes as unknown as SharedProgramme[] : [],
    transferRates: normalizeSharedTransfers(stored.transferRates),
  };
  const derived = await deriveSharedCatalogue();
  await prisma.cruiseSharedCatalogue.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      programmes: derived.programmes as unknown as Prisma.InputJsonValue,
      transferRates: derived.transferRates as unknown as Prisma.InputJsonValue,
    },
    update: {},
  });
  return derived;
}

async function materialiseSharedCatalogue(
  tx: Prisma.TransactionClient,
  catalogue: { programmes: SharedProgramme[]; transferRates: SharedTransfer[] },
  onlyCruiseId?: string,
): Promise<void> {
  const cruiseWhere = onlyCruiseId ? { id: onlyCruiseId } : {};
  await tx.cruiseProgramme.deleteMany({ where: onlyCruiseId ? { cruiseId: onlyCruiseId } : {} });
  await tx.cruiseTransferRate.deleteMany({ where: onlyCruiseId ? { cruiseId: onlyCruiseId } : {} });
  const cruises = await tx.nileCruise.findMany({
    where: cruiseWhere,
    select: { id: true, route: true, schedules: { where: { isActive: true }, select: { id: true, nights: true } } },
  });
  for (const cruise of cruises) {
    for (const schedule of cruise.schedules) {
      const programmes = catalogue.programmes.filter((programme) => programme.route === cruise.route && Number(programme.nights) === schedule.nights);
      for (let programmeIndex = 0; programmeIndex < programmes.length; programmeIndex++) {
        const programme = programmes[programmeIndex];
        const created = await tx.cruiseProgramme.create({
          data: {
            cruiseId: cruise.id,
            scheduleId: schedule.id,
            name: String(programme.name),
            nameAr: textOrNull(programme.nameAr),
            description: textOrNull(programme.description, 5000),
            descriptionAr: textOrNull(programme.descriptionAr, 5000),
            itinerary: readItinerary(programme.itinerary) as unknown as Prisma.InputJsonValue,
            transferIncluded: true,
            transferFromName: textOrNull(programme.transferFromName),
            transferToName: textOrNull(programme.transferToName),
            isActive: programme.isActive !== false,
            displayOrder: programmeIndex,
          },
        });
        for (let rateIndex = 0; rateIndex < programme.rates.length; rateIndex++) {
          const rate = programme.rates[rateIndex];
          const market = asCruiseMarket(rate.market);
          const adultPrice = rate.adultPrice ?? rate.singlePrice;
          await tx.cruiseProgrammeRate.create({
            data: {
              programmeId: created.id,
              market,
              currency: cruiseCurrency(market),
              singlePrice: decOrNull(adultPrice),
              doublePrice: null,
              triplePrice: null,
              childPrice: decOrNull(rate.childPrice),
              supplements: cleanSupplements(rate.supplements, cruiseCurrency(market)),
              validFrom: dateOrNull(rate.validFrom),
              validTo: dateOrNull(rate.validTo),
              notes: textOrNull(rate.notes, 1000),
              isActive: rate.isActive !== false,
              displayOrder: rateIndex,
            },
          });
        }
      }
      const transfers = catalogue.transferRates.filter((rate) => rate.route === cruise.route && Number(rate.nights) === schedule.nights);
      for (let rateIndex = 0; rateIndex < transfers.length; rateIndex++) {
        const rate = transfers[rateIndex];
        const market = asCruiseMarket(rate.market);
        await tx.cruiseTransferRate.create({
          data: {
            cruiseId: cruise.id,
            scheduleId: schedule.id,
            market,
            fromLocation: rate.fromLocation,
            toLocation: rate.toLocation,
            tripType: rate.tripType,
            vehicleType: rate.vehicleType,
            vehicleCapacity: rate.vehicleCapacity,
            amount: new Decimal(rate.amount),
            roundTripAmount: null,
            currency: cruiseCurrency(market),
            validFrom: dateOrNull(rate.validFrom),
            validTo: dateOrNull(rate.validTo),
            notes: textOrNull(rate.notes, 1000),
            isActive: rate.isActive !== false,
            displayOrder: rateIndex,
          },
        });
      }
    }
  }
}

/** One reusable programme/transfer catalogue, materialised against matching 3/4-night schedules. */
export async function getCruiseSharedCatalogue(_req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await ensureSharedCatalogue() });
}

export async function saveCruiseSharedCatalogue(req: Request, res: Response): Promise<void> {
  const postedProgrammes = Array.isArray(req.body?.programmes) ? req.body.programmes as ProgrammeInput[] : [];
  const postedTransfers = Array.isArray(req.body?.transferRates) ? req.body.transferRates as TransferRateInput[] : [];
  const programmes = postedProgrammes.map(cleanSharedProgramme);
  const transferRates = postedTransfers.map(cleanSharedTransfer);
  if (programmes.some((row) => !row) || transferRates.some((row) => !row)) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'Check route, nights, vehicle, capacity and transfer price' });
    return;
  }
  const cleanProgrammes = programmes as SharedProgramme[];
  const cleanTransfers = transferRates as SharedTransfer[];
  for (const programme of cleanProgrammes) {
    if (!String(programme.transferFromName ?? '').trim() || !String(programme.transferToName ?? '').trim()) {
      res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: `${programme.name}: included transfer route is required` });
      return;
    }
    const markets = new Set(programme.rates.map((rate) => asCruiseMarket(rate.market)));
    if (!markets.has('EGYPTIAN') || !markets.has('FOREIGN')
      || programme.rates.some((rate) => decOrNull(rate.adultPrice ?? rate.singlePrice) === null)) {
      res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: `${programme.name}: every period needs Egyptian/EGP and Foreign/USD adult prices` });
      return;
    }
  }
  const catalogue = { programmes: cleanProgrammes, transferRates: cleanTransfers };
  await prisma.$transaction(async (tx) => {
    await tx.cruiseSharedCatalogue.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        programmes: cleanProgrammes as unknown as Prisma.InputJsonValue,
        transferRates: cleanTransfers as unknown as Prisma.InputJsonValue,
      },
      update: {
        programmes: cleanProgrammes as unknown as Prisma.InputJsonValue,
        transferRates: cleanTransfers as unknown as Prisma.InputJsonValue,
      },
    });
    await materialiseSharedCatalogue(tx, catalogue);
  });
  res.json({ success: true, data: catalogue });
}

/** GET /api/cruises/:id/programmes — schedule-bound programmes and their two tariffs. */
export async function listCruiseProgrammes(req: Request, res: Response): Promise<void> {
  const programmes = await prisma.cruiseProgramme.findMany({
    where: { cruiseId: req.params.id },
    include: { rates: { orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }] } },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
  });
  res.json({ success: true, data: programmes });
}

/** PUT /api/cruises/:id/programmes — replace programmes after schedules are saved. */
export async function saveCruiseProgrammes(req: Request, res: Response): Promise<void> {
  const cruiseId = req.params.id;
  const cruise = await prisma.nileCruise.findUnique({
    where: { id: cruiseId },
    select: { schedules: { select: { id: true } } },
  });
  if (!cruise) { res.status(404).json({ success: false, error: 'NOT_FOUND' }); return; }
  const scheduleIds = new Set(cruise.schedules.map((schedule) => schedule.id));
  const posted = Array.isArray(req.body?.programmes) ? req.body.programmes as ProgrammeInput[] : [];
  const clean = posted.map((programme) => ({
    ...programme,
    scheduleId: String(programme.scheduleId ?? ''),
    name: String(programme.name ?? '').trim(),
    rates: Array.isArray(programme.rates) ? programme.rates : [],
  })).filter((programme) => programme.name.length > 0);

  for (const programme of clean) {
    if (!scheduleIds.has(programme.scheduleId)
      || !String(programme.transferFromName ?? '').trim()
      || !String(programme.transferToName ?? '').trim()) {
      res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: `Programme "${programme.name}" needs a valid From / Back schedule and included transfer route` });
      return;
    }
    const markets = new Set<Market>();
    for (const rate of programme.rates) {
      const invalid = validateCruiseRateInput(rate);
      if (invalid) {
        res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: `${programme.name}: ${invalid}` });
        return;
      }
      markets.add(asCruiseMarket(rate.market));
    }
    if (!markets.has('EGYPTIAN') || !markets.has('FOREIGN')) {
      res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: `${programme.name} needs an Egyptian/EGP tariff and a Foreign/USD tariff` });
      return;
    }
    if (!programmePeriodsHaveBothAudiences(programme.rates)) {
      res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: `${programme.name}: every price period needs both Egyptian/EGP and Foreign/USD prices` });
      return;
    }
  }

  const programmes = await prisma.$transaction(async (tx) => {
    await tx.cruiseProgramme.deleteMany({ where: { cruiseId } });
    for (let programmeIndex = 0; programmeIndex < clean.length; programmeIndex++) {
      const programme = clean[programmeIndex];
      const created = await tx.cruiseProgramme.create({
        data: {
          cruiseId,
          scheduleId: programme.scheduleId,
          name: programme.name,
          nameAr: textOrNull(programme.nameAr),
          description: textOrNull(programme.description, 5000),
          descriptionAr: textOrNull(programme.descriptionAr, 5000),
          itinerary: readItinerary(programme.itinerary) as unknown as Prisma.InputJsonValue,
          transferIncluded: true,
          transferFromName: textOrNull(programme.transferFromName),
          transferToName: textOrNull(programme.transferToName),
          isActive: programme.isActive !== false,
          displayOrder: programmeIndex,
        },
      });
      for (let rateIndex = 0; rateIndex < programme.rates.length; rateIndex++) {
        const rate = programme.rates[rateIndex];
        const market = asCruiseMarket(rate.market);
        const currency = cruiseCurrency(market);
        await tx.cruiseProgrammeRate.create({
          data: {
            programmeId: created.id,
            market,
            currency,
            singlePrice: decOrNull(rate.singlePrice),
            doublePrice: decOrNull(rate.doublePrice),
            triplePrice: decOrNull(rate.triplePrice),
            childPrice: decOrNull(rate.childPrice),
            supplements: cleanSupplements(rate.supplements, currency),
            validFrom: dateOrNull(rate.validFrom),
            validTo: dateOrNull(rate.validTo),
            notes: textOrNull(rate.notes, 1000),
            isActive: rate.isActive !== false,
            displayOrder: rateIndex,
          },
        });
      }
    }
    return tx.cruiseProgramme.findMany({
      where: { cruiseId },
      include: { rates: { orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }] } },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
  });
  res.json({ success: true, data: programmes });
}

export async function listCruiseTransferRates(req: Request, res: Response): Promise<void> {
  const rates = await prisma.cruiseTransferRate.findMany({
    where: { cruiseId: req.params.id },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
  });
  res.json({ success: true, data: rates });
}

export async function saveCruiseTransferRates(req: Request, res: Response): Promise<void> {
  const cruiseId = req.params.id;
  const cruise = await prisma.nileCruise.findUnique({
    where: { id: cruiseId }, select: { schedules: { select: { id: true } } },
  });
  if (!cruise) { res.status(404).json({ success: false, error: 'NOT_FOUND' }); return; }
  const scheduleIds = new Set(cruise.schedules.map((schedule) => schedule.id));
  const posted = Array.isArray(req.body?.rates) ? req.body.rates as TransferRateInput[] : [];
  const clean = posted.map((rate) => ({
    ...rate,
    fromLocation: String(rate.fromLocation ?? '').trim(),
    toLocation: String(rate.toLocation ?? '').trim(),
  })).filter((rate) => rate.fromLocation && rate.toLocation);
  for (const rate of clean) {
    const amount = Number(rate.amount);
    const vehicleType = asVehicleType(rate.vehicleType);
    const vehicleCapacity = Math.floor(Number(rate.vehicleCapacity ?? VEHICLE_DEFAULT_CAPACITY[vehicleType]));
    const from = dateOrNull(rate.validFrom);
    const to = dateOrNull(rate.validTo);
    const invalidDate = (rate.validFrom && !from) || (rate.validTo && !to);
    if (!Number.isFinite(amount) || amount < 0 || vehicleCapacity < 1 || vehicleCapacity > 99
      || invalidDate || !rate.scheduleId || !scheduleIds.has(String(rate.scheduleId)) || (from && to && to < from)) {
      res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'Check transfer route, schedule, price and period' });
      return;
    }
  }
  const rates = await prisma.$transaction(async (tx) => {
    await tx.cruiseTransferRate.deleteMany({ where: { cruiseId } });
    for (let index = 0; index < clean.length; index++) {
      const rate = clean[index];
      const market = asCruiseMarket(rate.market);
      await tx.cruiseTransferRate.create({
        data: {
          cruiseId,
          scheduleId: String(rate.scheduleId),
          market,
          fromLocation: rate.fromLocation,
          toLocation: rate.toLocation,
          tripType: asTransferTripType(rate.tripType),
          vehicleType: asVehicleType(rate.vehicleType),
          vehicleCapacity: Math.floor(Number(rate.vehicleCapacity ?? VEHICLE_DEFAULT_CAPACITY[asVehicleType(rate.vehicleType)])),
          amount: new Decimal(Number(rate.amount)),
          roundTripAmount: null,
          currency: cruiseCurrency(market),
          validFrom: dateOrNull(rate.validFrom),
          validTo: dateOrNull(rate.validTo),
          notes: textOrNull(rate.notes, 1000),
          isActive: rate.isActive !== false,
          displayOrder: index,
        },
      });
    }
    return tx.cruiseTransferRate.findMany({
      where: { cruiseId }, orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
  });
  res.json({ success: true, data: rates });
}
