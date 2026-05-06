import { Router } from 'express';
import { requireRole } from '../../middleware/role';
import {
  listCruises, createCruise, updateCruise, deleteCruise,
  listCruiseBookings, createCruiseBooking, confirmCruiseBooking, cancelCruiseBooking,
} from './cruise.controller';

const router = Router();

router.get('/cruises', listCruises);
router.post('/cruises', requireRole('SUPERADMIN'), createCruise);
router.patch('/cruises/:id', requireRole('SUPERADMIN'), updateCruise);
router.delete('/cruises/:id', requireRole('SUPERADMIN'), deleteCruise);

router.get('/cruise-bookings', listCruiseBookings);
router.post('/cruise-bookings', createCruiseBooking);
router.patch('/cruise-bookings/:id/confirm', requireRole('SUPERADMIN', 'COMPANY_ADMIN'), confirmCruiseBooking);
router.patch('/cruise-bookings/:id/cancel', cancelCruiseBooking);

export default router;
