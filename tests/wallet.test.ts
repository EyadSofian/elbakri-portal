import test from 'node:test';
import assert from 'node:assert/strict';
import { Decimal } from '@prisma/client/runtime/library';
import { debitWallet, refundWallet } from '../src/shared/wallet';

// Unit tests for the centralised wallet helpers. A mock transaction client backs
// an in-memory ledger so we can assert idempotency + balance arithmetic without a DB.
function mockTx(initialBalance: number) {
  const state = { balance: new Decimal(initialBalance), txns: [] as { type: string; reference: string; amount: Decimal }[] };
  const tx = {
    walletTransaction: {
      findFirst: async ({ where }: { where: { reference: string; type: string } }) =>
        state.txns.find((t) => t.reference === where.reference && t.type === where.type) ?? null,
      create: async ({ data }: { data: { type: string; reference: string; amount: Decimal } }) => {
        state.txns.push({ type: data.type, reference: data.reference, amount: data.amount });
        return data;
      },
    },
    company: {
      findUniqueOrThrow: async () => ({ balance: state.balance }),
      update: async ({ data }: { data: { balance: Decimal } }) => {
        state.balance = data.balance;
        return { balance: state.balance };
      },
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { tx: tx as any, state };
}
const D = (n: number) => new Decimal(n);
const base = { companyId: 'c1', reference: 'REF-1', description: 'test', createdById: 'u1' };

test('debitWallet: debits once and decrements the balance', async () => {
  const { tx, state } = mockTx(1000);
  const r = await debitWallet(tx, { ...base, amount: D(300) });
  assert.equal(r.debited, true);
  assert.equal(state.balance.toString(), '700');
  assert.equal(state.txns.length, 1);
  assert.equal(state.txns[0].type, 'DEBIT');
});

test('debitWallet: idempotent — a second debit for the same reference is a no-op', async () => {
  const { tx, state } = mockTx(1000);
  await debitWallet(tx, { ...base, amount: D(300) });
  const r2 = await debitWallet(tx, { ...base, amount: D(300) });
  assert.equal(r2.debited, false);
  assert.equal(state.balance.toString(), '700'); // NOT 400 — no double charge
  assert.equal(state.txns.length, 1);
});

test('debitWallet: insufficient balance throws INSUFFICIENT_BALANCE', async () => {
  const { tx } = mockTx(100);
  await assert.rejects(() => debitWallet(tx, { ...base, amount: D(300) }), /INSUFFICIENT_BALANCE/);
});

test('debitWallet: a zero amount is a no-op (free/price-on-request services)', async () => {
  const { tx, state } = mockTx(1000);
  const r = await debitWallet(tx, { ...base, amount: D(0) });
  assert.equal(r.debited, false);
  assert.equal(state.txns.length, 0);
});

test('refundWallet: refunds a prior debit and restores the balance', async () => {
  const { tx, state } = mockTx(1000);
  await debitWallet(tx, { ...base, amount: D(300) });
  const r = await refundWallet(tx, { ...base, amount: D(300) });
  assert.equal(r.refunded, true);
  assert.equal(state.balance.toString(), '1000');
});

test('refundWallet: idempotent — a second refund is a no-op', async () => {
  const { tx, state } = mockTx(1000);
  await debitWallet(tx, { ...base, amount: D(300) });
  await refundWallet(tx, { ...base, amount: D(300) });
  const r2 = await refundWallet(tx, { ...base, amount: D(300) });
  assert.equal(r2.refunded, false);
  assert.equal(state.balance.toString(), '1000'); // NOT 1300 — no double refund
});

test('refundWallet: no refund when there was never a debit', async () => {
  const { tx, state } = mockTx(1000);
  const r = await refundWallet(tx, { ...base, amount: D(300) });
  assert.equal(r.refunded, false);
  assert.equal(state.balance.toString(), '1000');
});
