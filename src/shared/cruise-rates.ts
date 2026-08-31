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
  childPrice?: Decimal | null;
  validFrom: Date | null;
  validTo: Date | null;
  isActive?: boolean;
}

export type CruiseRateInputError =
  | 'INVALID_PERIOD_DATE'
  | 'INVALID_PERIOD_RANGE'
  | 'INVALID_OCCUPANCY_PRICE'
  | 'OCCUPANCY_PRICE_REQUIRED';

/**
 * Validate one admin rate row before a replace-all save can delete the old
 * table. The browser performs the same checks for a useful message, but the API
 * remains the source of truth for imports and direct requests.
 */
export function validateCruiseRateInput(row: {
  validFrom?: unknown;
  validTo?: unknown;
  singlePrice?: unknown;
  doublePrice?: unknown;
  triplePrice?: unknown;
  childPrice?: unknown;
}): CruiseRateInputError | null {
  const present = (value: unknown) => value !== null && value !== undefined && String(value).trim() !== '';
  const hasFrom = present(row.validFrom);
  const hasTo = present(row.validTo);
  const from = hasFrom ? new Date(String(row.validFrom)) : null;
  const to = hasTo ? new Date(String(row.validTo)) : null;
  if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) return 'INVALID_PERIOD_DATE';
  // One-sided and all-year rows are deliberately supported, just like hotel
  // rates. From / To are both visible; blank means that side is open.
  if (from && to && to < from) return 'INVALID_PERIOD_RANGE';

  const prices = [row.singlePrice, row.doublePrice, row.triplePrice];
  const supplied = prices.filter(present);
  if (!supplied.length) return 'OCCUPANCY_PRICE_REQUIRED';
  if (supplied.some((value) => !Number.isFinite(Number(value)) || Number(value) < 0)) {
    return 'INVALID_OCCUPANCY_PRICE';
  }
  if (present(row.childPrice) && (!Number.isFinite(Number(row.childPrice)) || Number(row.childPrice) < 0)) {
    return 'INVALID_OCCUPANCY_PRICE';
  }
  return null;
}

/** The two selling audiences used by Nile cruises. Every non-Egyptian company
 * deliberately resolves to the same foreign USD tariff. */
export type CruiseAudience = 'EGYPTIAN' | 'FOREIGN';

export function cruiseAudience(market: Market | null | undefined): CruiseAudience {
  return market === 'EGYPTIAN' ? 'EGYPTIAN' : 'FOREIGN';
}

export function cruiseAudienceCurrency(audience: CruiseAudience): 'EGP' | 'USD' {
  return audience === 'EGYPTIAN' ? 'EGP' : 'USD';
}

/** Every programme season is entered as one visible pair: Egyptians/EGP and
 * foreigners/USD. Checking only the programme as a whole would accept an EGP
 * summer row beside a USD winter row, leaving both seasons half-priced. */
