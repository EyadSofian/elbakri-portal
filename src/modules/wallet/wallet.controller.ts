import { Request, Response } from 'express';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../config/db';
import { paginate, paginateMeta } from '../../shared/helpers';

function normalizeCurrency(value: unknown): string {
  return String(value || 'USD').trim().toUpperCase().slice(0, 3) || 'USD';
}

async function ensurePlatformWallet(currency = 'USD') {
  const code = normalizeCurrency(currency);
  return prisma.platformWallet.upsert({
    where: { currency: code },
    create: { currency: code, balance: new Decimal(0) },
    update: {},
  });
}

export async function getBalance(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  if (!caller.companyId) {
    res.status(403).json({ success: false, error: 'FORBIDDEN' });
    return;
  }

  const [company, debitAgg, creditAgg] = await Promise.all([
    prisma.company.findUnique({
      where: { id: caller.companyId },
      select: { balance: true, currency: true, name: true, creditLimit: true },
    }),
    // Total amount deducted (debits & refunds reversed)
    prisma.walletTransaction.aggregate({
      where: { companyId: caller.companyId, type: 'DEBIT' },
      _sum: { amount: true },
    }),
    // Total amount credited (top-ups)
    prisma.walletTransaction.aggregate({
      where: { companyId: caller.companyId, type: 'CREDIT' },
      _sum: { amount: true },
    }),
  ]);

  if (!company) {
    res.status(404).json({ success: false, error: 'NOT_FOUND' });
    return;
  }

  const totalDeposited = creditAgg._sum.amount ?? new Decimal(0);
  const totalUsed      = debitAgg._sum.amount  ?? new Decimal(0);
  // The company.balance field IS the current remaining balance (maintained by each transaction)
  const remainingBalance = company.balance;

  res.json({
    success: true,
    data: {
      balance: company.balance,          // alias kept for backwards compat
      remainingBalance,
      totalDeposited,
      totalUsed,
      currency: company.currency,
      companyName: company.name,
    },
  });
}

export async function getTransactions(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  if (!caller.companyId) {
    res.status(403).json({ success: false, error: 'FORBIDDEN' });
    return;
  }

  const page = parseInt(String(req.query.page ?? '1'));
  const limit = parseInt(String(req.query.limit ?? '20'));
  const { skip, take } = paginate(page, limit);

  const where = {
    companyId: caller.companyId,
    ...(req.query.type && { type: req.query.type as 'CREDIT' | 'DEBIT' | 'REFUND' | 'ADJUSTMENT' }),
    ...(req.query.from && { createdAt: { gte: new Date(String(req.query.from)) } }),
  };

  const [transactions, total] = await Promise.all([
    prisma.walletTransaction.findMany({
      where, skip, take,
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { id: true, name: true } } },
    }),
    prisma.walletTransaction.count({ where }),
  ]);

  res.json({ success: true, data: transactions, meta: paginateMeta(total, page, limit) });
}

export async function getAllTransactions(req: Request, res: Response): Promise<void> {
  const page = parseInt(String(req.query.page ?? '1'));
  const limit = parseInt(String(req.query.limit ?? '20'));
  const { skip, take } = paginate(page, limit);

  const where = {
    ...(req.query.companyId && { companyId: String(req.query.companyId) }),
    ...(req.query.type && { type: req.query.type as 'CREDIT' | 'DEBIT' | 'REFUND' | 'ADJUSTMENT' }),
    ...(req.query.from && { createdAt: { gte: new Date(String(req.query.from)) } }),
    ...(req.query.to && { createdAt: { lte: new Date(String(req.query.to)) } }),
  };

  const [transactions, total] = await Promise.all([
    prisma.walletTransaction.findMany({
      where, skip, take,
      orderBy: { createdAt: 'desc' },
      include: {
        company: { select: { id: true, name: true, currency: true } },
        createdBy: { select: { id: true, name: true } },
      },
    }),
    prisma.walletTransaction.count({ where }),
  ]);

  res.json({ success: true, data: transactions, meta: paginateMeta(total, page, limit) });
}

export async function getPlatformWallet(req: Request, res: Response): Promise<void> {
  const currency = normalizeCurrency(req.query.currency);
  const wallet = await ensurePlatformWallet(currency);
  const transactions = await prisma.platformWalletTransaction.findMany({
    where: { currency },
    take: 20,
    orderBy: { createdAt: 'desc' },
    include: {
      company: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });

  res.json({ success: true, data: { wallet, transactions } });
}

export async function fundPlatformWallet(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const amount = new Decimal(req.body.amount ?? 0);
  const currency = normalizeCurrency(req.body.currency);
  const description = String(req.body.description || '').trim() || 'Platform wallet funding';

  if (amount.lte(0)) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'Amount must be greater than zero' });
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    const wallet = await tx.platformWallet.upsert({
      where: { currency },
      create: { currency, balance: new Decimal(0) },
      update: {},
    });
    const balanceBefore = wallet.balance;
    const balanceAfter = balanceBefore.add(amount);

    const updatedWallet = await tx.platformWallet.update({
      where: { currency },
      data: { balance: balanceAfter },
    });

    const transaction = await tx.platformWalletTransaction.create({
      data: {
        type: 'CREDIT',
        amount,
        balanceBefore,
        balanceAfter,
        currency,
        reference: `PF-${Date.now()}`,
        description,
        createdById: caller.id,
      },
    });

    return { wallet: updatedWallet, transaction };
  });

  res.json({ success: true, data: result });
}
