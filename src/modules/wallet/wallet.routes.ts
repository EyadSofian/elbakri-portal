import { Router } from 'express';
import { getBalance, getTransactions } from './wallet.controller';
import { requireRole } from '../../middleware/role';

const router = Router();

router.get('/balance', requireRole('AGENT', 'COMPANY_ADMIN'), getBalance);
router.get('/transactions', requireRole('AGENT', 'COMPANY_ADMIN'), getTransactions);

export default router;
