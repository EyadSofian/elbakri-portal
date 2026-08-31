import { Decimal } from '@prisma/client/runtime/library';

/**
 * How an excursion is charged.
 *
 * PER_PERSON  — an adult price and a child price, each multiplied by heads.
 * SINGLE / DOUBLE / TRIPLE — a party rate: what it costs to send one, two or
 * three people out together (a private car, a quad bike, a safari jeep).
 *
 * The party rates used to be charged once no matter how many people were on the
 * booking, so a desert safari for six cost the same as a safari for two. A
 * party rate prices *one* party, so a booking is as many parties as it takes to
 * seat everybody — six people on a double rate is three doubles. That is the
 * whole of the fix, and it is why this lives in its own module: it is the one
 * piece of the flow worth testing on its own.
 */
export type PricingBasis = 'PER_PERSON' | 'SINGLE' | 'DOUBLE' | 'TRIPLE';
export type PartyBasis = Exclude<PricingBasis, 'PER_PERSON'>;

/** How many people one unit of each party rate covers. */
export const PARTY_SIZE: Record<PartyBasis, number> = { SINGLE: 1, DOUBLE: 2, TRIPLE: 3 };

export const PARTY_BASES: PartyBasis[] = ['SINGLE', 'DOUBLE', 'TRIPLE'];

export function isPartyBasis(value: string): value is PartyBasis {
  return (PARTY_BASES as string[]).includes(value);
}

/** Anything with a price is one basis the trip is sold on. Blank is not zero. */
export interface ActivityPriceSet {
  priceAdult?: Decimal | number | null;
  priceChild?: Decimal | number | null;
  priceSingle?: Decimal | number | null;
  priceDouble?: Decimal | number | null;
  priceTriple?: Decimal | number | null;
}

function has(value: Decimal | number | null | undefined): boolean {
  return value !== null && value !== undefined;
}

/**
 * Legacy Sheets rows used zero as the empty value for Single / Double / Triple.
 * Those zeroes are not free private tours: they mean the operator never enabled
 * that party size. Per-person adult/child zero remains valid (for example a
 * free child), but a party product must have a positive price to exist.
 */
function hasPartyPrice(value: Decimal | number | null | undefined): boolean {
  if (!has(value)) return false;
  const amount = value instanceof Decimal ? value : new Decimal(value as number);
  return amount.gt(0);
}

/**
 * The ways this particular trip is actually sold — nothing else may be offered.
 * An operator who priced a safari only as a private jeep for two never wants
 * "per person" on the form, and one who priced it per head never wants
 * "triple". Derived from which prices were filled in, so enabling a basis is
 * the same action as pricing it.
 */
export function availableBases(activity: ActivityPriceSet): PricingBasis[] {
  const bases: PricingBasis[] = [];
  if (has(activity.priceAdult)) bases.push('PER_PERSON');
  if (hasPartyPrice(activity.priceSingle)) bases.push('SINGLE');
  if (hasPartyPrice(activity.priceDouble)) bases.push('DOUBLE');
  if (hasPartyPrice(activity.priceTriple)) bases.push('TRIPLE');
  return bases;
}

/** The party price for one basis, or null when the trip is not sold that way. */
export function partyPriceFor(activity: ActivityPriceSet, basis: PartyBasis): Decimal | null {
  const raw = basis === 'SINGLE' ? activity.priceSingle
    : basis === 'DOUBLE' ? activity.priceDouble
      : activity.priceTriple;
  if (!hasPartyPrice(raw)) return null;
  return raw instanceof Decimal ? raw : new Decimal(raw as number);
}

/** Which rate prices a leftover group of this size. */
export function basisForSize(size: number): PartyBasis | null {
  if (size === 1) return 'SINGLE';
  if (size === 2) return 'DOUBLE';
  if (size === 3) return 'TRIPLE';
  return null;
}

/** One charged line: this many parties at this rate. */
export interface PartyLine {
  basis: PartyBasis;
  count: number;
  unitPrice: Decimal;
}

/**
 * How a party rate actually seats `pax` people.
 *
 * Fill as many full parties as the chosen rate holds, then charge whoever is
 * left over at the rate that matches how many they are — five people on a
 * double rate are two doubles and a single, not three doubles. That is how the
 * operator quotes it, and charging the odd person a full double would overbill
 * every group with an odd head count.
 *
 * The leftover is only priced that way if the operator actually sells it that
 * way. When the rate for the remainder is blank, the odd group falls back to a
 * whole party at the chosen rate — the trip is still sellable, and the operator
 * never ends up charging for something they never priced.
 *
 * Returns null when the chosen rate itself is not priced.
 */
