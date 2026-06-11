import { Router } from 'express';
import { requireRole } from '../../middleware/role';
import { listReceptions, createReception, confirmReception, cancelReception, getReceptionQuote } from './reception.controller';

const router = Router();

router.get('/quote', getReceptionQuote);
router.get('/', listReceptions);
router.post('/', createReception);
router.patch('/:id/confirm', requireRole('SUPERADMIN'), confirmReception);
router.patch('/:id/cancel', cancelReception);

export default router;
