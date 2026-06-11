import { Request, Response } from 'express';
import { prisma } from '../../config/db';

type NormalizedStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'REJECTED' | 'COMPLETED';

type ReportRecord = {
  companyId: string;
  type: string;
  status: NormalizedStatus;
  amount: number;
  currency: string;
  requestedAt: Date;
  confirmedAt: Date | null;
};

function normalizeStatus(status: string): NormalizedStatus {
  if (status === 'APPROVED' || status === 'CONFIRMED') return 'CONFIRMED';
  if (status === 'COMPLETED') return 'COMPLETED';
  if (status === 'CANCELLED') return 'CANCELLED';
  if (status === 'REJECTED') return 'REJECTED';
  return 'PENDING';
}

function isRevenueRecord(record: ReportRecord): boolean {
  return record.status === 'CONFIRMED' || record.status === 'COMPLETED';
}

function addMoney(target: Record<string, number>, currency: string, amount: number): void {
  const code = currency.trim().toUpperCase() || 'USD';
  target[code] = (target[code] ?? 0) + amount;
}

async function loadReportRecords(companyId?: string): Promise<ReportRecord[]> {
  const where = companyId ? { companyId } : {};
  const [
    bookings,
    activities,
    transport,
    cruises,
    securityApprovals,
    airportAssist,
    simRequests,
  ] = await Promise.all([
    prisma.booking.findMany({
      where,
      select: {
        companyId: true,
        type: true,
        status: true,
        totalAmount: true,
        currency: true,
        requestedAt: true,
        confirmedAt: true,
      },
    }),
    prisma.activityBooking.findMany({
      where,
      select: {
        companyId: true,
        status: true,
        totalAmount: true,
        currency: true,
        requestedAt: true,
        confirmedAt: true,
      },
    }),
    prisma.transportBooking.findMany({
      where,
      select: {
        companyId: true,
        status: true,
        totalAmount: true,
        currency: true,
        requestedAt: true,
        confirmedAt: true,
      },
    }),
    prisma.cruiseBooking.findMany({
      where,
      select: {
        companyId: true,
        status: true,
        totalAmount: true,
        currency: true,
        requestedAt: true,
        confirmedAt: true,
      },
    }),
    prisma.visaApplication.findMany({
      where,
      select: {
        companyId: true,
        status: true,
        totalAmount: true,
        currency: true,
        requestedAt: true,
        confirmedAt: true,
      },
    }),
    prisma.airportReception.findMany({
      where,
      select: {
        companyId: true,
        status: true,
        totalAmount: true,
        currency: true,
        requestedAt: true,
        confirmedAt: true,
      },
    }),
    prisma.simRequest.findMany({
      where,
      select: {
        companyId: true,
        status: true,
        totalAmount: true,
        currency: true,
        requestedAt: true,
        confirmedAt: true,
      },
    }),
  ]);

  return [
    ...bookings.map((row) => ({
      companyId: row.companyId,
      type: row.type,
      status: normalizeStatus(row.status),
      amount: Number(row.totalAmount),
      currency: row.currency,
      requestedAt: row.requestedAt,
      confirmedAt: row.confirmedAt,
    })),
    ...activities.map((row) => ({
      companyId: row.companyId,
      type: 'ACTIVITY',
      status: normalizeStatus(row.status),
      amount: Number(row.totalAmount),
      currency: row.currency,
      requestedAt: row.requestedAt,
      confirmedAt: row.confirmedAt,
    })),
    ...transport.map((row) => ({
      companyId: row.companyId,
      type: 'TRANSPORT',
      status: normalizeStatus(row.status),
      amount: Number(row.totalAmount),
      currency: row.currency,
      requestedAt: row.requestedAt,
      confirmedAt: row.confirmedAt,
    })),
    ...cruises.map((row) => ({
      companyId: row.companyId,
      type: 'CRUISE',
      status: normalizeStatus(row.status),
      amount: Number(row.totalAmount),
      currency: row.currency,
      requestedAt: row.requestedAt,
      confirmedAt: row.confirmedAt,
    })),
    ...securityApprovals.map((row) => ({
      companyId: row.companyId,
      type: 'SECURITY_APPROVAL',
      status: normalizeStatus(row.status),
      amount: Number(row.totalAmount),
      currency: row.currency,
      requestedAt: row.requestedAt,
      confirmedAt: row.confirmedAt,
    })),
    ...airportAssist.map((row) => ({
      companyId: row.companyId,
      type: 'AIRPORT_ASSIST',
      status: normalizeStatus(row.status),
      amount: Number(row.totalAmount),
      currency: row.currency,
      requestedAt: row.requestedAt,
      confirmedAt: row.confirmedAt,
    })),
    ...simRequests.map((row) => ({
      companyId: row.companyId,
      type: 'SIM_CARD',
      status: normalizeStatus(row.status),
      amount: Number(row.totalAmount),
      currency: row.currency,
      requestedAt: row.requestedAt,
      confirmedAt: row.confirmedAt,
    })),
  ];
}

