import test from 'node:test';
import assert from 'node:assert/strict';
import { Decimal } from '@prisma/client/runtime/library';
import {
  CruiseRateRow,
  applicableRates,
  availableOccupancies,
  cabinPrice,
  cabinsNeeded,
  fromPrice,
  isOccupancy,
  nightsBetween,
  normalizeWeekday,
  priceCruiseBooking,
  rateApplies,
  validateCruiseRateInput,
} from '../src/shared/cruise-rates';

// A Nile cruise is priced the way a hotel is: one row per cabin category, per
// market, per period, with a price for each occupancy. `priceFrom` was one
// number that could not answer any real quote.

const D = (n: number) => new Decimal(n);

function row(over: Partial<CruiseRateRow> = {}): CruiseRateRow {
  return {
    id: 'r1',
    cabinName: 'Standard Cabin',
    market: null,
    currency: 'USD',
    singlePrice: D(400),
    doublePrice: D(300),
    triplePrice: D(250),
    validFrom: null,
    validTo: null,
    isActive: true,
    ...over,
  };
}

const MARCH = new Date('2026-03-15');

// ── Admin period validation ────────────────────────────────────────────────

test('a cruise pricing period accepts From / To and any priced occupancy', () => {
  assert.equal(validateCruiseRateInput({
    validFrom: '2026-10-01',
    validTo: '2027-04-30',
    singlePrice: 400,
  }), null);
});

test('a cruise pricing period supports open-ended dates like a hotel rate', () => {
  assert.equal(validateCruiseRateInput({ validFrom: '2026-10-01', doublePrice: 300 }), null);
  assert.equal(validateCruiseRateInput({ validTo: '2027-04-30', doublePrice: 300 }), null);
});

test('a cruise pricing period refuses reversed or invalid dates', () => {
  assert.equal(validateCruiseRateInput({
    validFrom: '2027-04-30', validTo: '2026-10-01', doublePrice: 300,
  }), 'INVALID_PERIOD_RANGE');
  assert.equal(validateCruiseRateInput({
    validFrom: 'not-a-date', validTo: '2027-04-30', doublePrice: 300,
  }), 'INVALID_PERIOD_DATE');
});

test('a cruise rate row needs one valid Single, Double or Triple amount', () => {
  assert.equal(validateCruiseRateInput({ validFrom: null, validTo: null }), 'OCCUPANCY_PRICE_REQUIRED');
  assert.equal(validateCruiseRateInput({ doublePrice: -1 }), 'INVALID_OCCUPANCY_PRICE');
  assert.equal(validateCruiseRateInput({ triplePrice: 'abc' }), 'INVALID_OCCUPANCY_PRICE');
  assert.equal(validateCruiseRateInput({ doublePrice: 0 }), null, 'zero is explicit, not blank');
});

// ── rateApplies ─────────────────────────────────────────────────────────────

test('rateApplies: an all-markets row prices everyone', () => {
  assert.equal(rateApplies(row({ market: null }), 'GULF', MARCH), true);
  assert.equal(rateApplies(row({ market: null }), null, MARCH), true);
});

test('rateApplies: a market row only prices its own market', () => {
  assert.equal(rateApplies(row({ market: 'GULF' }), 'GULF', MARCH), true);
  assert.equal(rateApplies(row({ market: 'GULF' }), 'EGYPTIAN', MARCH), false);
});

test('rateApplies: a market row is never inherited by a caller with no market', () => {
  // Otherwise an anonymous request would quietly be quoted the Gulf price.
  assert.equal(rateApplies(row({ market: 'GULF' }), null, MARCH), false);
});

test('rateApplies: FOREIGN and INTERNATIONAL are the same audience', () => {
  // Rows were written under both names before the markets list settled.
  assert.equal(rateApplies(row({ market: 'FOREIGN' }), 'INTERNATIONAL', MARCH), true);
  assert.equal(rateApplies(row({ market: 'INTERNATIONAL' }), 'FOREIGN', MARCH), true);
});

test('rateApplies: the sailing date must fall inside the period', () => {
  const summer = row({ validFrom: new Date('2026-06-01'), validTo: new Date('2026-08-31') });
  assert.equal(rateApplies(summer, null, new Date('2026-07-01')), true);
  assert.equal(rateApplies(summer, null, new Date('2026-05-31')), false);
  assert.equal(rateApplies(summer, null, new Date('2026-09-01')), false);
});

test('rateApplies: an open-ended period covers everything on its open side', () => {
  assert.equal(rateApplies(row({ validFrom: new Date('2026-01-01') }), null, new Date('2030-01-01')), true);
  assert.equal(rateApplies(row({ validTo: new Date('2026-12-31') }), null, new Date('2020-01-01')), true);
});

test('rateApplies: an inactive row prices nothing', () => {
  assert.equal(rateApplies(row({ isActive: false }), null, MARCH), false);
});

test('applicableRates keeps only the rows that survive all of the above', () => {
  const rows = [
    row({ id: 'all' }),
    row({ id: 'gulf', market: 'GULF' }),
    row({ id: 'off', isActive: false }),
    row({ id: 'winter', validTo: new Date('2026-01-31') }),
  ];
  assert.deepEqual(applicableRates(rows, 'GULF', MARCH).map((r) => r.id), ['all', 'gulf']);
});

// ── cabinPrice / availableOccupancies ───────────────────────────────────────

test('cabinPrice reads the price for the occupancy asked for', () => {
  assert.equal(cabinPrice(row(), 'SINGLE')!.toString(), '400');
  assert.equal(cabinPrice(row(), 'DOUBLE')!.toString(), '300');
  assert.equal(cabinPrice(row(), 'TRIPLE')!.toString(), '250');
});

