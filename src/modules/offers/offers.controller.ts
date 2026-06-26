import { Request, Response } from 'express';
import { prisma } from '../../config/db';
import { sendError } from '../../shared/http';

function today() {
  return new Date();
}

export async function listOffers(req: Request, res: Response) {
  try {
    const { activeOnly, page = '1', limit = '50' } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const where: Record<string, unknown> = {};
    if (activeOnly === 'true') {
      const now = today();
      where.isActive = true;
      where.OR = [
        { validFrom: null },
        { validFrom: { lte: now } },
      ];
      // validTo check: null or >= now
      where.AND = [
        {
          OR: [{ validTo: null }, { validTo: { gte: now } }],
        },
      ];
    }

    const [offers, total] = await Promise.all([
      prisma.offer.findMany({
        where,
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limitNum,
      }),
      prisma.offer.count({ where }),
    ]);

    res.json({
      success: true,
      data: offers,
      meta: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', undefined, err);
  }
}

export async function getOffer(req: Request, res: Response) {
  try {
    const offer = await prisma.offer.findUnique({ where: { id: req.params.id } });
    if (!offer) return res.status(404).json({ success: false, message: 'Offer not found' });
    res.json({ success: true, data: offer });
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', undefined, err);
  }
}

export async function createOffer(req: Request, res: Response) {
  try {
    const {
      title, titleAr, description, descriptionAr, imageUrl,
      serviceType, ctaLabel, ctaLabelAr, ctaAction,
      validFrom, validTo, priority, isActive,
    } = req.body;

    if (!title) return res.status(400).json({ success: false, message: 'title is required' });

    const offer = await prisma.offer.create({
      data: {
        title,
        titleAr: titleAr || null,
        description: description || null,
        descriptionAr: descriptionAr || null,
        imageUrl: imageUrl || null,
        serviceType: serviceType || null,
        ctaLabel: ctaLabel || null,
        ctaLabelAr: ctaLabelAr || null,
        ctaAction: ctaAction || null,
        validFrom: validFrom ? new Date(validFrom) : null,
        validTo: validTo ? new Date(validTo) : null,
        priority: priority !== undefined ? parseInt(priority) : 0,
        isActive: isActive !== undefined ? Boolean(isActive) : true,
      },
    });

    res.status(201).json({ success: true, data: offer });
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', undefined, err);
  }
}

export async function updateOffer(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const existing = await prisma.offer.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Offer not found' });

    const {
      title, titleAr, description, descriptionAr, imageUrl,
      serviceType, ctaLabel, ctaLabelAr, ctaAction,
      validFrom, validTo, priority, isActive,
    } = req.body;

    const offer = await prisma.offer.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(titleAr !== undefined && { titleAr }),
        ...(description !== undefined && { description }),
        ...(descriptionAr !== undefined && { descriptionAr }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(serviceType !== undefined && { serviceType }),
        ...(ctaLabel !== undefined && { ctaLabel }),
        ...(ctaLabelAr !== undefined && { ctaLabelAr }),
        ...(ctaAction !== undefined && { ctaAction }),
        ...(validFrom !== undefined && { validFrom: validFrom ? new Date(validFrom) : null }),
        ...(validTo !== undefined && { validTo: validTo ? new Date(validTo) : null }),
        ...(priority !== undefined && { priority: parseInt(priority) }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) }),
      },
    });

    res.json({ success: true, data: offer });
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', undefined, err);
  }
}

export async function deleteOffer(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const existing = await prisma.offer.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Offer not found' });
    await prisma.offer.delete({ where: { id } });
    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', undefined, err);
  }
}

export async function getActiveOffer(_req: Request, res: Response) {
  try {
    const now = today();
    const offer = await prisma.offer.findFirst({
      where: {
        isActive: true,
        OR: [{ validFrom: null }, { validFrom: { lte: now } }],
        AND: [{ OR: [{ validTo: null }, { validTo: { gte: now } }] }],
      },
      orderBy: { priority: 'desc' },
    });
    res.json({ success: true, data: offer || null });
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', undefined, err);
  }
}
