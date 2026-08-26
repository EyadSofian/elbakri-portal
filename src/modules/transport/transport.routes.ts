import { Router } from 'express';
import { requireRole } from '../../middleware/role';
import {
  listTransportBookings,
  listTransferAddOns,
  createTransportBooking,
  confirmTransportBooking,
  cancelTransportBooking,
  listTransportRates,
  getTransportQuote,
  getTransportLocations,
  getTransportDisposalCatalogue,
} from './transport.controller';

const router = Router();

router.get('/', listTransportBookings);
router.get('/add-ons', requireRole('SUPERADMIN'), listTransferAddOns);
router.post('/', createTransportBooking);
router.patch('/:id/confirm', requireRole('SUPERADMIN'), confirmTransportBooking);
router.patch('/:id/cancel', cancelTransportBooking);

export default router;

// Separate router for transport rates (mounted separately in app.ts)
export const transportRatesRouter = Router();
transportRatesRouter.get('/', listTransportRates);
transportRatesRouter.get('/quote', getTransportQuote);
transportRatesRouter.get('/locations', getTransportLocations);
// At-disposal catalogue (areas + hour/day packages) — the third trip shape,
// which the from/to dropdowns cannot express.
transportRatesRouter.get('/disposal', getTransportDisposalCatalogue);
