import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
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
import { cruiseRoutesShareCorridor } from '../../shared/cruise-route';
import { syncRetirableRows } from '../../shared/retirable-sync';
import { resolvePriceContext } from '../../shared/pricing';
import { cruiseAudience } from '../../shared/cruise-rates';

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
  id?: string | null;
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
  id?: string | null;
  departureDay?: string;
  returnDay?: string;
  nights?: number | string | null;
  label?: string | null;
  labelAr?: string | null;
  isActive?: boolean;
}

/** GET /api/cruises/:id/rates — the full rate table, for the admin editor. */
export async function listCruiseRates(req: Request, res: Response): Promise<void> {
  const admin = req.user!.role === 'SUPERADMIN';
  const cruise = admin ? null : await prisma.nileCruise.findUnique({ where: { id: req.params.id }, select: { showPriceToAgents: true } });
  const context = admin ? null : await resolvePriceContext(req);
  const market = context && cruiseAudience(context.market) === 'EGYPTIAN' ? 'EGYPTIAN' : 'FOREIGN';
  const rates = await prisma.cruiseCabinRate.findMany({
    where: {
      cruiseId: req.params.id,
      retiredAt: null,
      ...(!admin && { isActive: true, market: market === 'FOREIGN' ? { in: ['FOREIGN', 'INTERNATIONAL'] } : 'EGYPTIAN' }),
    },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
  });
  res.json({ success: true, data: admin || cruise?.showPriceToAgents ? rates : [] });
}

