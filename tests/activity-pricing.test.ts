import test from 'node:test';
import assert from 'node:assert/strict';
import { Decimal } from '@prisma/client/runtime/library';
import {
  PARTY_SIZE,
  availableBases,
  isPartyBasis,
  partyPriceFor,
  partyTotal,
  partyUnits,
  perPersonTotal,
  priceActivity,
} from '../src/shared/activity-pricing';

// The bug this module exists to fix: a party rate ("double", "triple") was
// charged ONCE however many people were on the booking, so a desert safari for
// six cost the same as a safari for two. A party rate prices one party; a
// booking is as many parties as it takes to seat everybody.

const D = (n: number) => new Decimal(n);

// ── partyUnits: how many parties seat N people ──────────────────────────────

test('partyUnits: a double seats two, so six people are three doubles', () => {
  assert.equal(partyUnits(6, 'DOUBLE'), 3);
});

test('partyUnits: a part-full party still costs a whole party', () => {
  assert.equal(partyUnits(5, 'DOUBLE'), 3);  // 2 + 2 + 1
  assert.equal(partyUnits(4, 'TRIPLE'), 2);  // 3 + 1
  assert.equal(partyUnits(7, 'TRIPLE'), 3);  // 3 + 3 + 1
});

test('partyUnits: a single is one party per head', () => {
  assert.equal(partyUnits(1, 'SINGLE'), 1);
  assert.equal(partyUnits(4, 'SINGLE'), 4);
});

test('partyUnits: exact fits do not round up', () => {
  assert.equal(partyUnits(2, 'DOUBLE'), 1);
  assert.equal(partyUnits(4, 'DOUBLE'), 2);
  assert.equal(partyUnits(3, 'TRIPLE'), 1);
  assert.equal(partyUnits(6, 'TRIPLE'), 2);
});

test('partyUnits: never charges zero parties, whatever the pax count says', () => {
  for (const pax of [0, -3, NaN]) {
    assert.equal(partyUnits(pax, 'DOUBLE'), 1, `pax=${pax}`);
  }
});

test('partyUnits: a fractional head count is floored to whole people', () => {
  assert.equal(partyUnits(4.9, 'DOUBLE'), 2); // four people, two doubles
});

test('PARTY_SIZE names how many one party holds', () => {
  assert.deepEqual(PARTY_SIZE, { SINGLE: 1, DOUBLE: 2, TRIPLE: 3 });
});

// ── partyTotal ──────────────────────────────────────────────────────────────

test('partyTotal: raising the pax count RAISES the price (the reported bug)', () => {
  const rate = D(100);
  assert.equal(partyTotal(rate, 2, 'DOUBLE').toString(), '100');
  assert.equal(partyTotal(rate, 4, 'DOUBLE').toString(), '200');
  assert.equal(partyTotal(rate, 6, 'DOUBLE').toString(), '300');
});

test('partyTotal: triple rate scales in threes', () => {
  assert.equal(partyTotal(D(90), 3, 'TRIPLE').toString(), '90');
  assert.equal(partyTotal(D(90), 9, 'TRIPLE').toString(), '270');
});

test('partyTotal: keeps decimal precision (no float drift)', () => {
  assert.equal(partyTotal(D('33.33'), 6, 'DOUBLE').toString(), '99.99');
});

// ── perPersonTotal ──────────────────────────────────────────────────────────

test('perPersonTotal: adults and children are each charged their own price', () => {
  assert.equal(perPersonTotal(D(50), D(30), 2, 3).toString(), '190');
});

test('perPersonTotal: no children means no child charge', () => {
  assert.equal(perPersonTotal(D(50), D(30), 2, 0).toString(), '100');
});

test('perPersonTotal: negative counts cannot create a credit', () => {
  assert.equal(perPersonTotal(D(50), D(30), -2, -1).toString(), '0');
});

// ── availableBases: only the ways a trip was actually priced ────────────────

test('availableBases: a blank price means "not sold that way"', () => {
  assert.deepEqual(
    availableBases({ priceAdult: D(40), priceSingle: null, priceDouble: null, priceTriple: null }),
    ['PER_PERSON'],
  );
});

test('availableBases: a private-tour-only trip offers no per-person basis', () => {
  assert.deepEqual(
    availableBases({ priceAdult: null, priceDouble: D(120), priceTriple: D(150) }),
    ['DOUBLE', 'TRIPLE'],
  );
});

