import { Router } from 'express';
import { requireRole } from '../../middleware/role';
import {
  listOffers,
  getOffer,
  createOffer,
  updateOffer,
  deleteOffer,
  getActiveOffer,
  resolveOfferPackage,
} from './offers-v2.controller';

const router = Router();

// Public-ish (authenticated) — agents see active offers
router.get('/active', getActiveOffer);
router.get('/', listOffers);
router.get('/:id', getOffer);
router.post('/:id/resolve', resolveOfferPackage);

// Admin only
router.post('/', requireRole('SUPERADMIN'), createOffer);
router.patch('/:id', requireRole('SUPERADMIN'), updateOffer);
router.delete('/:id', requireRole('SUPERADMIN'), deleteOffer);

export default router;
