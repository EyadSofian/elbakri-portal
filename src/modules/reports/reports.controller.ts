import { Request, Response } from 'express';
import { prisma } from '../../config/db';

async function buildOverview(companyId?: string) {
  const where = companyId ? { companyId } : {};

  const [
    totalBookings,
    pendingBookings,
    activeCompanies,
    bookingsByType,
    bookingsByStatus,
    revenueRaw,
    topCompaniesRaw,
  ] = await Promise.all([
    prisma.booking.count({ where }),
    prisma.booking.count({ where: { ...where, status: 'PENDING' } }),
    companyId ? Promise.resolve(1) : prisma.company.count({ where: { isActive: true } }),
    prisma.booking.groupBy({
      by: ['type'],
      where,
      _count: { id: true },
    }),
    prisma.booking.groupBy({
      by: ['status'],
      where,
      _count: { id: true },
    }),
    prisma.booking.findMany({
      where: { ...where, status: { not: 'CANCELLED' } },
      select: { totalAmount: true, createdAt: true },
    }),
    companyId
      ? Promise.resolve([])
      : prisma.booking.groupBy({
          by: ['companyId'],
          where: { status: { not: 'CANCELLED' } },
          _count: { id: true },
          _sum: { totalAmount: true },
          orderBy: { _sum: { totalAmount: 'desc' } },
          take: 10,
        }),
  ]);

  const totalRevenue = revenueRaw.reduce((sum, b) => sum + Number(b.totalAmount), 0);

  const revenueByMonthMap: Record<string, number> = {};
  for (const b of revenueRaw) {
    const month = b.createdAt.toISOString().slice(0, 7);
    revenueByMonthMap[month] = (revenueByMonthMap[month] ?? 0) + Number(b.totalAmount);
  }
  const revenueByMonth = Object.entries(revenueByMonthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, revenue]) => ({ month, revenue }));

  const bookingsByTypeMap: Record<string, number> = { HOTEL: 0, FLIGHT: 0, PACKAGE: 0 };
  for (const row of bookingsByType) {
    bookingsByTypeMap[row.type] = row._count.id;
  }

  const bookingsByStatusMap: Record<string, number> = { PENDING: 0, CONFIRMED: 0, CANCELLED: 0, COMPLETED: 0 };
  for (const row of bookingsByStatus) {
    bookingsByStatusMap[row.status] = row._count.id;
  }

  const companyIds = (topCompaniesRaw as Array<{ companyId: string; _count: { id: number }; _sum: { totalAmount: unknown } }>)
    .map((r) => r.companyId);
  const companiesData = companyIds.length
    ? await prisma.company.findMany({ where: { id: { in: companyIds } }, select: { id: true, name: true } })
    : [];
  const companyMap = Object.fromEntries(companiesData.map((c) => [c.id, c.name]));

  const topCompanies = (topCompaniesRaw as Array<{ companyId: string; _count: { id: number }; _sum: { totalAmount: unknown } }>).map((r) => ({
    id: r.companyId,
    name: companyMap[r.companyId] ?? r.companyId,
    totalBookings: r._count.id,
    totalRevenue: Number(r._sum.totalAmount ?? 0),
  }));

  return {
    totalBookings,
    totalRevenue,
    pendingBookings,
    activeCompanies,
    bookingsByType: bookingsByTypeMap,
    bookingsByStatus: bookingsByStatusMap,
    revenueByMonth,
    topCompanies,
  };
}

export async function getOverview(req: Request, res: Response): Promise<void> {
  const data = await buildOverview();
  res.json({ success: true, data });
}

export async function getCompanyReport(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  // COMPANY_ADMIN may only access their own company's report
  if (caller.role !== 'SUPERADMIN' && caller.companyId !== req.params.id) {
    res.status(403).json({ success: false, error: 'FORBIDDEN' });
    return;
  }
  const data = await buildOverview(req.params.id);
  res.json({ success: true, data });
}
