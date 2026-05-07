import { Request, Response } from 'express';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../config/db';
import { paginate, paginateMeta } from '../../shared/helpers';
import { syncEntityFromSheets } from '../sheets-sync/sheets-sync.service';

export async function listHotels(req: Request, res: Response): Promise<void> {
  const page = parseInt(String(req.query.page ?? '1'));
  const limit = parseInt(String(req.query.limit ?? '20'));
  const { skip, take } = paginate(page, limit);

  const where = {
    isActive: true,
    ...(req.query.city && { city: { contains: String(req.query.city), mode: 'insensitive' as const } }),
    ...(req.query.stars && { stars: parseInt(String(req.query.stars)) }),
    ...(req.query.minPrice && { pricePerNight: { gte: new Decimal(String(req.query.minPrice)) } }),
    ...(req.query.maxPrice && {
      pricePerNight: {
        ...(req.query.minPrice ? { gte: new Decimal(String(req.query.minPrice)) } : {}),
        lte: new Decimal(String(req.query.maxPrice)),
      },
    }),
    ...(req.query.currency && { currency: String(req.query.currency) }),
  };

  const [hotels, total] = await Promise.all([
    prisma.hotel.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { rooms: true } } },
    }),
    prisma.hotel.count({ where }),
  ]);

  res.json({ success: true, data: hotels, meta: paginateMeta(total, page, limit) });
}

export async function createHotel(req: Request, res: Response): Promise<void> {
  const body = req.body as {
    name: string; nameAr?: string; city: string; cityAr?: string;
    country: string; stars?: number; address: string;
    description?: string; descriptionAr?: string;
    amenities?: string[]; imageUrl?: string;
    pricePerNight: number; currency?: string;
    commissionPercent?: number; availableRooms?: number; maxGuestsPerRoom?: number;
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
  if (body.amenities) data.amenities = body.amenities as string[];
  if (body.imageUrl !== undefined) data.imageUrl = body.imageUrl ? String(body.imageUrl) : null;
  if (body.pricePerNight !== undefined) data.pricePerNight = new Decimal(Number(body.pricePerNight));
  if (body.currency) data.currency = String(body.currency);
  if (body.commissionPercent !== undefined) data.commissionPercent = new Decimal(Number(body.commissionPercent));
  if (body.availableRooms !== undefined) data.availableRooms = Number(body.availableRooms);
  if (body.maxGuestsPerRoom !== undefined) data.maxGuestsPerRoom = Number(body.maxGuestsPerRoom);

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