/** PUT /api/cruises/:id/rates — replace the whole rate set for one boat. */
export async function saveCruiseRates(req: Request, res: Response): Promise<void> {
  const cruiseId = req.params.id;
  const cruise = await prisma.nileCruise.findUnique({
    where: { id: cruiseId },
    select: { id: true, schedules: { where: { retiredAt: null }, select: { id: true } } },
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
    const existing = await tx.cruiseCabinRate.findMany({ where: { cruiseId, retiredAt: null } });
    const writeData = (r: CabinRateInput, index: number) => {
      const market = asCruiseMarket(r.market);
      const currency = cruiseCurrency(market);
      return {
        scheduleId: String(r.scheduleId),
        cabinName: String(r.cabinName),
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
        retiredAt: null,
        notes: textOrNull(r.notes, 1000),
        displayOrder: index,
      };
    };
    await syncRetirableRows({
      existing,
      incoming: clean,
      incomingId: (row) => textOrNull(row.id),
      invalidIdError: 'RATE_NOT_AVAILABLE',
      legacyMatch: (row, candidate) => candidate.scheduleId === String(row.scheduleId)
        && candidate.cabinName.trim().toLowerCase() === String(row.cabinName).trim().toLowerCase()
        && asCruiseMarket(candidate.market) === asCruiseMarket(row.market)
        && (candidate.validFrom?.toISOString().slice(0, 10) ?? null) === (dateOrNull(row.validFrom)?.toISOString().slice(0, 10) ?? null)
        && (candidate.validTo?.toISOString().slice(0, 10) ?? null) === (dateOrNull(row.validTo)?.toISOString().slice(0, 10) ?? null),
      update: async (candidate, row, index) => tx.cruiseCabinRate.update({
        where: { id: candidate.id }, data: writeData(row, index),
      }),
      create: async (row, index) => tx.cruiseCabinRate.create({
        data: {
          cruiseId,
          ...writeData(row, index),
        },
      }),
      retire: async (candidate) => {
        await tx.cruiseCabinRate.update({
          where: { id: candidate.id }, data: { isActive: false, retiredAt: new Date() },
        });
      },
    });
    return tx.cruiseCabinRate.findMany({
      where: { cruiseId, retiredAt: null },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
  });
  res.json({ success: true, data: rates });
}

/** GET /api/cruises/:id/schedules — when this boat leaves and when it is back. */
export async function listCruiseSchedules(req: Request, res: Response): Promise<void> {
  const schedules = await prisma.cruiseSchedule.findMany({
    where: { cruiseId: req.params.id, retiredAt: null },
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

  const sharedCatalogue = await ensureSharedCatalogue();

  const schedules = await prisma.$transaction(async (tx) => {
    const existing = await tx.cruiseSchedule.findMany({ where: { cruiseId, retiredAt: null } });
    await syncRetirableRows({
      existing,
      incoming: clean,
      incomingId: (row) => textOrNull(row.raw.id),
      legacyMatch: (row, candidate) => candidate.departureDay === row.departureDay
        && candidate.returnDay === row.returnDay,
      invalidIdError: 'SCHEDULE_NOT_AVAILABLE',
      update: async (candidate, row, index) => tx.cruiseSchedule.update({
        where: { id: candidate.id },
        data: {
          departureDay: row.departureDay,
          returnDay: row.returnDay,
          nights: nightsBetween(row.departureDay, row.returnDay),
          label: textOrNull(row.raw.label),
          labelAr: textOrNull(row.raw.labelAr),
          isActive: row.raw.isActive !== false,
          retiredAt: null,
          displayOrder: index,
        },
      }),
      create: async (row, index) => tx.cruiseSchedule.create({
        data: {
          cruiseId,
          departureDay: row.departureDay,
          returnDay: row.returnDay,
          nights: nightsBetween(row.departureDay, row.returnDay),
          label: textOrNull(row.raw.label),
          labelAr: textOrNull(row.raw.labelAr),
          isActive: row.raw.isActive !== false,
          displayOrder: index,
        },
      }),
      retire: async (candidate) => {
        const retiredAt = new Date();
        const programmeIds = (await tx.cruiseProgramme.findMany({
          where: { scheduleId: candidate.id, retiredAt: null }, select: { id: true },
        })).map((row) => row.id);
        if (programmeIds.length) {
          await tx.cruiseProgrammeRate.updateMany({
            where: { programmeId: { in: programmeIds }, retiredAt: null },
            data: { isActive: false, retiredAt },
          });
        }
        await Promise.all([
          tx.cruiseCabinRate.updateMany({ where: { scheduleId: candidate.id, retiredAt: null }, data: { isActive: false, retiredAt } }),
          tx.cruiseProgramme.updateMany({ where: { scheduleId: candidate.id, retiredAt: null }, data: { isActive: false, retiredAt } }),
          tx.cruiseTransferRate.updateMany({ where: { scheduleId: candidate.id, retiredAt: null }, data: { isActive: false, retiredAt } }),
          tx.cruiseSchedule.update({ where: { id: candidate.id }, data: { isActive: false, retiredAt } }),
        ]);
      },
    });
    const saved = await tx.cruiseSchedule.findMany({
      where: { cruiseId, retiredAt: null },
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
  id?: string | null;
  catalogueKey?: string | null;
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
  id?: string | null;
  catalogueKey?: string | null;
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
  id?: string | null;
  catalogueKey?: string | null;
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
type SharedProgrammeRate = ProgrammeRateInput & { catalogueKey: string };
type SharedProgramme = ProgrammeInput & { catalogueKey: string; route: string; nights: number; rates: SharedProgrammeRate[] };
type SharedTransfer = TransferRateInput & {
  catalogueKey: string;
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

function readCatalogueKey(value: unknown, prefix: string): string {
  return textOrNull(value, 120) ?? `${prefix}-${randomUUID()}`;
}

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
    catalogueKey: readCatalogueKey(rate.catalogueKey ?? rate.id, 'programme-rate'),
    market: asCruiseMarket(rate.market),
    adultPrice: rate.adultPrice ?? rate.singlePrice ?? null,
    singlePrice: rate.adultPrice ?? rate.singlePrice ?? null,
    doublePrice: null,
    triplePrice: null,
  }));
  return {
    ...raw,
    catalogueKey: readCatalogueKey(raw.catalogueKey ?? raw.id, 'programme'),
    route,
    nights,
    name,
    rates,
  };
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
    catalogueKey: readCatalogueKey(raw.catalogueKey ?? raw.id, 'transfer'),
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
      const baseKey = textOrNull(raw.catalogueKey ?? raw.id, 110);
      const oneWay = cleanSharedTransfer({ ...raw, catalogueKey: baseKey ? `${baseKey}-one-way` : null, tripType: 'ONE_WAY', amount: raw.oneWayAmount ?? raw.amount });
      const roundTrip = cleanSharedTransfer({ ...raw, catalogueKey: baseKey ? `${baseKey}-round-trip` : null, tripType: 'ROUND_TRIP', amount: raw.roundTripAmount });
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
      catalogueKey: programme.catalogueKey ?? `legacy-programme-${programme.id}`,
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
        catalogueKey: rate.catalogueKey ?? `legacy-programme-rate-${rate.id}`,
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
        catalogueKey: rate.catalogueKey ?? `legacy-transfer-${rate.id}-${tripType}`,
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
  if (stored) {
    const programmes = (Array.isArray(stored.programmes) ? stored.programmes : [])
      .map((row) => cleanSharedProgramme((row ?? {}) as ProgrammeInput))
      .filter((row): row is SharedProgramme => row !== null);
    const transferRates = normalizeSharedTransfers(stored.transferRates);
    // This upgrades legacy JSON with stable catalogue keys. It is deliberately
    // non-destructive: the same semantic rows remain and future edits can now
    // update their materialised records without regenerating foreign keys.
    await prisma.cruiseSharedCatalogue.update({
      where: { id: 'default' },
      data: {
        programmes: programmes as unknown as Prisma.InputJsonValue,
        transferRates: transferRates as unknown as Prisma.InputJsonValue,
      },
    });
    return { programmes, transferRates };
  }
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

export async function materialiseSharedCatalogue(
  tx: Prisma.TransactionClient,
  catalogue: { programmes: SharedProgramme[]; transferRates: SharedTransfer[] },
  onlyCruiseId?: string,
): Promise<void> {
  const cruiseWhere = onlyCruiseId ? { id: onlyCruiseId } : {};
  const cruises = await tx.nileCruise.findMany({
    where: cruiseWhere,
    select: { id: true, route: true, schedules: { where: { isActive: true }, select: { id: true, nights: true } } },
  });

  const sameDate = (left: Date | null, right: unknown) =>
    (left?.toISOString().slice(0, 10) ?? null) === (dateOrNull(right)?.toISOString().slice(0, 10) ?? null);

  for (const cruise of cruises) {
    const desiredProgrammes = cruise.schedules.flatMap((schedule) =>
      catalogue.programmes.filter((programme) =>
        cruiseRoutesShareCorridor(cruise.route, programme.route)
        && Number(programme.nights) === schedule.nights,
      ).map((programme, displayOrder) => ({ programme, schedule, displayOrder })),
    );
    const existingProgrammes = await tx.cruiseProgramme.findMany({
      where: { cruiseId: cruise.id, retiredAt: null },
    });

    const syncProgrammeRates = async (programmeId: string, rows: SharedProgrammeRate[]) => {
      const existingRates = await tx.cruiseProgrammeRate.findMany({
        where: { programmeId, retiredAt: null },
      });
      await syncRetirableRows({
        existing: existingRates,
        incoming: rows,
        incomingId: (row) => existingRates.find((candidate) => candidate.catalogueKey === row.catalogueKey)?.id ?? null,
        legacyMatch: (row, candidate) => candidate.catalogueKey === null
          && asCruiseMarket(candidate.market) === asCruiseMarket(row.market)
          && sameDate(candidate.validFrom, row.validFrom)
          && sameDate(candidate.validTo, row.validTo),
        update: async (candidate, row, index) => {
          const market = asCruiseMarket(row.market);
          return tx.cruiseProgrammeRate.update({
            where: { id: candidate.id },
            data: {
              catalogueKey: row.catalogueKey,
              market,
              currency: cruiseCurrency(market),
              singlePrice: decOrNull(row.adultPrice ?? row.singlePrice),
              doublePrice: null,
              triplePrice: null,
              childPrice: decOrNull(row.childPrice),
              supplements: cleanSupplements(row.supplements, cruiseCurrency(market)),
              validFrom: dateOrNull(row.validFrom),
              validTo: dateOrNull(row.validTo),
              notes: textOrNull(row.notes, 1000),
              isActive: row.isActive !== false,
              retiredAt: null,
              displayOrder: index,
            },
          });
        },
        create: async (row, index) => {
          const market = asCruiseMarket(row.market);
          return tx.cruiseProgrammeRate.create({
            data: {
              programmeId,
              catalogueKey: row.catalogueKey,
              market,
              currency: cruiseCurrency(market),
              singlePrice: decOrNull(row.adultPrice ?? row.singlePrice),
              doublePrice: null,
              triplePrice: null,
              childPrice: decOrNull(row.childPrice),
              supplements: cleanSupplements(row.supplements, cruiseCurrency(market)),
              validFrom: dateOrNull(row.validFrom),
              validTo: dateOrNull(row.validTo),
              notes: textOrNull(row.notes, 1000),
              isActive: row.isActive !== false,
              displayOrder: index,
            },
          });
        },
        retire: async (candidate) => {
          await tx.cruiseProgrammeRate.update({
            where: { id: candidate.id }, data: { isActive: false, retiredAt: new Date() },
          });
        },
      });
    };

    await syncRetirableRows({
      existing: existingProgrammes,
      incoming: desiredProgrammes,
      incomingId: (row) => existingProgrammes.find((candidate) =>
        candidate.catalogueKey === row.programme.catalogueKey && candidate.scheduleId === row.schedule.id)?.id ?? null,
      legacyMatch: (row, candidate) => candidate.catalogueKey === null
        && candidate.scheduleId === row.schedule.id
        && candidate.name.trim().toLowerCase() === String(row.programme.name).trim().toLowerCase(),
      update: async (candidate, row) => {
        const saved = await tx.cruiseProgramme.update({
          where: { id: candidate.id },
          data: {
            scheduleId: row.schedule.id,
            catalogueKey: row.programme.catalogueKey,
            name: String(row.programme.name),
            nameAr: textOrNull(row.programme.nameAr),
            description: textOrNull(row.programme.description, 5000),
            descriptionAr: textOrNull(row.programme.descriptionAr, 5000),
            itinerary: readItinerary(row.programme.itinerary) as unknown as Prisma.InputJsonValue,
            transferIncluded: true,
            transferFromName: textOrNull(row.programme.transferFromName),
            transferToName: textOrNull(row.programme.transferToName),
            isActive: row.programme.isActive !== false,
            retiredAt: null,
            displayOrder: row.displayOrder,
          },
        });
        await syncProgrammeRates(saved.id, row.programme.rates);
        return saved;
      },
      create: async (row) => {
        const saved = await tx.cruiseProgramme.create({
          data: {
            cruiseId: cruise.id,
            scheduleId: row.schedule.id,
            catalogueKey: row.programme.catalogueKey,
            name: String(row.programme.name),
            nameAr: textOrNull(row.programme.nameAr),
            description: textOrNull(row.programme.description, 5000),
            descriptionAr: textOrNull(row.programme.descriptionAr, 5000),
            itinerary: readItinerary(row.programme.itinerary) as unknown as Prisma.InputJsonValue,
            transferIncluded: true,
            transferFromName: textOrNull(row.programme.transferFromName),
            transferToName: textOrNull(row.programme.transferToName),
            isActive: row.programme.isActive !== false,
            displayOrder: row.displayOrder,
          },
        });
        await syncProgrammeRates(saved.id, row.programme.rates);
        return saved;
      },
      retire: async (candidate) => {
        const retiredAt = new Date();
        await tx.cruiseProgrammeRate.updateMany({
          where: { programmeId: candidate.id, retiredAt: null }, data: { isActive: false, retiredAt },
        });
        await tx.cruiseProgramme.update({
          where: { id: candidate.id }, data: { isActive: false, retiredAt },
        });
      },
    });

    const desiredTransfers = cruise.schedules.flatMap((schedule) =>
      catalogue.transferRates.filter((rate) =>
        cruiseRoutesShareCorridor(cruise.route, rate.route)
        && Number(rate.nights) === schedule.nights,
      ).map((rate, displayOrder) => ({ rate, schedule, displayOrder })),
    );
    const existingTransfers = await tx.cruiseTransferRate.findMany({
      where: { cruiseId: cruise.id, retiredAt: null },
    });
    await syncRetirableRows({
      existing: existingTransfers,
      incoming: desiredTransfers,
      incomingId: (row) => existingTransfers.find((candidate) =>
        candidate.catalogueKey === row.rate.catalogueKey && candidate.scheduleId === row.schedule.id)?.id ?? null,
      legacyMatch: (row, candidate) => candidate.catalogueKey === null
        && candidate.scheduleId === row.schedule.id
        && candidate.market === asCruiseMarket(row.rate.market)
        && candidate.fromLocation.trim().toLowerCase() === row.rate.fromLocation.trim().toLowerCase()
        && candidate.toLocation.trim().toLowerCase() === row.rate.toLocation.trim().toLowerCase()
        && candidate.tripType === row.rate.tripType
        && candidate.vehicleType === row.rate.vehicleType
        && candidate.vehicleCapacity === row.rate.vehicleCapacity,
      update: async (candidate, row) => {
        const market = asCruiseMarket(row.rate.market);
        return tx.cruiseTransferRate.update({
          where: { id: candidate.id },
          data: {
            scheduleId: row.schedule.id,
            catalogueKey: row.rate.catalogueKey,
            market,
            fromLocation: row.rate.fromLocation,
            toLocation: row.rate.toLocation,
            tripType: row.rate.tripType,
            vehicleType: row.rate.vehicleType,
            vehicleCapacity: row.rate.vehicleCapacity,
            amount: new Decimal(row.rate.amount),
            roundTripAmount: null,
            currency: cruiseCurrency(market),
            validFrom: dateOrNull(row.rate.validFrom),
            validTo: dateOrNull(row.rate.validTo),
            notes: textOrNull(row.rate.notes, 1000),
            isActive: row.rate.isActive !== false,
            retiredAt: null,
            displayOrder: row.displayOrder,
          },
        });
      },
      create: async (row) => {
        const market = asCruiseMarket(row.rate.market);
        return tx.cruiseTransferRate.create({
          data: {
            cruiseId: cruise.id,
            scheduleId: row.schedule.id,
            catalogueKey: row.rate.catalogueKey,
            market,
            fromLocation: row.rate.fromLocation,
            toLocation: row.rate.toLocation,
            tripType: row.rate.tripType,
            vehicleType: row.rate.vehicleType,
            vehicleCapacity: row.rate.vehicleCapacity,
            amount: new Decimal(row.rate.amount),
            roundTripAmount: null,
            currency: cruiseCurrency(market),
            validFrom: dateOrNull(row.rate.validFrom),
            validTo: dateOrNull(row.rate.validTo),
            notes: textOrNull(row.rate.notes, 1000),
            isActive: row.rate.isActive !== false,
            displayOrder: row.displayOrder,
          },
        });
      },
      retire: async (candidate) => {
        await tx.cruiseTransferRate.update({
          where: { id: candidate.id }, data: { isActive: false, retiredAt: new Date() },
        });
      },
    });
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
  const admin = req.user!.role === 'SUPERADMIN';
  const cruise = admin ? null : await prisma.nileCruise.findUnique({ where: { id: req.params.id }, select: { showPriceToAgents: true } });
  const context = admin ? null : await resolvePriceContext(req);
  const market = context && cruiseAudience(context.market) === 'EGYPTIAN' ? 'EGYPTIAN' : 'FOREIGN';
  const programmes = await prisma.cruiseProgramme.findMany({
    where: { cruiseId: req.params.id, retiredAt: null, ...(!admin && { isActive: true }) },
    include: { rates: {
      where: {
        retiredAt: null,
        ...(!admin && { isActive: true, market: market === 'FOREIGN' ? { in: ['FOREIGN', 'INTERNATIONAL'] } : 'EGYPTIAN' }),
      },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    } },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
  });
  res.json({
    success: true,
    data: admin || cruise?.showPriceToAgents ? programmes : programmes.map((programme) => ({ ...programme, rates: [] })),
  });
}

/** PUT /api/cruises/:id/programmes — replace programmes after schedules are saved. */
export async function saveCruiseProgrammes(req: Request, res: Response): Promise<void> {
  const cruiseId = req.params.id;
  const cruise = await prisma.nileCruise.findUnique({
    where: { id: cruiseId },
    select: { schedules: { where: { retiredAt: null }, select: { id: true } } },
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
    const existing = await tx.cruiseProgramme.findMany({ where: { cruiseId, retiredAt: null } });
    const syncRates = async (programmeId: string, incomingRates: ProgrammeRateInput[]) => {
      const existingRates = await tx.cruiseProgrammeRate.findMany({ where: { programmeId, retiredAt: null } });
      await syncRetirableRows({
        existing: existingRates,
        incoming: incomingRates,
        incomingId: (row) => textOrNull(row.id),
        invalidIdError: 'PROGRAMME_RATE_NOT_AVAILABLE',
        legacyMatch: (row, candidate) => candidate.market === asCruiseMarket(row.market)
          && (candidate.validFrom?.toISOString().slice(0, 10) ?? null) === (dateOrNull(row.validFrom)?.toISOString().slice(0, 10) ?? null)
          && (candidate.validTo?.toISOString().slice(0, 10) ?? null) === (dateOrNull(row.validTo)?.toISOString().slice(0, 10) ?? null),
        update: async (candidate, row, index) => {
          const market = asCruiseMarket(row.market);
          return tx.cruiseProgrammeRate.update({
            where: { id: candidate.id },
            data: {
              market, currency: cruiseCurrency(market),
              singlePrice: decOrNull(row.singlePrice), doublePrice: decOrNull(row.doublePrice),
              triplePrice: decOrNull(row.triplePrice), childPrice: decOrNull(row.childPrice),
              supplements: cleanSupplements(row.supplements, cruiseCurrency(market)),
              validFrom: dateOrNull(row.validFrom), validTo: dateOrNull(row.validTo),
              notes: textOrNull(row.notes, 1000), isActive: row.isActive !== false,
              retiredAt: null, displayOrder: index,
            },
          });
        },
        create: async (row, index) => {
          const market = asCruiseMarket(row.market);
          return tx.cruiseProgrammeRate.create({
            data: {
              programmeId, market, currency: cruiseCurrency(market),
              singlePrice: decOrNull(row.singlePrice), doublePrice: decOrNull(row.doublePrice),
              triplePrice: decOrNull(row.triplePrice), childPrice: decOrNull(row.childPrice),
              supplements: cleanSupplements(row.supplements, cruiseCurrency(market)),
              validFrom: dateOrNull(row.validFrom), validTo: dateOrNull(row.validTo),
              notes: textOrNull(row.notes, 1000), isActive: row.isActive !== false,
              displayOrder: index,
            },
          });
        },
        retire: async (candidate) => {
          await tx.cruiseProgrammeRate.update({ where: { id: candidate.id }, data: { isActive: false, retiredAt: new Date() } });
        },
      });
    };
    await syncRetirableRows({
      existing,
      incoming: clean,
      incomingId: (row) => textOrNull(row.id),
      invalidIdError: 'PROGRAMME_NOT_AVAILABLE',
      legacyMatch: (row, candidate) => candidate.scheduleId === row.scheduleId
        && candidate.name.trim().toLowerCase() === row.name.trim().toLowerCase(),
      update: async (candidate, row, index) => {
        const saved = await tx.cruiseProgramme.update({
          where: { id: candidate.id },
          data: {
            scheduleId: row.scheduleId, name: row.name, nameAr: textOrNull(row.nameAr),
            description: textOrNull(row.description, 5000), descriptionAr: textOrNull(row.descriptionAr, 5000),
            itinerary: readItinerary(row.itinerary) as unknown as Prisma.InputJsonValue,
            transferIncluded: true, transferFromName: textOrNull(row.transferFromName),
            transferToName: textOrNull(row.transferToName), isActive: row.isActive !== false,
            retiredAt: null, displayOrder: index,
          },
        });
        await syncRates(saved.id, row.rates);
        return saved;
      },
      create: async (row, index) => {
        const saved = await tx.cruiseProgramme.create({
          data: {
            cruiseId, scheduleId: row.scheduleId, name: row.name, nameAr: textOrNull(row.nameAr),
            description: textOrNull(row.description, 5000), descriptionAr: textOrNull(row.descriptionAr, 5000),
            itinerary: readItinerary(row.itinerary) as unknown as Prisma.InputJsonValue,
            transferIncluded: true, transferFromName: textOrNull(row.transferFromName),
            transferToName: textOrNull(row.transferToName), isActive: row.isActive !== false,
            displayOrder: index,
          },
        });
        await syncRates(saved.id, row.rates);
        return saved;
      },
      retire: async (candidate) => {
        const retiredAt = new Date();
        await tx.cruiseProgrammeRate.updateMany({ where: { programmeId: candidate.id, retiredAt: null }, data: { isActive: false, retiredAt } });
        await tx.cruiseProgramme.update({ where: { id: candidate.id }, data: { isActive: false, retiredAt } });
      },
    });
    return tx.cruiseProgramme.findMany({
      where: { cruiseId, retiredAt: null },
      include: { rates: { where: { retiredAt: null }, orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }] } },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
  });
  res.json({ success: true, data: programmes });
}

export async function listCruiseTransferRates(req: Request, res: Response): Promise<void> {
  const admin = req.user!.role === 'SUPERADMIN';
  const cruise = admin ? null : await prisma.nileCruise.findUnique({ where: { id: req.params.id }, select: { showPriceToAgents: true } });
  const context = admin ? null : await resolvePriceContext(req);
  const market = context && cruiseAudience(context.market) === 'EGYPTIAN' ? 'EGYPTIAN' : 'FOREIGN';
  const rates = await prisma.cruiseTransferRate.findMany({
    where: {
      cruiseId: req.params.id,
      retiredAt: null,
      ...(!admin && { isActive: true, market: market === 'FOREIGN' ? { in: ['FOREIGN', 'INTERNATIONAL'] } : 'EGYPTIAN' }),
    },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
  });
  res.json({ success: true, data: admin || cruise?.showPriceToAgents ? rates : [] });
}

export async function saveCruiseTransferRates(req: Request, res: Response): Promise<void> {
  const cruiseId = req.params.id;
  const cruise = await prisma.nileCruise.findUnique({
    where: { id: cruiseId }, select: { schedules: { where: { retiredAt: null }, select: { id: true } } },
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
    const existing = await tx.cruiseTransferRate.findMany({ where: { cruiseId, retiredAt: null } });
    const writeData = (rate: TransferRateInput, index: number) => {
      const market = asCruiseMarket(rate.market);
      return {
        scheduleId: String(rate.scheduleId), market,
        fromLocation: String(rate.fromLocation), toLocation: String(rate.toLocation),
        tripType: asTransferTripType(rate.tripType), vehicleType: asVehicleType(rate.vehicleType),
        vehicleCapacity: Math.floor(Number(rate.vehicleCapacity ?? VEHICLE_DEFAULT_CAPACITY[asVehicleType(rate.vehicleType)])),
        amount: new Decimal(Number(rate.amount)), roundTripAmount: null,
        currency: cruiseCurrency(market), validFrom: dateOrNull(rate.validFrom), validTo: dateOrNull(rate.validTo),
        notes: textOrNull(rate.notes, 1000), isActive: rate.isActive !== false,
        retiredAt: null, displayOrder: index,
      };
    };
    await syncRetirableRows({
      existing,
      incoming: clean,
      incomingId: (row) => textOrNull(row.id),
      invalidIdError: 'TRANSFER_RATE_NOT_AVAILABLE',
      legacyMatch: (row, candidate) => candidate.scheduleId === String(row.scheduleId)
        && candidate.market === asCruiseMarket(row.market)
        && candidate.fromLocation.trim().toLowerCase() === String(row.fromLocation).trim().toLowerCase()
        && candidate.toLocation.trim().toLowerCase() === String(row.toLocation).trim().toLowerCase()
        && candidate.tripType === asTransferTripType(row.tripType)
        && candidate.vehicleType === asVehicleType(row.vehicleType),
      update: async (candidate, row, index) => tx.cruiseTransferRate.update({ where: { id: candidate.id }, data: writeData(row, index) }),
      create: async (row, index) => tx.cruiseTransferRate.create({ data: { cruiseId, ...writeData(row, index) } }),
      retire: async (candidate) => {
        await tx.cruiseTransferRate.update({ where: { id: candidate.id }, data: { isActive: false, retiredAt: new Date() } });
      },
    });
    return tx.cruiseTransferRate.findMany({
      where: { cruiseId, retiredAt: null }, orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
  });
  res.json({ success: true, data: rates });
}
