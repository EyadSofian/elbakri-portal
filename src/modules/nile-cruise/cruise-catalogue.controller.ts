import { Request, Response } from 'express';
import { Decimal } from '@prisma/client/runtime/library';
import { CabinType, Market } from '@prisma/client';
import { prisma } from '../../config/db';
import { normalizeWeekday, nightsBetween } from '../../shared/cruise-rates';

/**
 * The catalogue half of a Nile cruise: the cabin rate rows that price it, and
 * the schedules that say when the boat actually sails.
 *
 * Both are saved as a whole set (delete + recreate inside one transaction),
 * which is how the hotel rate matrix already works — the editor is a list the
 * admin reorders and deletes rows from freely, and a per-row PATCH API would
 * make that four calls instead of one.
 */

const MARKETS: Market[] = ['EGYPTIAN', 'INTERNATIONAL', 'GULF', 'FOREIGN', 'MIDDLE_EAST', 'NORTH_AFRICA', 'ARAB_48'];
const CABIN_TYPES: CabinType[] = ['STANDARD', 'DELUXE', 'SUITE', 'PRESIDENTIAL'];

function asMarket(value: unknown): Market | null {
  const s = String(value ?? '').trim().toUpperCase();
  return (MARKETS as string[]).includes(s) ? (s as Market) : null;
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

interface CabinRateInput {
  cabinName?: string;
  cabinType?: string;
  market?: string | null;
  currency?: string;
  singlePrice?: number | string | null;
  doublePrice?: number | string | null;
  triplePrice?: number | string | null;
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
  const cruise = await prisma.nileCruise.findUnique({ where: { id: cruiseId }, select: { id: true } });
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

  const rates = await prisma.$transaction(async (tx) => {
    await tx.cruiseCabinRate.deleteMany({ where: { cruiseId } });
    for (let i = 0; i < clean.length; i++) {
      const r = clean[i];
      await tx.cruiseCabinRate.create({
        data: {
          cruiseId,
          cabinName: r.cabinName,
          cabinType: asCabinType(r.cabinType),
          market: asMarket(r.market),
          currency: String(r.currency ?? 'USD').trim().toUpperCase().slice(0, 3) || 'USD',
          singlePrice: decOrNull(r.singlePrice),
          doublePrice: decOrNull(r.doublePrice),
          triplePrice: decOrNull(r.triplePrice),
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
    return tx.cruiseSchedule.findMany({
      where: { cruiseId },
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    });
  });
  res.json({ success: true, data: schedules });
}
