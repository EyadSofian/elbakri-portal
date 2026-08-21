import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../config/db';
import { paginate, paginateMeta } from '../../shared/helpers';

type ModelKey = 'transportRate' | 'visaFee' | 'receptionServiceRate';

const transportTypes = ['AIRPORT_TRANSFER', 'PRIVATE_TRANSFER', 'DAY_TOUR_TRANSPORT', 'INTERCITY'] as const;
const vehicleTypes = ['SEDAN', 'SUV', 'VAN_6', 'VAN_12', 'MINIBUS_20', 'BUS_45', 'LUXURY_LIMO'] as const;
const serviceModes = ['POINT_TO_POINT', 'AIRPORT_TRANSFER', 'HOURLY_CHARTER', 'DAY_USE'] as const;
const endpointTypes = ['AIRPORT', 'HOTEL', 'DESTINATION'] as const;
const visaTypes = ['TOURIST', 'BUSINESS', 'TRANSIT', 'STUDENT', 'MEDICAL', 'UMRAH', 'HAJJ'] as const;
const processingTypes = ['NORMAL', 'EXPRESS', 'URGENT'] as const;
const receptionTypes = ['MEET_AND_GREET', 'AHLAN_SERVICE', 'VIP_LOUNGE', 'FULL_ASSISTANCE'] as const;
/**
 * Airports come from the admin-managed Airport table, so a reception rate may
 * name any code an admin has added. An unknown code is rejected rather than
 * silently coerced to CAI, which is what a fixed list used to do.
 */
async function resolveAirportCode(value: unknown): Promise<string | null> {
  const code = String(value ?? '').trim().toUpperCase();
  if (!code) return null;
  const found = await prisma.airport.findUnique({ where: { code }, select: { code: true } });
  return found?.code ?? null;
}

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

function decimalOrNull(value: unknown): Decimal | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? new Decimal(n) : null;
}

function intOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) ? n : null;
}

