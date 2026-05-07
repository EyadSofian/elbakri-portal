import { Request, Response } from 'express';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../config/db';
import { paginate, paginateMeta } from '../../shared/helpers';

type ModelKey = 'transportRate' | 'visaFee' | 'receptionServiceRate';

const transportTypes = ['AIRPORT_TRANSFER', 'PRIVATE_TRANSFER', 'DAY_TOUR_TRANSPORT', 'INTERCITY'] as const;
const vehicleTypes = ['SEDAN', 'SUV', 'VAN_6', 'VAN_12', 'MINIBUS_20', 'BUS_45', 'LUXURY_LIMO'] as const;
const visaTypes = ['TOURIST', 'BUSINESS', 'TRANSIT', 'STUDENT', 'MEDICAL', 'UMRAH', 'HAJJ'] as const;
const processingTypes = ['NORMAL', 'EXPRESS', 'URGENT'] as const;
const receptionTypes = ['MEET_AND_GREET', 'AHLAN_SERVICE', 'VIP_LOUNGE', 'FULL_ASSISTANCE'] as const;
const airports = ['CAI', 'HRG', 'SSH', 'LXR', 'ASW', 'HBE', 'MHH'] as const;

function enumValue<T extends readonly string[]>(value: unknown, allowed: T, fallback: T[number]): T[number] {
  const normalized = String(value ?? '').trim().toUpperCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

function stringValue(value: unknown): string | undefined {
  const text = String(value ?? '').trim();
  return text ? text : undefined;
}

function boolValue(value: unknown, fallback = true): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return fallback;
}

function decimalValue(value: unknown, fallback = 0): Decimal {
  return new Decimal(String((value ?? fallback) || 0));
}

async function listMaster(req: Request, res: Response, model: ModelKey, filters: Record<string, unknown> = {}): Promise<void> {
  const page = parseInt(String(req.query.page ?? '1'));
  const limit = parseInt(String(req.query.limit ?? '20'));
  const { skip, take } = paginate(page, limit);
  const where = {
    ...(req.query.includeInactive === 'true' ? {} : { isActive: true }),
    ...filters,
  };
  const client = prisma[model] as any;
  const [rows, total] = await Promise.all([
    client.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
    client.count({ where }),
  ]);
  res.json({ success: true, data: rows, meta: paginateMeta(total, page, limit) });
}

export async function listTransportRates(req: Request, res: Response): Promise<void> {
  await listMaster(req, res, 'transportRate', {
    ...(req.query.type && { type: enumValue(req.query.type, transportTypes, 'PRIVATE_TRANSFER') }),
    ...(req.query.vehicleType && { vehicleType: enumValue(req.query.vehicleType, vehicleTypes, 'SEDAN') }),
    ...(req.query.city && { city: { contains: String(req.query.city), mode: 'insensitive' } }),
  });
}

export async function createTransportRate(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const rate = await prisma.transportRate.create({
    data: {
      type: enumValue(body.type, transportTypes, 'PRIVATE_TRANSFER') as any,
      vehicleType: enumValue(body.vehicleType, vehicleTypes, 'SEDAN') as any,
      city: stringValue(body.city),
      fromLocation: stringValue(body.fromLocation),
      toLocation: stringValue(body.toLocation),
      rate: decimalValue(body.rate),
      currency: stringValue(body.currency)?.toUpperCase() ?? 'USD',
      notes: stringValue(body.notes),
      isActive: boolValue(body.isActive),
    },
  });
  res.status(201).json({ success: true, data: rate });
}

export async function updateTransportRate(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  if (body.type !== undefined) data.type = enumValue(body.type, transportTypes, 'PRIVATE_TRANSFER');
  if (body.vehicleType !== undefined) data.vehicleType = enumValue(body.vehicleType, vehicleTypes, 'SEDAN');
  if (body.city !== undefined) data.city = stringValue(body.city) ?? null;
  if (body.fromLocation !== undefined) data.fromLocation = stringValue(body.fromLocation) ?? null;
  if (body.toLocation !== undefined) data.toLocation = stringValue(body.toLocation) ?? null;
  if (body.rate !== undefined) data.rate = decimalValue(body.rate);
  if (body.currency !== undefined) data.currency = stringValue(body.currency)?.toUpperCase() ?? 'USD';
  if (body.notes !== undefined) data.notes = stringValue(body.notes) ?? null;
  if (body.isActive !== undefined) data.isActive = boolValue(body.isActive);
  const rate = await prisma.transportRate.update({ where: { id: req.params.id }, data: data as any });
  res.json({ success: true, data: rate });
}

