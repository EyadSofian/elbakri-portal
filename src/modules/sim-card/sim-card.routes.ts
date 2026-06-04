import { Router } from 'express';
import { requireRole } from '../../middleware/role';
import {
  listPackages,
  createPackage,
  updatePackage,
  deletePackage,
  listRequests,
  createRequest,
  updateRequestStatus,
} from './sim-card.controller';

const router = Router();

// Packages
router.get('/packages', listPackages);
router.post('/packages', requireRole('SUPERADMIN'), createPackage);
router.patch('/packages/:id', requireRole('SUPERADMIN'), updatePackage);
router.delete('/packages/:id', requireRole('SUPERADMIN'), deletePackage);

// Requests
router.get('/requests', listRequests);
router.post('/requests', createRequest);
router.patch('/requests/:id/status', requireRole('SUPERADMIN'), updateRequestStatus);

export default router;
