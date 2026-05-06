import { Router } from 'express';
import { getOverview, getCompanyReport } from './reports.controller';
import { requireRole } from '../../middleware/role';

const router = Router();

router.get('/overview', requireRole('SUPERADMIN'), getOverview);
router.get('/company/:id', requireRole('SUPERADMIN', 'COMPANY_ADMIN', 'AGENT'), getCompanyReport);

export default router;
