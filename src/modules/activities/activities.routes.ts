import { Router } from 'express';
import { requireRole } from '../../middleware/role';
import { validate } from '../../middleware/validate';
import { createActivitySchema, updateActivitySchema } from './activities.schema';
import {
  listActivities, createActivity, updateActivity, deleteActivity,
  listActivityBookings, createActivityBooking, confirmActivityBooking, cancelActivityBooking,
} from './activities.controller';
import {
  listActivityPackages, getActivityPackage, createActivityPackage,
  confirmActivityPackage, cancelActivityPackage,
} from './activity-packages.controller';

const router = Router();

router.get('/activities', listActivities);
router.post('/activities', requireRole('SUPERADMIN'), validate(createActivitySchema), createActivity);
router.patch('/activities/:id', requireRole('SUPERADMIN'), validate(updateActivitySchema), updateActivity);
router.delete('/activities/:id', requireRole('SUPERADMIN'), deleteActivity);

router.get('/activity-bookings', listActivityBookings);
router.post('/activity-bookings', createActivityBooking);
router.patch('/activity-bookings/:id/confirm', requireRole('SUPERADMIN'), confirmActivityBooking);
router.patch('/activity-bookings/:id/cancel', cancelActivityBooking);

// Activity packages (one package = many activities, one voucher)
router.get('/activity-packages', listActivityPackages);
router.get('/activity-packages/:id', getActivityPackage);
router.post('/activity-packages', createActivityPackage);
router.patch('/activity-packages/:id/confirm', requireRole('SUPERADMIN'), confirmActivityPackage);
router.patch('/activity-packages/:id/cancel', cancelActivityPackage);

export default router;
