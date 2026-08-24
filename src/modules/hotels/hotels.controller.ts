import { Request, Response } from 'express';
import { Decimal } from '@prisma/client/runtime/library';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/db';
import { paginate, paginateMeta } from '../../shared/helpers';
import { setJsonStringArray } from '../../shared/json-array';
import { resolveMarketPriceMap } from '../../shared/pricing';
import { resolveHotelRateMap } from './rates.controller';
import { groupByTag } from './images.controller';
import { syncEntityFromSheets } from '../sheets-sync/sheets-sync.service';

// Structured hotel policy fields — plain optional strings shown in the company
// hotel detail modal. Kept in one list so create/update stay in sync.
const POLICY_FIELDS = [
  'checkInTime', 'checkOutTime',
  'cancellationPolicy', 'cancellationPolicyAr',
  'childrenPolicy', 'childrenPolicyAr',
  'extraBedPolicy', 'extraBedPolicyAr',
  'mealPolicy', 'mealPolicyAr',
  'importantNotes', 'importantNotesAr',
] as const;

/**
 * Determine if a company can see this hotel's price.
 *
 * Two controls, in order: an explicit per-company decision wins, otherwise the
 * hotel's own switch. A company's tier used to gate this as well, which meant a
 * hotel could be hidden from an agent by a setting nobody could see on the
 * company — the per-company table says the same thing where it can be read.
 */
function canSeePrices(hotel: { showPriceToAgents: boolean }, override?: { canViewPrice: boolean } | null): boolean {
  if (override) return override.canViewPrice;
  return hotel.showPriceToAgents;
}

export async function listHotels(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const page = parseInt(String(req.query.page ?? '1'));
  const limit = parseInt(String(req.query.limit ?? '20'));
  const { skip, take } = paginate(page, limit);
  const search = String(req.query.search ?? '').trim();

  const priceFilter: Prisma.DecimalFilter | undefined = req.query.minPrice || req.query.maxPrice
    ? {
        ...(req.query.minPrice ? { gte: new Decimal(String(req.query.minPrice)) } : {}),
        ...(req.query.maxPrice ? { lte: new Decimal(String(req.query.maxPrice)) } : {}),
      }
    : undefined;

  // Boolean attribute filters — only applied when the query param equals 'true'
  const boolFilter = (key: string) => req.query[key] === 'true' ? { [key]: true } : {};

  const where: Prisma.HotelWhereInput = {
    ...(caller.role !== 'SUPERADMIN' && { isActive: true }),
    ...(req.query.city && { city: { contains: String(req.query.city), mode: 'insensitive' as const } }),
    ...(req.query.area && { area: { contains: String(req.query.area), mode: 'insensitive' as const } }),
    ...(req.query.stars && { stars: parseInt(String(req.query.stars)) }),
    ...(req.query.destinationId && { destinationId: String(req.query.destinationId) }),
    ...(priceFilter && { pricePerNight: priceFilter }),
    ...(req.query.currency && { currency: String(req.query.currency) }),
    // Structured amenity filters (sheet-driven)
    ...boolFilter('seaFront'),
    ...boolFilter('privateBeach'),
    ...boolFilter('sandyBeach'),
    ...boolFilter('kidsPool'),
    ...boolFilter('kidsClub'),
    ...boolFilter('aquaPark'),
    ...boolFilter('snorkeling'),
    ...boolFilter('diving'),
    ...boolFilter('adultsOnly'),
    ...boolFilter('allInclusive'),
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' as const } },
        { nameAr: { contains: search, mode: 'insensitive' as const } },
        { city: { contains: search, mode: 'insensitive' as const } },
        { cityAr: { contains: search, mode: 'insensitive' as const } },
        { country: { contains: search, mode: 'insensitive' as const } },
        { address: { contains: search, mode: 'insensitive' as const } },
        { description: { contains: search, mode: 'insensitive' as const } },
        { descriptionAr: { contains: search, mode: 'insensitive' as const } },
        {
          destination: {
            is: {
              OR: [
                { name: { contains: search, mode: 'insensitive' as const } },
                { nameAr: { contains: search, mode: 'insensitive' as const } },
                { slug: { contains: search, mode: 'insensitive' as const } },
              ],
            },
          },
        },
      ],
    }),
  };

  const [hotels, total] = await Promise.all([
    prisma.hotel.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { rooms: true } },
        destination: { select: { id: true, name: true, nameAr: true, slug: true } },
        ...(caller.role !== 'SUPERADMIN' && caller.companyId
          ? {
              companyVisibility: {
                where: { companyId: caller.companyId },
                select: { canViewPrice: true, canRequestQuote: true },
              },
            }
          : {}),
      },
    }),
    prisma.hotel.count({ where }),
  ]);

  // For non-admin users, prices resolve against the company's own market.
  let companyMarket: import('@prisma/client').Market | null = null;
  if (caller.role !== 'SUPERADMIN' && caller.companyId) {
    const company = await prisma.company.findUnique({
      where: { id: caller.companyId },
      select: { market: true },
    });
    companyMarket = company?.market ?? null;
  }

  // Explicit price overrides for this company's market AND company (verbatim, no FX)
  const companyId = caller.role !== 'SUPERADMIN' ? (caller.companyId ?? null) : null;
  const ids = hotels.map((h) => h.id);
  const [marketOverrides, rateMap] = await Promise.all([
    resolveMarketPriceMap('HOTEL', ids, { market: companyMarket, companyId }),
    caller.role !== 'SUPERADMIN' ? resolveHotelRateMap(ids, companyMarket) : Promise.resolve(new Map()),
  ]);

  const data = hotels.map((hotel) => {
    if (caller.role === 'SUPERADMIN') {
      return hotel; // Admin sees everything (base/Foreign price)
    }
    const visibilityOverride = 'companyVisibility' in hotel ? hotel.companyVisibility[0] : null;
    const showPrice = canSeePrices(hotel, visibilityOverride);
    const { companyVisibility: _companyVisibility, ...hotelData } = hotel as typeof hotel & { companyVisibility?: unknown };
    const ov = marketOverrides.get(hotel.id);
    const rateInfo = rateMap.get(hotel.id) as { fromPrice: Decimal | null; currency: string | null } | undefined;
    const hasRates = !!rateInfo && rateInfo.fromPrice != null;
    const displayPrice = hasRates ? rateInfo!.fromPrice : (ov?.amount ?? hotel.pricePerNight);
    return {
      ...hotelData,
      pricePerNight: showPrice ? displayPrice : null,
      currency: hasRates ? (rateInfo!.currency ?? hotel.currency) : (ov?.currency ?? hotel.currency),
      hasRateMatrix: hasRates,
      priceVisible: showPrice,
      canRequestQuote: visibilityOverride?.canRequestQuote ?? hotel.allowQuoteRequest,
    };
  });

  res.json({ success: true, data, meta: paginateMeta(total, page, limit) });
}

