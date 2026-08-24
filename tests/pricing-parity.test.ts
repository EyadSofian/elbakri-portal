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
