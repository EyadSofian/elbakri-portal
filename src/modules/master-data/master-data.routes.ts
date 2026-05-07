import { Router } from 'express';
import { requireRole } from '../../middleware/role';
import {
  createReceptionServiceRate,
  createTransportRate,
  createVisaFee,
  deleteReceptionServiceRate,
  deleteTransportRate,
  deleteVisaFee,
  listReceptionServiceRates,
  listTransportRates,
  listVisaFees,
  updateReceptionServiceRate,
  updateTransportRate,
  updateVisaFee,
} from './master-data.controller';

const router = Router();

router.get('/transport-rates', listTransportRates);
router.post('/transport-rates', requireRole('SUPERADMIN'), createTransportRate);
router.patch('/transport-rates/:id', requireRole('SUPERADMIN'), updateTransportRate);
router.delete('/transport-rates/:id', requireRole('SUPERADMIN'), deleteTransportRate);

router.get('/visa-fees', listVisaFees);
router.post('/visa-fees', requireRole('SUPERADMIN'), createVisaFee);
router.patch('/visa-fees/:id', requireRole('SUPERADMIN'), updateVisaFee);
router.delete('/visa-fees/:id', requireRole('SUPERADMIN'), deleteVisaFee);

router.get('/reception-services', listReceptionServiceRates);
router.post('/reception-services', requireRole('SUPERADMIN'), createReceptionServiceRate);
router.patch('/reception-services/:id', requireRole('SUPERADMIN'), updateReceptionServiceRate);
router.delete('/reception-services/:id', requireRole('SUPERADMIN'), deleteReceptionServiceRate);

export default router;
