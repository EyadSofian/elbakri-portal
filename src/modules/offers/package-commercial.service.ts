import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../config/db';

export type PackageAudience = 'EGYPTIAN' | 'FOREIGN';
export type PackageOccupancy = 'SINGLE' | 'DOUBLE' | 'TRIPLE';

export type PackageHotelInput = {
  id: string | null;
  hotelId: string;
  hotelRateId: string | null;
  nights: number;
  mealPlan: string | null;
};
export type PackageTransferInput = {
  id: string | null;
  transportRateId: string;
  included: boolean;
};
export type PackageActivityInput = {
  id: string | null;
  activityId: string;
  dayNumber: number | null;
};
export type PackagePricePeriodInput = {
  id: string | null;
  validFrom: string;
  validTo: string;
  market: PackageAudience;
  currency: 'EGP' | 'USD';
  singlePrice: number;
  doublePrice: number;
  triplePrice: number;
  childPrice: number;
};

export type PackageComponentsInput = {
  hotelItems: PackageHotelInput[];
  transferItems: PackageTransferInput[];
  activityItems: PackageActivityInput[];
  pricingPeriods: PackagePricePeriodInput[];
};

export type PackageCommercialResolution = {
  packageId: string;
  packageTitle: string;
  packageTitleAr: string | null;
  pricePeriodId: string;
  market: PackageAudience;
  occupancy: PackageOccupancy;
  travelDate: string;
  adultsCount: number;
  childrenCount: number;
  baseAmount: Decimal;
  childUnitPrice: Decimal;
  total: Decimal;
  currency: string;
  hotels: Record<string, unknown>[];
  transfers: Record<string, unknown>[];
  activities: Record<string, unknown>[];
};

function fail(code: string): never {
  throw new Error(code);
}