function endpointTypeOrNull(value: unknown): (typeof endpointTypes)[number] | null {
  const s = String(value ?? '').trim().toUpperCase();
  return (endpointTypes as readonly string[]).includes(s) ? (s as (typeof endpointTypes)[number]) : null;
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

/**
 * Match one endpoint by its display label, across both the typed name and the
 * legacy free-text column — rates imported before typed endpoints existed only
 * ever filled the latter.
 */
function endpointNamed(side: 'from' | 'to', name: string) {
  return {
    OR: [
      { [`${side}Name`]: { equals: name, mode: 'insensitive' as const } },
      { [`${side}Location`]: { equals: name, mode: 'insensitive' as const } },
    ],
  } as Prisma.TransportRateWhereInput;
}

/**
 * Rates for one route, in the direction asked for OR its reverse when the rate
 * is two-way. The customer form calls this to build the vehicle list, so a
 * route priced only as "Cairo → North Coast" must still offer its vehicles to
 * someone travelling North Coast → Cairo — otherwise the reverse direction
 * looks unpriced in the picker even though the resolver would price it.
 */
function routeFilter(from: string, to: string): Prisma.TransportRateWhereInput {
  return {
    OR: [
      { AND: [endpointNamed('from', from), endpointNamed('to', to)] },
      { AND: [{ isBidirectional: true }, endpointNamed('from', to), endpointNamed('to', from)] },
    ],
  };
}

export async function listTransportRates(req: Request, res: Response): Promise<void> {
  const from = stringValue(req.query.from);
  const to = stringValue(req.query.to);
  await listMaster(req, res, 'transportRate', {
    ...(req.query.type && { type: enumValue(req.query.type, transportTypes, 'PRIVATE_TRANSFER') }),
    ...(req.query.vehicleType && { vehicleType: enumValue(req.query.vehicleType, vehicleTypes, 'SEDAN') }),
    ...(req.query.city && { city: { contains: String(req.query.city), mode: 'insensitive' as const } }),
    // Both endpoints are needed to name a route; one alone is not a filter.
    ...(from && to ? routeFilter(from, to) : {}),
  });
}

// Build the typed-endpoint + dual-currency payload shared by create/update.
// Legacy `rate`/`currency`/`roundTripRate` are kept in sync from the explicit
// EGP/USD fields so old resolvers and the NOT-NULL `rate` column keep working.
function transportEndpointAndPriceData(body: Record<string, unknown>, mode: 'create' | 'update'): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  const set = (key: string, value: unknown) => {
    if (mode === 'create' || body[key] !== undefined) data[key] = value;
  };

  if (mode === 'create' || body.serviceMode !== undefined) data.serviceMode = enumValue(body.serviceMode, serviceModes, 'POINT_TO_POINT');
  set('serviceNameEn', stringValue(body.serviceNameEn) ?? null);
  set('serviceNameAr', stringValue(body.serviceNameAr) ?? null);
  set('serviceArea', stringValue(body.serviceArea) ?? null);
  if (mode === 'create' || body.durationHours !== undefined) data.durationHours = intOrNull(body.durationHours);

  // Typed endpoints (authoritative). Mirror the display names into the legacy
  // free-text columns so existing list/search keeps working.
  if (mode === 'create' || body.fromType !== undefined) data.fromType = endpointTypeOrNull(body.fromType);
  set('fromId', stringValue(body.fromId) ?? null);
  if (mode === 'create' || body.toType !== undefined) data.toType = endpointTypeOrNull(body.toType);
  set('toId', stringValue(body.toId) ?? null);
  if (mode === 'create' || body.fromName !== undefined || body.fromLocation !== undefined) {
    const fromName = stringValue(body.fromName) ?? stringValue(body.fromLocation) ?? null;
    data.fromName = fromName;
    data.fromLocation = fromName;
  }
  if (mode === 'create' || body.toName !== undefined || body.toLocation !== undefined) {
    const toName = stringValue(body.toName) ?? stringValue(body.toLocation) ?? null;
    data.toName = toName;
    data.toLocation = toName;
  }

  if (mode === 'create' || body.isBidirectional !== undefined) data.isBidirectional = boolValue(body.isBidirectional, false);
  if (mode === 'create' || body.minCapacity !== undefined) data.minCapacity = intOrNull(body.minCapacity) ?? 1;
  if (mode === 'create' || body.maxCapacity !== undefined) data.maxCapacity = intOrNull(body.maxCapacity);
  set('city', stringValue(body.city) ?? null);
  set('destinationId', stringValue(body.destinationId) ?? null);

  // Explicit dual-currency sale prices (NO FX).
  const priceEgp = decimalOrNull(body.priceEgp);
  const priceUsd = decimalOrNull(body.priceUsd);
  const rtEgp = decimalOrNull(body.roundTripPriceEgp);
  const rtUsd = decimalOrNull(body.roundTripPriceUsd);
  if (mode === 'create' || body.priceEgp !== undefined) data.priceEgp = priceEgp;
  if (mode === 'create' || body.priceUsd !== undefined) data.priceUsd = priceUsd;
  if (mode === 'create' || body.roundTripPriceEgp !== undefined) data.roundTripPriceEgp = rtEgp;
  if (mode === 'create' || body.roundTripPriceUsd !== undefined) data.roundTripPriceUsd = rtUsd;

  // Keep the legacy columns in lockstep with the dual prices when any are given.
  const anyDual = priceEgp != null || priceUsd != null;
  if (anyDual) {
    data.rate = priceUsd ?? priceEgp ?? new Decimal(0);
    data.currency = priceUsd != null ? 'USD' : 'EGP';
    if (rtUsd != null || rtEgp != null) data.roundTripRate = priceUsd != null ? (rtUsd ?? null) : (rtEgp ?? null);
  } else {
    if (mode === 'create' || body.rate !== undefined) data.rate = decimalValue(body.rate);
    if (mode === 'create' || body.currency !== undefined) data.currency = stringValue(body.currency)?.toUpperCase() ?? 'USD';
    if (body.roundTripRate !== undefined) data.roundTripRate = decimalOrNull(body.roundTripRate);
  }

  set('notes', stringValue(body.notes) ?? null);
  if (mode === 'create' || body.isActive !== undefined) data.isActive = boolValue(body.isActive);
  if (mode === 'create' || body.type !== undefined) data.type = enumValue(body.type, transportTypes, 'PRIVATE_TRANSFER');
  if (mode === 'create' || body.vehicleType !== undefined) data.vehicleType = enumValue(body.vehicleType, vehicleTypes, 'SEDAN');
  return data;
}

export async function createTransportRate(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const rate = await prisma.transportRate.create({
    data: transportEndpointAndPriceData(body, 'create') as Prisma.TransportRateUncheckedCreateInput,
  });
  res.status(201).json({ success: true, data: rate });
}

export async function updateTransportRate(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const rate = await prisma.transportRate.update({
    where: { id: req.params.id },
    data: transportEndpointAndPriceData(body, 'update') as Prisma.TransportRateUncheckedUpdateInput,
  });
  res.json({ success: true, data: rate });
}

/**
 * PATCH /api/transport-rates/bulk-direction — turn the reverse direction on or
 * off for a set of rates at once.
 *
 * A rate prices one direction only unless it is flagged bidirectional, so a
 * "Cairo → Sahel" row leaves "Sahel → Cairo" unpriced. Most intercity transfers
 * cost the same both ways, and re-opening every row to tick one box is the kind
 * of chore that leaves a catalogue half-done — so the admin selects the rows and
 * flips them together. Airport transfers are deliberately NOT excluded here:
 * an arrival often costs more than a departure, but only the operator knows
 * which of their routes are symmetric, so the choice stays theirs.
 */
