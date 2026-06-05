import { Router } from 'express';
import { requireRole } from '../../middleware/role';
import {
  listTemplates, getTemplate, createTemplate, updateTemplate,
  activateTemplate, duplicateTemplate, previewTemplate, deleteTemplate,
  getActiveTemplate,
} from './ui-templates.controller';

// Admin router — mounted at /api/admin/ui-templates
export const adminUiTemplatesRouter = Router();
adminUiTemplatesRouter.get('/', requireRole('SUPERADMIN'), listTemplates);
adminUiTemplatesRouter.get('/:id', requireRole('SUPERADMIN'), getTemplate);
adminUiTemplatesRouter.post('/', requireRole('SUPERADMIN'), createTemplate);
adminUiTemplatesRouter.patch('/:id', requireRole('SUPERADMIN'), updateTemplate);
adminUiTemplatesRouter.post('/:id/activate', requireRole('SUPERADMIN'), activateTemplate);
adminUiTemplatesRouter.post('/:id/duplicate', requireRole('SUPERADMIN'), duplicateTemplate);
adminUiTemplatesRouter.post('/preview', requireRole('SUPERADMIN'), previewTemplate);
adminUiTemplatesRouter.delete('/:id', requireRole('SUPERADMIN'), deleteTemplate);

// User router — mounted at /api/ui-templates (any authenticated user)
export const userUiTemplatesRouter = Router();
userUiTemplatesRouter.get('/:target/:serviceType', getActiveTemplate);
userUiTemplatesRouter.get('/:target', getActiveTemplate);
