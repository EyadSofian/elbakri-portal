import { Router } from 'express';
import { listUsers, createUser, updateUser, deleteUser, resetUserPassword } from './users.controller';
import { validate } from '../../middleware/validate';
import { createUserSchema, resetPasswordSchema, updateUserSchema } from './users.schema';
import { requireRole } from '../../middleware/role';
import { asyncHandler } from '../../middleware/async';

const router = Router();

// Handlers are wrapped: Express 4 does not await route handlers, so an
// unwrapped async handler that rejects (a dropped connection, an unexpected
// Prisma error) writes no response at all and the request hangs until the
// client gives up. asyncHandler routes the rejection to the global error
// handler, which answers with a 500.
router.use(requireRole('SUPERADMIN', 'COMPANY_ADMIN'));
router.get('/', asyncHandler(listUsers));
router.post('/', validate(createUserSchema), asyncHandler(createUser));
router.patch('/:id', validate(updateUserSchema), asyncHandler(updateUser));
router.post('/:id/reset-password', validate(resetPasswordSchema), asyncHandler(resetUserPassword));
router.delete('/:id', asyncHandler(deleteUser));

export default router;
