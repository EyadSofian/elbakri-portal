import { Router } from 'express';
import { requireRole } from '../../middleware/role';
import {
  createGroupType,
  deleteGroupType,
  listGroupTypes,
  updateGroupType,
} from './group-types.controller';

const router = Router();

router.get('/', listGroupTypes);
router.post('/', requireRole('SUPERADMIN'), createGroupType);
router.put('/:id', requireRole('SUPERADMIN'), updateGroupType);
router.delete('/:id', requireRole('SUPERADMIN'), deleteGroupType);

export default router;
