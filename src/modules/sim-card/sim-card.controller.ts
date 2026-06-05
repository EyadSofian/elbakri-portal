import { Request, Response } from 'express';
import { prisma } from '../../config/db';
import { sanitizeCustomFields } from '../../shared/helpers';

// ─── Packages (admin managed) ────────────────────────────────────────────────

export async function listPackages(req: Request, res: Response) {
  try {
    const { activeOnly, page = '1', limit = '50' } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;
    const where = activeOnly === 'true' ? { isActive: true } : {};

    const [packages, total] = await Promise.all([
      prisma.simPackage.findMany({ where, orderBy: { createdAt: 'asc' }, skip, take: limitNum }),
      prisma.simPackage.count({ where }),
    ]);

    res.json({
      success: true,
      data: packages,
      meta: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function createPackage(req: Request, res: Response) {
  try {
    const { name, nameAr, dataSize, minutes, validity, price, currency, isActive } = req.body;
    if (!name || !dataSize || !validity || price === undefined) {
      return res.status(400).json({ success: false, message: 'name, dataSize, validity, price are required' });
    }
    const pkg = await prisma.simPackage.create({
      data: {
        name,
        nameAr: nameAr || null,
        dataSize,
        minutes: minutes || null,
        validity,
        price,
        currency: currency || 'USD',
        isActive: isActive !== undefined ? Boolean(isActive) : true,
      },
    });
    res.status(201).json({ success: true, data: pkg });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function updatePackage(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { name, nameAr, dataSize, minutes, validity, price, currency, isActive } = req.body;
    const pkg = await prisma.simPackage.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(nameAr !== undefined && { nameAr }),
        ...(dataSize !== undefined && { dataSize }),
        ...(minutes !== undefined && { minutes }),
        ...(validity !== undefined && { validity }),
        ...(price !== undefined && { price }),
        ...(currency !== undefined && { currency }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) }),
      },
    });
    res.json({ success: true, data: pkg });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function deletePackage(req: Request, res: Response) {
  try {
    await prisma.simPackage.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

// ─── Requests (company users) ────────────────────────────────────────────────

function genRef(year: number, seq: number) {
  return `SIM-${year}-${String(seq).padStart(4, '0')}`;
}

async function generateSimRef(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.simRequest.count();
  // Use count + timestamp suffix to guarantee uniqueness even under rapid creation
  return `SIM-${year}-${String(count + 1).padStart(4, '0')}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
}

export async function listRequests(req: Request, res: Response) {
  try {
    const user = req.user!;
    const isSuperAdmin = user.role === 'SUPERADMIN';
    const { status, page = '1', limit = '50', search } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const where: Record<string, unknown> = {};
    if (!isSuperAdmin && user.companyId) where.companyId = user.companyId;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { refNumber: { contains: search, mode: 'insensitive' } },
        { clientName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [requests, total] = await Promise.all([
      prisma.simRequest.findMany({
        where,
        include: { package: true, company: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.simRequest.count({ where }),
    ]);

    res.json({
      success: true,
      data: requests,
      meta: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function createRequest(req: Request, res: Response) {
  try {
    const user = req.user!;
    if (!user.companyId) return res.status(400).json({ success: false, message: 'No company associated' });

    const { packageId, clientName, phone, quantity, arrivalDate, notes, customFields } = req.body;
    if (!clientName || !phone) {
      return res.status(400).json({ success: false, message: 'clientName and phone are required' });
    }

    const pkg = packageId ? await prisma.simPackage.findUnique({ where: { id: packageId } }) : null;
    const qty = Math.max(1, parseInt(quantity) || 1);
    const unitPrice = pkg ? Number(pkg.price) : 0;
    const totalAmount = unitPrice * qty;
    const currency = pkg?.currency || 'USD';

    const refNumber = await generateSimRef();

    const simReq = await prisma.simRequest.create({
      data: {
        refNumber,
        companyId: user.companyId,
        createdById: user.id,
        packageId: packageId || null,
        clientName,
        phone,
        quantity: qty,
        arrivalDate: arrivalDate ? new Date(arrivalDate) : null,
        notes: notes || null,
        customFields: sanitizeCustomFields(customFields) ?? undefined,
        totalAmount,
        currency,
        status: 'PENDING',
      },
      include: { package: true },
    });

    res.status(201).json({ success: true, data: simReq });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}

export async function updateRequestStatus(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const updated = await prisma.simRequest.update({
      where: { id },
      data: { status },
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: (err as Error).message });
  }
}
