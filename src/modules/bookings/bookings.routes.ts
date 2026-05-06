import { Router } from 'express';
import { listBookings, createBooking, getBooking, confirmBooking, cancelBooking } from './bookings.controller';
import { requireRole } from '../../middleware/role';
import { validate } from '../../middleware/validate';
import { createBookingSchema, cancelBookingSchema } from './bookings.schema';

const router = Router();

router.get('/', listBookings);
router.post('/', validate(createBookingSchema), createBooking);
router.get('/:id', getBooking);
router.patch('/:id/confirm', requireRole('SUPERADMIN', 'COMPANY_ADMIN'), confirmBooking);
router.patch('/:id/cancel', validate(cancelBookingSchema), cancelBooking);

export default router;
