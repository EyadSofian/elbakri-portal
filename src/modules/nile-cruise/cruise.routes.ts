import { Router } from 'express';
import { requireRole } from '../../middleware/role';
import { validate } from '../../middleware/validate';
import { createCruiseSchema, updateCruiseSchema } from './cruise.schema';
import {
  listCruises, createCruise, updateCruise, deleteCruise,
  listCruiseBookings, createCruiseBooking, confirmCruiseBooking, cancelCruiseBooking,
} from './cruise.controller';
import {
  listCruiseRates, saveCruiseRates, listCruiseSchedules, saveCruiseSchedules,
} from './cruise-catalogue.controller';

const router = Router();

router.get('/cruises', listCruises);
router.post('/cruises', requireRole('SUPERADMIN'), validate(createCruiseSchema), createCruise);
router.patch('/cruises/:id', requireRole('SUPERADMIN'), validate(updateCruiseSchema), updateCruise);
router.delete('/cruises/:id', requireRole('SUPERADMIN'), deleteCruise);

// Cabin rate rows and the sailing schedule. Both are readable by agents — the
// rates are what they quote from and the schedule is what they sell — and
// writable by admins only.
router.get('/cruises/:id/rates', listCruiseRates);
router.put('/cruises/:id/rates', requireRole('SUPERADMIN'), saveCruiseRates);
router.get('/cruises/:id/schedules', listCruiseSchedules);
router.put('/cruises/:id/schedules', requireRole('SUPERADMIN'), saveCruiseSchedules);

router.get('/cruise-bookings', listCruiseBookings);
router.post('/cruise-bookings', createCruiseBooking);
router.patch('/cruise-bookings/:id/confirm', requireRole('SUPERADMIN'), confirmCruiseBooking);
router.patch('/cruise-bookings/:id/cancel', cancelCruiseBooking);

export default router;
