import { Decimal } from '@prisma/client/runtime/library';
import { Market } from '@prisma/client';

/**
 * Pricing a Nile cruise the way a hotel is priced.
 *
 * A boat used to carry one number, `priceFrom`, which said nothing about which
 * cabin, which market, or which part of the season — so every real quote was
 * worked out by hand and typed in. A cruise now carries rate rows: one cabin
 * category, one market, one validity period, priced by how many people share
 * the cabin. That is exactly the shape of `HotelRate`, deliberately: an
 * operator who has priced a hotel already knows how to price a boat, and the
 * rules below are the same rules, kept here as pure functions so they can be
 * tested without a database.
 *
 * Prices are explicit per currency and are NEVER FX-converted.
 */

export type Occupancy = 'SINGLE' | 'DOUBLE' | 'TRIPLE';

export const OCCUPANCIES: Occupancy[] = ['SINGLE', 'DOUBLE', 'TRIPLE'];

/** How many guests one cabin holds at each occupancy. */
export const OCCUPANCY_SIZE: Record<Occupancy, number> = { SINGLE: 1, DOUBLE: 2, TRIPLE: 3 };

export function isOccupancy(value: unknown): value is Occupancy {
  return (OCCUPANCIES as string[]).includes(String(value ?? '').toUpperCase());
}

export interface CruiseRateRow {
  id: string;
  cabinName: string;
  market: Market | null;
  currency: string;
  singlePrice: Decimal | null;
  doublePrice: Decimal | null;
  triplePrice: Decimal | null;
  validFrom: Date | null;
  validTo: Date | null;
  isActive?: boolean;
}

/**
 * INTERNATIONAL and FOREIGN are the same audience under two names — rows were
 * written under both before the markets list settled, and a guest priced under
 * one must not lose the row written under the other.
 */
function marketEquivalent(a: Market, b: Market): boolean {
  if (a === b) return true;
  const foreign = new Set<Market>(['FOREIGN', 'INTERNATIONAL']);
  return foreign.has(a) && foreign.has(b);
}

/**
 * Does this row price this sailing, for this market?
 *
 * A row with no market prices everyone. A row WITH a market only prices that
 * market — including the case where the caller has no market at all, which is
 * why an anonymous request cannot quietly inherit the Gulf price.
 */
export function rateApplies(row: CruiseRateRow, market: Market | null, date: Date): boolean {
  if (row.isActive === false) return false;
  if (row.validFrom && row.validFrom > date) return false;
  if (row.validTo && row.validTo < date) return false;
  if (row.market != null && market == null) return false;
  if (row.market != null && market != null && !marketEquivalent(row.market, market)) return false;
  return true;
}

/** The rows a given market may be quoted from, for a sailing on `date`. */
export function applicableRates(rows: CruiseRateRow[], market: Market | null, date: Date): CruiseRateRow[] {
  return rows.filter((row) => rateApplies(row, market, date));
}

/** The price of one cabin at one occupancy — null when it is not sold that way. */
export function cabinPrice(row: CruiseRateRow, occupancy: Occupancy): Decimal | null {
  if (occupancy === 'SINGLE') return row.singlePrice ?? null;
  if (occupancy === 'DOUBLE') return row.doublePrice ?? null;
  return row.triplePrice ?? null;
}

/** Which occupancies this cabin is actually sold at. Blank is not zero. */
export function availableOccupancies(row: CruiseRateRow): Occupancy[] {
  return OCCUPANCIES.filter((o) => cabinPrice(row, o) != null);
}

/**
 * How many cabins it takes to sleep `pax` guests at this occupancy. Five guests
 * in doubles need three cabins, not two and a half — a half-empty cabin is
 * still a whole cabin on the bill.
 */
export function cabinsNeeded(pax: number, occupancy: Occupancy): number {
  const heads = Math.max(1, Math.floor(pax) || 1);
  return Math.max(1, Math.ceil(heads / OCCUPANCY_SIZE[occupancy]));
}

/**
 * The total for a booking: the cabin price once per cabin taken.
 *
 * `cabins` is what the operator actually booked when they know it; otherwise
 * the head count decides. Returns null when this cabin is not sold at this
 * occupancy, which the caller turns into a quote request rather than a zero.
 */
export function priceCruiseBooking(input: {
  row: CruiseRateRow;
  occupancy: Occupancy;
  pax: number;
  cabins?: number | null;
}): { total: Decimal; cabins: number; unitPrice: Decimal; currency: string } | null {
  const unitPrice = cabinPrice(input.row, input.occupancy);
  if (unitPrice == null) return null;
  const cabins = input.cabins && input.cabins > 0
    ? Math.floor(input.cabins)
    : cabinsNeeded(input.pax, input.occupancy);
  return { total: unitPrice.mul(cabins), cabins, unitPrice, currency: input.row.currency };
}

/**
 * The headline "from" price: the cheapest occupancy price across every row that
 * applies, with the currency of the row it came from — never a mix.
 */
export function fromPrice(
  rows: CruiseRateRow[],
  market: Market | null,
  date: Date,
): { amount: Decimal; currency: string } | null {
  let best: { amount: Decimal; currency: string } | null = null;
  for (const row of applicableRates(rows, market, date)) {
    for (const occupancy of OCCUPANCIES) {
      const price = cabinPrice(row, occupancy);
      if (price == null) continue;
      if (!best || price.lt(best.amount)) best = { amount: price, currency: row.currency };
    }
  }
  return best;
}

/** Days a schedule may name, in the order a week runs. */
export const WEEKDAYS = [
  'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY',
] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export function normalizeWeekday(value: unknown): Weekday | null {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!raw) return null;
  const direct = WEEKDAYS.find((d) => d === raw);
  if (direct) return direct;
  // "Mon", "MON", "Monday " — an operator types the short form as often as not.
  const short = WEEKDAYS.find((d) => d.startsWith(raw.slice(0, 3)) && raw.length >= 3);
  return short ?? null;
}

/**
 * How many nights a leg runs from its departure day to its return day.
 *
 * A sailing that leaves Monday and is back Thursday is three nights; one that
 * leaves Friday and is back Monday wraps the weekend and is also three. Taking
 * the difference modulo seven is what makes the wrapping case come out right
 * instead of negative.
 */
export function nightsBetween(departureDay: Weekday, returnDay: Weekday): number {
  const from = WEEKDAYS.indexOf(departureDay);
  const to = WEEKDAYS.indexOf(returnDay);
  const diff = (to - from + 7) % 7;
  // Leaving and returning on the same weekday is a full week aboard, not a
  // day trip — a same-day cruise is not a thing these boats sell.
  return diff === 0 ? 7 : diff;
}