/** GET /api/hotels/areas?destinationId=&city= — distinct sub-areas for filter chips */
export async function listHotelAreas(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const where: Prisma.HotelWhereInput = {
    ...(caller.role !== 'SUPERADMIN' && { isActive: true }),
    area: { not: null },
    ...(req.query.destinationId && { destinationId: String(req.query.destinationId) }),
    ...(req.query.city && { city: { contains: String(req.query.city), mode: 'insensitive' as const } }),
  };
  const rows = await prisma.hotel.findMany({
    where,
    select: { area: true },
    distinct: ['area'],
    orderBy: { area: 'asc' },
  });
  const areas = rows.map(r => r.area).filter(Boolean) as string[];
  res.json({ success: true, data: areas });
}

export async function getHotel(req: Request, res: Response): Promise<void> {
  const caller = req.user!;

  const hotel = await prisma.hotel.findUnique({
    where: { id: req.params.id },
    include: {
      destination: { select: { id: true, name: true, nameAr: true, slug: true } },
      pricing: { where: { isActive: true }, orderBy: { validFrom: 'asc' } },
      // Tagged photos — what an agent shows a client who asks for "sea view".
      images: { orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }] },
      _count: { select: { rooms: true } },
      ...(caller.role !== 'SUPERADMIN' && caller.companyId
        ? {
            companyVisibility: {
              where: { companyId: caller.companyId },
              select: { canViewPrice: true, canRequestQuote: true },
            },
          }
        : {}),
    },
  });

  if (!hotel || (!hotel.isActive && caller.role !== 'SUPERADMIN')) {
    res.status(404).json({ success: false, error: 'NOT_FOUND' });
    return;
  }

  if (caller.role === 'SUPERADMIN') {
    res.json({ success: true, data: { ...hotel, imageGroups: groupByTag(hotel.images) } });
    return;
  }

  const company = caller.companyId
    ? await prisma.company.findUnique({ where: { id: caller.companyId }, select: { market: true } })
    : null;
  const visibilityOverride = 'companyVisibility' in hotel ? hotel.companyVisibility[0] : null;
  const showPrice = canSeePrices(hotel, visibilityOverride);
  const { companyVisibility: _companyVisibility, ...hotelData } = hotel as typeof hotel & { companyVisibility?: unknown };
  const ov = (await resolveMarketPriceMap('HOTEL', [hotel.id], { market: company?.market ?? null, companyId: caller.companyId ?? null })).get(hotel.id);
  const marketPrice = ov?.amount ?? hotel.pricePerNight;

  // Structured rate matrix for this company's market (explicit, no FX). When a
  // hotel has applicable rates we surface them and base the display price on the
  // cheapest rate — never the stale pricePerNight.
  const rateInfo = showPrice
    ? (await resolveHotelRateMap([hotel.id], company?.market ?? null)).get(hotel.id)
    : undefined;
  const hasRates = !!rateInfo && rateInfo.rates.length > 0;

  res.json({
    success: true,
    data: {
      ...hotelData,
      // When rate rows exist, the display price comes from them; otherwise fall
      // back to the explicit market override or the legacy base price.
      pricePerNight: showPrice ? (hasRates ? rateInfo!.fromPrice : marketPrice) : null,
      currency: hasRates ? (rateInfo!.currency ?? hotel.currency) : (ov?.currency ?? hotel.currency),
      rates: showPrice ? (rateInfo?.rates ?? []) : [],
      hasRateMatrix: hasRates,
      // Same photos, pre-grouped, so the portal does not regroup them per render.
      imageGroups: groupByTag(hotel.images),
      pricing: showPrice ? hotel.pricing : [],
      priceVisible: showPrice,
      canRequestQuote: visibilityOverride?.canRequestQuote ?? hotel.allowQuoteRequest,
    },
  });
}

