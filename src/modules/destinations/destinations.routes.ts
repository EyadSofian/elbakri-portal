import { Router } from 'express';
import { requireRole } from '../../middleware/role';
import {
  listDestinations,
  getDestination,
  createDestination,
  updateDestination,
  deleteDestination,
} from './destinations.controller';

const router = Router();

// Public (authenticated) — agents can read destinations
router.get('/', listDestinations);
router.get('/:id', getDestination);

// Admin only — create/update/delete
router.post('/', requireRole('SUPERADMIN'), createDestination);
router.patch('/:id', requireRole('SUPERADMIN'), updateDestination);
router.delete('/:id', requireRole('SUPERADMIN'), deleteDestination);

export default router;
