import { Request, Response } from 'express';
import { prisma } from '../../config/db';
import { sendError } from '../../shared/http';
import { syncRetirableRows } from '../../shared/retirable-sync';
import {
  normalizePackageComponents,
  packageAudience,
  PackageComponentsInput,
  resolvePackagePrice,
  validatePackageReferences,
} from './package-commercial.service';

export const offerKind = (value: unknown) => String(value ?? '').toUpperCase() === 'PACKAGE' ? 'PACKAGE' : 'OFFER';
const jsonRows = (value: unknown) => Array.isArray(value) ? value : [];
export const packageData = normalizePackageComponents;

const packageInclude = {
  packageHotels: {
    where: { retiredAt: null }, orderBy: { displayOrder: 'asc' as const },
    include: { hotel: { select: { id: true, name: true, nameAr: true, isActive: true } }, hotelRate: { select: { id: true, roomName: true, mealPlan: true, isActive: true } } },
  },
  packageTransfers: {
    where: { retiredAt: null }, orderBy: { displayOrder: 'asc' as const },
    include: { transportRate: { select: { id: true, fromName: true, fromLocation: true, toName: true, toLocation: true, vehicleType: true, serviceNameEn: true, serviceNameAr: true, isActive: true } } },
  },
  packageActivities: {
    where: { retiredAt: null }, orderBy: { displayOrder: 'asc' as const },
    include: { activity: { select: { id: true, name: true, nameAr: true, city: true, isActive: true } } },
  },
  packagePricePeriods: { where: { retiredAt: null }, orderBy: { validFrom: 'asc' as const } },
} as const;

function legacyComponents(offer: any) {
  return { hotelItems: jsonRows(offer.hotelItems), transferItems: jsonRows(offer.transferItems), activityItems: jsonRows(offer.activityItems), pricingPeriods: jsonRows(offer.pricingPeriods) };
}

function relationalComponents(offer: any, audience?: 'EGYPTIAN' | 'FOREIGN') {
  const periods = (offer.packagePricePeriods ?? []).filter((period: any) => !audience || packageAudience(period.market) === audience);
  return {
    hotelItems: (offer.packageHotels ?? []).map((item: any) => ({
      id: item.id, hotelId: item.hotelId, hotelRateId: item.hotelRateId, nights: item.nights, mealPlan: item.mealPlan,
      name: item.hotel?.name, nameAr: item.hotel?.nameAr, roomName: item.hotelRate?.roomName ?? null,
    })),
    transferItems: (offer.packageTransfers ?? []).map((item: any) => ({
      id: item.id, transportRateId: item.transportRateId, included: item.included,
      from: item.transportRate?.fromName ?? item.transportRate?.fromLocation,
      to: item.transportRate?.toName ?? item.transportRate?.toLocation,
      vehicleType: item.transportRate?.vehicleType, serviceName: item.transportRate?.serviceNameEn, serviceNameAr: item.transportRate?.serviceNameAr,
    })),
    activityItems: (offer.packageActivities ?? []).map((item: any) => ({
      id: item.id, activityId: item.activityId, dayNumber: item.dayNumber,
      name: item.activity?.name, nameAr: item.activity?.nameAr, city: item.activity?.city,
    })),
    pricingPeriods: periods.map((period: any) => ({
      id: period.id, validFrom: period.validFrom.toISOString().slice(0, 10), validTo: period.validTo.toISOString().slice(0, 10),
      market: packageAudience(period.market), currency: period.currency,
      singlePrice: Number(period.singlePrice), doublePrice: Number(period.doublePrice), triplePrice: Number(period.triplePrice), childPrice: Number(period.childPrice),
    })),
  };
}