export async function createHotel(req: Request, res: Response): Promise<void> {
  const body = req.body as {
    name: string; nameAr?: string; city: string; cityAr?: string;
    country: string; stars?: number; address: string;
    description?: string; descriptionAr?: string;
    amenities?: string[]; imageUrl?: string; galleryUrls?: string[];
    pricePerNight: number; currency?: string;
    showPriceToAgents?: boolean; allowQuoteRequest?: boolean;
    destinationId?: string; area?: string | null; googleRating?: number | null; isActive?: boolean;
  } & Partial<Record<(typeof POLICY_FIELDS)[number], string>>;

  const imageUrl = (req.file ? `/uploads/${req.file.filename}` : body.imageUrl) ?? undefined;

  const policyData: Record<string, string | null> = {};
  for (const f of POLICY_FIELDS) {
    if (body[f] !== undefined) policyData[f] = body[f] ? String(body[f]) : null;
  }

  const hotel = await prisma.hotel.create({
    data: {
      name: body.name,
      nameAr: body.nameAr,
      city: body.city,
      cityAr: body.cityAr,
      country: body.country,
      stars: body.stars ?? 3,
      address: body.address,
      description: body.description,
      descriptionAr: body.descriptionAr,
      amenities: setJsonStringArray(body.amenities),
      imageUrl,
      galleryUrls: setJsonStringArray(body.galleryUrls),
      pricePerNight: new Decimal(body.pricePerNight),
      currency: body.currency ?? 'USD',
      showPriceToAgents: body.showPriceToAgents ?? false,
      allowQuoteRequest: body.allowQuoteRequest ?? true,
      destinationId: body.destinationId ?? null,
      area: body.area ?? null,
      googleRating: body.googleRating == null ? null : new Decimal(Number(body.googleRating)),
      ...(body.isActive !== undefined ? { isActive: Boolean(body.isActive) } : {}),
      ...policyData,
      source: 'MANUAL',
    },
  });

  res.status(201).json({ success: true, data: hotel });
}

