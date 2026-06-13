import { Request } from 'express';
import { Decimal } from '@prisma/client/runtime/library';
import { Market } from '@prisma/client';
import { prisma } from '../config/db';

/**
 * Explicit, admin-defined price matrix.
 *
 * Every sellable service has a base price column (Hotel.pricePerNight,
 * Activity.priceAdult/priceChild, TransportRate.rate/roundTripRate,
 * NileCruise.priceFrom, SimPackage.price). Admins can layer explicit price
 * rows on top via `MarketPrice` — each row carries its OWN `amount` + `currency`
 * (e.g. 1500 EGP) and is returned verbatim, with NO automatic FX conversion of
 * the sale price.
 *
 * Resolution priority for a given (entityType, entityId):
 *   1. company-specific row  (companyId matches)            — highest
 *   2. market-specific row   (market matches, companyId null)
 *   3. "applies to all" row  (market null, companyId null)
 *   4. the service's base column                            — lowest fallback
 * `priceUsd` is the legacy column (treated as USD) used when `amount` is null.
 */

export type MarketEntityType =
  | 'HOTEL'
  | 'ACTIVITY_ADULT'
  | 'ACTIVITY_CHILD'
  | 'TRANSPORT'
  | 'TRANSPORT_RT'
  | 'CRUISE'
  | 'SIM'
  | 'SECURITY'
  | 'AIRPORT';

export interface PriceContext {
  market: Market | null;
  companyId?: string | null;
  pax?: number;
  date?: Date;
}

export interface ResolvedPrice {
  amount: Decimal;
  currency: string;
  overridden: boolean;
}

function isMarket(v: unknown): v is Market {
  return v === 'EGYPTIAN' || v === 'INTERNATIONAL' || v === 'GULF' || v === 'FOREIGN';
}

/**
 * Resolve the market + company context for this request.
 * - Company callers → their own company.
 * - SUPERADMIN → optional `?market=` / `?companyId=` (admin price preview).
 */
export async function resolveCallerMarket(req: Request): Promise<Market | null> {
  const ctx = await resolvePriceContext(req);
  return ctx.market;
}

export async function resolvePriceContext(req: Request): Promise<PriceContext> {
  const caller = req.user;
  if (!caller) return { market: null, companyId: null };
  if (caller.role === 'SUPERADMIN') {
    const q = String(req.query?.market ?? '').toUpperCase();
    const companyId = req.query?.companyId ? String(req.query.companyId) : null;
    if (companyId) {
      const company = await prisma.company.findUnique({ where: { id: companyId }, select: { market: true } });
      return { market: company?.market ?? (isMarket(q) ? q : null), companyId };
    }
    return { market: isMarket(q) ? q : null, companyId: null };
  }
  if (!caller.companyId) return { market: null, companyId: null };
  const company = await prisma.company.findUnique({
    where: { id: caller.companyId },
    select: { market: true },
  });
  return { market: company?.market ?? null, companyId: caller.companyId };
}

interface PriceRow {
  market: Market | null;
  companyId: string | null;
  currency: string;
  amount: Decimal | null;
  priceUsd: Decimal | null;
  minPax: number | null;
  maxPax: number | null;
  validFrom: Date | null;
  validTo: Date | null;
}

/** Score a candidate row against the context; -1 means "not applicable". */
function scoreRow(r: PriceRow, ctx: PriceContext): number {
  const now = ctx.date ?? new Date();
  if (r.validFrom && r.validFrom > now) return -1;
  if (r.validTo && r.validTo < now) return -1;
  if (ctx.pax != null) {
    if (r.minPax != null && ctx.pax < r.minPax) return -1;
    if (r.maxPax != null && ctx.pax > r.maxPax) return -1;
  }
  if (r.companyId) return ctx.companyId && r.companyId === ctx.companyId ? 3 : -1;
  if (r.market) return ctx.market && r.market === ctx.market ? 2 : -1;
  return 1; // applies to all markets / all companies
}

function rowValue(r: PriceRow, base: Decimal, baseCurrency: string): { amount: Decimal; currency: string } {
  if (r.amount != null) return { amount: r.amount, currency: r.currency || 'USD' };
  if (r.priceUsd != null) return { amount: r.priceUsd, currency: 'USD' };
  return { amount: base, currency: baseCurrency };
}

