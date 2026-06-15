import test from 'node:test';
import assert from 'node:assert/strict';
import { Decimal } from '@prisma/client/runtime/library';
import { resolveExplicitPrice, scoreRow, PriceRow } from '../src/shared/pricing';
import { explicitMoney } from '../src/shared/money';

// Pure tests for the explicit price matrix (Findings 5 & 6): admin-defined prices
// are returned VERBATIM (no FX), with priority company → market → all → base.

function row(p: Partial<PriceRow>): PriceRow {
  return {
    market: null, companyId: null, currency: 'USD', amount: null, priceUsd: null,
    minPax: null, maxPax: null, validFrom: null, validTo: null, ...p,
  };
}
const EGP = (n: number) => row({ market: 'EGYPTIAN', currency: 'EGP', amount: new Decimal(n) });
const USD = (n: number) => row({ market: 'FOREIGN', currency: 'USD', amount: new Decimal(n) });

test('Egyptian company → exact EGP row, verbatim (no FX)', () => {
  const r = resolveExplicitPrice([EGP(2500), USD(50)], { market: 'EGYPTIAN', companyId: null }, new Decimal(99), 'USD');
  assert.equal(r.currency, 'EGP');
  assert.equal(r.amount.toString(), '2500');
  assert.equal(r.overridden, true);
});

test('Foreign company → exact USD row, verbatim (no FX)', () => {
  const r = resolveExplicitPrice([EGP(2500), USD(50)], { market: 'FOREIGN', companyId: null }, new Decimal(99), 'EGP');
  assert.equal(r.currency, 'USD');
  assert.equal(r.amount.toString(), '50');
});

test('Company-specific override beats the market row (Finding 6)', () => {
  const rows = [USD(50), row({ companyId: 'co1', currency: 'USD', amount: new Decimal(45) })];
  const r = resolveExplicitPrice(rows, { market: 'FOREIGN', companyId: 'co1' }, new Decimal(99), 'USD');
  assert.equal(r.amount.toString(), '45');
});

test('All-markets row beats base but loses to a market row', () => {
  const all = row({ market: null, currency: 'USD', amount: new Decimal(60) });
  assert.equal(resolveExplicitPrice([all], { market: 'FOREIGN', companyId: null }, new Decimal(99), 'USD').amount.toString(), '60');
  assert.equal(resolveExplicitPrice([all, USD(50)], { market: 'FOREIGN', companyId: null }, new Decimal(99), 'USD').amount.toString(), '50');
});

test('No applicable row → base price, not overridden (no invented value)', () => {
  const r = resolveExplicitPrice([EGP(2500)], { market: 'FOREIGN', companyId: null }, new Decimal(99), 'USD');
  assert.equal(r.amount.toString(), '99');
  assert.equal(r.currency, 'USD');
  assert.equal(r.overridden, false);
});

test('pax outside [minPax,maxPax] excludes the row', () => {
  const rows = [row({ market: 'FOREIGN', currency: 'USD', amount: new Decimal(50), minPax: 2, maxPax: 4 })];
  assert.equal(resolveExplicitPrice(rows, { market: 'FOREIGN', companyId: null, pax: 1 }, new Decimal(99), 'USD').overridden, false);
  assert.equal(resolveExplicitPrice(rows, { market: 'FOREIGN', companyId: null, pax: 3 }, new Decimal(99), 'USD').amount.toString(), '50');
});

test('validFrom/validTo window filters by booking date', () => {
  const rows = [row({ market: 'FOREIGN', currency: 'USD', amount: new Decimal(50), validFrom: new Date('2026-01-01'), validTo: new Date('2026-06-30') })];
  assert.equal(resolveExplicitPrice(rows, { market: 'FOREIGN', companyId: null, date: new Date('2026-03-01') }, new Decimal(99), 'USD').amount.toString(), '50');
  assert.equal(resolveExplicitPrice(rows, { market: 'FOREIGN', companyId: null, date: new Date('2026-09-01') }, new Decimal(99), 'USD').overridden, false);
});

test('a 50 USD row is NEVER converted to the base currency', () => {
  const r = resolveExplicitPrice([row({ market: 'EGYPTIAN', currency: 'USD', amount: new Decimal(50) })], { market: 'EGYPTIAN', companyId: null }, new Decimal(2500), 'EGP');
  assert.equal(r.currency, 'USD');
  assert.equal(r.amount.toString(), '50');
});

test('company override does NOT apply to a different company', () => {
  const rows = [USD(50), row({ companyId: 'co1', currency: 'USD', amount: new Decimal(45) })];
  const r = resolveExplicitPrice(rows, { market: 'FOREIGN', companyId: 'co2' }, new Decimal(99), 'USD');
  assert.equal(r.amount.toString(), '50'); // falls back to the market row, not co1's override
});

test('scoreRow priority: company(3) > market(2) > all(1) > n/a(-1)', () => {
  const ctx = { market: 'FOREIGN' as const, companyId: 'co1', pax: 2, date: new Date('2026-03-01') };
  assert.equal(scoreRow(row({ companyId: 'co1' }), ctx), 3);
  assert.equal(scoreRow(row({ market: 'FOREIGN' }), ctx), 2);
  assert.equal(scoreRow(row({}), ctx), 1);
  assert.equal(scoreRow(row({ market: 'EGYPTIAN' }), ctx), -1);
  assert.equal(scoreRow(row({ companyId: 'other' }), ctx), -1);
});

test('explicitMoney: rate 1, source equals total, currency normalised & preserved', () => {
  const m = explicitMoney(new Decimal('123.456'), 'egp');
  assert.equal(m.currency, 'EGP');
  assert.equal(m.sourceCurrency, 'EGP');
  assert.equal(m.exchangeRate.toString(), '1');
  assert.equal(m.totalAmount.toString(), '123.46');
  assert.equal(m.sourceAmount.toString(), m.totalAmount.toString());
});
