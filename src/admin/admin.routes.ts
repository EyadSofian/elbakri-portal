import { Router } from 'express';
import companiesRouter from '../modules/companies/companies.routes';
import { fundPlatformWallet, getAllTransactions, getPlatformWallet } from '../modules/wallet/wallet.controller';
import reportsRouter from '../modules/reports/reports.routes';
import sheetsRouter from '../modules/sheets-sync/sheets-sync.routes';
import { getMarketPrices, setMarketPrices, getPriceRows, setPriceRows } from '../modules/market-prices/market-prices.controller';
import { requireRole } from '../middleware/role';

const router = Router();

router.use('/companies', requireRole('SUPERADMIN'), companiesRouter);
router.get('/market-prices', requireRole('SUPERADMIN'), getMarketPrices);
router.put('/market-prices', requireRole('SUPERADMIN'), setMarketPrices);
router.get('/price-rows', requireRole('SUPERADMIN'), getPriceRows);
router.put('/price-rows', requireRole('SUPERADMIN'), setPriceRows);
router.get('/wallet/transactions', requireRole('SUPERADMIN'), getAllTransactions);
router.get('/wallet/platform', requireRole('SUPERADMIN'), getPlatformWallet);
router.post('/wallet/platform/fund', requireRole('SUPERADMIN'), fundPlatformWallet);
router.use('/reports', requireRole('SUPERADMIN'), reportsRouter);
router.use('/sheets', sheetsRouter);

export default router;
