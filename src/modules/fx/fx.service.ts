import { prisma } from '../../config/db';

/**
 * Live FX rates (base USD), keyless provider, cached for the day.
 *
 * Source: https://open.er-api.com/v6/latest/USD (free, no API key).
 * Caching: in-memory for the process + a single `FxRateCache` row in the DB so
 * the last good rates survive restarts and act as a fallback when the provider
 * is unreachable. Never hardcodes static rates.
 */

const FX_URL = process.env.FX_API_URL ?? 'https://open.er-api.com/v6/latest/USD';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
// Currencies we surface in the UI (others still pass through if present).
const CORE_CURRENCIES = ['USD', 'EUR', 'EGP', 'SAR', 'AED', 'GBP'];

export interface FxRates {
  base: string;
  rates: Record<string, number>;
  lastUpdated: string; // ISO timestamp
}

let memoryCache: { data: FxRates; fetchedAt: number } | null = null;

async function fetchFromProvider(): Promise<FxRates | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(FX_URL, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      result?: string;
      base_code?: string;
      rates?: Record<string, number>;
      time_last_update_utc?: string;
    };
    if (json.result !== 'success' || !json.rates || typeof json.rates.USD !== 'number') return null;
    return {
      base: json.base_code ?? 'USD',
      rates: json.rates,
      lastUpdated: json.time_last_update_utc
        ? new Date(json.time_last_update_utc).toISOString()
        : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

async function readDbCache(): Promise<{ data: FxRates; fetchedAt: number } | null> {
  const row = await prisma.fxRateCache.findUnique({ where: { id: 'latest' } });
  if (!row) return null;
  const rates = row.rates as Record<string, number>;
  if (!rates || typeof rates.USD !== 'number') return null;
  return {
    data: { base: row.base, rates, lastUpdated: row.fetchedAt.toISOString() },
    fetchedAt: row.fetchedAt.getTime(),
  };
}

async function writeDbCache(data: FxRates): Promise<void> {
  await prisma.fxRateCache.upsert({
    where: { id: 'latest' },
    update: { base: data.base, rates: data.rates, fetchedAt: new Date(data.lastUpdated) },
    create: { id: 'latest', base: data.base, rates: data.rates, fetchedAt: new Date(data.lastUpdated) },
  });
}

/**
 * Returns the latest rates, refreshing at most once/day. Falls back to the DB
 * cache (then to a last-resort minimal map) when the provider is unreachable.
 */
export async function getRates(): Promise<FxRates> {
  const now = Date.now();

  if (memoryCache && now - memoryCache.fetchedAt < ONE_DAY_MS) return memoryCache.data;

  // Hydrate from DB; if fresh enough, use it without hitting the network.
  const db = await readDbCache();
  if (db && now - db.fetchedAt < ONE_DAY_MS) {
    memoryCache = db;
    return db.data;
  }

  const fresh = await fetchFromProvider();
  if (fresh) {
    memoryCache = { data: fresh, fetchedAt: now };
    await writeDbCache(fresh).catch(() => undefined);
    return fresh;
  }

  // Provider down — use whatever we last stored.
  if (db) {
    memoryCache = db;
    return db.data;
  }

  // Absolute last resort: identity for USD only (never a wrong conversion).
  return { base: 'USD', rates: { USD: 1 }, lastUpdated: new Date(0).toISOString() };
}

/** Compact payload for clients: core currencies plus whatever else is present. */
export function pickCurrencies(data: FxRates): FxRates {
  const rates: Record<string, number> = {};
  for (const code of CORE_CURRENCIES) {
    if (typeof data.rates[code] === 'number') rates[code] = data.rates[code];
  }
  return { base: data.base, rates, lastUpdated: data.lastUpdated };
}
