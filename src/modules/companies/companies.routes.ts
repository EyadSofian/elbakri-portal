import { Router } from 'express';
import {
  listCompanies, createCompany, getCompany, updateCompany, topupCompany, deleteCompany,
} from './companies.controller';
import { validate } from '../../middleware/validate';
import { createCompanySchema, updateCompanySchema, topupSchema } from './companies.schema';

const router = Router();

router.get('/', listCompanies);
router.post('/', validate(createCompanySchema), createCompany);
router.get('/:id', getCompany);
router.patch('/:id', validate(updateCompanySchema), updateCompany);
router.post('/:id/topup', validate(topupSchema), topupCompany);
router.delete('/:id', deleteCompany);

export default router;
