import { Request, Response } from 'express';
import { Decimal } from '@prisma/client/runtime/library';
import { Market, HotelSupplementType } from '@prisma/client';
import { prisma } from '../../config/db';

// ─────────────────────────────────────────────
// Structured hotel rate matrix (rooms × markets × occupancy) + supplements.
// Prices are explicit per-currency — NEVER FX-converted. `market = null` means
// the rate applies to ALL markets (fallback when no market-specific row exists).
// ─────────────────────────────────────────────

const MARKETS: Market[] = ['EGYPTIAN', 'INTERNATIONAL', 'GULF', 'FOREIGN', 'MIDDLE_EAST', 'NORTH_AFRICA', 'ARAB_48'];
const SUPP_TYPES: HotelSupplementType[] = ['FIXED_AMOUNT', 'PERCENTAGE', 'TOTAL_PRICE', 'TEXT_ONLY'];

function asMarket(v: unknown): Market | null {
  const s = String(v ?? '').trim().toUpperCase();
  return (MARKETS as string[]).includes(s) ? (s as Market) : null;
}
/**
 * Meal plans are admin-managed (MealPlanOption), so the value is validated
 * against the configured list rather than a fixed enum — that is what lets an
 * admin add a plan like Soft All Inclusive without a code change.
 */
async function asMealPlanCode(v: unknown): Promise<string | null> {
  const s = String(v ?? '').trim().toUpperCase();
  if (!s) return null;
  const found = await prisma.mealPlanOption.findUnique({ where: { code: s }, select: { code: true } });
  return found?.code ?? null;
}
function asSuppType(v: unknown): HotelSupplementType {
  const s = String(v ?? '').trim().toUpperCase();
  return (SUPP_TYPES as string[]).includes(s) ? (s as HotelSupplementType) : 'TEXT_ONLY';
}
function decOrNull(v: unknown): Decimal | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? new Decimal(n) : null;
}
function dateOrNull(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

const rateInclude = { supplements: { orderBy: { displayOrder: 'asc' as const } } };

interface SupplementInput {
  name?: string;
  type?: string;
  amount?: number | string | null;
  currency?: string | null;
  notes?: string | null;
}
interface RateInput {
  roomName?: string;
  market?: string | null;
  currency?: string;
  singlePrice?: number | string | null;
  doublePrice?: number | string | null;
  triplePrice?: number | string | null;
  mealPlan?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  isActive?: boolean;
  notes?: string | null;
  supplements?: SupplementInput[];
}

/** GET /api/hotels/:id/rates — full rate table for the admin editor. */
export async function listHotelRatesAdmin(req: Request, res: Response): Promise<void> {
  const rates = await prisma.hotelRate.findMany({
    where: { hotelId: req.params.id },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    include: rateInclude,
  });
  res.json({ success: true, data: rates });
}

/**
 * PUT /api/hotels/:id/rates — replace the full rate set for one hotel.
 * Each row needs a roomName + currency; rows with no room name are dropped.
 * Supplements are nested per row. Done in a transaction (delete + recreate).
 */
export async function saveHotelRates(req: Request, res: Response): Promise<void> {
  const hotelId = req.params.id;
  const hotel = await prisma.hotel.findUnique({ where: { id: hotelId }, select: { id: true } });
  if (!hotel) {
    res.status(404).json({ success: false, error: 'NOT_FOUND' });
    return;
  }

  const rows = Array.isArray(req.body?.rates) ? (req.body.rates as RateInput[]) : [];
  const clean = rows
    .map((r) => ({ ...r, roomName: String(r.roomName ?? '').trim() }))
    .filter((r) => r.roomName.length > 0);

  await prisma.$transaction(async (tx) => {
    await tx.hotelRate.deleteMany({ where: { hotelId } });
    for (let i = 0; i < clean.length; i++) {
      const r = clean[i];
      const supplements = (Array.isArray(r.supplements) ? r.supplements : [])
        .map((s, j) => ({ ...s, name: String(s.name ?? '').trim(), j }))
        .filter((s) => s.name.length > 0);
      await tx.hotelRate.create({
        data: {
          hotelId,
          roomName: r.roomName,
          market: asMarket(r.market),
          currency: String(r.currency ?? 'USD').trim().toUpperCase() || 'USD',
          singlePrice: decOrNull(r.singlePrice),
          doublePrice: decOrNull(r.doublePrice),
          triplePrice: decOrNull(r.triplePrice),
          mealPlan: await asMealPlanCode(r.mealPlan),
          validFrom: dateOrNull(r.validFrom),
          validTo: dateOrNull(r.validTo),
          isActive: r.isActive !== false,
          notes: r.notes ? String(r.notes).trim() : null,
          displayOrder: i,
          supplements: {
            create: supplements.map((s) => ({
              name: s.name,
              type: asSuppType(s.type),
              amount: decOrNull(s.amount),
              currency: s.currency ? String(s.currency).trim().toUpperCase() : null,
              notes: s.notes ? String(s.notes).trim() : null,
              displayOrder: s.j,
            })),
          },
        },
      });
    }
  });

  const saved = await prisma.hotelRate.findMany({
    where: { hotelId },
    orderBy: [{ displayOrder: 'asc' }],
    include: rateInclude,
  });
  res.json({ success: true, data: saved });
}

export interface VisibleHotelRate {
  id: string;
  roomName: string;
  market: Market | null;
  currency: string;
  singlePrice: Decimal | null;
  doublePrice: Decimal | null;
  triplePrice: Decimal | null;
  mealPlan: string | null;
  notes: string | null;
  supplements: { id: string; name: string; type: HotelSupplementType; amount: Decimal | null; currency: string | null; notes: string | null }[];
}

// FOREIGN and INTERNATIONAL describe the same "non-Egyptian, non-Gulf" client —
// the brief's hotel rate markets are EGYPTIAN/GULF/FOREIGN/ALL while companies
// may carry market INTERNATIONAL, so treat the two as equivalent when matching.
function marketEquivalent(a: Market, b: Market): boolean {
  if (a === b) return true;
  const foreign = new Set<Market>(['FOREIGN', 'INTERNATIONAL']);
  return foreign.has(a) && foreign.has(b);
}

function rateApplies(r: { market: Market | null; validFrom: Date | null; validTo: Date | null }, market: Market | null, now: Date): boolean {
  if (r.validFrom && r.validFrom > now) return false;
  if (r.validTo && r.validTo < now) return false;
  if (r.market != null && market != null && !marketEquivalent(r.market, market)) return false;
  if (r.market != null && market == null) return false; // a market-specific row needs a matching market
  return true;
}

/**
 * Resolve the rates a given company market may see for a set of hotels.
 * Returns id → { rates[], fromPrice, currency } only for hotels that have at
 * least one applicable active rate. `fromPrice` = the lowest occupancy price.
 */
export async function resolveHotelRateMap(
  hotelIds: string[],
  market: Market | null,
  now = new Date(),
): Promise<Map<string, { rates: VisibleHotelRate[]; fromPrice: Decimal | null; currency: string | null }>> {
  const out = new Map<string, { rates: VisibleHotelRate[]; fromPrice: Decimal | null; currency: string | null }>();
  if (hotelIds.length === 0) return out;
  const rows = await prisma.hotelRate.findMany({
    where: { hotelId: { in: hotelIds }, isActive: true },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
    include: rateInclude,
  });
  const byHotel = new Map<string, typeof rows>();
  for (const r of rows) {
    const arr = byHotel.get(r.hotelId) ?? [];
    arr.push(r);
    byHotel.set(r.hotelId, arr);
  }
  for (const [hotelId, list] of byHotel) {
    const applicable = list.filter((r) => rateApplies(r, market, now));
    if (applicable.length === 0) continue;
    const rates: VisibleHotelRate[] = applicable.map((r) => ({
      id: r.id,
      roomName: r.roomName,
      market: r.market,
      currency: r.currency,
      singlePrice: r.singlePrice,
      doublePrice: r.doublePrice,
      triplePrice: r.triplePrice,
      mealPlan: r.mealPlan,
      notes: r.notes,
      supplements: r.supplements.map((s) => ({ id: s.id, name: s.name, type: s.type, amount: s.amount, currency: s.currency, notes: s.notes })),
    }));
    // Lowest occupancy price across rows that share the cheapest row's currency.
    let fromPrice: Decimal | null = null;
    let currency: string | null = null;
    for (const r of rates) {
      const candidates = [r.singlePrice, r.doublePrice, r.triplePrice].filter((p): p is Decimal => p != null);
      for (const c of candidates) {
        if (fromPrice == null || c.lt(fromPrice)) {
          fromPrice = c;
          currency = r.currency;
        }
      }
    }
    out.set(hotelId, { rates, fromPrice, currency });
  }
  return out;
}
