import test from 'node:test';
import assert from 'node:assert/strict';
import { Decimal } from '@prisma/client/runtime/library';
import {
  PARTY_BASES,
  PartyBasis,
  compositionTotal,
  compositionUnits,
  partyComposition,
} from '../src/shared/activity-pricing';
import {
  OCCUPANCIES,
  Occupancy,
  cabinsNeeded,
  priceCruiseBooking,
} from '../src/shared/cruise-rates';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { loadPortal } = require('./helpers/load-portal') as {
  loadPortal: (file: string) => Record<string, (...args: unknown[]) => unknown>;
};

/**
 * The agent portal previews a price; the server charges one. They are two
 * separate implementations of the same rule, in two languages, in two files —
 * so the only thing that keeps them honest is running both over the same
 * inputs and comparing.
 *
 * A drift here is not a cosmetic bug: it is a client quoted one number and
 * billed another. This sweeps every party size against every plausible price
 * table, including the tables with gaps that decide whether a leftover group
 * is charged at its own size or falls back to a whole party.
 */
const portal = loadPortal('dashboard.html');

/**
 * Values built inside the sandbox carry that context's own Array/Object
 * prototypes, so assert.deepEqual rejects them as "same structure but not
 * reference-equal". Round-tripping through JSON brings them into this realm;
 * the data is what these assertions are about.
 */
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));

type PriceTable = { SINGLE?: number; DOUBLE?: number; TRIPLE?: number };

/** The same table in the two shapes the two sides read. */
function asServerPrices(table: PriceTable) {
  return {
    priceSingle: table.SINGLE === undefined ? null : new Decimal(table.SINGLE),
    priceDouble: table.DOUBLE === undefined ? null : new Decimal(table.DOUBLE),
    priceTriple: table.TRIPLE === undefined ? null : new Decimal(table.TRIPLE),
  };
}

/** Every meaningful shape of price table, including the ones with holes. */
const TABLES: PriceTable[] = [
  { SINGLE: 60, DOUBLE: 100, TRIPLE: 120 }, // sold every way
  { DOUBLE: 100 },                          // only as a double
  { TRIPLE: 120 },                          // only as a triple
  { SINGLE: 60 },                           // only as a single
  { SINGLE: 60, DOUBLE: 100 },              // no triple
  { DOUBLE: 100, TRIPLE: 120 },             // no single — the fallback case
  { SINGLE: 0, DOUBLE: 0, TRIPLE: 0 },      // free with a package: zero is a price
  { SINGLE: 33.33, DOUBLE: 99.99 },         // awkward decimals
];

test('portal and server compose every party the same way', () => {
  let compared = 0;
  for (const table of TABLES) {
    for (const basis of PARTY_BASES as PartyBasis[]) {
      for (let pax = 1; pax <= 12; pax += 1) {
        const server = partyComposition(pax, basis, asServerPrices(table));
        const client = portal.actPartyComposition(pax, basis, table) as
          { basis: string; count: number; unitPrice: number }[] | null;

        const context = `table=${JSON.stringify(table)} basis=${basis} pax=${pax}`;

        // A rate the trip is not sold at must be refused by BOTH — one side
        // quoting a price the other refuses is the same bug in reverse.
        if (server === null || client === null) {
          assert.equal(server === null, client === null, `refusal disagrees: ${context}`);
          continue;
        }

        assert.deepEqual(
          plain(client).map((l) => [l.basis, l.count]),
          server.map((l) => [l.basis, l.count]),
          `composition disagrees: ${context}`,
        );
        assert.equal(
          compositionUnits(server),
          portal.actCompositionUnits(client),
          `party count disagrees: ${context}`,
        );
        assert.equal(
          compositionTotal(server).toFixed(2),
          (portal.actCompositionTotal(client) as number).toFixed(2),
          `total disagrees: ${context}`,
        );
        compared += 1;
      }
    }
  }
  // A sweep that silently compared nothing would pass while proving nothing.
  // The expectation is derived from the data rather than hard-coded, so adding
  // a price table cannot quietly shrink the coverage this test claims.
  const sellablePairs = TABLES
    .flatMap((table) => (PARTY_BASES as PartyBasis[]).map((basis) => table[basis] !== undefined))
    .filter(Boolean).length;
  assert.equal(compared, sellablePairs * 12, 'the sweep did not cover every sellable rate');
});

