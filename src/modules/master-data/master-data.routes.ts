import { Router } from 'express';
import { requireRole } from '../../middleware/role';
import { validate } from '../../middleware/validate';
import { transportRateSchema, visaFeeSchema, receptionRateSchema } from './master-data.schema';
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
router.post('/transport-rates', requireRole('SUPERADMIN'), validate(transportRateSchema), createTransportRate);
router.patch('/transport-rates/:id', requireRole('SUPERADMIN'), validate(transportRateSchema), updateTransportRate);
router.delete('/transport-rates/:id', requireRole('SUPERADMIN'), deleteTransportRate);

router.get('/visa-fees', listVisaFees);
router.post('/visa-fees', requireRole('SUPERADMIN'), validate(visaFeeSchema), createVisaFee);
router.patch('/visa-fees/:id', requireRole('SUPERADMIN'), validate(visaFeeSchema), updateVisaFee);
router.delete('/visa-fees/:id', requireRole('SUPERADMIN'), deleteVisaFee);

router.get('/reception-services', listReceptionServiceRates);
router.post('/reception-services', requireRole('SUPERADMIN'), validate(receptionRateSchema), createReceptionServiceRate);
router.patch('/reception-services/:id', requireRole('SUPERADMIN'), validate(receptionRateSchema), updateReceptionServiceRate);
router.delete('/reception-services/:id', requireRole('SUPERADMIN'), deleteReceptionServiceRate);

export default router;
