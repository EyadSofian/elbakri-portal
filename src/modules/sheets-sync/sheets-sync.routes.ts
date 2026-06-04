import { Router } from 'express';
import { requireRole } from '../../middleware/role';
import {
  getConfig,
  history,
  saveConfig,
  syncEntity,
  syncSpecificEntity,
  testConnection,
} from './sheets-sync.controller';

const adminSheetsRouter = Router();

adminSheetsRouter.use(requireRole('SUPERADMIN'));
adminSheetsRouter.get('/config', getConfig);
adminSheetsRouter.patch('/config', saveConfig);
adminSheetsRouter.post('/test', testConnection);
adminSheetsRouter.post('/sync/:entity', syncEntity);
adminSheetsRouter.get('/history', history);

export const entitySheetsRouter = Router();

entitySheetsRouter.post('/destinations/sync-sheets', requireRole('SUPERADMIN'), syncSpecificEntity('destinations'));
entitySheetsRouter.post('/hotel-pricing/sync-sheets', requireRole('SUPERADMIN'), syncSpecificEntity('hotel-pricing'));
entitySheetsRouter.post('/cruises/sync-sheets', requireRole('SUPERADMIN'), syncSpecificEntity('cruises'));
entitySheetsRouter.post('/activities/sync-sheets', requireRole('SUPERADMIN'), syncSpecificEntity('activities'));
entitySheetsRouter.post('/transport-rates/sync-sheets', requireRole('SUPERADMIN'), syncSpecificEntity('transport-rates'));
entitySheetsRouter.post('/visa-fees/sync-sheets', requireRole('SUPERADMIN'), syncSpecificEntity('visa-fees'));
entitySheetsRouter.post('/reception-services/sync-sheets', requireRole('SUPERADMIN'), syncSpecificEntity('reception-services'));

export default adminSheetsRouter;
