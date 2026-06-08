import { Router, Request, Response } from 'express';
import { getRates, pickCurrencies } from './fx.service';

const router = Router();

/** GET /api/fx/rates — live daily FX rates (base USD) + lastUpdated. Any authed user. */
router.get('/rates', async (_req: Request, res: Response) => {
  try {
    const data = await getRates();
    res.json({ success: true, data: pickCurrencies(data) });
  } catch (err) {
    res.status(500).json({ success: false, error: 'FX_UNAVAILABLE', message: (err as Error).message });
  }
});

export default router;