export async function deleteTransportRate(req: Request, res: Response): Promise<void> {
  await prisma.transportRate.update({ where: { id: req.params.id }, data: { isActive: false } });
  res.json({ success: true, data: null });
}

export async function listVisaFees(req: Request, res: Response): Promise<void> {
  await listMaster(req, res, 'visaFee', {
    ...(req.query.visaType && { visaType: enumValue(req.query.visaType, visaTypes, 'TOURIST') }),
    ...(req.query.destinationCountry && { destinationCountry: { contains: String(req.query.destinationCountry), mode: 'insensitive' } }),
  });
}

export async function createVisaFee(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const fee = await prisma.visaFee.create({
    data: {
      visaType: enumValue(body.visaType, visaTypes, 'TOURIST') as any,
      destinationCountry: stringValue(body.destinationCountry) ?? 'Egypt',
      processingType: enumValue(body.processingType, processingTypes, 'NORMAL') as any,
      fee: decimalValue(body.fee),
      currency: stringValue(body.currency)?.toUpperCase() ?? 'USD',
      notes: stringValue(body.notes),
      isActive: boolValue(body.isActive),
    },
  });
  res.status(201).json({ success: true, data: fee });
}

export async function updateVisaFee(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  if (body.visaType !== undefined) data.visaType = enumValue(body.visaType, visaTypes, 'TOURIST');
  if (body.destinationCountry !== undefined) data.destinationCountry = stringValue(body.destinationCountry) ?? 'Egypt';
  if (body.processingType !== undefined) data.processingType = enumValue(body.processingType, processingTypes, 'NORMAL');
  if (body.fee !== undefined) data.fee = decimalValue(body.fee);
  if (body.currency !== undefined) data.currency = stringValue(body.currency)?.toUpperCase() ?? 'USD';
  if (body.notes !== undefined) data.notes = stringValue(body.notes) ?? null;
  if (body.isActive !== undefined) data.isActive = boolValue(body.isActive);
  const fee = await prisma.visaFee.update({ where: { id: req.params.id }, data: data as any });
  res.json({ success: true, data: fee });
}

export async function deleteVisaFee(req: Request, res: Response): Promise<void> {
  await prisma.visaFee.update({ where: { id: req.params.id }, data: { isActive: false } });
  res.json({ success: true, data: null });
}

export async function listReceptionServiceRates(req: Request, res: Response): Promise<void> {
  await listMaster(req, res, 'receptionServiceRate', {
    ...(req.query.serviceType && { serviceType: enumValue(req.query.serviceType, receptionTypes, 'MEET_AND_GREET') }),
    ...(req.query.airport && { airport: enumValue(req.query.airport, airports, 'CAI') }),
  });
}

export async function createReceptionServiceRate(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const rate = await prisma.receptionServiceRate.create({
    data: {
      serviceType: enumValue(body.serviceType, receptionTypes, 'MEET_AND_GREET') as any,
      airport: body.airport ? enumValue(body.airport, airports, 'CAI') as any : undefined,
      rate: decimalValue(body.rate),
      currency: stringValue(body.currency)?.toUpperCase() ?? 'USD',
      notes: stringValue(body.notes),
      isActive: boolValue(body.isActive),
    },
  });
  res.status(201).json({ success: true, data: rate });
}

export async function updateReceptionServiceRate(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  if (body.serviceType !== undefined) data.serviceType = enumValue(body.serviceType, receptionTypes, 'MEET_AND_GREET');
  if (body.airport !== undefined) data.airport = stringValue(body.airport) ? enumValue(body.airport, airports, 'CAI') : null;
  if (body.rate !== undefined) data.rate = decimalValue(body.rate);
  if (body.currency !== undefined) data.currency = stringValue(body.currency)?.toUpperCase() ?? 'USD';
  if (body.notes !== undefined) data.notes = stringValue(body.notes) ?? null;
  if (body.isActive !== undefined) data.isActive = boolValue(body.isActive);
  const rate = await prisma.receptionServiceRate.update({ where: { id: req.params.id }, data: data as any });
  res.json({ success: true, data: rate });
}

export async function deleteReceptionServiceRate(req: Request, res: Response): Promise<void> {
  await prisma.receptionServiceRate.update({ where: { id: req.params.id }, data: { isActive: false } });
  res.json({ success: true, data: null });
}
