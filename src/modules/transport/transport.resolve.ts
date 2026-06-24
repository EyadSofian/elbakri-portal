import { Decimal } from '@prisma/client/runtime/library';
import { Market, TransportRate } from '@prisma/client';
import { prisma } from '../../config/db';

// ─────────────────────────────────────────────
// Typed transport route resolution + dual-currency (EGP/USD) sale pricing.
//
// A route leg is a typed endpoint: AIRPORT | HOTEL | DESTINATION, identified by
// a soft id (airportId / hotelId / destinationId) and/or a display name. The
// resolver matches a requested route to a configured rate in two passes:
//   1. EXACT     — rate.from == req.from AND rate.to == req.to
//   2. REVERSED  — rate.from == req.to  AND rate.to == req.from, when the rate
//                  is flagged isBidirectional (so "Airport → Cairo" also prices
//                  "Cairo → Airport").
// Sale price comes from the explicit dual-currency fields with NO FX:
//   EGYPTIAN market → EGP, every other market → USD. Missing → "price on request".
// ─────────────────────────────────────────────

export type EndpointRef = { type?: string | null; id?: string | null; name?: string | null };

export interface RouteQuery {
  rateId?: string | null;
  from: EndpointRef;
  to: EndpointRef;
  vehicleType?: string | null;
  pax: number;
  transportType?: string | null;
  destinationId?: string | null;
}

export interface RateMatch {
  rate: TransportRate;
  matchedDirection: 'EXACT' | 'REVERSED';
}

function norm(v: unknown): string {
  return String(v ?? '').trim().toLowerCase();
}

/** Does a configured rate endpoint satisfy the requested endpoint ref? */
function endpointMatches(
  rate: { type: string | null; id: string | null; name: string | null; legacy: string | null },
  ref: EndpointRef,
): boolean {
  const refId = ref.id ? String(ref.id) : '';
  const refName = norm(ref.name);
  // If both sides carry a type and they disagree, it's not a match.
  if (ref.type && rate.type && norm(ref.type) !== norm(rate.type)) return false;
  // Primary: id match (most precise).
  if (refId && rate.id) return rate.id === refId;
  // Fallback: name match against the typed name or the legacy free-text label.
  if (refName) return norm(rate.name) === refName || norm(rate.legacy) === refName;
  return false;
}

function fromEndpoint(r: TransportRate) {
  return { type: r.fromType, id: r.fromId, name: r.fromName, legacy: r.fromLocation };
}
function toEndpoint(r: TransportRate) {
  return { type: r.toType, id: r.toId, name: r.toName, legacy: r.toLocation };
}

function directionFor(rate: TransportRate, q: RouteQuery): 'EXACT' | 'REVERSED' | null {
  const exact = endpointMatches(fromEndpoint(rate), q.from) && endpointMatches(toEndpoint(rate), q.to);
  if (exact) return 'EXACT';
  if (rate.isBidirectional && endpointMatches(fromEndpoint(rate), q.to) && endpointMatches(toEndpoint(rate), q.from)) {
    return 'REVERSED';
  }
  return null;
}

/**
 * Resolve the priced rate for a requested route. rateId is authoritative when
 * supplied. Otherwise candidates are filtered by vehicle/capacity and matched
 * EXACT first, then REVERSED (bidirectional only). Cheapest match wins.
 */
export async function resolveTransportRate(q: RouteQuery): Promise<RateMatch | null> {
  if (q.rateId) {
    const rate = await prisma.transportRate.findFirst({ where: { id: q.rateId, isActive: true } });
    if (!rate) return null;
    const dir = directionFor(rate, q) ?? 'EXACT';
    return { rate, matchedDirection: dir };
  }

  const candidates = await prisma.transportRate.findMany({
    where: {
      isActive: true,
      ...(q.vehicleType ? { vehicleType: q.vehicleType as TransportRate['vehicleType'] } : {}),
      ...(q.transportType ? { type: q.transportType as TransportRate['type'] } : {}),
      ...(q.destinationId ? { destinationId: q.destinationId } : {}),
      minCapacity: { lte: q.pax },
      OR: [{ maxCapacity: null }, { maxCapacity: { gte: q.pax } }],
    },
    orderBy: { rate: 'asc' },
  });

  let exact: TransportRate | null = null;
  let reversed: TransportRate | null = null;
  for (const rate of candidates) {
    const dir = directionFor(rate, q);
    if (dir === 'EXACT' && !exact) exact = rate;
    else if (dir === 'REVERSED' && !reversed) reversed = rate;
  }
  if (exact) return { rate: exact, matchedDirection: 'EXACT' };
  if (reversed) return { rate: reversed, matchedDirection: 'REVERSED' };
  return null;
}

export interface TransportPrice {
  found: boolean;
  oneWay: Decimal | null;
  roundTrip: Decimal | null;
  roundTripIsEstimated: boolean;
  currency: string;
}

/** Display currency for a market — Egyptian sees EGP, everyone else USD. */
export function marketCurrency(market: Market | null): 'EGP' | 'USD' {
  return market === 'EGYPTIAN' ? 'EGP' : 'USD';
}

/** True when a rate opts into the new explicit dual-currency model. */
export function usesDualPricing(rate: TransportRate): boolean {
  return rate.priceEgp != null || rate.priceUsd != null || rate.roundTripPriceEgp != null || rate.roundTripPriceUsd != null;
}

/**
 * Pick the explicit sale price for a rate in the company's currency — NO FX.
 * Only used for rates on the dual-currency model; legacy rates keep their
 * existing MarketPrice/base resolution path. Missing price → found:false
 * ("price on request").
 */
export function pickDualPrice(rate: TransportRate, market: Market | null): TransportPrice {
  const cur = marketCurrency(market);
  const oneWay = cur === 'EGP' ? rate.priceEgp : rate.priceUsd;
  const rtExplicit = cur === 'EGP' ? rate.roundTripPriceEgp : rate.roundTripPriceUsd;
  if (oneWay == null) {
    return { found: false, oneWay: null, roundTrip: rtExplicit ?? null, roundTripIsEstimated: false, currency: cur };
  }
  return {
    found: true,
    oneWay,
    roundTrip: rtExplicit ?? oneWay.mul(2),
    roundTripIsEstimated: rtExplicit == null,
    currency: cur,
  };
}
