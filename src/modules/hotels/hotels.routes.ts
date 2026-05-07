import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { listHotels, createHotel, updateHotel, deleteHotel, syncSheets } from './hotels.controller';
import {
  addHotelPricing,
  createHotelPricing,
  deleteHotelPricing,
  exportHotelsExcel,
  getHotelPricing,
  importHotelsExcel,
  listAllHotelPricing,
  updateHotelPricing,
} from './pricing.controller';
import { requireRole } from '../../middleware/role';
import { validate } from '../../middleware/validate';
import { createHotelSchema, updateHotelSchema } from './hotels.schema';

const storage = multer.diskStorage({
  destination: process.env.UPLOAD_DIR ?? './uploads',
  filename: (_req, file, cb) => {
    cb(null, `${Date.now()}-${path.basename(file.originalname)}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });
const uploadMemory = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const router = Router();

router.get('/export-excel', requireRole('SUPERADMIN', 'COMPANY_ADMIN'), exportHotelsExcel);
router.post('/import-excel', requireRole('SUPERADMIN'), uploadMemory.single('file'), importHotelsExcel);
router.get('/pricing/all', requireRole('SUPERADMIN'), listAllHotelPricing);
router.post('/pricing', requireRole('SUPERADMIN'), createHotelPricing);
router.patch('/pricing/:id', requireRole('SUPERADMIN'), updateHotelPricing);
router.delete('/pricing/:id', requireRole('SUPERADMIN'), deleteHotelPricing);
router.get('/', listHotels);
router.post('/', requireRole('SUPERADMIN'), upload.single('image'), validate(createHotelSchema), createHotel);
router.patch('/:id', requireRole('SUPERADMIN'), validate(updateHotelSchema), updateHotel);
router.delete('/:id', requireRole('SUPERADMIN'), deleteHotel);
router.post('/sync-sheets', requireRole('SUPERADMIN'), syncSheets);
router.get('/:id/pricing', getHotelPricing);
router.post('/:id/pricing', requireRole('SUPERADMIN'), addHotelPricing);

export default router;