export function partyComposition(
  pax: number,
  basis: PartyBasis,
  prices: ActivityPriceSet,
): PartyLine[] | null {
  const unitPrice = partyPriceFor(prices, basis);
  if (unitPrice === null) return null;

  const size = PARTY_SIZE[basis];
  const heads = Math.max(1, Math.floor(pax) || 1);
  const full = Math.floor(heads / size);
  const rest = heads % size;

  const lines: PartyLine[] = [];
  if (full > 0) lines.push({ basis, count: full, unitPrice });
  if (rest > 0) {
    const restBasis = basisForSize(rest);
    const restPrice = restBasis ? partyPriceFor(prices, restBasis) : null;
    lines.push(restBasis && restPrice !== null
      ? { basis: restBasis, count: 1, unitPrice: restPrice }
      // Not sold at the leftover size — the group still travels, in a party of
      // the size that IS priced.
      : { basis, count: 1, unitPrice });
  }
  return lines;
}

/** What the composed lines add up to. */
export function compositionTotal(lines: PartyLine[]): Decimal {
  return lines.reduce((sum, line) => sum.add(line.unitPrice.mul(line.count)), new Decimal(0));
}

/** How many parties are charged in total, across every line. */
export function compositionUnits(lines: PartyLine[]): number {
  return lines.reduce((sum, line) => sum + line.count, 0);
}

/** Per-head total. Children are only charged when there are any. */
export function perPersonTotal(
  adultPrice: Decimal,
  childPrice: Decimal,
  adultsCount: number,
  childrenCount: number,
): Decimal {
  const adults = Math.max(0, Math.floor(adultsCount) || 0);
  const children = Math.max(0, Math.floor(childrenCount) || 0);
  return adultPrice.mul(adults).add(childPrice.mul(children));
}

/** What an invoice or a price preview prints, in words a client reads. */
export interface PricingBreakdown {
  basis: PricingBasis;
  units: number; // parties charged in total (heads, on a per-person booking)
  unitPrice: Decimal | null; // the chosen party rate, null on a per-person booking
  /** The charged lines — e.g. two doubles and a single. Empty for per-person. */
  lines: PartyLine[];
  total: Decimal;
}

/**
 * The whole calculation in one call, so the controller, the invoice and the
 * tests all agree. Throws nothing: an unsellable combination comes back as
 * `null`, and the caller decides whether that is a 400 or a quote request.
 */
export function priceActivity(input: {
  activity: ActivityPriceSet;
  basis: PricingBasis;
  adultsCount: number;
  childrenCount: number;
  /** Resolved market prices — pass these when a per-head override applies. */
  adultPrice?: Decimal;
  childPrice?: Decimal;
}): PricingBreakdown | null {
  const { activity, basis, adultsCount, childrenCount } = input;
  if (basis === 'PER_PERSON') {
    const adults = Math.max(0, Math.floor(adultsCount) || 0);
    const children = Math.max(0, Math.floor(childrenCount) || 0);
    if (adults > 0 && !has(activity.priceAdult) && !input.adultPrice) return null;
    if (children > 0 && !has(activity.priceChild) && !input.childPrice) return null;
    const adultPrice = input.adultPrice
      ?? (has(activity.priceAdult) ? new Decimal(String(activity.priceAdult)) : new Decimal(0));
    const childPrice = input.childPrice
      ?? (has(activity.priceChild) ? new Decimal(String(activity.priceChild)) : new Decimal(0));
    return {
      basis,
      units: adults + children,
      unitPrice: null,
      lines: [],
      total: perPersonTotal(adultPrice, childPrice, adults, children),
    };
  }
  const unitPrice = partyPriceFor(activity, basis);
  if (unitPrice === null) return null;
  const pax = Math.max(1, (Math.max(0, adultsCount) || 0) + (Math.max(0, childrenCount) || 0));
  const lines = partyComposition(pax, basis, activity);
  if (lines === null) return null;
  return {
    basis,
    units: compositionUnits(lines),
    unitPrice,
    lines,
    total: compositionTotal(lines),
  };
}
