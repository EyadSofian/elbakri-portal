import { Router } from 'express';
import { listUsers, createUser, updateUser, deleteUser, resetUserPassword } from './users.controller';
import { validate } from '../../middleware/validate';
import { createUserSchema, resetPasswordSchema, updateUserSchema } from './users.schema';
import { requireRole } from '../../middleware/role';

const router = Router();

router.use(requireRole('SUPERADMIN', 'COMPANY_ADMIN'));
router.get('/', listUsers);
router.post('/', validate(createUserSchema), createUser);
router.patch('/:id', validate(updateUserSchema), updateUser);
router.post('/:id/reset-password', validate(resetPasswordSchema), resetUserPassword);
router.delete('/:id', deleteUser);

export default router;
