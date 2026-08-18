import { Router } from 'express';
import {
  listCompanies, createCompany, getCompany, updateCompany, topupCompany, deleteCompany,
} from './companies.controller';
import { validate } from '../../middleware/validate';
import { createCompanySchema, updateCompanySchema, topupSchema } from './companies.schema';
import { asyncHandler } from '../../middleware/async';

const router = Router();

// Wrapped for the same reason as the user routes: Express 4 does not await
// handlers, so an unwrapped rejection writes no response and the request hangs.
router.get('/', asyncHandler(listCompanies));
router.post('/', validate(createCompanySchema), asyncHandler(createCompany));
router.get('/:id', asyncHandler(getCompany));
router.patch('/:id', validate(updateCompanySchema), asyncHandler(updateCompany));
router.post('/:id/topup', validate(topupSchema), asyncHandler(topupCompany));
router.delete('/:id', asyncHandler(deleteCompany));

export default router;
