import { Request } from 'express';
import { Decimal } from '@prisma/client/runtime/library';
import { Market } from '@prisma/client';
import { prisma } from '../config/db';

/**
 * Explicit per-market pricing.
 *
 * Each service stores its base price on its own column (Hotel.pricePerNight,
 * Activity.priceAdult/priceChild, TransportRate.rate/roundTripRate,
 * NileCruise.priceFrom, SimPackage.price). That base is treated as the
 * default / FOREIGN price. EGYPTIAN and GULF prices are stored as overrides in
 * the MarketPrice table; when no override exists we fall back to the base price
 * so existing data keeps working. All prices are USD — currency display
 * conversion happens on the frontend (see formatPrice + /api/fx/rates).
 */

export type MarketEntityType =
  | 'HOTEL'
  | 'ACTIVITY_ADULT'
  | 'ACTIVITY_CHILD'
  | 'TRANSPORT'
  | 'TRANSPORT_RT'
  | 'CRUISE'
  | 'SIM';

function isMarket(v: unknown): v is Market {
  return v === 'EGYPTIAN' || v === 'GULF' || v === 'FOREIGN';
}

/**
 * Resolve the market that prices should be shown in for this request.
 * - Company callers → their company's `market`.
 * - SUPERADMIN → optional `?market=` query (admin price preview), else null.
 * `null` / `FOREIGN` mean "use the base price column" (no override lookup).
 */
export async function resolveCallerMarket(req: Request): Promise<Market | null> {
  const caller = req.user;
  if (!caller) return null;
  if (caller.role === 'SUPERADMIN') {
    const q = String(req.query?.market ?? '').toUpperCase();
    return isMarket(q) ? q : null;
  }
  if (!caller.companyId) return null;
  const company = await prisma.company.findUnique({
    where: { id: caller.companyId },
    select: { market: true },
  });
  return company?.market ?? null;
}

/**
 * Batch-load per-market price overrides for a set of entity ids.
 * Returns an empty map for FOREIGN / null (base column is authoritative there).
 */
export async function resolveMarketPrices(
  entityType: MarketEntityType,
  ids: string[],
  market: Market | null,
): Promise<Map<string, Decimal>> {
  const out = new Map<string, Decimal>();
  if (!market || market === 'FOREIGN' || ids.length === 0) return out;
  const rows = await prisma.marketPrice.findMany({
    where: { entityType, market, entityId: { in: ids } },
    select: { entityId: true, priceUsd: true },
  });
  for (const r of rows) out.set(r.entityId, r.priceUsd);
  return out;
}

/**
 * Mutate a list of records in place, overriding `priceField` with the market
 * override when present. Used for list/detail read paths returning prices to
 * company users. No-op for FOREIGN / null.
 */
export async function applyMarketPrice<T extends Record<string, unknown>>(
  items: T[],
  opts: { entityType: MarketEntityType; market: Market | null; priceField: keyof T; idKey?: keyof T },
): Promise<T[]> {
  const { entityType, market, priceField } = opts;
  const idKey = opts.idKey ?? ('id' as keyof T);
  if (!market || market === 'FOREIGN' || items.length === 0) return items;
  const ids = items.map((i) => String(i[idKey]));
  const overrides = await resolveMarketPrices(entityType, ids, market);
  for (const it of items) {
    const ov = overrides.get(String(it[idKey]));
    if (ov != null && it[priceField] != null) (it as Record<string, unknown>)[priceField as string] = ov;
  }
  return items;
}

/** Single-entity market price with base fallback. */
export async function getMarketPrice(
  entityType: MarketEntityType,
  entityId: string,
  market: Market | null,
  baseUsd: Decimal,
): Promise<Decimal> {
  if (!market || market === 'FOREIGN') return baseUsd;
  const row = await prisma.marketPrice.findUnique({
    where: { entityType_entityId_market: { entityType, entityId, market } },
    select: { priceUsd: true },
  });
  return row?.priceUsd ?? baseUsd;
}

/**
 * Upsert (or clear when value is null/empty) a per-market price override.
 * Admin-only callers. FOREIGN overrides are ignored (edit the base column).
 */
export async function upsertMarketPrice(
  entityType: MarketEntityType,
  entityId: string,
  market: Market,
  priceUsd: number | string | null | undefined,
): Promise<void> {
  if (market === 'FOREIGN') return;
  const raw = priceUsd == null || priceUsd === '' ? null : Number(priceUsd);
  if (raw == null || !Number.isFinite(raw) || raw <= 0) {
    await prisma.marketPrice.deleteMany({ where: { entityType, entityId, market } });
    return;
  }
  await prisma.marketPrice.upsert({
    where: { entityType_entityId_market: { entityType, entityId, market } },
    update: { priceUsd: new Decimal(raw) },
    create: { entityType, entityId, market, priceUsd: new Decimal(raw) },
  });
}

/** Fetch all overrides for one entity, keyed by market — for admin edit forms. */
export async function getEntityMarketPrices(
  entityType: MarketEntityType,
  entityId: string,
): Promise<Record<string, number>> {
  const rows = await prisma.marketPrice.findMany({
    where: { entityType, entityId },
    select: { market: true, priceUsd: true },
  });
  const out: Record<string, number> = {};
  for (const r of rows) out[r.market] = Number(r.priceUsd);
  return out;
}
