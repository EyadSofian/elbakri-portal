import { Request, Response } from 'express';
import { MarketEntityType, getEntityMarketPrices, upsertMarketPrice } from '../../shared/pricing';

const ALLOWED: MarketEntityType[] = [
  'HOTEL',
  'ACTIVITY_ADULT',
  'ACTIVITY_CHILD',
  'TRANSPORT',
  'TRANSPORT_RT',
  'CRUISE',
  'SIM',
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
export async function setMarketPrices(req: Request, res: Response): Promise<void> {
  const { entityType, entityId, prices } = req.body as {
    entityType?: string;
    entityId?: string;
    prices?: { EGYPTIAN?: number | string | null };
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
  if ('EGYPTIAN' in values) {
    await upsertMarketPrice(entityType, entityId, 'EGYPTIAN', values.EGYPTIAN);
  }

  const updated = await getEntityMarketPrices(entityType, entityId);
  res.json({ success: true, data: updated });
}
