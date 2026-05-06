import { Router } from 'express';
import { requireRole } from '../../middleware/role';
import {
  listActivities, createActivity, updateActivity, deleteActivity,
  listActivityBookings, createActivityBooking, confirmActivityBooking, cancelActivityBooking,
} from './activities.controller';

const router = Router();

router.get('/activities', listActivities);
router.post('/activities', requireRole('SUPERADMIN'), createActivity);
router.patch('/activities/:id', requireRole('SUPERADMIN'), updateActivity);
router.delete('/activities/:id', requireRole('SUPERADMIN'), deleteActivity);

router.get('/activity-bookings', listActivityBookings);
router.post('/activity-bookings', createActivityBooking);
router.patch('/activity-bookings/:id/confirm', requireRole('SUPERADMIN', 'COMPANY_ADMIN'), confirmActivityBooking);
router.patch('/activity-bookings/:id/cancel', cancelActivityBooking);

export default router;
