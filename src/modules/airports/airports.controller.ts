import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/db';

function str(v: unknown): string {
  return String(v ?? '').trim();
}
function strOrNull(v: unknown): string | null {
  const s = str(v);
  return s || null;
}
function boolValue(v: unknown, fallback = true): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.toLowerCase() === 'true';
  return fallback;
}

/** GET /api/airports — active airports (admin can pass ?includeInactive=true). */
export async function listAirports(req: Request, res: Response): Promise<void> {
  const includeInactive = req.user?.role === 'SUPERADMIN' && req.query.includeInactive === 'true';
  const airports = await prisma.airport.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: [{ code: 'asc' }],
  });
  res.json({ success: true, data: airports });
}

export async function createAirport(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const code = str(body.code).toUpperCase();
  const nameEn = str(body.nameEn);
  if (!code || !nameEn) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'code and nameEn are required' });
    return;
  }
  try {
    const airport = await prisma.airport.create({
      data: {
        code,
        nameEn,
        nameAr: strOrNull(body.nameAr),
        city: strOrNull(body.city),
        cityAr: strOrNull(body.cityAr),
        isActive: boolValue(body.isActive),
      },
    });
    res.status(201).json({ success: true, data: airport });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      res.status(400).json({ success: false, error: 'DUPLICATE_CODE', message: `An airport with code ${code} already exists.` });
      return;
    }
    throw err;
  }
}

export async function updateAirport(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  if (body.code !== undefined) data.code = str(body.code).toUpperCase();
  if (body.nameEn !== undefined) data.nameEn = str(body.nameEn);
  if (body.nameAr !== undefined) data.nameAr = strOrNull(body.nameAr);
  if (body.city !== undefined) data.city = strOrNull(body.city);
  if (body.cityAr !== undefined) data.cityAr = strOrNull(body.cityAr);
  if (body.isActive !== undefined) data.isActive = boolValue(body.isActive);
  try {
    const airport = await prisma.airport.update({ where: { id: req.params.id }, data });
    res.json({ success: true, data: airport });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      res.status(400).json({ success: false, error: 'DUPLICATE_CODE', message: 'Another airport already uses that code.' });
      return;
    }
    throw err;
  }
}

export async function deleteAirport(req: Request, res: Response): Promise<void> {
  await prisma.airport.update({ where: { id: req.params.id }, data: { isActive: false } });
  res.json({ success: true, data: null });
}
