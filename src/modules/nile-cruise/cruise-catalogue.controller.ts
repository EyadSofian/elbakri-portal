import { Request, Response } from 'express';
import { Decimal } from '@prisma/client/runtime/library';
import { CabinType, HotelSupplementType, Market, Prisma } from '@prisma/client';
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
    return saved;
  });
  res.json({ success: true, data: schedules });
}

interface ProgrammeRateInput {
  market?: string;
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
  scheduleId?: string;
  market?: string;
  fromLocation?: string;
  toLocation?: string;
  amount?: number | string | null;
  validFrom?: string | null;
  validTo?: string | null;
  notes?: string | null;
  isActive?: boolean;
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
    const from = dateOrNull(rate.validFrom);
    const to = dateOrNull(rate.validTo);
    const invalidDate = (rate.validFrom && !from) || (rate.validTo && !to);
    if (!Number.isFinite(amount) || amount < 0 || invalidDate || !rate.scheduleId || !scheduleIds.has(String(rate.scheduleId)) || (from && to && to < from)) {
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
          amount: new Decimal(Number(rate.amount)),
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