export async function updateHotel(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const data: Record<string, unknown> = {};

  if (body.name) data.name = String(body.name);
  if (body.nameAr !== undefined) data.nameAr = body.nameAr ? String(body.nameAr) : null;
  if (body.city) data.city = String(body.city);
  if (body.cityAr !== undefined) data.cityAr = body.cityAr ? String(body.cityAr) : null;
  if (body.country) data.country = String(body.country);
  if (body.stars !== undefined) data.stars = Number(body.stars);
  if (body.address) data.address = String(body.address);
  if (body.description !== undefined) data.description = body.description ? String(body.description) : null;
  if (body.descriptionAr !== undefined) data.descriptionAr = body.descriptionAr ? String(body.descriptionAr) : null;
  if (body.amenities !== undefined) data.amenities = setJsonStringArray(body.amenities);
  if (body.galleryUrls !== undefined) data.galleryUrls = setJsonStringArray(body.galleryUrls);
  if (body.imageUrl !== undefined) data.imageUrl = body.imageUrl ? String(body.imageUrl) : null;
  if (body.pricePerNight !== undefined) data.pricePerNight = new Decimal(Number(body.pricePerNight));
  if (body.currency) data.currency = String(body.currency);
  if (body.showPriceToAgents !== undefined) data.showPriceToAgents = Boolean(body.showPriceToAgents);
  if (body.allowQuoteRequest !== undefined) data.allowQuoteRequest = Boolean(body.allowQuoteRequest);
  if (body.destinationId !== undefined) data.destinationId = body.destinationId ? String(body.destinationId) : null;
  if (body.area !== undefined) data.area = body.area ? String(body.area) : null;
  if (body.googleRating !== undefined) data.googleRating = body.googleRating == null ? null : new Decimal(Number(body.googleRating));
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
  for (const f of POLICY_FIELDS) {
    if (body[f] !== undefined) data[f] = body[f] ? String(body[f]) : null;
  }
  if (req.file) data.imageUrl = `/uploads/${req.file.filename}`;

  const hotel = await prisma.hotel.update({
    where: { id: req.params.id },
    data,
  });

  res.json({ success: true, data: hotel });
}

export async function deleteHotel(req: Request, res: Response): Promise<void> {
  await prisma.hotel.update({ where: { id: req.params.id }, data: { isActive: false } });
  res.json({ success: true, data: null });
}

/** Toggle price visibility for a hotel (admin shortcut) */
export async function toggleHotelPriceVisibility(req: Request, res: Response): Promise<void> {
  const { showPriceToAgents } = req.body as { showPriceToAgents?: boolean };

  const hotel = await prisma.hotel.update({
    where: { id: req.params.id },
    data: { ...(showPriceToAgents !== undefined && { showPriceToAgents }) },
  });

  res.json({ success: true, data: hotel });
}

export async function listHotelCompanyVisibility(req: Request, res: Response): Promise<void> {
  const records = await prisma.hotelCompanyVisibility.findMany({
    where: { hotelId: req.params.id },
    include: {
      company: {
        select: { id: true, name: true, email: true, tier: true, currency: true, isActive: true },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  res.json({ success: true, data: records });
}

export async function upsertHotelCompanyVisibility(req: Request, res: Response): Promise<void> {
  const body = req.body as {
    companyId?: string;
    canViewPrice?: boolean;
    canRequestQuote?: boolean | null;
    note?: string | null;
  };

  if (!body.companyId) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'companyId is required' });
    return;
  }

  const record = await prisma.hotelCompanyVisibility.upsert({
    where: { hotelId_companyId: { hotelId: req.params.id, companyId: body.companyId } },
    create: {
      hotelId: req.params.id,
      companyId: body.companyId,
      canViewPrice: body.canViewPrice ?? false,
      canRequestQuote: body.canRequestQuote ?? null,
      note: body.note?.trim() || null,
    },
    update: {
      canViewPrice: body.canViewPrice ?? false,
      canRequestQuote: body.canRequestQuote ?? null,
      note: body.note?.trim() || null,
    },
    include: {
      company: {
        select: { id: true, name: true, email: true, tier: true, currency: true, isActive: true },
      },
    },
  });

  res.json({ success: true, data: record });
}

export async function deleteHotelCompanyVisibility(req: Request, res: Response): Promise<void> {
  await prisma.hotelCompanyVisibility.delete({
    where: { hotelId_companyId: { hotelId: req.params.id, companyId: req.params.companyId } },
  });
  res.json({ success: true, data: null });
}

export async function syncSheets(req: Request, res: Response): Promise<void> {
  try {
    const result = await syncEntityFromSheets('hotels', {
      spreadsheetId: typeof req.body?.spreadsheetId === 'string' ? req.body.spreadsheetId : undefined,
      triggeredById: req.user?.id,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: 'SYNC_FAILED', message: (error as Error).message });
  }
}
