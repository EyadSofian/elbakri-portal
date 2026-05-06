import { Router } from 'express';
import { listUsers, createUser, updateUser, deleteUser } from './users.controller';
import { validate } from '../../middleware/validate';
import { createUserSchema, updateUserSchema } from './users.schema';

const router = Router();

router.get('/', listUsers);
router.post('/', validate(createUserSchema), createUser);
router.patch('/:id', validate(updateUserSchema), updateUser);
router.delete('/:id', deleteUser);

export default router;