test('cabinPrice: a blank price is null — the cabin is not sold that way', () => {
  assert.equal(cabinPrice(row({ triplePrice: null }), 'TRIPLE'), null);
});

test('availableOccupancies lists only what is priced', () => {
  assert.deepEqual(availableOccupancies(row({ singlePrice: null })), ['DOUBLE', 'TRIPLE']);
  assert.deepEqual(availableOccupancies(row({ singlePrice: null, doublePrice: null, triplePrice: null })), []);
});

test('isOccupancy accepts exactly the three occupancies', () => {
  assert.equal(isOccupancy('double'), true);
  assert.equal(isOccupancy('QUAD'), false);
});

// ── cabinsNeeded / priceCruiseBooking ───────────────────────────────────────

test('cabinsNeeded: a half-empty cabin is still a whole cabin', () => {
  assert.equal(cabinsNeeded(5, 'DOUBLE'), 3);
  assert.equal(cabinsNeeded(4, 'DOUBLE'), 2);
  assert.equal(cabinsNeeded(4, 'TRIPLE'), 2);
  assert.equal(cabinsNeeded(1, 'SINGLE'), 1);
});

test('cabinsNeeded: never zero, whatever the head count says', () => {
  assert.equal(cabinsNeeded(0, 'DOUBLE'), 1);
  assert.equal(cabinsNeeded(-4, 'DOUBLE'), 1);
});

test('priceCruiseBooking: charges the cabin price once per cabin', () => {
  const priced = priceCruiseBooking({ row: row(), occupancy: 'DOUBLE', pax: 6 })!;
  assert.equal(priced.cabins, 3);
  assert.equal(priced.total.toString(), '900');
  assert.equal(priced.currency, 'USD');
});

test('priceCruiseBooking: an explicit cabin count wins over the head count', () => {
  // The operator may have booked four cabins for six people on purpose.
  const priced = priceCruiseBooking({ row: row(), occupancy: 'DOUBLE', pax: 6, cabins: 4 })!;
  assert.equal(priced.cabins, 4);
  assert.equal(priced.total.toString(), '1200');
});

test('priceCruiseBooking: a nonsense cabin count falls back to the head count', () => {
  const priced = priceCruiseBooking({ row: row(), occupancy: 'DOUBLE', pax: 6, cabins: 0 })!;
  assert.equal(priced.cabins, 3);
});

test('priceCruiseBooking: an unsold occupancy returns null, not a free cruise', () => {
  assert.equal(
    priceCruiseBooking({ row: row({ triplePrice: null }), occupancy: 'TRIPLE', pax: 3 }),
    null,
  );
});

// ── fromPrice ───────────────────────────────────────────────────────────────

test('fromPrice: the cheapest price any applicable row offers', () => {
  const best = fromPrice([row({ id: 'a' }), row({ id: 'b', doublePrice: D(180) })], null, MARCH)!;
  assert.equal(best.amount.toString(), '180');
});

test('fromPrice: carries the currency of the row it came from, never a mix', () => {
  const rows = [
    row({ id: 'usd', singlePrice: D(400), doublePrice: D(300), triplePrice: D(250) }),
    row({ id: 'egp', currency: 'EGP', singlePrice: D(9000), doublePrice: D(7000), triplePrice: D(6000) }),
  ];
  const best = fromPrice(rows, null, MARCH)!;
  assert.equal(best.amount.toString(), '250');
  assert.equal(best.currency, 'USD');
});

test('fromPrice: rows that do not apply are not quoted from', () => {
  const rows = [row({ id: 'gulf', market: 'GULF', doublePrice: D(100) }), row({ id: 'all' })];
  const best = fromPrice(rows, 'EGYPTIAN', MARCH)!;
  assert.equal(best.amount.toString(), '250'); // the all-markets triple, not the Gulf 100
});

test('fromPrice: nothing applicable is null, not zero', () => {
  assert.equal(fromPrice([row({ isActive: false })], null, MARCH), null);
  assert.equal(fromPrice([], null, MARCH), null);
});

// ── Schedules: when the boat leaves and when it is back ─────────────────────

test('normalizeWeekday: accepts the full name, the short form and any casing', () => {
  assert.equal(normalizeWeekday('Monday'), 'MONDAY');
  assert.equal(normalizeWeekday('mon'), 'MONDAY');
  assert.equal(normalizeWeekday(' THURSDAY '), 'THURSDAY');
});

test('normalizeWeekday: rejects what is not a day', () => {
  for (const bad of ['', 'M', 'Mars', null, undefined, 7]) {
    assert.equal(normalizeWeekday(bad), null, String(bad));
  }
});

test('nightsBetween: Monday out, Thursday back is three nights', () => {
  assert.equal(nightsBetween('MONDAY', 'THURSDAY'), 3);
});

test('nightsBetween: Sunday out, Tuesday back is two nights', () => {
  assert.equal(nightsBetween('SUNDAY', 'TUESDAY'), 2);
});

test('nightsBetween: a leg that wraps the weekend is not negative', () => {
  // Friday → Monday is three nights, not minus four.
  assert.equal(nightsBetween('FRIDAY', 'MONDAY'), 3);
  assert.equal(nightsBetween('SATURDAY', 'SUNDAY'), 1);
});

test('nightsBetween: same day out and back is a full week aboard', () => {
  assert.equal(nightsBetween('MONDAY', 'MONDAY'), 7);
});