const rows = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const text = (value: unknown) => String(value ?? '').trim();
const rowId = (value: unknown) => text(value) || null;
const money = (value: unknown) => {
  if (value === '' || value == null) return NaN;
  return Number(value);
};
const isoDate = (value: unknown) => {
  const result = text(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(result) ? result : '';
};

/** Strict payload normalisation: incomplete rows are errors, never silently
 * removed during an unrelated edit. */
export function normalizePackageComponents(source: Record<string, unknown>): PackageComponentsInput {
  const hotelItems = rows(source.hotelItems).map((raw) => {
    const row = raw as Record<string, unknown>;
    const hotelId = text(row.hotelId);
    const nights = Math.floor(Number(row.nights));
    if (!hotelId || !Number.isFinite(nights) || nights < 1) fail('PACKAGE_HOTEL_INVALID');
    return {
      id: rowId(row.id),
      hotelId,
      hotelRateId: rowId(row.hotelRateId),
      nights,
      mealPlan: rowId(row.mealPlan),
    };
  });
  if (!hotelItems.length) fail('PACKAGE_HOTEL_REQUIRED');

  const transferItems = rows(source.transferItems).map((raw) => {
    const row = raw as Record<string, unknown>;
    const transportRateId = text(row.transportRateId);
    if (!transportRateId) fail('PACKAGE_TRANSFER_INVALID');
    return { id: rowId(row.id), transportRateId, included: row.included !== false };
  });

  const activityItems = rows(source.activityItems).map((raw) => {
    const row = raw as Record<string, unknown>;
    const activityId = text(row.activityId);
    const dayNumber = row.dayNumber === '' || row.dayNumber == null ? null : Math.floor(Number(row.dayNumber));
    if (!activityId || (dayNumber !== null && (!Number.isFinite(dayNumber) || dayNumber < 1))) fail('PACKAGE_ACTIVITY_INVALID');
    return { id: rowId(row.id), activityId, dayNumber };
  });

  const pricingPeriods = rows(source.pricingPeriods).map((raw) => {
    const row = raw as Record<string, unknown>;
    const market: PackageAudience = text(row.market).toUpperCase() === 'EGYPTIAN' ? 'EGYPTIAN' : 'FOREIGN';
    const validFrom = isoDate(row.validFrom);
    const validTo = isoDate(row.validTo);
    const prices = [money(row.singlePrice), money(row.doublePrice), money(row.triplePrice), money(row.childPrice)];
    if (!validFrom || !validTo || validTo < validFrom || prices.some((value) => !Number.isFinite(value) || value < 0)) {
      fail('PACKAGE_PRICE_PERIOD_INVALID');
    }
    return {
      id: rowId(row.id),
      validFrom,
      validTo,
      market,
      currency: market === 'EGYPTIAN' ? 'EGP' as const : 'USD' as const,
      singlePrice: prices[0],
      doublePrice: prices[1],
      triplePrice: prices[2],
      childPrice: prices[3],
    };
  });
  if (!pricingPeriods.length) fail('PACKAGE_PRICE_PERIOD_REQUIRED');
  assertNonOverlappingPackagePeriods(pricingPeriods);

  const unique = (values: string[], code: string) => {
    if (new Set(values).size !== values.length) fail(code);
  };
  unique(hotelItems.map((item) => `${item.hotelId}:${item.hotelRateId ?? ''}`), 'PACKAGE_HOTEL_DUPLICATE');
  unique(transferItems.map((item) => item.transportRateId), 'PACKAGE_TRANSFER_DUPLICATE');
  unique(activityItems.map((item) => item.activityId), 'PACKAGE_ACTIVITY_DUPLICATE');

  return { hotelItems, transferItems, activityItems, pricingPeriods };
}

export function assertNonOverlappingPackagePeriods(periods: PackagePricePeriodInput[]): void {
  for (const market of ['EGYPTIAN', 'FOREIGN'] as const) {
    const applicable = periods.filter((period) => period.market === market).sort((a, b) => a.validFrom.localeCompare(b.validFrom));
    for (let index = 1; index < applicable.length; index += 1) {
      if (applicable[index].validFrom <= applicable[index - 1].validTo) fail('PACKAGE_PERIOD_OVERLAP');
    }
  }
}

export async function validatePackageReferences(input: PackageComponentsInput, db: any = prisma): Promise<void> {
  const hotelIds = [...new Set(input.hotelItems.map((item) => item.hotelId))];
  const hotelRateIds = [...new Set(input.hotelItems.map((item) => item.hotelRateId).filter(Boolean))] as string[];
  const transferIds = [...new Set(input.transferItems.map((item) => item.transportRateId))];
  const activityIds = [...new Set(input.activityItems.map((item) => item.activityId))];
  const mealPlans = [...new Set(input.hotelItems.map((item) => item.mealPlan).filter(Boolean))] as string[];
  const [hotels, hotelRates, transfers, activities, plans] = await Promise.all([
    db.hotel.findMany({ where: { id: { in: hotelIds }, isActive: true }, select: { id: true } }),
    db.hotelRate.findMany({ where: { id: { in: hotelRateIds }, isActive: true }, select: { id: true, hotelId: true } }),
    db.transportRate.findMany({ where: { id: { in: transferIds }, isActive: true }, select: { id: true, fromName: true, fromLocation: true, toName: true, toLocation: true } }),
    db.activity.findMany({ where: { id: { in: activityIds }, isActive: true }, select: { id: true } }),
    db.mealPlanOption.findMany({ where: { code: { in: mealPlans }, isActive: true }, select: { code: true } }),
  ]);
  if (hotels.length !== hotelIds.length) fail('PACKAGE_HOTEL_NOT_AVAILABLE');
  if (hotelRates.length !== hotelRateIds.length) fail('PACKAGE_HOTEL_RATE_NOT_AVAILABLE');
  const rates = new Map<string, any>(hotelRates.map((rate: any) => [rate.id, rate]));
  if (input.hotelItems.some((item) => item.hotelRateId && rates.get(item.hotelRateId)?.hotelId !== item.hotelId)) fail('PACKAGE_HOTEL_RATE_MISMATCH');
  if (plans.length !== mealPlans.length) fail('PACKAGE_MEAL_PLAN_NOT_AVAILABLE');
  if (transfers.length !== transferIds.length) fail('PACKAGE_TRANSFER_NOT_AVAILABLE');
  if (transfers.some((rate: any) => !(rate.fromName ?? rate.fromLocation) || !(rate.toName ?? rate.toLocation))) fail('PACKAGE_TRANSFER_ROUTE_REQUIRED');
  if (activities.length !== activityIds.length) fail('PACKAGE_ACTIVITY_NOT_AVAILABLE');
}

export function packageAudience(market: unknown): PackageAudience {
  return String(market ?? '').toUpperCase() === 'EGYPTIAN' ? 'EGYPTIAN' : 'FOREIGN';
}

export function isPackageOccupancy(value: unknown): value is PackageOccupancy {
  return value === 'SINGLE' || value === 'DOUBLE' || value === 'TRIPLE';
}

export async function resolvePackagePrice(input: {
  packageId: string;
  companyId: string;
  travelDate: string | Date;
  occupancy: string;
  adultsCount?: number;
  childrenCount?: number;
}, db: any = prisma): Promise<PackageCommercialResolution> {
  const travelDate = new Date(input.travelDate);
  if (Number.isNaN(travelDate.getTime())) fail('PACKAGE_TRAVEL_DATE_INVALID');
  travelDate.setUTCHours(12, 0, 0, 0);
  const occupancy = text(input.occupancy).toUpperCase();
  if (!isPackageOccupancy(occupancy)) fail('PACKAGE_OCCUPANCY_INVALID');
  const adultsCount = Math.max(1, Math.floor(Number(input.adultsCount ?? 1)) || 1);
  const childrenCount = Math.max(0, Math.floor(Number(input.childrenCount ?? 0)) || 0);

  const [company, product] = await Promise.all([
    db.company.findUnique({ where: { id: input.companyId }, select: { isActive: true, market: true } }),
    db.offer.findFirst({
      where: { id: input.packageId, kind: 'PACKAGE', isActive: true, packageNeedsConfiguration: false },
      include: {
        packageHotels: { where: { retiredAt: null }, orderBy: { displayOrder: 'asc' }, include: { hotel: true, hotelRate: true } },
        packageTransfers: { where: { retiredAt: null }, orderBy: { displayOrder: 'asc' }, include: { transportRate: true } },
        packageActivities: { where: { retiredAt: null }, orderBy: { displayOrder: 'asc' }, include: { activity: true } },
        packagePricePeriods: { where: { retiredAt: null } },
      },
    }),
  ]);
  if (!company?.isActive) fail('COMPANY_INACTIVE');
  if (!product) fail('PACKAGE_NOT_AVAILABLE');
  if ((product.validFrom && product.validFrom > travelDate) || (product.validTo && product.validTo < travelDate)) fail('PACKAGE_NOT_AVAILABLE');
  if (!product.packageHotels.length) fail('PACKAGE_NOT_CONFIGURED');

  const market = packageAudience(company.market);
  const matches = product.packagePricePeriods.filter((period: any) => (
    packageAudience(period.market) === market && period.validFrom <= travelDate && period.validTo >= travelDate
  ));
  if (!matches.length) fail('PACKAGE_PRICE_NOT_AVAILABLE');
  if (matches.length > 1) fail('PACKAGE_PRICE_AMBIGUOUS');
  const period = matches[0];
  const priceKey = occupancy === 'SINGLE' ? 'singlePrice' : occupancy === 'DOUBLE' ? 'doublePrice' : 'triplePrice';
  const baseAmount = new Decimal(period[priceKey]);
  const childUnitPrice = new Decimal(period.childPrice);
  const total = baseAmount.add(childUnitPrice.mul(childrenCount));

  return {
    packageId: product.id,
    packageTitle: product.title,
    packageTitleAr: product.titleAr,
    pricePeriodId: period.id,
    market,
    occupancy,
    travelDate: travelDate.toISOString().slice(0, 10),
    adultsCount,
    childrenCount,
    baseAmount,
    childUnitPrice,
    total,
    currency: period.currency,
    hotels: product.packageHotels.map((item: any) => ({
      id: item.id, hotelId: item.hotelId, hotelRateId: item.hotelRateId, name: item.hotel.name,
      roomName: item.hotelRate?.roomName ?? null, nights: item.nights, mealPlan: item.mealPlan,
    })),
    transfers: product.packageTransfers.map((item: any) => ({
      id: item.id, transportRateId: item.transportRateId, included: item.included,
      from: item.transportRate.fromName ?? item.transportRate.fromLocation,
      to: item.transportRate.toName ?? item.transportRate.toLocation,
      vehicleType: item.transportRate.vehicleType,
    })),
    activities: product.packageActivities.map((item: any) => ({
      id: item.id, activityId: item.activityId, name: item.activity.name, nameAr: item.activity.nameAr,
      dayNumber: item.dayNumber,
    })),
  };
}

export function packageResolutionFields(resolution: PackageCommercialResolution): Record<string, unknown> {
  return {
    packageId: resolution.packageId,
    packageTitle: resolution.packageTitle,
    packageTitleAr: resolution.packageTitleAr,
    packagePricePeriodId: resolution.pricePeriodId,
    packageMarket: resolution.market,
    packageTravelDate: resolution.travelDate,
    packageOccupancy: resolution.occupancy,
    packageAdultsCount: resolution.adultsCount,
    packageChildrenCount: resolution.childrenCount,
    packageBaseAmount: resolution.baseAmount.toNumber(),
    packageChildUnitPrice: resolution.childUnitPrice.toNumber(),
    packageResolvedTotal: resolution.total.toNumber(),
    packageCurrency: resolution.currency,
    // QuoteRequest.customFields is deliberately flat/sanitised. JSON snapshot
    // strings preserve what was sold without reopening nested client input.
    packageHotelsSnapshot: JSON.stringify(resolution.hotels),
    packageTransfersSnapshot: JSON.stringify(resolution.transfers),
    packageActivitiesSnapshot: JSON.stringify(resolution.activities),
  };
}
