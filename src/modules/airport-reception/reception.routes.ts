import { Router } from 'express';
import { requireRole } from '../../middleware/role';
import { listReceptions, createReception, confirmReception, cancelReception } from './reception.controller';

const router = Router();

router.get('/', listReceptions);
router.post('/', createReception);
router.patch('/:id/confirm', requireRole('SUPERADMIN', 'COMPANY_ADMIN'), confirmReception);
router.patch('/:id/cancel', cancelReception);

export default router;
