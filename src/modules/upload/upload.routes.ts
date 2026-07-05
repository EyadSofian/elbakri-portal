import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { PUBLIC_UPLOADS_DIR, PRIVATE_UPLOADS_DIR, ensureStorageDirs } from '../../config/paths';

// Directories are created centrally at boot; ensure here too so a direct import
// (e.g. in tests) never writes into a missing folder.
ensureStorageDirs();

function makeStorage(dir: string) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      const base = path.basename(file.originalname, ext).replace(/[^a-z0-9]/gi, '_').slice(0, 30);
      cb(null, `${Date.now()}_${base}${ext}`);
    },
  });
}

// Public uploader — images + PDFs that are safe to serve at /uploads (e.g. hotel
// brochures, destination images).
const upload = multer({
  storage: makeStorage(PUBLIC_UPLOADS_DIR),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /jpg|jpeg|png|gif|webp|pdf/i;
    if (allowed.test(path.extname(file.originalname))) return cb(null, true);
    cb(new Error('Only images and PDFs are allowed'));
  },
});

// Images-only uploader (jpg/png/webp) for hotel main + gallery images.
const imageUpload = multer({
  storage: makeStorage(PUBLIC_UPLOADS_DIR),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /jpe?g|png|webp/i;
    if (allowed.test(path.extname(file.originalname))) return cb(null, true);
    cb(new Error('Only JPG, PNG and WEBP images are allowed'));
  },
});

// Private uploader — passports, flight tickets and other private documents.
// Files land in a directory that is NOT served statically; they are only
// reachable via the authenticated, ownership-checked route
// GET /api/files/private/:filename.
const privateUpload = multer({
  storage: makeStorage(PRIVATE_UPLOADS_DIR),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /jpg|jpeg|png|gif|webp|pdf/i;
    if (allowed.test(path.extname(file.originalname))) return cb(null, true);
    cb(new Error('Only images and PDFs are allowed'));
  },
});

const router = Router();

router.post('/', upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
  const url = `/uploads/${req.file.filename}`;
  res.json({ success: true, data: { url, filename: req.file.filename, size: req.file.size } });
});

// Multi-file image upload (gallery) — accepts up to 30 images in one request.
router.post('/images', imageUpload.array('files', 30), (req: Request, res: Response) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length === 0) return res.status(400).json({ success: false, message: 'No files uploaded' });
  const data = files.map((f) => ({ url: `/uploads/${f.filename}`, filename: f.filename, size: f.size }));
  res.json({ success: true, data });
});

// Private document upload — returns a protected URL (not a public /uploads path).
router.post('/private', privateUpload.single('file'), (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
  const url = `/api/files/private/${req.file.filename}`;
  res.json({ success: true, data: { url, filename: req.file.filename, size: req.file.size } });
});

export default router;
