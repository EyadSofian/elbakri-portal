import { Decimal } from '@prisma/client/runtime/library';
import { Market, TransportRate } from '@prisma/client';
import { prisma } from '../../config/db';

// ─────────────────────────────────────────────
// Typed transport route resolution + dual-currency (EGP/USD) sale pricing.
//
// A transport product comes in one of two SHAPES:
//
//  A) A ROUTE (POINT_TO_POINT / AIRPORT_TRANSFER) — the client goes from one
//     endpoint to another. A route leg is a typed endpoint:
//     AIRPORT | HOTEL | DESTINATION, identified by a soft id (airportId /
//     hotelId / destinationId) and/or a display name. Matched in two passes:
//       1. EXACT     — rate.from == req.from AND rate.to == req.to
//       2. REVERSED  — rate.from == req.to  AND rate.to == req.from, when the
//                      rate is flagged isBidirectional (so "Airport → Cairo"
//                      also prices "Cairo → Airport").
//
//  B) AT DISPOSAL (HOURLY_CHARTER / DAY_USE) — the car is booked for a block of
//     time inside an area, not for a route. The client says "a car with me in
//     Cairo for 8 hours" and drives wherever they like. These rates carry NO
//     endpoints at all — they are identified by (serviceArea, durationHours),
//     so the endpoint passes above can never match one. They get their own
//     DISPOSAL pass, keyed on area + duration.
//
// Sale price comes from the explicit dual-currency fields with NO FX:
//   EGYPTIAN market → EGP, every other market → USD. Missing → "price on request".
// A disposal package is sold as ONE block of time, so it has no round-trip
// price — see pickDualPrice.
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
  // At-disposal selectors — an alternative to from/to, never combined with them.
  serviceMode?: string | null;
  serviceArea?: string | null;
  durationHours?: number | null;
}

export interface RateMatch {
  rate: TransportRate;
  matchedDirection: 'EXACT' | 'REVERSED' | 'DISPOSAL';
}

function norm(v: unknown): string {
  return String(v ?? '').trim().toLowerCase();
}

/** The service modes where the car is at the client's disposal for a period. */
export const DISPOSAL_SERVICE_MODES = ['HOURLY_CHARTER', 'DAY_USE'] as const;

/** True for a service mode that is sold as a block of time, not as a route. */
export function isDisposalMode(mode: unknown): boolean {
  return (DISPOSAL_SERVICE_MODES as readonly string[]).includes(String(mode ?? '').toUpperCase());
}

