import { Router } from 'express';
import { requireRole } from '../../middleware/role';
import {
  listTransportBookings,
  createTransportBooking,
  confirmTransportBooking,
  cancelTransportBooking,
  listTransportRates,
  getTransportQuote,
  getTransportLocations,
} from './transport.controller';

const router = Router();

router.get('/', listTransportBookings);
router.post('/', createTransportBooking);
router.patch('/:id/confirm', requireRole('SUPERADMIN'), confirmTransportBooking);
router.patch('/:id/cancel', cancelTransportBooking);

export default router;

// Separate router for transport rates (mounted separately in app.ts)
export const transportRatesRouter = Router();
transportRatesRouter.get('/', listTransportRates);
transportRatesRouter.get('/quote', getTransportQuote);
transportRatesRouter.get('/locations', getTransportLocations);
