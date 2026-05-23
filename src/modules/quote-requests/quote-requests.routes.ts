import { Router } from 'express';
import { requireRole } from '../../middleware/role';
import {
  listQuoteRequests,
  getQuoteRequest,
  createQuoteRequest,
  updateQuoteRequest,
  cancelQuoteRequest,
} from './quote-requests.controller';

const router = Router();

// All authenticated users can view their own quotes
router.get('/', listQuoteRequests);
router.get('/:id', getQuoteRequest);

// All authenticated users can submit a quote request
router.post('/', createQuoteRequest);

// Only agents/company admins can cancel their own
router.post('/:id/cancel', cancelQuoteRequest);

// SUPERADMIN: update status, assign, respond
router.patch('/:id', requireRole('SUPERADMIN'), updateQuoteRequest);

export default router;
