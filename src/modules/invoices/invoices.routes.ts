import { Router } from 'express';
import {
  listInvoices,
  downloadPdf,
  bulkPdf,
  markPaid,
} from './invoices.controller';
import {
  listConsolidatedInvoices,
  listEligibleConsolidatedInvoices,
  createConsolidatedInvoice,
  downloadConsolidatedPdf,
  downloadConsolidatedExcel,
} from './consolidated.controller';
import { requireRole } from '../../middleware/role';

const router = Router();

router.get('/', listInvoices);
router.post('/bulk-pdf', bulkPdf);
router.get('/consolidated', listConsolidatedInvoices);
router.get('/consolidated/eligible', requireRole('SUPERADMIN'), listEligibleConsolidatedInvoices);
router.post('/consolidated', requireRole('SUPERADMIN'), createConsolidatedInvoice);
router.get('/consolidated/:id/pdf', downloadConsolidatedPdf);
router.get('/consolidated/:id/excel', downloadConsolidatedExcel);
router.get('/:id/pdf', downloadPdf);
router.patch('/:id/mark-paid', requireRole('SUPERADMIN'), markPaid);

export default router;
