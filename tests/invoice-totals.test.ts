import test from 'node:test';
import assert from 'node:assert/strict';
import { Decimal } from '@prisma/client/runtime/library';
import { buildInvoiceTotals, totalsByCurrency } from '../src/shared/invoicing';

// A combined statement ends with what the invoices add up to — split by
// currency, because adding USD to EGP produces a number that means nothing.

const D = (n: number | string) => new Decimal(n);

test('totalsByCurrency: one currency, one total', () => {
  const totals = totalsByCurrency([
    { total: D(100), currency: 'USD' },
    { total: D(250.5), currency: 'USD' },
  ]);
  assert.deepEqual(totals.map((b) => [b.currency, b.total.toString(), b.count]), [['USD', '350.5', 2]]);
});

test('totalsByCurrency: currencies are never added together', () => {
  const totals = totalsByCurrency([
    { total: D(100), currency: 'USD' },
    { total: D(5000), currency: 'EGP' },
    { total: D(50), currency: 'USD' },
  ]);
  assert.deepEqual(
    totals.map((b) => [b.currency, b.total.toString(), b.count]),
    [['USD', '150', 2], ['EGP', '5000', 1]],
  );
});

test('totalsByCurrency: currencies keep the order they were first seen', () => {
  // So the same statement reads the same way every time it is generated.
  const totals = totalsByCurrency([
    { total: D(1), currency: 'EGP' },
    { total: D(1), currency: 'USD' },
    { total: D(1), currency: 'EGP' },
  ]);
  assert.deepEqual(totals.map((b) => b.currency), ['EGP', 'USD']);
});

test('totalsByCurrency: a missing currency is treated as USD', () => {
  assert.deepEqual(totalsByCurrency([{ total: D(10) }]).map((b) => b.currency), ['USD']);
});

test('totalsByCurrency: casing and padding do not split a currency in two', () => {
  const totals = totalsByCurrency([
    { total: D(10), currency: 'usd' },
    { total: D(10), currency: ' USD ' },
  ]);
  assert.equal(totals.length, 1);
  assert.equal(totals[0].total.toString(), '20');
});

test('totalsByCurrency: plain numbers and strings total exactly', () => {
  const totals = totalsByCurrency([
    { total: 10.1, currency: 'USD' },
    { total: '20.2', currency: 'USD' },
  ]);
  assert.equal(totals[0].total.toString(), '30.3'); // not 30.299999999999997
});

test('totalsByCurrency: an empty statement has no totals', () => {
  assert.deepEqual(totalsByCurrency([]), []);
});

test('buildInvoiceTotals: tax stays zero until a policy is configured', () => {
  const totals = buildInvoiceTotals(D('123.456'));
  assert.equal(totals.subtotal.toString(), '123.46');
  assert.equal(totals.taxAmount.toString(), '0');
  assert.equal(totals.total.toString(), '123.46');
});
