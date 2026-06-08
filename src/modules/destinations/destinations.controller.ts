import { Request, Response } from 'express';
import { DestinationType } from '@prisma/client';
import { prisma } from '../../config/db';
import { paginate, paginateMeta } from '../../shared/helpers';

export async function listDestinations(req: Request, res: Response): Promise<void> {
  const page = parseInt(String(req.query.page ?? '1'));
  const limit = parseInt(String(req.query.limit ?? '100'));
  const { skip, take } = paginate(page, limit);

  const where = {
    ...(req.query.isActive !== 'false' && { isActive: true }),
    ...(req.query.country && { country: String(req.query.country) }),
    ...(req.query.type && { type: req.query.type as DestinationType }),
    ...(req.query.q && {
      OR: [
        { name: { contains: String(req.query.q), mode: 'insensitive' as const } },
        { nameAr: { contains: String(req.query.q), mode: 'insensitive' as const } },
        { slug: { contains: String(req.query.q), mode: 'insensitive' as const } },
      ],
    }),
  };

  const [destinations, total] = await Promise.all([
    prisma.destination.findMany({
      where,
      skip,
      take,
      orderBy: { name: 'asc' },
    }),
    prisma.destination.count({ where }),
  ]);

  res.json({ success: true, data: destinations, meta: paginateMeta(total, page, limit) });
}

export async function getDestination(req: Request, res: Response): Promise<void> {
  const dest = await prisma.destination.findUnique({
    where: { id: req.params.id },
    include: {
      _count: {
        select: { hotels: true, activities: true, transportRates: true },
      },
    },
  });

  if (!dest) {
    res.status(404).json({ success: false, error: 'NOT_FOUND' });
    return;
  }

  res.json({ success: true, data: dest });
}

export async function createDestination(req: Request, res: Response): Promise<void> {
  const body = req.body as {
    name: string; nameAr?: string; slug: string;
    country?: string; region?: string; type?: DestinationType; imageUrl?: string | null;
  };

  if (!body.name || !body.slug) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'name and slug are required' });
    return;
  }

  const existing = await prisma.destination.findUnique({ where: { slug: body.slug } });
  if (existing) {
    res.status(409).json({ success: false, error: 'SLUG_EXISTS', message: 'A destination with this slug already exists' });
    return;
  }

  const dest = await prisma.destination.create({
    data: {
      name: body.name,
      nameAr: body.nameAr ?? null,
      slug: body.slug.toLowerCase().replace(/\s+/g, '-'),
      country: body.country ?? 'EG',
      region: body.region ?? null,
      type: body.type ?? 'CITY',
      imageUrl: body.imageUrl ?? null,
    },
  });

  res.status(201).json({ success: true, data: dest });
}

export async function updateDestination(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const data: Record<string, unknown> = {};

  if (body.name !== undefined) data.name = String(body.name);
  if (body.nameAr !== undefined) data.nameAr = body.nameAr ? String(body.nameAr) : null;
  if (body.slug !== undefined) data.slug = String(body.slug).toLowerCase().replace(/\s+/g, '-');
  if (body.country !== undefined) data.country = String(body.country);
  if (body.region !== undefined) data.region = body.region ? String(body.region) : null;
  if (body.type !== undefined) data.type = body.type as DestinationType;
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
  if (body.imageUrl !== undefined) data.imageUrl = body.imageUrl ? String(body.imageUrl) : null;

  const dest = await prisma.destination.update({
    where: { id: req.params.id },
    data,
  });

  res.json({ success: true, data: dest });
}

export async function deleteDestination(req: Request, res: Response): Promise<void> {
  // Check if destination has active hotels or activities
  const dest = await prisma.destination.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { hotels: true, activities: true } } },
  });

  if (!dest) {
    res.status(404).json({ success: false, error: 'NOT_FOUND' });
    return;
  }

  if (dest._count.hotels > 0 || dest._count.activities > 0) {
    // Soft deactivate instead of delete
    await prisma.destination.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ success: true, data: { mode: 'DEACTIVATED' } });
    return;
  }

  await prisma.destination.delete({ where: { id: req.params.id } });
  res.json({ success: true, data: { mode: 'DELETED' } });
}