export function presentOffer(offer: any, audience?: 'EGYPTIAN' | 'FOREIGN') {
  if (offer.kind !== 'PACKAGE') return offer;
  const configured = (offer.packageHotels?.length ?? 0) > 0 && !offer.packageNeedsConfiguration;
  const components = configured ? relationalComponents(offer, audience) : legacyComponents(offer);
  if (audience && !configured) components.pricingPeriods = [];
  const { packageHotels, packageTransfers, packageActivities, packagePricePeriods, ...publicOffer } = offer;
  return { ...publicOffer, ...components, packageConfigured: configured };
}

async function callerAudience(req: Request): Promise<'EGYPTIAN' | 'FOREIGN' | undefined> {
  if (req.user!.role === 'SUPERADMIN') return undefined;
  if (!req.user!.companyId) return 'FOREIGN';
  const company = await prisma.company.findUnique({ where: { id: req.user!.companyId }, select: { market: true } });
  return packageAudience(company?.market);
}

async function syncPackageComponents(tx: any, offerId: string, input: PackageComponentsInput) {
  const [hotels, transfers, activities, periods] = await Promise.all([
    tx.commercialPackageHotel.findMany({ where: { offerId } }),
    tx.commercialPackageTransfer.findMany({ where: { offerId } }),
    tx.commercialPackageActivity.findMany({ where: { offerId } }),
    tx.commercialPackagePricePeriod.findMany({ where: { offerId } }),
  ]);
  await syncRetirableRows({
    existing: hotels, incoming: input.hotelItems, incomingId: (row) => row.id, invalidIdError: 'PACKAGE_HOTEL_COMPONENT_NOT_FOUND',
    update: (existing, row, index) => tx.commercialPackageHotel.update({ where: { id: existing.id }, data: { hotelId: row.hotelId, hotelRateId: row.hotelRateId, nights: row.nights, mealPlan: row.mealPlan, displayOrder: index, retiredAt: null } }),
    create: (row, index) => tx.commercialPackageHotel.create({ data: { offerId, hotelId: row.hotelId, hotelRateId: row.hotelRateId, nights: row.nights, mealPlan: row.mealPlan, displayOrder: index } }),
    retire: (existing) => tx.commercialPackageHotel.update({ where: { id: existing.id }, data: { retiredAt: new Date() } }),
  });
  await syncRetirableRows({
    existing: transfers, incoming: input.transferItems, incomingId: (row) => row.id, invalidIdError: 'PACKAGE_TRANSFER_COMPONENT_NOT_FOUND',
    update: (existing, row, index) => tx.commercialPackageTransfer.update({ where: { id: existing.id }, data: { transportRateId: row.transportRateId, included: row.included, displayOrder: index, retiredAt: null } }),
    create: (row, index) => tx.commercialPackageTransfer.create({ data: { offerId, transportRateId: row.transportRateId, included: row.included, displayOrder: index } }),
    retire: (existing) => tx.commercialPackageTransfer.update({ where: { id: existing.id }, data: { retiredAt: new Date() } }),
  });
  await syncRetirableRows({
    existing: activities, incoming: input.activityItems, incomingId: (row) => row.id, invalidIdError: 'PACKAGE_ACTIVITY_COMPONENT_NOT_FOUND',
    update: (existing, row, index) => tx.commercialPackageActivity.update({ where: { id: existing.id }, data: { activityId: row.activityId, dayNumber: row.dayNumber, displayOrder: index, retiredAt: null } }),
    create: (row, index) => tx.commercialPackageActivity.create({ data: { offerId, activityId: row.activityId, dayNumber: row.dayNumber, displayOrder: index } }),
    retire: (existing) => tx.commercialPackageActivity.update({ where: { id: existing.id }, data: { retiredAt: new Date() } }),
  });
  await syncRetirableRows({
    existing: periods, incoming: input.pricingPeriods, incomingId: (row) => row.id, invalidIdError: 'PACKAGE_PRICE_PERIOD_NOT_FOUND',
    update: (existing, row) => tx.commercialPackagePricePeriod.update({ where: { id: existing.id }, data: { market: row.market, currency: row.currency, validFrom: new Date(`${row.validFrom}T00:00:00.000Z`), validTo: new Date(`${row.validTo}T23:59:59.999Z`), singlePrice: row.singlePrice, doublePrice: row.doublePrice, triplePrice: row.triplePrice, childPrice: row.childPrice, retiredAt: null } }),
    create: (row) => tx.commercialPackagePricePeriod.create({ data: { offerId, market: row.market, currency: row.currency, validFrom: new Date(`${row.validFrom}T00:00:00.000Z`), validTo: new Date(`${row.validTo}T23:59:59.999Z`), singlePrice: row.singlePrice, doublePrice: row.doublePrice, triplePrice: row.triplePrice, childPrice: row.childPrice } }),
    retire: (existing) => tx.commercialPackagePricePeriod.update({ where: { id: existing.id }, data: { retiredAt: new Date() } }),
  });
}

