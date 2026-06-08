import { Router } from 'express';
import { listInvoices, downloadPdf, markPaid, consolidatedInvoice } from './invoices.controller';
import { requireRole } from '../../middleware/role';

const router = Router();

router.get('/', listInvoices);
router.get('/consolidated', requireRole('SUPERADMIN'), consolidatedInvoice);
router.get('/:id/pdf', downloadPdf);
router.patch('/:id/mark-paid', requireRole('SUPERADMIN'), markPaid);

export default router;
