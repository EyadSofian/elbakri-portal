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
  listCruiseProgrammes, saveCruiseProgrammes,
  listCruiseTransferRates, saveCruiseTransferRates,
  listSharedProgrammes, saveSharedProgrammes,
  listSharedTransferRates, saveSharedTransferRates,
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
router.get('/cruises/:id/programmes', listCruiseProgrammes);
router.put('/cruises/:id/programmes', requireRole('SUPERADMIN'), saveCruiseProgrammes);
router.get('/cruises/:id/transfer-rates', listCruiseTransferRates);
router.put('/cruises/:id/transfer-rates', requireRole('SUPERADMIN'), saveCruiseTransferRates);

// The fleet-wide programme and transfer library: the programmes and routes
// every boat sells, written once. Readable by agents for the same reason the
// per-cruise rows are — it is what they are quoting from — and writable by
// admins only.
router.get('/cruise-library/programmes', listSharedProgrammes);
router.put('/cruise-library/programmes', requireRole('SUPERADMIN'), saveSharedProgrammes);
router.get('/cruise-library/transfer-rates', listSharedTransferRates);
router.put('/cruise-library/transfer-rates', requireRole('SUPERADMIN'), saveSharedTransferRates);

router.get('/cruise-bookings', listCruiseBookings);
router.post('/cruise-bookings', createCruiseBooking);
router.patch('/cruise-bookings/:id/confirm', requireRole('SUPERADMIN'), confirmCruiseBooking);
router.patch('/cruise-bookings/:id/cancel', cancelCruiseBooking);

export default router;
