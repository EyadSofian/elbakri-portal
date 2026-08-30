import test from 'node:test';
import assert from 'node:assert/strict';
import { Decimal } from '@prisma/client/runtime/library';
import {
  CruiseRateRow,
  applyCruiseSupplements,
  applicableRates,
  availableOccupancies,
  cabinPrice,
  cabinsNeeded,
  fromPrice,
  isOccupancy,
  cruiseAudience,
  cruiseAudienceCurrency,
  nightsBetween,
  normalizeWeekday,
  priceCruiseBooking,
  priceCruiseProgrammePerPerson,
  priceCruisePerPerson,
  priceCruiseTransfer,
  programmePeriodsHaveBothAudiences,
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

// ── Current selling rule: per person, with explicit child price ─────────────

test('priceCruisePerPerson: Double is a sharing basis and every adult is charged', () => {
  const priced = priceCruisePerPerson({ row: row(), occupancy: 'DOUBLE', adults: 4 })!;
  assert.equal(priced.adultUnitPrice.toString(), '300');
  assert.equal(priced.total.toString(), '1200');
});

test('priceCruisePerPerson: children use their own explicit per-person price', () => {
  const priced = priceCruisePerPerson({
    row: row({ childPrice: D(125) }), occupancy: 'TRIPLE', adults: 3, children: 2,
  })!;
  assert.equal(priced.total.toString(), '1000');
  assert.equal(priced.childUnitPrice!.toString(), '125');
});

test('priceCruisePerPerson: a child without a child tariff is price-on-request, never free', () => {
  assert.equal(priceCruisePerPerson({ row: row(), occupancy: 'DOUBLE', adults: 2, children: 1 }), null);
});

test('programme pricing has no Single/Double/Triple multiplier', () => {
  const priced = priceCruiseProgrammePerPerson({
    adultPrice: D(300), childPrice: D(150), currency: 'USD', adults: 3, children: 1,
  })!;
  assert.equal(priced.total.toString(), '1050');
  assert.equal(priced.adultUnitPrice.toString(), '300');
});

test('programme child price stays required when children are travelling', () => {
  assert.equal(priceCruiseProgrammePerPerson({
    adultPrice: D(300), childPrice: null, currency: 'USD', adults: 2, children: 1,
  }), null);
});

test('cruise transfer charges one whole vehicle when the party fits', () => {
  const priced = priceCruiseTransfer({ amount: D(100), capacity: 6, pax: 3 })!;
  assert.equal(priced.total.toString(), '100');
  assert.equal(priced.vehicleCount, 1);
});

test('cruise transfer adds another vehicle only when capacity is exceeded', () => {
  const priced = priceCruiseTransfer({ amount: D(100), capacity: 6, pax: 8 })!;
  assert.equal(priced.total.toString(), '200');
  assert.equal(priced.vehicleCount, 2);
  assert.equal(priceCruiseTransfer({ amount: D(150), capacity: 12, pax: 8 })!.total.toString(), '150');
});

test('cruise transfer refuses an invalid vehicle capacity', () => {
  assert.equal(priceCruiseTransfer({ amount: D(100), capacity: 0, pax: 2 }), null);
});

test('Nile cruises expose only Egyptian/EGP and Foreign/USD audiences', () => {
  assert.equal(cruiseAudience('EGYPTIAN'), 'EGYPTIAN');
  assert.equal(cruiseAudienceCurrency(cruiseAudience('EGYPTIAN')), 'EGP');
  for (const market of ['FOREIGN', 'INTERNATIONAL', 'GULF'] as const) {
    assert.equal(cruiseAudience(market), 'FOREIGN');
    assert.equal(cruiseAudienceCurrency(cruiseAudience(market)), 'USD');
  }
});

test('each programme price period has both Egyptian and foreign tariffs', () => {
  assert.equal(programmePeriodsHaveBothAudiences([
    { market: 'EGYPTIAN', validFrom: '2026-10-01', validTo: '2026-12-20' },
    { market: 'FOREIGN', validFrom: '2026-10-01', validTo: '2026-12-20' },
    { market: 'EGYPTIAN', validFrom: '2026-12-21', validTo: '2027-04-30' },
    { market: 'FOREIGN', validFrom: '2026-12-21', validTo: '2027-04-30' },
  ]), true);
  assert.equal(programmePeriodsHaveBothAudiences([
    { market: 'EGYPTIAN', validFrom: '2026-10-01', validTo: '2026-12-20' },
    { market: 'FOREIGN', validFrom: '2026-12-21', validTo: '2027-04-30' },
  ]), false);
});

test('cruise supplements follow hotel semantics on the per-person fare total', () => {
  const total = applyCruiseSupplements(D(1000), 4, 'USD', [
    { name: 'Christmas', type: 'PERCENTAGE', amount: 10 },
    { name: 'Gala dinner', type: 'FIXED_AMOUNT', amount: 25, currency: 'USD' },
  ]);
  assert.equal(total!.toString(), '1200');
});

test('a cruise supplement in another explicit currency is refused', () => {
  assert.equal(applyCruiseSupplements(D(1000), 2, 'USD', [
    { name: 'Gala dinner', type: 'FIXED_AMOUNT', amount: 25, currency: 'EGP' },
  ]), null);
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
