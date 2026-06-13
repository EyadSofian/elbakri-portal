import { Request, Response } from 'express';
import {
  MarketEntityType, getEntityMarketPrices, upsertMarketPrice,
  getEntityPriceRows, saveEntityPriceRows, MarketPriceRowInput,
} from '../../shared/pricing';

const ALLOWED: MarketEntityType[] = [
  'HOTEL',
  'ACTIVITY_ADULT',
  'ACTIVITY_CHILD',
  'TRANSPORT',
  'TRANSPORT_RT',
  'CRUISE',
  'SIM',
  'SECURITY',
  'AIRPORT',
];

function isAllowed(value: unknown): value is MarketEntityType {
  return typeof value === 'string' && (ALLOWED as string[]).includes(value);
}

export async function getMarketPrices(req: Request, res: Response): Promise<void> {
  const entityType = String(req.query.entityType ?? '');
  const entityId = String(req.query.entityId ?? '');
  if (!isAllowed(entityType) || !entityId) {
    res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'entityType and entityId required',
    });
    return;
  }

  const prices = await getEntityMarketPrices(entityType, entityId);
  res.json({ success: true, data: prices });
}

/**
 * International companies use the entity's base price. The only explicit
 * override maintained by the admin is the Egyptian price.
 */
type PriceValue = number | string | null | { amount?: number | string | null; currency?: string };

function splitPrice(v: PriceValue): { amount: number | string | null | undefined; currency: string } {
  if (v && typeof v === 'object') return { amount: v.amount, currency: v.currency || 'USD' };
  return { amount: v, currency: 'USD' };
}

export async function setMarketPrices(req: Request, res: Response): Promise<void> {
  const { entityType, entityId, prices } = req.body as {
    entityType?: string;
    entityId?: string;
    prices?: { EGYPTIAN?: PriceValue; GULF?: PriceValue; FOREIGN?: PriceValue; INTERNATIONAL?: PriceValue };
  };
  if (!isAllowed(entityType) || !entityId) {
    res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'entityType and entityId required',
    });
    return;
  }

  const values = prices ?? {};
  for (const market of ['EGYPTIAN', 'GULF', 'FOREIGN', 'INTERNATIONAL'] as const) {
    if (market in values) {
      const { amount, currency } = splitPrice(values[market] as PriceValue);
      await upsertMarketPrice(entityType, entityId, market, amount, currency);
    }
  }

  const updated = await getEntityMarketPrices(entityType, entityId);
  res.json({ success: true, data: updated });
}

// ── Full price-matrix rows (currency-aware, company/market/all overrides) ──────

/** GET /api/admin/price-rows?entityType=&entityId= */
export async function getPriceRows(req: Request, res: Response): Promise<void> {
  const entityType = String(req.query.entityType ?? '');
  const entityId = String(req.query.entityId ?? '');
  if (!isAllowed(entityType) || !entityId) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'entityType and entityId required' });
    return;
  }
  const rows = await getEntityPriceRows(entityType, entityId);
  res.json({ success: true, data: rows });
}

/** PUT /api/admin/price-rows  { entityType, entityId, rows: MarketPriceRowInput[] } */
export async function setPriceRows(req: Request, res: Response): Promise<void> {
  const { entityType, entityId, rows } = req.body as {
    entityType?: string; entityId?: string; rows?: MarketPriceRowInput[];
  };
  if (!isAllowed(entityType) || !entityId) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'entityType and entityId required' });
    return;
  }
  await saveEntityPriceRows(entityType, entityId, Array.isArray(rows) ? rows : []);
  const updated = await getEntityPriceRows(entityType, entityId);
  res.json({ success: true, data: updated });
}
