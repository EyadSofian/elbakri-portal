import { Router } from 'express';
import { requireRole } from '../../middleware/role';
import {
  listVisaApplications, createVisaApplication, updateVisaApplication,
  submitVisa, approveVisa, rejectVisa,
} from './visa.controller';

const router = Router();

router.get('/', listVisaApplications);
router.post('/', createVisaApplication);
router.patch('/:id', updateVisaApplication);
router.patch('/:id/submit', submitVisa);
router.patch('/:id/approve', requireRole('SUPERADMIN'), approveVisa);
router.patch('/:id/reject', requireRole('SUPERADMIN'), rejectVisa);

export default router;
