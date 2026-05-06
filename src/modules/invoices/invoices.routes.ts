import { Router } from 'express';
import { listInvoices, downloadPdf, markPaid } from './invoices.controller';
import { requireRole } from '../../middleware/role';

const router = Router();

router.get('/', listInvoices);
router.get('/:id/pdf', downloadPdf);
router.patch('/:id/mark-paid', requireRole('SUPERADMIN'), markPaid);

export default router;