export async function bulkSetTransportDirection(req: Request, res: Response): Promise<void> {
  const body = req.body as { ids?: unknown; isBidirectional?: unknown };
  const ids = Array.isArray(body.ids) ? body.ids.filter((v): v is string => typeof v === 'string' && !!v) : [];
  if (!ids.length) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'Select at least one rate.' });
    return;
  }
  const isBidirectional = body.isBidirectional !== false;
  const result = await prisma.transportRate.updateMany({
    where: { id: { in: ids } },
    data: { isBidirectional },
  });
  res.json({ success: true, data: { updated: result.count, isBidirectional } });
}

export async function deleteTransportRate(req: Request, res: Response): Promise<void> {
  await prisma.transportRate.update({ where: { id: req.params.id }, data: { isActive: false } });
  res.json({ success: true, data: null });
}

export async function listVisaFees(req: Request, res: Response): Promise<void> {
  await listMaster(req, res, 'visaFee', {
    ...(req.query.visaType && { visaType: enumValue(req.query.visaType, visaTypes, 'TOURIST') }),
    ...(req.query.destinationCountry && { destinationCountry: { contains: String(req.query.destinationCountry), mode: 'insensitive' as const } }),
  });
}

export async function createVisaFee(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const fee = await prisma.visaFee.create({
    data: {
      visaType: enumValue(body.visaType, visaTypes, 'TOURIST'),
      // Blank is meaningful on both: it prices any airport / any destination.
      destinationCountry: stringValue(body.destinationCountry),
      destinationCity: stringValue(body.destinationCity),
      processingType: enumValue(body.processingType, processingTypes, 'NORMAL'),
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
  if (body.destinationCountry !== undefined) data.destinationCountry = stringValue(body.destinationCountry);
  if (body.destinationCity !== undefined) data.destinationCity = stringValue(body.destinationCity);
  if (body.processingType !== undefined) data.processingType = enumValue(body.processingType, processingTypes, 'NORMAL');
  if (body.fee !== undefined) data.fee = decimalValue(body.fee);
  if (body.currency !== undefined) data.currency = stringValue(body.currency)?.toUpperCase() ?? 'USD';
  if (body.notes !== undefined) data.notes = stringValue(body.notes) ?? null;
  if (body.isActive !== undefined) data.isActive = boolValue(body.isActive);
  const fee = await prisma.visaFee.update({ where: { id: req.params.id }, data: data as Prisma.VisaFeeUncheckedUpdateInput });
  res.json({ success: true, data: fee });
}

export async function deleteVisaFee(req: Request, res: Response): Promise<void> {
  await prisma.visaFee.update({ where: { id: req.params.id }, data: { isActive: false } });
  res.json({ success: true, data: null });
}

export async function listReceptionServiceRates(req: Request, res: Response): Promise<void> {
  await listMaster(req, res, 'receptionServiceRate', {
    ...(req.query.serviceType && { serviceType: enumValue(req.query.serviceType, receptionTypes, 'MEET_AND_GREET') }),
    ...(req.query.airport && { airport: String(req.query.airport).trim().toUpperCase() }),
  });
}

export async function createReceptionServiceRate(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  let airport: string | null = null;
  if (body.airport) {
    airport = await resolveAirportCode(body.airport);
    if (!airport) {
      res.status(400).json({ success: false, error: 'UNKNOWN_AIRPORT', message: 'That airport is not in the airport list. Add it under Transport → Airports first.' });
      return;
    }
  }
  const rate = await prisma.receptionServiceRate.create({
    data: {
      serviceType: enumValue(body.serviceType, receptionTypes, 'MEET_AND_GREET'),
      airport: airport ?? undefined,
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
  if (body.airport !== undefined) {
    if (stringValue(body.airport)) {
      const code = await resolveAirportCode(body.airport);
      if (!code) {
        res.status(400).json({ success: false, error: 'UNKNOWN_AIRPORT', message: 'That airport is not in the airport list. Add it under Transport → Airports first.' });
        return;
      }
      data.airport = code;
    } else {
      data.airport = null;
    }
  }
  if (body.rate !== undefined) data.rate = decimalValue(body.rate);
  if (body.currency !== undefined) data.currency = stringValue(body.currency)?.toUpperCase() ?? 'USD';
  if (body.notes !== undefined) data.notes = stringValue(body.notes) ?? null;
  if (body.isActive !== undefined) data.isActive = boolValue(body.isActive);
  const rate = await prisma.receptionServiceRate.update({ where: { id: req.params.id }, data: data as Prisma.ReceptionServiceRateUncheckedUpdateInput });
  res.json({ success: true, data: rate });
}

export async function deleteReceptionServiceRate(req: Request, res: Response): Promise<void> {
  await prisma.receptionServiceRate.update({ where: { id: req.params.id }, data: { isActive: false } });
  res.json({ success: true, data: null });
}
