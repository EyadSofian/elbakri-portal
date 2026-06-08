import { Request, Response } from 'express';
import { MarketEntityType, getEntityMarketPrices, upsertMarketPrice } from '../../shared/pricing';

const ALLOWED: MarketEntityType[] = [
  'HOTEL', 'ACTIVITY_ADULT', 'ACTIVITY_CHILD', 'TRANSPORT', 'TRANSPORT_RT', 'CRUISE', 'SIM',
];

function isAllowed(v: unknown): v is MarketEntityType {
  return typeof v === 'string' && (ALLOWED as string[]).includes(v);
}

/** GET /api/admin/market-prices?entityType=&entityId= — overrides keyed by market. */
export async function getMarketPrices(req: Request, res: Response): Promise<void> {
  const entityType = String(req.query.entityType ?? '');
  const entityId = String(req.query.entityId ?? '');
  if (!isAllowed(entityType) || !entityId) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'entityType and entityId required' });
    return;
  }
  const prices = await getEntityMarketPrices(entityType, entityId);
  res.json({ success: true, data: prices });
}

/**
 * PUT /api/admin/market-prices — upsert/clear EGYPTIAN + GULF overrides for one entity.
 * Body: { entityType, entityId, prices: { EGYPTIAN?: number|null, GULF?: number|null } }
 * (FOREIGN is the base column edited on the entity itself.)
 */
export async function setMarketPrices(req: Request, res: Response): Promise<void> {
  const { entityType, entityId, prices } = req.body as {
    entityType?: string; entityId?: string;
    prices?: { EGYPTIAN?: number | string | null; GULF?: number | string | null };
  };
  if (!isAllowed(entityType) || !entityId) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'entityType and entityId required' });
    return;
  }
  const p = prices ?? {};
  if ('EGYPTIAN' in p) await upsertMarketPrice(entityType, entityId, 'EGYPTIAN', p.EGYPTIAN);
  if ('GULF' in p) await upsertMarketPrice(entityType, entityId, 'GULF', p.GULF);
  const updated = await getEntityMarketPrices(entityType, entityId);
  res.json({ success: true, data: updated });
}
