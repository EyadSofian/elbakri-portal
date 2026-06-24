import { Router } from 'express';
import { requireRole } from '../../middleware/role';
import { listAirports, createAirport, updateAirport, deleteAirport } from './airports.controller';

const router = Router();

router.get('/', listAirports);
router.post('/', requireRole('SUPERADMIN'), createAirport);
router.patch('/:id', requireRole('SUPERADMIN'), updateAirport);
router.delete('/:id', requireRole('SUPERADMIN'), deleteAirport);

export default router;