/** Pick the best matching price row for one entity (or null if none applies). */
async function bestRow(entityType: MarketEntityType, entityId: string, ctx: PriceContext): Promise<PriceRow | null> {
  const rows = (await prisma.marketPrice.findMany({
    where: { entityType, entityId, isActive: true },
    select: { market: true, companyId: true, currency: true, amount: true, priceUsd: true,
      minPax: true, maxPax: true, validFrom: true, validTo: true },
  })) as PriceRow[];
  let best: PriceRow | null = null;
  let bestScore = 0;
  for (const r of rows) {
    const s = scoreRow(r, ctx);
    if (s > bestScore) { best = r; bestScore = s; }
  }
  return best;
}

/** Single-entity resolved money — explicit admin price or base fallback. */
export async function resolveMarketMoney(
  entityType: MarketEntityType,
  entityId: string,
  marketOrCtx: Market | null | PriceContext,
  baseAmount: Decimal,
  baseCurrency: string,
  companyId?: string | null,
): Promise<ResolvedPrice> {
  const ctx: PriceContext = isCtx(marketOrCtx)
    ? marketOrCtx
    : { market: marketOrCtx, companyId: companyId ?? null };
  const row = await bestRow(entityType, entityId, ctx);
  if (!row) return { amount: baseAmount, currency: baseCurrency, overridden: false };
  const v = rowValue(row, baseAmount, baseCurrency);
  return { amount: v.amount, currency: v.currency, overridden: row.amount != null || row.priceUsd != null };
}

function isCtx(v: Market | null | PriceContext): v is PriceContext {
  return v !== null && typeof v === 'object' && 'market' in v;
}

/** Single-entity resolved Decimal (USD-style) — back-compat helper. */
export async function getMarketPrice(
  entityType: MarketEntityType,
  entityId: string,
  market: Market | null,
  baseUsd: Decimal,
  companyId?: string | null,
): Promise<Decimal> {
  const r = await resolveMarketMoney(entityType, entityId, market, baseUsd, 'USD', companyId);
  return r.amount;
}

/**
 * Batch-resolve overrides for a set of ids. Returns a map of
 * id → { amount, currency } only for entities that have an applicable row.
 */
export async function resolveMarketPriceMap(
  entityType: MarketEntityType,
  ids: string[],
  ctx: PriceContext,
): Promise<Map<string, { amount: Decimal; currency: string }>> {
  const out = new Map<string, { amount: Decimal; currency: string }>();
  if (ids.length === 0) return out;
  const rows = (await prisma.marketPrice.findMany({
    where: { entityType, entityId: { in: ids }, isActive: true },
    select: { entityId: true, market: true, companyId: true, currency: true, amount: true, priceUsd: true,
      minPax: true, maxPax: true, validFrom: true, validTo: true },
  })) as (PriceRow & { entityId: string })[];
  const byId = new Map<string, (PriceRow & { entityId: string })[]>();
  for (const r of rows) {
    const arr = byId.get(r.entityId) ?? [];
    arr.push(r); byId.set(r.entityId, arr);
  }
  for (const [id, list] of byId) {
    let best: PriceRow | null = null; let bestScore = 0;
    for (const r of list) { const s = scoreRow(r, ctx); if (s > bestScore) { best = r; bestScore = s; } }
    if (best) {
      const v = rowValue(best, new Decimal(0), 'USD');
      if (best.amount != null || best.priceUsd != null) out.set(id, v);
    }
  }
  return out;
}

/** Back-compat: USD-only override map (legacy callers). */
export async function resolveMarketPrices(
  entityType: MarketEntityType,
  ids: string[],
  market: Market | null,
  companyId?: string | null,
): Promise<Map<string, Decimal>> {
  const map = await resolveMarketPriceMap(entityType, ids, { market, companyId: companyId ?? null });
  const out = new Map<string, Decimal>();
  for (const [id, v] of map) out.set(id, v.amount);
  return out;
}

/**
 * Mutate a list in place, overriding `priceField` (and optional `currencyField`)
 * with the explicit admin price when one applies. The resolved currency is
 * surfaced verbatim — callers/clients must NOT FX-convert it.
 */