test('the two sides agree on the case the operator asked about', () => {
  // Five guests, double rate: two doubles and a single — 100 + 100 + 60.
  const table = { SINGLE: 60, DOUBLE: 100, TRIPLE: 120 };
  const server = partyComposition(5, 'DOUBLE', asServerPrices(table))!;
  const client = plain(portal.actPartyComposition(5, 'DOUBLE', table) as { basis: string; count: number }[]);
  assert.deepEqual(client.map((l) => [l.basis, l.count]), [['DOUBLE', 2], ['SINGLE', 1]]);
  assert.deepEqual(server.map((l) => [l.basis, l.count]), [['DOUBLE', 2], ['SINGLE', 1]]);
  assert.equal(compositionTotal(server).toString(), '260');
  assert.equal(portal.actCompositionTotal(client), 260);
});

test('activity packages use the same party composition as single bookings', () => {
  // The package modal used to ignore SINGLE / DOUBLE / TRIPLE completely and
  // always multiply the adult price. Five guests on a double must be the same
  // two doubles + one single in both entry points.
  const result = portal.pkgPriceResult(5, 0, 'DOUBLE', {
    currency: 'USD',
    priceAdult: 50,
    priceChild: 25,
    partyPrices: { SINGLE: 60, DOUBLE: 100, TRIPLE: 120 },
  }) as { total: number; lines: { basis: string; count: number }[] };
  assert.equal(result.total, 260);
  assert.deepEqual(plain(result.lines).map((line) => [line.basis, line.count]), [
    ['DOUBLE', 2],
    ['SINGLE', 1],
  ]);
});

test('package per-person pricing distinguishes blank child price from zero', () => {
  const freeChild = portal.pkgPriceResult(2, 1, 'PER_PERSON', {
    currency: 'USD', priceAdult: 50, priceChild: 0, partyPrices: {},
  }) as { total: number };
  assert.equal(freeChild.total, 100, 'an explicit zero child price is real');

  const missingChild = portal.pkgPriceResult(2, 1, 'PER_PERSON', {
    currency: 'USD', priceAdult: 50, priceChild: null, partyPrices: {},
  });
  assert.equal(missingChild, null, 'a blank child price must go to request, not borrow the adult price');
});

// ── A cruise cabin: the portal previews it, the desk charges it ─────────────

test('portal and server fill the same number of cabins, for every party', () => {
  // The portal works out how many cabins a party needs so the agent does not
  // have to; the server works it out again when the booking is priced. If they
  // ever drift, the agent quotes for two cabins and the client is billed three.
  let compared = 0;
  for (const occupancy of OCCUPANCIES) {
    for (let pax = 1; pax <= 12; pax += 1) {
      assert.equal(
        portal.crCabinsNeeded(pax, occupancy),
        cabinsNeeded(pax, occupancy),
        `cabins disagree for ${pax} guests at ${occupancy}`,
      );
      compared += 1;
    }
  }
  assert.equal(compared, OCCUPANCIES.length * 12, 'the sweep did not cover every occupancy');
});

test('portal and server reach the same cabin total', () => {
  const row = {
    id: 'r1',
    cabinName: 'Standard',
    market: null,
    currency: 'USD',
    singlePrice: new Decimal(900),
    doublePrice: new Decimal(600),
    triplePrice: null,
    validFrom: null,
    validTo: null,
  };
  const portalRow = { singlePrice: 900, doublePrice: 600, triplePrice: null };
  for (const occupancy of ['SINGLE', 'DOUBLE'] as Occupancy[]) {
    for (let pax = 1; pax <= 7; pax += 1) {
      const server = priceCruiseBooking({ row, occupancy, pax })!;
      const unit = portal.crCabinPrice(portalRow, occupancy) as number;
      const cabins = portal.crCabinsNeeded(pax, occupancy) as number;
      assert.equal(
        String(unit * cabins),
        server.total.toString(),
        `total disagrees for ${pax} guests at ${occupancy}`,
      );
    }
  }
});

test('both sides refuse to sell a cabin at an occupancy it has no price for', () => {
  // A blank triple price means "not sold that way". Reading it as zero on
  // either side would give the cabin away.
  const row = {
    id: 'r1',
    cabinName: 'Standard',
    market: null,
    currency: 'USD',
    singlePrice: new Decimal(900),
    doublePrice: new Decimal(600),
    triplePrice: null,
    validFrom: null,
    validTo: null,
  };
  assert.equal(priceCruiseBooking({ row, occupancy: 'TRIPLE', pax: 3 }), null);
  assert.equal(portal.crCabinPrice({ triplePrice: null }, 'TRIPLE'), null);
});