async function buildOverview(companyId?: string) {
  const [records, activeCompanies] = await Promise.all([
    loadReportRecords(companyId),
    companyId ? Promise.resolve(1) : prisma.company.count({ where: { isActive: true } }),
  ]);

  const bookingsByType: Record<string, number> = {
    HOTEL: 0,
    FLIGHT: 0,
    PACKAGE: 0,
    ACTIVITY: 0,
    TRANSPORT: 0,
    CRUISE: 0,
    SECURITY_APPROVAL: 0,
    AIRPORT_ASSIST: 0,
    SIM_CARD: 0,
  };
  const bookingsByStatus: Record<NormalizedStatus, number> = {
    PENDING: 0,
    CONFIRMED: 0,
    CANCELLED: 0,
    REJECTED: 0,
    COMPLETED: 0,
  };
  const totalRevenueByCurrency: Record<string, number> = {};
  const revenueByMonthMap: Record<string, Record<string, number>> = {};
  const companyTotals = new Map<string, {
    totalBookings: number;
    revenueByCurrency: Record<string, number>;
  }>();

  for (const record of records) {
    bookingsByType[record.type] = (bookingsByType[record.type] ?? 0) + 1;
    bookingsByStatus[record.status] += 1;

    const companyTotal = companyTotals.get(record.companyId) ?? {
      totalBookings: 0,
      revenueByCurrency: {},
    };
    companyTotal.totalBookings += 1;

    if (isRevenueRecord(record)) {
      addMoney(totalRevenueByCurrency, record.currency, record.amount);
      addMoney(companyTotal.revenueByCurrency, record.currency, record.amount);
      const revenueDate = record.confirmedAt ?? record.requestedAt;
      const month = revenueDate.toISOString().slice(0, 7);
      revenueByMonthMap[month] ??= {};
      addMoney(revenueByMonthMap[month], record.currency, record.amount);
    }

    companyTotals.set(record.companyId, companyTotal);
  }

  const companyIds = [...companyTotals.keys()];
  const companies = companyIds.length
    ? await prisma.company.findMany({
        where: { id: { in: companyIds } },
        select: { id: true, name: true, currency: true },
      })
    : [];
  const companyMap = new Map(companies.map((company) => [company.id, company]));

  const topCompanies = [...companyTotals.entries()]
    .map(([id, totals]) => ({
      id,
      name: companyMap.get(id)?.name ?? id,
      currency: companyMap.get(id)?.currency ?? 'USD',
      totalBookings: totals.totalBookings,
      totalRevenue: totals.revenueByCurrency[companyMap.get(id)?.currency ?? 'USD'] ?? 0,
      revenueByCurrency: totals.revenueByCurrency,
    }))
    .sort((a, b) => b.totalBookings - a.totalBookings)
    .slice(0, 10);

  const revenueByMonth = Object.entries(revenueByMonthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, revenueByCurrency]) => ({
      month,
      revenueByCurrency,
      revenue: companyId
        ? revenueByCurrency[companyMap.get(companyId)?.currency ?? 'USD'] ?? 0
        : Object.values(revenueByCurrency).reduce((sum, amount) => sum + amount, 0),
    }));

  const reportCurrency = companyId ? companyMap.get(companyId)?.currency ?? 'USD' : 'USD';

  return {
    totalBookings: records.length,
    totalRevenue: totalRevenueByCurrency[reportCurrency] ?? 0,
    totalRevenueByCurrency,
    reportCurrency,
    pendingBookings: bookingsByStatus.PENDING,
    activeCompanies,
    bookingsByType,
    bookingsByStatus,
    revenueByMonth,
    topCompanies,
  };
}

export async function getOverview(_req: Request, res: Response): Promise<void> {
  const data = await buildOverview();
  res.json({ success: true, data });
}

export async function getCompanyReport(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  if (caller.role !== 'SUPERADMIN' && caller.companyId !== req.params.id) {
    res.status(403).json({ success: false, error: 'FORBIDDEN' });
    return;
  }
  const data = await buildOverview(req.params.id);
  res.json({ success: true, data });
}