const packageErrors = new Set([
  'PACKAGE_HOTEL_REQUIRED', 'PACKAGE_HOTEL_INVALID', 'PACKAGE_TRANSFER_INVALID', 'PACKAGE_ACTIVITY_INVALID', 'PACKAGE_PRICE_PERIOD_REQUIRED',
  'PACKAGE_PRICE_PERIOD_INVALID', 'PACKAGE_PERIOD_OVERLAP', 'PACKAGE_HOTEL_DUPLICATE', 'PACKAGE_TRANSFER_DUPLICATE', 'PACKAGE_ACTIVITY_DUPLICATE',
  'PACKAGE_HOTEL_NOT_AVAILABLE', 'PACKAGE_HOTEL_RATE_NOT_AVAILABLE', 'PACKAGE_HOTEL_RATE_MISMATCH', 'PACKAGE_MEAL_PLAN_NOT_AVAILABLE',
  'PACKAGE_TRANSFER_NOT_AVAILABLE', 'PACKAGE_TRANSFER_ROUTE_REQUIRED', 'PACKAGE_ACTIVITY_NOT_AVAILABLE', 'PACKAGE_HOTEL_COMPONENT_NOT_FOUND',
  'PACKAGE_TRANSFER_COMPONENT_NOT_FOUND', 'PACKAGE_ACTIVITY_COMPONENT_NOT_FOUND', 'PACKAGE_PRICE_PERIOD_NOT_FOUND',
]);

function handlePackageError(res: Response, err: unknown): boolean {
  const code = String((err as Error)?.message ?? '');
  if (!packageErrors.has(code)) return false;
  res.status(400).json({ success: false, error: code, message: code });
  return true;
}

export async function listOffers(req: Request, res: Response) {
  try {
    const { activeOnly, kind, page = '1', limit = '50' } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const where: Record<string, unknown> = {};
    const requestedKind = kind ? offerKind(kind) : undefined;
    if (requestedKind) where.kind = requestedKind;
    if (activeOnly === 'true') {
      const now = new Date();
      where.isActive = true;
      if (requestedKind === 'PACKAGE') where.packageNeedsConfiguration = false;
      where.OR = [{ validFrom: null }, { validFrom: { lte: now } }];
      where.AND = [
        { OR: [{ validTo: null }, { validTo: { gte: now } }] },
        // A dashboard-wide active count must not advertise a legacy package
        // whose free-text components have not yet been linked to real records.
        ...(!requestedKind ? [{ OR: [{ kind: { not: 'PACKAGE' } }, { packageNeedsConfiguration: false }] }] : []),
      ];
    }
    const [offers, total, audience] = await Promise.all([
      prisma.offer.findMany({ where, include: packageInclude, orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }], skip: (pageNum - 1) * limitNum, take: limitNum }),
      prisma.offer.count({ where }), callerAudience(req),
    ]);
    res.json({ success: true, data: offers.map((offer) => presentOffer(offer, audience)), meta: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) } });
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', undefined, err); }
}

