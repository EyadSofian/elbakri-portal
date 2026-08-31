import test from 'node:test';
import assert from 'node:assert/strict';
import { Decimal } from '@prisma/client/runtime/library';
import {
  PARTY_SIZE,
  availableBases,
  basisForSize,
  compositionTotal,
  compositionUnits,
  isPartyBasis,
  partyComposition,
  partyPriceFor,
  perPersonTotal,
  priceActivity,
} from '../src/shared/activity-pricing';

// The bug this module exists to fix: a party rate ("double", "triple") was
// charged ONCE however many people were on the booking, so a desert safari for
// six cost the same as a safari for two.
//
// A party rate prices ONE party. A booking fills as many full parties as the
// rate holds, and whoever is left over is charged at the rate for how many THEY
// are — five people on a double rate are two doubles and a single.

const D = (n: number | string) => new Decimal(n);

/** A trip sold at every party size, so the composition rule is what is tested. */
const ALL = { priceSingle: D(60), priceDouble: D(100), priceTriple: D(120) };

const shape = (lines: ReturnType<typeof partyComposition>) =>
  (lines ?? []).map((l) => [l.basis, l.count]);

test('PARTY_SIZE names how many one party holds', () => {
  assert.deepEqual(PARTY_SIZE, { SINGLE: 1, DOUBLE: 2, TRIPLE: 3 });
});

test('basisForSize maps a leftover group to the rate that prices it', () => {
  assert.equal(basisForSize(1), 'SINGLE');
  assert.equal(basisForSize(2), 'DOUBLE');
  assert.equal(basisForSize(3), 'TRIPLE');
  assert.equal(basisForSize(4), null);
  assert.equal(basisForSize(0), null);
});

// ── partyComposition: how a group is actually seated ────────────────────────

test('partyComposition: an exact fit is whole parties and nothing else', () => {
  assert.deepEqual(shape(partyComposition(6, 'DOUBLE', ALL)), [['DOUBLE', 3]]);
  assert.deepEqual(shape(partyComposition(2, 'DOUBLE', ALL)), [['DOUBLE', 1]]);
  assert.deepEqual(shape(partyComposition(6, 'TRIPLE', ALL)), [['TRIPLE', 2]]);
});

test('partyComposition: five on a double rate are two doubles and a SINGLE', () => {
  // The rule the operator asked for: the odd person is charged as a single,
  // not as a whole second double.
  assert.deepEqual(shape(partyComposition(5, 'DOUBLE', ALL)), [['DOUBLE', 2], ['SINGLE', 1]]);
});

test('partyComposition: a triple rate leaves a single or a double behind', () => {
  assert.deepEqual(shape(partyComposition(4, 'TRIPLE', ALL)), [['TRIPLE', 1], ['SINGLE', 1]]);
  assert.deepEqual(shape(partyComposition(5, 'TRIPLE', ALL)), [['TRIPLE', 1], ['DOUBLE', 1]]);
  assert.deepEqual(shape(partyComposition(7, 'TRIPLE', ALL)), [['TRIPLE', 2], ['SINGLE', 1]]);
  assert.deepEqual(shape(partyComposition(8, 'TRIPLE', ALL)), [['TRIPLE', 2], ['DOUBLE', 1]]);
});

test('partyComposition: a single rate is one party per head', () => {
  assert.deepEqual(shape(partyComposition(4, 'SINGLE', ALL)), [['SINGLE', 4]]);
});

test('partyComposition: fewer people than the rate holds are charged at their own size', () => {
  assert.deepEqual(shape(partyComposition(1, 'DOUBLE', ALL)), [['SINGLE', 1]]);
  assert.deepEqual(shape(partyComposition(2, 'TRIPLE', ALL)), [['DOUBLE', 1]]);
});

test('partyComposition: an unpriced leftover size falls back to a whole party', () => {
  // The trip is only sold as a double. The fifth guest still travels — in a
  // second double — because charging a single price that was never set would
  // invent a rate the operator never agreed to.
  const doubleOnly = { priceDouble: D(100) };
  assert.deepEqual(shape(partyComposition(5, 'DOUBLE', doubleOnly)), [['DOUBLE', 2], ['DOUBLE', 1]]);
  assert.equal(compositionTotal(partyComposition(5, 'DOUBLE', doubleOnly)!).toString(), '300');
});

test('partyComposition: the chosen rate must itself be priced', () => {
  assert.equal(partyComposition(4, 'TRIPLE', { priceDouble: D(100) }), null);
});

test('partyComposition: never composes an empty booking', () => {
  for (const pax of [0, -3, NaN]) {
    const lines = partyComposition(pax, 'DOUBLE', ALL)!;
    assert.ok(compositionUnits(lines) >= 1, `pax=${pax}`);
  }
});

test('partyComposition: a fractional head count is floored to whole people', () => {
  assert.deepEqual(shape(partyComposition(4.9, 'DOUBLE', ALL)), [['DOUBLE', 2]]);
});

// ── compositionTotal / compositionUnits ─────────────────────────────────────

test('compositionTotal: five on a double costs two doubles plus one single', () => {
  assert.equal(compositionTotal(partyComposition(5, 'DOUBLE', ALL)!).toString(), '260'); // 100+100+60
});

test('compositionTotal: raising the pax count RAISES the price (the reported bug)', () => {
  const at = (pax: number) => compositionTotal(partyComposition(pax, 'DOUBLE', ALL)!).toString();
  assert.equal(at(2), '100');
  assert.equal(at(4), '200');
  assert.equal(at(6), '300');
});

test('compositionTotal: keeps decimal precision (no float drift)', () => {
  const rates = { priceSingle: D('11.11'), priceDouble: D('33.33') };
  assert.equal(compositionTotal(partyComposition(5, 'DOUBLE', rates)!).toString(), '77.77');
});

test('compositionUnits counts every party across every line', () => {
  assert.equal(compositionUnits(partyComposition(5, 'DOUBLE', ALL)!), 3);
  assert.equal(compositionUnits(partyComposition(6, 'DOUBLE', ALL)!), 3);
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

test('availableBases: legacy zero party prices do not create fake booking modes', () => {
  assert.deepEqual(availableBases({ priceAdult: D(60), priceSingle: D(0), priceDouble: D(0) }), ['PER_PERSON']);
  assert.deepEqual(availableBases({ priceAdult: D(0) }), ['PER_PERSON'], 'a deliberate free per-person price stays valid');
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
  assert.equal(partyPriceFor({ priceTriple: D(0) }, 'TRIPLE'), null);
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

test('priceActivity: the odd guest is charged at a single rate, and itemised', () => {
  const r = priceActivity({ activity: ALL, basis: 'DOUBLE', adultsCount: 5, childrenCount: 0 })!;
  assert.deepEqual(r.lines.map((l) => [l.basis, l.count]), [['DOUBLE', 2], ['SINGLE', 1]]);
  assert.equal(r.units, 3);
  assert.equal(r.total.toString(), '260');
  // `unitPrice` still names the rate the client CHOSE, so the summary can say
  // "you picked the double rate" even when a line prices the leftover.
  assert.equal(r.unitPrice!.toString(), '100');
});

test('priceActivity: a per-person booking has no party lines to itemise', () => {
  const r = priceActivity({
    activity: { priceAdult: D(50) },
    basis: 'PER_PERSON',
    adultsCount: 2,
    childrenCount: 0,
  })!;
  assert.deepEqual(r.lines, []);
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
