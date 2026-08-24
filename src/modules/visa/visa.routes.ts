import { Router } from 'express';
import { requireRole } from '../../middleware/role';
import { validate } from '../../middleware/validate';
import {
  listVisaApplications, createVisaApplication, updateVisaApplication,
  deleteVisaApplication, submitVisa, approveVisa, rejectVisa, getVisaQuote,
  listSecurityDestinations, listSecurityNationalities,
} from './visa.controller';
import { updateVisaApplicationSchema } from './visa.schema';

const router = Router();

router.get('/quote', getVisaQuote);
router.get('/destinations', listSecurityDestinations);
router.get('/nationalities', listSecurityNationalities);
router.get('/', listVisaApplications);
router.post('/', createVisaApplication);
router.patch('/:id', requireRole('SUPERADMIN'), validate(updateVisaApplicationSchema), updateVisaApplication);
router.delete('/:id', requireRole('SUPERADMIN'), deleteVisaApplication);
router.patch('/:id/submit', submitVisa);
router.patch('/:id/approve', requireRole('SUPERADMIN'), approveVisa);
router.patch('/:id/reject', requireRole('SUPERADMIN'), rejectVisa);

export default router;
