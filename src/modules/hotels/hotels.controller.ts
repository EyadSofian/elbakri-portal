import { Request, Response } from 'express';
import { Decimal } from '@prisma/client/runtime/library';
import { CompanyTier } from '@prisma/client';
import { prisma } from '../../config/db';
import { paginate, paginateMeta } from '../../shared/helpers';
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
}, companyTier: CompanyTier): boolean {
  if (!hotel.showPriceToAgents) return false;
  if (!hotel.minVisibleTier) return true;
  return TIER_ORDER[companyTier] >= TIER_ORDER[hotel.minVisibleTier];
}

export async function listHotels(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const page = parseInt(String(req.query.page ?? '1'));
  const limit = parseInt(String(req.query.limit ?? '20'));
  const { skip, take } = paginate(page, limit);

  const where = {
    isActive: true,
    ...(req.query.city && { city: { contains: String(req.query.city), mode: 'insensitive' as const } }),
    ...(req.query.stars && { stars: parseInt(String(req.query.stars)) }),
    ...(req.query.destinationId && { destinationId: String(req.query.destinationId) }),
    ...(req.query.minPrice && { pricePerNight: { gte: new Decimal(String(req.query.minPrice)) } }),
    ...(req.query.maxPrice && {
      pricePerNight: {
        ...(req.query.minPrice ? { gte: new Decimal(String(req.query.minPrice)) } : {}),
        lte: new Decimal(String(req.query.maxPrice)),
      },
    }),
    ...(req.query.currency && { currency: String(req.query.currency) }),
  };

  // For admin, include all hotels including inactive
  const adminWhere = caller.role === 'SUPERADMIN'
    ? { ...where, isActive: undefined }
    : where;

  const [hotels, total] = await Promise.all([
    prisma.hotel.findMany({
      where: adminWhere,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { rooms: true } },
        destination: { select: { id: true, name: true, nameAr: true, slug: true } },
      },
    }),
    prisma.hotel.count({ where: adminWhere }),
  ]);

  // For non-admin users, determine price visibility based on company tier
  let companyTier: CompanyTier = 'STANDARD';
  if (caller.role !== 'SUPERADMIN' && caller.companyId) {
    const company = await prisma.company.findUnique({
      where: { id: caller.companyId },
      select: { tier: true },
    });
    companyTier = company?.tier ?? 'STANDARD';
  }

  const data = hotels.map((hotel) => {
    if (caller.role === 'SUPERADMIN') {
      return hotel; // Admin sees everything
    }
    const showPrice = canSeePrices(hotel, companyTier);
    return {
      ...hotel,
      pricePerNight: showPrice ? hotel.pricePerNight : null,
      priceVisible: showPrice,
      // Always allow quote requests unless explicitly disabled
      canRequestQuote: hotel.allowQuoteRequest,
    };
  });

  res.json({ success: true, data, meta: paginateMeta(total, page, limit) });
}

export async function getHotel(req: Request, res: Response): Promise<void> {
  const caller = req.user!;

  const hotel = await prisma.hotel.findUnique({
    where: { id: req.params.id },
    include: {
      destination: { select: { id: true, name: true, nameAr: true, slug: true } },
      pricing: { where: { isActive: true }, orderBy: { validFrom: 'asc' } },
      _count: { select: { rooms: true } },
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
    ? await prisma.company.findUnique({ where: { id: caller.companyId }, select: { tier: true } })
    : null;
  const companyTier: CompanyTier = company?.tier ?? 'STANDARD';
  const showPrice = canSeePrices(hotel, companyTier);

  res.json({
    success: true,
    data: {
      ...hotel,
      pricePerNight: showPrice ? hotel.pricePerNight : null,
      pricing: showPrice ? hotel.pricing : [],
      priceVisible: showPrice,
      canRequestQuote: hotel.allowQuoteRequest,
    },
  });
}

export async function createHotel(req: Request, res: Response): Promise<void> {
  const body = req.body as {
    name: string; nameAr?: string; city: string; cityAr?: string;
    country: string; stars?: number; address: string;
    description?: string; descriptionAr?: string;
    amenities?: string[]; imageUrl?: string;
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
