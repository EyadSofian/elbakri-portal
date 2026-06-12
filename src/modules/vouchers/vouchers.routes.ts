import { Router } from 'express';
import { requireRole } from '../../middleware/role';
import {
  downloadVoucher,
  regenerateVoucher,
  getVoucherByBooking,
  listVouchers,
} from './vouchers.controller';

const router = Router();

router.get('/',                      listVouchers);
router.get('/by-booking',            getVoucherByBooking);
router.get('/:id/download',          downloadVoucher);
router.post('/:id/regenerate',       requireRole('SUPERADMIN'), regenerateVoucher);

export default router;