export async function getOffer(req: Request, res: Response) {
  try {
    const offer = await prisma.offer.findUnique({ where: { id: req.params.id }, include: packageInclude });
    if (!offer) return res.status(404).json({ success: false, message: 'Offer not found' });
    if (req.user!.role !== 'SUPERADMIN' && (!offer.isActive || (offer.kind === 'PACKAGE' && offer.packageNeedsConfiguration))) return res.status(404).json({ success: false, error: 'NOT_FOUND' });
    res.json({ success: true, data: presentOffer(offer, await callerAudience(req)) });
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', undefined, err); }
}

export async function resolveOfferPackage(req: Request, res: Response) {
  try {
    if (!req.user!.companyId) return res.status(400).json({ success: false, error: 'COMPANY_REQUIRED' });
    const resolution = await resolvePackagePrice({ packageId: req.params.id, companyId: req.user!.companyId, travelDate: String(req.body.travelDate ?? ''), occupancy: String(req.body.occupancy ?? ''), adultsCount: req.body.adultsCount, childrenCount: req.body.childrenCount });
    res.json({ success: true, data: { ...resolution, baseAmount: resolution.baseAmount.toNumber(), childUnitPrice: resolution.childUnitPrice.toNumber(), total: resolution.total.toNumber() } });
  } catch (err) {
    const code = String((err as Error).message || 'PACKAGE_PRICE_NOT_AVAILABLE');
    res.status(400).json({ success: false, error: code, message: code });
  }
}

export async function createOffer(req: Request, res: Response) {
  try {
    const body = req.body as Record<string, any>;
    if (!String(body.title ?? '').trim()) return res.status(400).json({ success: false, error: 'TITLE_REQUIRED' });
    const kind = offerKind(body.kind);
    const components = kind === 'PACKAGE' ? normalizePackageComponents(body) : null;
    if (components) await validatePackageReferences(components);
    const offer = await prisma.$transaction(async (tx) => {
      const created = await tx.offer.create({ data: {
        title: String(body.title).trim(), titleAr: body.titleAr || null, description: body.description || null, descriptionAr: body.descriptionAr || null,
        imageUrl: body.imageUrl || null, kind, hotelItems: kind === 'OFFER' ? jsonRows(body.hotelItems) : [], transferItems: kind === 'OFFER' ? jsonRows(body.transferItems) : [],
        activityItems: kind === 'OFFER' ? jsonRows(body.activityItems) : [], pricingPeriods: kind === 'OFFER' ? jsonRows(body.pricingPeriods) : [], packageNeedsConfiguration: false,
        serviceType: body.serviceType || null, ctaLabel: body.ctaLabel || null, ctaLabelAr: body.ctaLabelAr || null, ctaAction: body.ctaAction || null,
        validFrom: body.validFrom ? new Date(body.validFrom) : null, validTo: body.validTo ? new Date(body.validTo) : null,
        priority: body.priority !== undefined ? parseInt(body.priority) : 0, isActive: body.isActive !== undefined ? Boolean(body.isActive) : true,
      } });
      if (components) await syncPackageComponents(tx, created.id, components);
      return tx.offer.findUniqueOrThrow({ where: { id: created.id }, include: packageInclude });
    });
    res.status(201).json({ success: true, data: presentOffer(offer) });
  } catch (err) { if (!handlePackageError(res, err)) sendError(res, 500, 'INTERNAL_ERROR', undefined, err); }
}

export async function updateOffer(req: Request, res: Response) {
  try {
    const body = req.body as Record<string, any>;
    const existing = await prisma.offer.findUnique({ where: { id: req.params.id }, include: packageInclude });
    if (!existing) return res.status(404).json({ success: false, message: 'Offer not found' });
    const kind = body.kind === undefined ? existing.kind : offerKind(body.kind);
    const componentKeys = ['hotelItems', 'transferItems', 'activityItems', 'pricingPeriods'];
    const mutatesComponents = componentKeys.some((key) => body[key] !== undefined) || (existing.kind !== 'PACKAGE' && kind === 'PACKAGE');
    let components: PackageComponentsInput | null = null;
    if (kind === 'PACKAGE' && mutatesComponents) {
      const current = relationalComponents(existing);
      components = normalizePackageComponents(Object.fromEntries(componentKeys.map((key) => [key, body[key] === undefined ? (current as any)[key] : body[key]])));
      await validatePackageReferences(components);
    }
    const updated = await prisma.$transaction(async (tx) => {
      await tx.offer.update({ where: { id: existing.id }, data: {
        ...(body.title !== undefined && { title: String(body.title).trim() }), ...(body.titleAr !== undefined && { titleAr: body.titleAr || null }),
        ...(body.description !== undefined && { description: body.description || null }), ...(body.descriptionAr !== undefined && { descriptionAr: body.descriptionAr || null }),
        ...(body.imageUrl !== undefined && { imageUrl: body.imageUrl || null }), ...(body.kind !== undefined && { kind }), ...(components && { packageNeedsConfiguration: false }),
        ...(kind === 'OFFER' && body.hotelItems !== undefined && { hotelItems: jsonRows(body.hotelItems) }), ...(kind === 'OFFER' && body.transferItems !== undefined && { transferItems: jsonRows(body.transferItems) }),
        ...(kind === 'OFFER' && body.activityItems !== undefined && { activityItems: jsonRows(body.activityItems) }), ...(kind === 'OFFER' && body.pricingPeriods !== undefined && { pricingPeriods: jsonRows(body.pricingPeriods) }),
        ...(body.serviceType !== undefined && { serviceType: body.serviceType || null }), ...(body.ctaLabel !== undefined && { ctaLabel: body.ctaLabel || null }),
        ...(body.ctaLabelAr !== undefined && { ctaLabelAr: body.ctaLabelAr || null }), ...(body.ctaAction !== undefined && { ctaAction: body.ctaAction || null }),
        ...(body.validFrom !== undefined && { validFrom: body.validFrom ? new Date(body.validFrom) : null }), ...(body.validTo !== undefined && { validTo: body.validTo ? new Date(body.validTo) : null }),
        ...(body.priority !== undefined && { priority: parseInt(body.priority) }), ...(body.isActive !== undefined && { isActive: Boolean(body.isActive) }),
      } });
      if (components) await syncPackageComponents(tx, existing.id, components);
      return tx.offer.findUniqueOrThrow({ where: { id: existing.id }, include: packageInclude });
    });
    res.json({ success: true, data: presentOffer(updated) });
  } catch (err) { if (!handlePackageError(res, err)) sendError(res, 500, 'INTERNAL_ERROR', undefined, err); }
}

export async function deleteOffer(req: Request, res: Response) {
  try {
    const existing = await prisma.offer.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Offer not found' });
    if (existing.kind === 'PACKAGE') {
      await prisma.offer.update({ where: { id: existing.id }, data: { isActive: false } });
      return res.json({ success: true, message: 'Package deactivated; commercial history preserved' });
    }
    await prisma.offer.delete({ where: { id: existing.id } });
    res.json({ success: true, message: 'Deleted' });
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', undefined, err); }
}

export async function getActiveOffer(_req: Request, res: Response) {
  try {
    const now = new Date();
    const offer = await prisma.offer.findFirst({ where: { kind: 'OFFER', isActive: true, OR: [{ validFrom: null }, { validFrom: { lte: now } }], AND: [{ OR: [{ validTo: null }, { validTo: { gte: now } }] }] }, orderBy: { priority: 'desc' } });
    res.json({ success: true, data: offer || null });
  } catch (err) { sendError(res, 500, 'INTERNAL_ERROR', undefined, err); }
}
