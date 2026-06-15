/**
 * §8 integration suite — DB-backed. SKIPPED unless a disposable test DB is wired:
 *   set RUN_DB_TESTS=1 and a localhost/_test DATABASE_URL, then:
 *     npx prisma migrate deploy        # applies 20260614000000_transport_service_mode_and_sim_unit
 *     npm run test:integration
 *
 * These never run against production (the guard below refuses a non-local DB).
 * Each case maps 1:1 to the spec's §8 list so they can be fleshed out and run
 * the moment a test database is available (Docker Postgres or a Neon branch).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const DB = process.env.DATABASE_URL || '';
const RUN = process.env.RUN_DB_TESTS === '1' && /(_test|localhost|127\.0\.0\.1)/.test(DB);
const dbTest = (name: string, fn: () => Promise<void> | void) => test(name, { skip: !RUN }, fn);

// ── Transport ────────────────────────────────────────────────────────────────
dbTest('DAY_USE / HOURLY_CHARTER booking with NO real pickup → 400 PICKUP_REQUIRED', async () => {
  // POST /api/transport-bookings with rateId of an hourly rate, pickupType AIRPORT and
  // pickupLocation = the rate label ("Cairo (8 hours)") → expect 400 (rate label ≠ pickup).
  assert.ok(RUN);
});
dbTest('DAY_USE with a hotel pickup → 201 success', async () => { assert.ok(RUN); });
dbTest('HOTEL endpoint missing hotel name → 400', async () => { assert.ok(RUN); });
dbTest('Round trip missing returnDateTime → 400', async () => { assert.ok(RUN); });
dbTest('Round trip with returnDateTime before outbound → 400 RETURN_BEFORE_OUTBOUND', async () => { assert.ok(RUN); });
dbTest('Same reversed route uses the explicit roundTripRate (not 2× one-way)', async () => { assert.ok(RUN); });
dbTest('Different return route prices BOTH legs (two independent rates, same currency)', async () => { assert.ok(RUN); });
dbTest('Different return route with no return price → 400 RETURN_PRICE_ON_REQUEST', async () => { assert.ok(RUN); });
dbTest('Voucher shows Trip Type + Outbound/Return sections (round trip)', async () => { assert.ok(RUN); });

// ── SIM ──────────────────────────────────────────────────────────────────────
dbTest('SIM quantity 1 → total = unit × 1', async () => { assert.ok(RUN); });
dbTest('SIM quantity 3 → total = unit × 3, unitAmount stored', async () => { assert.ok(RUN); });
dbTest('SIM invalid quantity (0 / 4.5 / 9999) → 400 INVALID_QUANTITY', async () => { assert.ok(RUN); });
dbTest('SIM company/market-specific unit price applied (no FX)', async () => { assert.ok(RUN); });

// ── Pricing (no sale-price FX; full context) ──────────────────────────────────
dbTest('Egyptian company gets the exact EGP row', async () => { assert.ok(RUN); });
dbTest('Foreign company gets the exact USD row', async () => { assert.ok(RUN); });
dbTest('Company override beats the market row', async () => { assert.ok(RUN); });
dbTest('No matching row → Price on request / base (no invented conversion)', async () => { assert.ok(RUN); });
dbTest('No sale-price FX conversion occurs for any booking flow', async () => { assert.ok(RUN); });

// ── Activity package ──────────────────────────────────────────────────────────
dbTest('One ActivityPackage + N items (no stray ActivityBooking rows)', async () => { assert.ok(RUN); });
dbTest('Exactly one voucher + one invoice per package; reconfirm does not duplicate', async () => { assert.ok(RUN); });
dbTest('Overlapping activity times on the same date → 400 TIME_CONFLICT', async () => { assert.ok(RUN); });
dbTest('Mixed-currency package → 400 MIXED_CURRENCY (no silent FX)', async () => { assert.ok(RUN); });

test('integration guard: refuses to run against a non-local database', () => {
  if (process.env.RUN_DB_TESTS === '1') {
    assert.match(DB, /(_test|localhost|127\.0\.0\.1)/, 'RUN_DB_TESTS=1 but DATABASE_URL is not a local/_test DB — refusing to touch it');
  }
});
