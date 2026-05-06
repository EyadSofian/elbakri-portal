import { Request, Response } from 'express';
import { prisma } from '../../config/db';
import { paginate, paginateMeta } from '../../shared/helpers';

export async function getBalance(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  if (!caller.companyId) {
    res.status(403).json({ success: false, error: 'FORBIDDEN' });
    return;
  }

  const company = await prisma.company.findUnique({
    where: { id: caller.companyId },
    select: { balance: true, name: true },
  });

  if (!company) {
    res.status(404).json({ success: false, error: 'NOT_FOUND' });
    return;
  }

  res.json({ success: true, data: { balance: company.balance, currency: 'USD', companyName: company.name } });
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
        company: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
    }),
    prisma.walletTransaction.count({ where }),
  ]);

  res.json({ success: true, data: transactions, meta: paginateMeta(total, page, limit) });
}
