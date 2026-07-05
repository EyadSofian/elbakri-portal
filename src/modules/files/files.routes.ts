import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { prisma } from '../../config/db';
import { PRIVATE_UPLOADS_DIR, safeResolveInside } from '../../config/paths';

const router = Router();

const CONTENT_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

/**
 * Does a record owned by `companyId` reference this private file? Private docs
 * are attached to a VisaApplication (passport / flight ticket) or an
 * AirportReception (flight ticket). We match on the stored URL containing the
 * filename and scope the lookup to the caller's company, so a company user can
 * only pull files that belong to their own bookings.
 */
async function companyOwnsFile(companyId: string, filename: string): Promise<boolean> {
  const [visa, reception] = await Promise.all([
    prisma.visaApplication.findFirst({
      where: {
        companyId,
        OR: [
          { passportUrl: { contains: filename } },
          { flightTicketUrl: { contains: filename } },
        ],
      },
      select: { id: true },
    }),
    prisma.airportReception.findFirst({
      where: { companyId, ticketUrl: { contains: filename } },
      select: { id: true },
    }),
  ]);
  return !!visa || !!reception;
}

/**
 * GET /api/files/private/:filename
 * Authenticated, ownership-checked download of a private document. Mounted
 * behind `authenticate` in app.ts, so req.user is always present.
 */
router.get('/private/:filename', async (req: Request, res: Response): Promise<void> => {
  const caller = req.user!;
  const filePath = safeResolveInside(PRIVATE_UPLOADS_DIR, req.params.filename);
  if (!filePath) {
    res.status(400).json({ success: false, error: 'INVALID_FILENAME' });
    return;
  }

  const filename = path.basename(filePath);

  // Authorization: SUPERADMIN sees any private file; a company user only files
  // referenced by their own visa/reception records.
  if (caller.role !== 'SUPERADMIN') {
    if (!caller.companyId || !(await companyOwnsFile(caller.companyId, filename))) {
      res.status(403).json({ success: false, error: 'FORBIDDEN' });
      return;
    }
  }

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ success: false, error: 'NOT_FOUND' });
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  res.setHeader('Content-Type', CONTENT_TYPES[ext] ?? 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const stream = fs.createReadStream(filePath);
  stream.on('error', () => {
    if (!res.headersSent) res.status(500).json({ success: false, error: 'READ_FAILED' });
  });
  stream.pipe(res);
});

export default router;