export function programmePeriodsHaveBothAudiences(rows: Array<{
  market?: unknown;
  validFrom?: unknown;
  validTo?: unknown;
}>): boolean {
  if (!rows.length) return false;
  const periods = new Map<string, Set<CruiseAudience>>();
  for (const row of rows) {
    const key = `${String(row.validFrom ?? '').slice(0, 10)}|${String(row.validTo ?? '').slice(0, 10)}`;
    if (!periods.has(key)) periods.set(key, new Set());
    periods.get(key)!.add(String(row.market ?? '').toUpperCase() === 'EGYPTIAN' ? 'EGYPTIAN' : 'FOREIGN');
  }
  return [...periods.values()].every(markets => markets.has('EGYPTIAN') && markets.has('FOREIGN'));
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
 * Nile-cruise occupancy prices are per person, not per cabin. "Double" means
 * the adult is sharing a double; it does not turn two guests into one billing
 * unit. Children use their explicit per-person price and blank never means 0.
 */
export function priceCruisePerPerson(input: {
  row: CruiseRateRow;
  occupancy: Occupancy;
  adults: number;
  children?: number;
}): { total: Decimal; adultUnitPrice: Decimal; childUnitPrice: Decimal | null; currency: string } | null {
  const adultUnitPrice = cabinPrice(input.row, input.occupancy);
  if (adultUnitPrice == null) return null;
  const adults = Math.max(1, Math.floor(input.adults) || 1);
  const children = Math.max(0, Math.floor(input.children ?? 0) || 0);
  const childUnitPrice = input.row.childPrice ?? null;
  if (children > 0 && childUnitPrice == null) return null;
  return {
    total: adultUnitPrice.mul(adults).add((childUnitPrice ?? new Decimal(0)).mul(children)),
    adultUnitPrice,
    childUnitPrice,
    currency: input.row.currency,
  };
}

/** A programme is deliberately independent of cabin sharing. It has one adult
 * price and one optional child price per traveller. */
export function priceCruiseProgrammePerPerson(input: {
  adultPrice: Decimal | null;
  childPrice?: Decimal | null;
  currency: string;
  adults: number;
  children?: number;
}): { total: Decimal; adultUnitPrice: Decimal; childUnitPrice: Decimal | null; currency: string } | null {
  if (input.adultPrice == null) return null;
  const adults = Math.max(1, Math.floor(input.adults) || 1);
  const children = Math.max(0, Math.floor(input.children ?? 0) || 0);
  const childUnitPrice = input.childPrice ?? null;
  if (children > 0 && childUnitPrice == null) return null;
  return {
    total: input.adultPrice.mul(adults).add((childUnitPrice ?? new Decimal(0)).mul(children)),
    adultUnitPrice: input.adultPrice,
    childUnitPrice,
    currency: input.currency,
  };
}

export type CruiseTransferTripType = 'ONE_WAY' | 'ROUND_TRIP';

/** Each transfer row is one explicit ONE_WAY or ROUND_TRIP product. The price
 * belongs to the whole vehicle; passenger count only decides how many vehicles
 * are required for the selected capacity. */
export function priceCruiseTransfer(input: {
  amount: Decimal;
  capacity: number;
  pax: number;
}): { total: Decimal; unitPrice: Decimal; pax: number; vehicleCount: number; capacity: number } | null {
  if (input.amount.isNegative()) return null;
  const pax = Math.max(1, Math.floor(input.pax) || 1);
  const capacity = Math.floor(Number(input.capacity));
  if (!Number.isFinite(capacity) || capacity < 1) return null;
  const vehicleCount = Math.ceil(pax / capacity);
  return {
    total: input.amount.mul(vehicleCount),
    unitPrice: input.amount,
    pax,
    vehicleCount,
    capacity,
  };
}

export type CruiseSupplementType = 'FIXED_AMOUNT' | 'PERCENTAGE' | 'TOTAL_PRICE' | 'TEXT_ONLY';
export interface CruiseSupplement {
  name: string;
  type: CruiseSupplementType;
  amount?: Decimal | number | string | null;
  currency?: string | null;
}

/** Apply selected cruise supplements with hotel-compatible semantics. Fixed
 * and total-price rows are per passenger; percentages apply to the fare total. */
export function applyCruiseSupplements(
  base: Decimal,
  pax: number,
  currency: string,
  supplements: CruiseSupplement[],
): Decimal | null {
  const heads = Math.max(1, Math.floor(pax) || 1);
  const names = new Set<string>();
  let fixedTotal = new Decimal(0);
  let percentageTotal = new Decimal(0);
  let replacement: Decimal | null = null;
  for (const supplement of supplements) {
    const key = String(supplement.name ?? '').trim().toLowerCase();
    if (!key || names.has(key)) return null;
    names.add(key);
    if (supplement.type === 'TEXT_ONLY') continue;
    const amount = supplement.amount === null || supplement.amount === undefined || supplement.amount === ''
      ? null : new Decimal(supplement.amount);
    if (amount == null || amount.isNegative()) return null;
    if (supplement.type === 'PERCENTAGE') {
      // Percentage supplements are intentionally currencyless. A legacy row
      // carrying a currency is contradictory and must be corrected by admin.
      if (supplement.currency) return null;
      percentageTotal = percentageTotal.add(base.mul(amount).div(100));
    } else {
      if (supplement.currency && supplement.currency !== currency) return null;
      if (supplement.type === 'FIXED_AMOUNT') fixedTotal = fixedTotal.add(amount.mul(heads));
      else if (supplement.type === 'TOTAL_PRICE') {
        if (replacement !== null) return null;
        replacement = amount.mul(heads);
      }
    }
  }
  // TOTAL_PRICE is a fare replacement. Mixing it with additive commercial
  // supplements is ambiguous, so reject the combination instead of allowing
  // request array order to decide money.
  if (replacement !== null && (!fixedTotal.isZero() || !percentageTotal.isZero())) return null;
  return (replacement ?? base.add(fixedTotal).add(percentageTotal)).toDecimalPlaces(2);
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

export type CruiseStayDateError =
  | 'INVALID_DATES'
  | 'INVALID_SCHEDULE'
  | 'DEPARTURE_DAY_MISMATCH'
  | 'STAY_LENGTH_MISMATCH'
  | 'RETURN_DAY_MISMATCH';

/**
 * Check that the two calendar dates are the real From / Back dates of a
 * selected sailing. Quote forms carry both dates because operations and hotel
 * exports expect them, but they are not free-form hotel dates: the schedule is
 * the source of truth.
 */
export function validateCruiseStayDates(
  checkInValue: unknown,
  checkOutValue: unknown,
  schedule: { departureDay?: unknown; returnDay?: unknown; nights?: unknown },
): CruiseStayDateError | null {
  const dateOnly = (value: unknown): Date | null => {
    if (value instanceof Date && Number.isNaN(value.getTime())) return null;
    const raw = value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? '').trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
    const date = new Date(`${raw}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw ? null : date;
  };

  const checkIn = dateOnly(checkInValue);
  const checkOut = dateOnly(checkOutValue);
  if (!checkIn || !checkOut || checkOut <= checkIn) return 'INVALID_DATES';

  const departureDay = normalizeWeekday(schedule.departureDay);
  const returnDay = normalizeWeekday(schedule.returnDay);
  const nights = Math.floor(Number(schedule.nights));
  if (!departureDay || !returnDay || !Number.isFinite(nights) || nights < 1) return 'INVALID_SCHEDULE';

  if (WEEKDAYS[checkIn.getUTCDay()] !== departureDay) return 'DEPARTURE_DAY_MISMATCH';
  const actualNights = Math.round((checkOut.getTime() - checkIn.getTime()) / 86_400_000);
  if (actualNights !== nights) return 'STAY_LENGTH_MISMATCH';
  if (WEEKDAYS[checkOut.getUTCDay()] !== returnDay) return 'RETURN_DAY_MISMATCH';
  return null;
}
