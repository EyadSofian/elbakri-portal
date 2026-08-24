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
 * The ways this particular trip is actually sold — nothing else may be offered.
 * An operator who priced a safari only as a private jeep for two never wants
 * "per person" on the form, and one who priced it per head never wants
 * "triple". Derived from which prices were filled in, so enabling a basis is
 * the same action as pricing it.
 */
export function availableBases(activity: ActivityPriceSet): PricingBasis[] {
  const bases: PricingBasis[] = [];
  if (has(activity.priceAdult)) bases.push('PER_PERSON');
  if (has(activity.priceSingle)) bases.push('SINGLE');
  if (has(activity.priceDouble)) bases.push('DOUBLE');
  if (has(activity.priceTriple)) bases.push('TRIPLE');
  return bases;
}

/** The party price for one basis, or null when the trip is not sold that way. */
export function partyPriceFor(activity: ActivityPriceSet, basis: PartyBasis): Decimal | null {
  const raw = basis === 'SINGLE' ? activity.priceSingle
    : basis === 'DOUBLE' ? activity.priceDouble
      : activity.priceTriple;
  if (!has(raw)) return null;
  return raw instanceof Decimal ? raw : new Decimal(raw as number);
}

/**
 * How many parties it takes to seat `pax` people.
 *
 * Five people on a double rate need three cars, not two and a half — a party
 * that is not full still costs a whole party, which is how every operator
 * quotes it. Always at least one, so a booking is never charged nothing.
 */
export function partyUnits(pax: number, basis: PartyBasis): number {
  const size = PARTY_SIZE[basis];
  const heads = Math.max(1, Math.floor(pax) || 1);
  return Math.max(1, Math.ceil(heads / size));
}

/** What `pax` people cost at a party rate: the rate once per party needed. */
export function partyTotal(unitPrice: Decimal, pax: number, basis: PartyBasis): Decimal {
  return unitPrice.mul(partyUnits(pax, basis));
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

/** One line an invoice or a price preview can print, in words a client reads. */
export interface PricingBreakdown {
  basis: PricingBasis;
  units: number; // parties charged (1 for per-person, where heads are the count)
  unitPrice: Decimal | null; // the party rate, null on a per-person booking
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
      total: perPersonTotal(adultPrice, childPrice, adults, children),
    };
  }
  const unitPrice = partyPriceFor(activity, basis);
  if (unitPrice === null) return null;
  const pax = Math.max(1, (Math.max(0, adultsCount) || 0) + (Math.max(0, childrenCount) || 0));
  const units = partyUnits(pax, basis);
  return { basis, units, unitPrice, total: unitPrice.mul(units) };
}