/** True when the caller is asking for an at-disposal product rather than a route. */
export function isDisposalQuery(q: Pick<RouteQuery, 'serviceMode' | 'serviceArea'>): boolean {
  return isDisposalMode(q.serviceMode) || !!norm(q.serviceArea);
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

/**
 * Does an at-disposal rate satisfy the request? Keyed on the area the car stays
 * within, plus the size of the time block when the caller pinned one. The
 * area falls back to the legacy free-text city/from label so rates imported
 * before serviceArea existed still resolve.
 */
function disposalMatches(rate: TransportRate, q: RouteQuery): boolean {
  if (!isDisposalMode(rate.serviceMode)) return false;
  // An explicit mode (hourly vs full day) narrows the match when given.
  if (q.serviceMode && norm(q.serviceMode) !== norm(rate.serviceMode)) return false;
  const wantArea = norm(q.serviceArea);
  if (wantArea) {
    const areas = [rate.serviceArea, rate.city, rate.fromLocation, rate.fromName].map(norm).filter(Boolean);
    if (!areas.includes(wantArea)) return false;
  }
  if (q.durationHours != null && rate.durationHours != null && rate.durationHours !== q.durationHours) {
    return false;
  }
  return true;
}

function directionFor(rate: TransportRate, q: RouteQuery): RateMatch['matchedDirection'] | null {
  // An at-disposal rate has no endpoints — it can only ever match on area.
  if (isDisposalMode(rate.serviceMode)) return disposalMatches(rate, q) ? 'DISPOSAL' : null;
  const exact = endpointMatches(fromEndpoint(rate), q.from) && endpointMatches(toEndpoint(rate), q.to);
  if (exact) return 'EXACT';
  if (rate.isBidirectional && endpointMatches(fromEndpoint(rate), q.to) && endpointMatches(toEndpoint(rate), q.from)) {
    return 'REVERSED';
  }
  return null;
}

/**
 * Resolve the priced rate for a requested product. rateId is authoritative when
 * supplied. Otherwise candidates are filtered by vehicle/capacity and matched:
 * an at-disposal request matches on area + duration, a route request matches
 * EXACT first, then REVERSED (bidirectional only). Cheapest match wins.
 */
export async function resolveTransportRate(q: RouteQuery): Promise<RateMatch | null> {
  if (q.rateId) {
    const rate = await prisma.transportRate.findFirst({ where: { id: q.rateId, isActive: true } });
    if (!rate) return null;
    const fallback: RateMatch['matchedDirection'] = isDisposalMode(rate.serviceMode) ? 'DISPOSAL' : 'EXACT';
    const dir = directionFor(rate, q) ?? fallback;
    return { rate, matchedDirection: dir };
  }

  const wantsDisposal = isDisposalQuery(q);
  const candidates = await prisma.transportRate.findMany({
    where: {
      isActive: true,
      ...(q.vehicleType ? { vehicleType: q.vehicleType as TransportRate['vehicleType'] } : {}),
      ...(q.transportType ? { type: q.transportType as TransportRate['type'] } : {}),
      ...(q.destinationId ? { destinationId: q.destinationId } : {}),
      // Keep the two shapes apart: an at-disposal request must never fall back
      // onto a point-to-point rate, and vice versa.
      ...(wantsDisposal
        ? { serviceMode: { in: DISPOSAL_SERVICE_MODES as unknown as TransportRate['serviceMode'][] } }
        : { NOT: { serviceMode: { in: DISPOSAL_SERVICE_MODES as unknown as TransportRate['serviceMode'][] } } }),
      minCapacity: { lte: q.pax },
      OR: [{ maxCapacity: null }, { maxCapacity: { gte: q.pax } }],
    },
    orderBy: { rate: 'asc' },
  });

  let exact: TransportRate | null = null;
  let reversed: TransportRate | null = null;
  let disposal: TransportRate | null = null;
  for (const rate of candidates) {
    const dir = directionFor(rate, q);
    if (dir === 'DISPOSAL' && !disposal) disposal = rate;
    else if (dir === 'EXACT' && !exact) exact = rate;
    else if (dir === 'REVERSED' && !reversed) reversed = rate;
  }
  if (disposal) return { rate: disposal, matchedDirection: 'DISPOSAL' };
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
  /** True when the product is a time block, so "round trip" does not apply. */
  isDisposal: boolean;
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
 *
 * An at-disposal package is one block of time at one price: the client already
 * gets to come back to where they started inside those hours, so there is no
 * second leg to charge. Its "round trip" price is therefore the same single
 * price, never a doubling.
 */
export function pickDualPrice(rate: TransportRate, market: Market | null): TransportPrice {
  const cur = marketCurrency(market);
  const disposal = isDisposalMode(rate.serviceMode);
  const oneWay = cur === 'EGP' ? rate.priceEgp : rate.priceUsd;
  const rtExplicit = cur === 'EGP' ? rate.roundTripPriceEgp : rate.roundTripPriceUsd;
  if (oneWay == null) {
    return {
      found: false,
      oneWay: null,
      roundTrip: disposal ? null : rtExplicit ?? null,
      roundTripIsEstimated: false,
      currency: cur,
      isDisposal: disposal,
    };
  }
  if (disposal) {
    return { found: true, oneWay, roundTrip: oneWay, roundTripIsEstimated: false, currency: cur, isDisposal: true };
  }
  return {
    found: true,
    oneWay,
    roundTrip: rtExplicit ?? oneWay.mul(2),
    roundTripIsEstimated: rtExplicit == null,
    currency: cur,
    isDisposal: false,
  };
}
