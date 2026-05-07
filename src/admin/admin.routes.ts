import { Router } from 'express';
import companiesRouter from '../modules/companies/companies.routes';
import { fundPlatformWallet, getAllTransactions, getPlatformWallet } from '../modules/wallet/wallet.controller';
import reportsRouter from '../modules/reports/reports.routes';
import sheetsRouter from '../modules/sheets-sync/sheets-sync.routes';
import { requireRole } from '../middleware/role';

const router = Router();

router.use('/companies', requireRole('SUPERADMIN'), companiesRouter);
router.get('/wallet/transactions', requireRole('SUPERADMIN'), getAllTransactions);
router.get('/wallet/platform', requireRole('SUPERADMIN'), getPlatformWallet);
router.post('/wallet/platform/fund', requireRole('SUPERADMIN'), fundPlatformWallet);
router.use('/reports', requireRole('SUPERADMIN'), reportsRouter);
router.use('/sheets', sheetsRouter);

export default router;
