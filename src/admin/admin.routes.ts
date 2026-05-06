import { Router } from 'express';
import companiesRouter from '../modules/companies/companies.routes';
import { getAllTransactions } from '../modules/wallet/wallet.controller';
import reportsRouter from '../modules/reports/reports.routes';
import sheetsRouter from '../modules/sheets-sync/sheets-sync.routes';
import { requireRole } from '../middleware/role';

const router = Router();

router.use('/companies', requireRole('SUPERADMIN'), companiesRouter);
router.get('/wallet/transactions', requireRole('SUPERADMIN'), getAllTransactions);
router.use('/reports', requireRole('SUPERADMIN'), reportsRouter);
router.use('/sheets', sheetsRouter);

export default router;
