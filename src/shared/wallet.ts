import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Centralised, idempotent wallet money movements.
 *
 * Every service controller (transport, activity, package, reception, sim,
 * cruise, hotel booking) confirms by DEBITing the company wallet and cancels by
 * REFUNDing it. That logic — idempotency keyed on (reference, type), balance
 * check, balanceBefore/After snapshot, WalletTransaction row — was copy-pasted
 * in ~8 places; this module is the single source of truth.
 *
 * Both helpers MUST be called inside a `prisma.$transaction` so the balance read
 * and write are atomic. They re-read `company.balance` from the provided `tx`
 * (the authoritative value at that point in the transaction).
 */

export interface WalletMoveInput {
  companyId: string;
  amount: Decimal;
  reference: string; // booking refNumber — the idempotency key
  description: string;
  createdById: string;
}

/**
 * Debit the wallet once for `reference`. No-op (returns {debited:false}) when the
 * amount is <= 0 or a DEBIT for this reference already exists (idempotent re-confirm).
 * Throws Error('INSUFFICIENT_BALANCE') — callers already map this to a 400.
 */
export async function debitWallet(tx: Prisma.TransactionClient, input: WalletMoveInput): Promise<{ debited: boolean }> {
  if (input.amount.lte(0)) return { debited: false };

  const already = await tx.walletTransaction.findFirst({
    where: { reference: input.reference, type: 'DEBIT' },
    select: { id: true },
  });
  if (already) return { debited: false };

  const company = await tx.company.findUniqueOrThrow({ where: { id: input.companyId }, select: { balance: true } });
  if (company.balance.lt(input.amount)) throw new Error('INSUFFICIENT_BALANCE');

  const balanceBefore = company.balance;
  const balanceAfter = balanceBefore.sub(input.amount);
  await tx.company.update({ where: { id: input.companyId }, data: { balance: balanceAfter } });
  await tx.walletTransaction.create({
    data: {
      companyId: input.companyId,
      type: 'DEBIT',
      amount: input.amount,
      balanceBefore,
      balanceAfter,
      reference: input.reference,
      description: input.description,
      createdById: input.createdById,
    },
  });
  return { debited: true };
}

/**
 * Refund the wallet once for `reference`. No-op (returns {refunded:false}) when the
 * amount is <= 0, no DEBIT exists for this reference, or a REFUND already exists.
 * This mirrors the previous per-controller cancel logic exactly.
 */
export async function refundWallet(tx: Prisma.TransactionClient, input: WalletMoveInput): Promise<{ refunded: boolean }> {
  if (input.amount.lte(0)) return { refunded: false };

  const [debit, priorRefund] = await Promise.all([
    tx.walletTransaction.findFirst({ where: { reference: input.reference, type: 'DEBIT' }, select: { id: true } }),
    tx.walletTransaction.findFirst({ where: { reference: input.reference, type: 'REFUND' }, select: { id: true } }),
  ]);
  if (!debit || priorRefund) return { refunded: false };

  const company = await tx.company.findUniqueOrThrow({ where: { id: input.companyId }, select: { balance: true } });
  const balanceBefore = company.balance;
  const balanceAfter = balanceBefore.add(input.amount);
  await tx.company.update({ where: { id: input.companyId }, data: { balance: balanceAfter } });
  await tx.walletTransaction.create({
    data: {
      companyId: input.companyId,
      type: 'REFUND',
      amount: input.amount,
      balanceBefore,
      balanceAfter,
      reference: input.reference,
      description: input.description,
      createdById: input.createdById,
    },
  });
  return { refunded: true };
}

// Re-export for tests/callers that want the Decimal type without a deep import.
export { Decimal };