test('availableBases: a zero price is a real price, not a blank', () => {
  // A free-with-the-package trip is priced at zero deliberately; treating that
  // as "not sold" would hide a basis the operator meant to offer.
  assert.deepEqual(availableBases({ priceSingle: D(0) }), ['SINGLE']);
});

test('availableBases: an unpriced trip offers nothing at all', () => {
  assert.deepEqual(availableBases({}), []);
});

test('isPartyBasis recognises exactly the three party rates', () => {
  assert.equal(isPartyBasis('DOUBLE'), true);
  assert.equal(isPartyBasis('PER_PERSON'), false);
  assert.equal(isPartyBasis('QUAD'), false);
});

// ── partyPriceFor ───────────────────────────────────────────────────────────

test('partyPriceFor: reads the price for the basis asked for', () => {
  const activity = { priceSingle: D(70), priceDouble: D(120), priceTriple: D(150) };
  assert.equal(partyPriceFor(activity, 'SINGLE')!.toString(), '70');
  assert.equal(partyPriceFor(activity, 'DOUBLE')!.toString(), '120');
  assert.equal(partyPriceFor(activity, 'TRIPLE')!.toString(), '150');
});

test('partyPriceFor: an unpriced basis is null, never zero', () => {
  assert.equal(partyPriceFor({ priceDouble: D(120) }, 'TRIPLE'), null);
});

test('partyPriceFor: a plain number is accepted as well as a Decimal', () => {
  assert.equal(partyPriceFor({ priceDouble: 120 }, 'DOUBLE')!.toString(), '120');
});

// ── priceActivity: the whole calculation ────────────────────────────────────

test('priceActivity: per person multiplies both head counts', () => {
  const r = priceActivity({
    activity: { priceAdult: D(50), priceChild: D(25) },
    basis: 'PER_PERSON',
    adultsCount: 2,
    childrenCount: 2,
  })!;
  assert.equal(r.total.toString(), '150');
  assert.equal(r.units, 4);
  assert.equal(r.unitPrice, null);
});

test('priceActivity: a party booking reports the parties it charged', () => {
  const r = priceActivity({
    activity: { priceDouble: D(120) },
    basis: 'DOUBLE',
    adultsCount: 5,
    childrenCount: 1,
  })!;
  assert.equal(r.units, 3);          // six people, three doubles
  assert.equal(r.unitPrice!.toString(), '120');
  assert.equal(r.total.toString(), '360');
});

test('priceActivity: children count towards the party size', () => {
  const twoAdults = priceActivity({ activity: { priceDouble: D(120) }, basis: 'DOUBLE', adultsCount: 2, childrenCount: 0 })!;
  const plusAChild = priceActivity({ activity: { priceDouble: D(120) }, basis: 'DOUBLE', adultsCount: 2, childrenCount: 1 })!;
  assert.equal(twoAdults.units, 1);
  assert.equal(plusAChild.units, 2); // the third person needs a second car
});

test('priceActivity: an unsold basis returns null rather than a free trip', () => {
  assert.equal(
    priceActivity({ activity: { priceAdult: D(50) }, basis: 'TRIPLE', adultsCount: 3, childrenCount: 0 }),
    null,
  );
});

test('priceActivity: per person with no adult price is refused, not zero-rated', () => {
  assert.equal(
    priceActivity({ activity: { priceChild: D(25) }, basis: 'PER_PERSON', adultsCount: 2, childrenCount: 1 }),
    null,
  );
});

test('priceActivity: per person with children but no child price is refused', () => {
  assert.equal(
    priceActivity({ activity: { priceAdult: D(50) }, basis: 'PER_PERSON', adultsCount: 2, childrenCount: 1 }),
    null,
  );
});

test('priceActivity: adults only is fine on a trip with no child price', () => {
  const r = priceActivity({ activity: { priceAdult: D(50) }, basis: 'PER_PERSON', adultsCount: 2, childrenCount: 0 })!;
  assert.equal(r.total.toString(), '100');
});

test('priceActivity: a resolved market price overrides the catalogue price', () => {
  const r = priceActivity({
    activity: { priceAdult: D(50), priceChild: D(25) },
    basis: 'PER_PERSON',
    adultsCount: 2,
    childrenCount: 0,
    adultPrice: D(45), // this company's negotiated rate
  })!;
  assert.equal(r.total.toString(), '90');
});

test('priceActivity: a party booking always charges at least one party', () => {
  const r = priceActivity({ activity: { priceDouble: D(120) }, basis: 'DOUBLE', adultsCount: 0, childrenCount: 0 })!;
  assert.equal(r.units, 1);
  assert.equal(r.total.toString(), '120');
});