export async function applyMarketPrice<T extends Record<string, unknown>>(
  items: T[],
  opts: {
    entityType: MarketEntityType;
    market: Market | null;
    companyId?: string | null;
    priceField: keyof T;
    idKey?: keyof T;
    currencyField?: keyof T;
  },
): Promise<T[]> {
  const { entityType, market, priceField } = opts;
  const idKey = opts.idKey ?? ('id' as keyof T);
  if (items.length === 0) return items;
  const ids = items.map((i) => String(i[idKey]));
  const overrides = await resolveMarketPriceMap(entityType, ids, { market, companyId: opts.companyId ?? null });
  for (const it of items) {
    const ov = overrides.get(String(it[idKey]));
    if (ov != null && it[priceField] != null) {
      (it as Record<string, unknown>)[priceField as string] = ov.amount;
      if (opts.currencyField) {
        (it as Record<string, unknown>)[opts.currencyField as string] = ov.currency;
      }
    }
  }
  return items;
}

// ─── Admin price-matrix management ─────────────────────────────────────────────

export interface MarketPriceRowInput {
  id?: string;
  market?: Market | null;
  companyId?: string | null;
  label?: string | null;
  currency: string;
  amount: number | string;
  nationalityGroup?: string | null;
  minPax?: number | null;
  maxPax?: number | null;
  validFrom?: string | null;
  validTo?: string | null;
  isActive?: boolean;
}

/** Fetch all price rows for one entity (admin edit table). */
export async function getEntityPriceRows(entityType: MarketEntityType, entityId: string) {
  return prisma.marketPrice.findMany({
    where: { entityType, entityId },
    orderBy: [{ companyId: 'asc' }, { market: 'asc' }, { createdAt: 'asc' }],
  });
}

/**
 * Replace the full set of price rows for one entity with `rows`. Rows with a
 * positive amount are upserted; everything else for the entity is removed.
 */
export async function saveEntityPriceRows(
  entityType: MarketEntityType,
  entityId: string,
  rows: MarketPriceRowInput[],
): Promise<void> {
  const clean = (rows ?? []).filter((r) => {
    const amt = Number(r.amount);
    return Number.isFinite(amt) && amt > 0 && r.currency;
  });
  await prisma.$transaction(async (tx) => {
    await tx.marketPrice.deleteMany({ where: { entityType, entityId } });
    if (clean.length === 0) return;
    await tx.marketPrice.createMany({
      data: clean.map((r) => ({
        entityType,
        entityId,
        market: r.market ?? null,
        companyId: r.companyId ?? null,
        label: r.label ?? null,
        currency: r.currency,
        amount: new Decimal(Number(r.amount)),
        nationalityGroup: r.nationalityGroup ?? null,
        minPax: r.minPax ?? null,
        maxPax: r.maxPax ?? null,
        validFrom: r.validFrom ? new Date(r.validFrom) : null,
        validTo: r.validTo ? new Date(r.validTo) : null,
        isActive: r.isActive !== false,
      })),
    });
  });
}

/**
 * Single per-market upsert (non-destructive — only touches the one
 * market-level row, companyId = null). Writes an explicit amount + currency.
 */
export async function upsertMarketPrice(
  entityType: MarketEntityType,
  entityId: string,
  market: Market,
  amount: number | string | null | undefined,
  currency = 'USD',
): Promise<void> {
  const raw = amount == null || amount === '' ? null : Number(amount);
  const existing = await prisma.marketPrice.findFirst({ where: { entityType, entityId, market, companyId: null } });
  if (raw == null || !Number.isFinite(raw) || raw <= 0) {
    if (existing) await prisma.marketPrice.delete({ where: { id: existing.id } });
    return;
  }
  if (existing) {
    await prisma.marketPrice.update({ where: { id: existing.id }, data: { amount: new Decimal(raw), currency: currency || 'USD', isActive: true } });
  } else {
    await prisma.marketPrice.create({ data: { entityType, entityId, market, companyId: null, amount: new Decimal(raw), currency: currency || 'USD' } });
  }
}

/** Back-compat: market → numeric amount map for one entity (admin edit forms). */
export async function getEntityMarketPrices(
  entityType: MarketEntityType,
  entityId: string,
): Promise<Record<string, number>> {
  const rows = await prisma.marketPrice.findMany({
    where: { entityType, entityId, companyId: null },
    select: { market: true, amount: true, priceUsd: true },
  });
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (!r.market) continue;
    const v = r.amount ?? r.priceUsd;
    if (v != null) out[r.market] = Number(v);
  }
  return out;
}
