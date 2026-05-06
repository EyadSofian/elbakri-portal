import { Router } from 'express';
import { requireRole } from '../../middleware/role';
import {
  listTransportBookings, createTransportBooking, confirmTransportBooking, cancelTransportBooking,
} from './transport.controller';

const router = Router();

router.get('/', listTransportBookings);
router.post('/', createTransportBooking);
router.patch('/:id/confirm', requireRole('SUPERADMIN', 'COMPANY_ADMIN'), confirmTransportBooking);
router.patch('/:id/cancel', cancelTransportBooking);

export default router;
