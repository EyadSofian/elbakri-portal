import { Request, Response } from 'express';
import { Decimal } from '@prisma/client/runtime/library';
import { CompanyTier, Prisma } from '@prisma/client';
import { prisma } from '../../config/db';
import { paginate, paginateMeta } from '../../shared/helpers';
import { resolveMarketPriceMap } from '../../shared/pricing';
import { syncEntityFromSheets } from '../sheets-sync/sheets-sync.service';

const TIER_ORDER: Record<CompanyTier, number> = {
  STANDARD: 0,
  SILVER: 1,
  GOLD: 2,
  PLATINUM: 3,
};

/** Determine if a company can see this hotel's price */
function canSeePrices(hotel: {
  showPriceToAgents: boolean;
  minVisibleTier: CompanyTier | null;
}, companyTier: CompanyTier, override?: { canViewPrice: boolean } | null): boolean {
  if (override) return override.canViewPrice;
  if (!hotel.showPriceToAgents) return false;
  if (!hotel.minVisibleTier) return true;
  return TIER_ORDER[companyTier] >= TIER_ORDER[hotel.minVisibleTier];
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
    ...(req.query.city && { city: { contains: String(req.query.city), mode: 'insensitive' } }),
    ...(req.query.area && { area: { contains: String(req.query.area), mode: 'insensitive' } }),
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
        { name: { contains: search, mode: 'insensitive' } },
        { nameAr: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
        { cityAr: { contains: search, mode: 'insensitive' } },
        { country: { contains: search, mode: 'insensitive' } },
        { address: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { descriptionAr: { contains: search, mode: 'insensitive' } },
        {
          destination: {
            is: {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { nameAr: { contains: search, mode: 'insensitive' } },
                { slug: { contains: search, mode: 'insensitive' } },
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

  // For non-admin users, determine price visibility based on company tier + market
  let companyTier: CompanyTier = 'STANDARD';
  let companyMarket: import('@prisma/client').Market | null = null;
  if (caller.role !== 'SUPERADMIN' && caller.companyId) {
    const company = await prisma.company.findUnique({
      where: { id: caller.companyId },
      select: { tier: true, market: true },
    });
    companyTier = company?.tier ?? 'STANDARD';
    companyMarket = company?.market ?? null;
  }

  // Explicit price overrides for this company's market AND company (verbatim, no FX)
  const companyId = caller.role !== 'SUPERADMIN' ? (caller.companyId ?? null) : null;
  const marketOverrides = await resolveMarketPriceMap('HOTEL', hotels.map((h) => h.id), { market: companyMarket, companyId });

  const data = hotels.map((hotel) => {
    if (caller.role === 'SUPERADMIN') {
      return hotel; // Admin sees everything (base/Foreign price)
    }
    const visibilityOverride = 'companyVisibility' in hotel ? hotel.companyVisibility[0] : null;
    const showPrice = canSeePrices(hotel, companyTier, visibilityOverride);
    const { companyVisibility: _companyVisibility, ...hotelData } = hotel as typeof hotel & { companyVisibility?: unknown };
    const ov = marketOverrides.get(hotel.id);
    const marketPrice = ov?.amount ?? hotel.pricePerNight;
    return {
      ...hotelData,
      pricePerNight: showPrice ? marketPrice : null,
      currency: ov?.currency ?? hotel.currency,
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
    ...(req.query.city && { city: { contains: String(req.query.city), mode: 'insensitive' } }),
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
    res.json({ success: true, data: hotel });
    return;
  }

  const company = caller.companyId
    ? await prisma.company.findUnique({ where: { id: caller.companyId }, select: { tier: true, market: true } })
    : null;
  const companyTier: CompanyTier = company?.tier ?? 'STANDARD';
  const visibilityOverride = 'companyVisibility' in hotel ? hotel.companyVisibility[0] : null;
  const showPrice = canSeePrices(hotel, companyTier, visibilityOverride);
  const { companyVisibility: _companyVisibility, ...hotelData } = hotel as typeof hotel & { companyVisibility?: unknown };
  const ov = (await resolveMarketPriceMap('HOTEL', [hotel.id], { market: company?.market ?? null, companyId: caller.companyId ?? null })).get(hotel.id);
  const marketPrice = ov?.amount ?? hotel.pricePerNight;

  res.json({
    success: true,
    data: {
      ...hotelData,
      pricePerNight: showPrice ? marketPrice : null,
      currency: ov?.currency ?? hotel.currency,
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
    commissionPercent?: number; availableRooms?: number; maxGuestsPerRoom?: number;
    showPriceToAgents?: boolean; allowQuoteRequest?: boolean; minVisibleTier?: CompanyTier;
    destinationId?: string;
  };

  const imageUrl = (req.file ? `/uploads/${req.file.filename}` : body.imageUrl) ?? undefined;

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
      amenities: body.amenities ?? [],
      imageUrl,
      galleryUrls: body.galleryUrls ?? [],
      pricePerNight: new Decimal(body.pricePerNight),
      currency: body.currency ?? 'USD',
      commissionPercent: new Decimal(body.commissionPercent ?? 0),
      availableRooms: body.availableRooms ?? 0,
      maxGuestsPerRoom: body.maxGuestsPerRoom ?? 2,
      showPriceToAgents: body.showPriceToAgents ?? false,
      allowQuoteRequest: body.allowQuoteRequest ?? true,
      minVisibleTier: body.minVisibleTier ?? null,
      destinationId: body.destinationId ?? null,
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
  if (body.amenities) data.amenities = body.amenities as string[];
  if (body.galleryUrls !== undefined) data.galleryUrls = Array.isArray(body.galleryUrls) ? (body.galleryUrls as string[]) : [];
  if (body.imageUrl !== undefined) data.imageUrl = body.imageUrl ? String(body.imageUrl) : null;
  if (body.pricePerNight !== undefined) data.pricePerNight = new Decimal(Number(body.pricePerNight));
  if (body.currency) data.currency = String(body.currency);
  if (body.commissionPercent !== undefined) data.commissionPercent = new Decimal(Number(body.commissionPercent));
  if (body.availableRooms !== undefined) data.availableRooms = Number(body.availableRooms);
  if (body.maxGuestsPerRoom !== undefined) data.maxGuestsPerRoom = Number(body.maxGuestsPerRoom);
  if (body.showPriceToAgents !== undefined) data.showPriceToAgents = Boolean(body.showPriceToAgents);
  if (body.allowQuoteRequest !== undefined) data.allowQuoteRequest = Boolean(body.allowQuoteRequest);
  if (body.minVisibleTier !== undefined) data.minVisibleTier = body.minVisibleTier as CompanyTier | null;
  if (body.destinationId !== undefined) data.destinationId = body.destinationId ? String(body.destinationId) : null;
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
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
  const { showPriceToAgents, minVisibleTier } = req.body as {
    showPriceToAgents?: boolean;
    minVisibleTier?: CompanyTier | null;
  };

  const hotel = await prisma.hotel.update({
    where: { id: req.params.id },
    data: {
      ...(showPriceToAgents !== undefined && { showPriceToAgents }),
      ...(minVisibleTier !== undefined && { minVisibleTier: minVisibleTier ?? null }),
    },
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
