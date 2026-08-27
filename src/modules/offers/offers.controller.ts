import { Request, Response } from 'express';
import { prisma } from '../../config/db';
import { sendError } from '../../shared/http';

const offerKind = (value: unknown) => String(value ?? '').toUpperCase() === 'PACKAGE' ? 'PACKAGE' : 'OFFER';
const jsonRows = (value: unknown) => Array.isArray(value) ? value.slice(0, 100) : [];

function packageData(source: Record<string, unknown>) {
  const hotels = jsonRows(source.hotelItems).map((raw) => {
    const row = raw as Record<string, unknown>;
    const name = String(row?.name ?? '').trim();
    return name ? { name, hotelId: String(row.hotelId ?? '').trim() || null, nights: Math.max(1, Math.floor(Number(row.nights) || 1)), mealPlan: String(row.mealPlan ?? '').trim() || null } : null;
  }).filter(Boolean);
  const transfers = jsonRows(source.transferItems).map((raw) => {
    const row = raw as Record<string, unknown>;
    const from = String(row?.from ?? '').trim();
    const to = String(row?.to ?? '').trim();
    return from && to ? { from, to, vehicleType: String(row.vehicleType ?? '').trim() || null } : null;
  }).filter(Boolean);
  const activities = jsonRows(source.activityItems).map((raw) => {
    const row = raw as Record<string, unknown>;
    const name = String(row?.name ?? '').trim();
    return name ? { name, activityId: String(row.activityId ?? '').trim() || null, date: String(row.date ?? '').trim() || null } : null;
  }).filter(Boolean);
  const pricingPeriods = jsonRows(source.pricingPeriods).map((raw) => {
    const row = raw as Record<string, unknown>;
    const market = String(row?.market ?? '').toUpperCase() === 'EGYPTIAN' ? 'EGYPTIAN' : 'FOREIGN';
    const currency = market === 'EGYPTIAN' ? 'EGP' : 'USD';
    const validFrom = String(row?.validFrom ?? '').slice(0, 10);
    const validTo = String(row?.validTo ?? '').slice(0, 10);
    const money = (value: unknown) => value === '' || value == null ? null : Number(value);
    return {
      validFrom, validTo, market, currency,
      singlePrice: money(row.singlePrice), doublePrice: money(row.doublePrice),
      triplePrice: money(row.triplePrice), childPrice: money(row.childPrice),
    };
  });
  if (!hotels.length) throw new Error('PACKAGE_HOTEL_REQUIRED');
  if (!pricingPeriods.length || pricingPeriods.some((row) => {
    const prices = [row.singlePrice, row.doublePrice, row.triplePrice, row.childPrice];
    return !row.validFrom || !row.validTo || row.validTo < row.validFrom
      || prices.some((price) => price == null || !Number.isFinite(price) || price < 0);
  })) throw new Error('PACKAGE_PRICE_PERIOD_INVALID');
  return { hotelItems: hotels, transferItems: transfers, activityItems: activities, pricingPeriods };
}

function today() {
  return new Date();
}

export async function listOffers(req: Request, res: Response) {
  try {
    const { activeOnly, kind, page = '1', limit = '50' } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const where: Record<string, unknown> = {};
    if (kind) where.kind = offerKind(kind);
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
      kind, hotelItems, transferItems, activityItems, pricingPeriods,
      serviceType, ctaLabel, ctaLabelAr, ctaAction,
      validFrom, validTo, priority, isActive,
    } = req.body;

    if (!title) return res.status(400).json({ success: false, message: 'title is required' });

    const resolvedKind = offerKind(kind);
    const components = resolvedKind === 'PACKAGE' ? packageData(req.body as Record<string, unknown>) : {
      hotelItems: jsonRows(hotelItems), transferItems: jsonRows(transferItems),
      activityItems: jsonRows(activityItems), pricingPeriods: jsonRows(pricingPeriods),
    };
    const offer = await prisma.offer.create({
      data: {
        title,
        titleAr: titleAr || null,
        description: description || null,
        descriptionAr: descriptionAr || null,
        imageUrl: imageUrl || null,
        kind: resolvedKind,
        ...components,
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
    if ((err as Error).message === 'PACKAGE_HOTEL_REQUIRED' || (err as Error).message === 'PACKAGE_PRICE_PERIOD_INVALID') {
      return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: (err as Error).message });
    }
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
      kind, hotelItems, transferItems, activityItems, pricingPeriods,
      serviceType, ctaLabel, ctaLabelAr, ctaAction,
      validFrom, validTo, priority, isActive,
    } = req.body;

    const resolvedKind = kind === undefined ? existing.kind : offerKind(kind);
    const componentSource = {
      hotelItems: hotelItems === undefined ? existing.hotelItems : hotelItems,
      transferItems: transferItems === undefined ? existing.transferItems : transferItems,
      activityItems: activityItems === undefined ? existing.activityItems : activityItems,
      pricingPeriods: pricingPeriods === undefined ? existing.pricingPeriods : pricingPeriods,
    };
    const components = resolvedKind === 'PACKAGE' ? packageData(componentSource) : componentSource;
    const offer = await prisma.offer.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(titleAr !== undefined && { titleAr }),
        ...(description !== undefined && { description }),
        ...(descriptionAr !== undefined && { descriptionAr }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(kind !== undefined && { kind: resolvedKind }),
        ...(resolvedKind === 'PACKAGE' && components),
        ...(resolvedKind === 'OFFER' && hotelItems !== undefined && { hotelItems: jsonRows(hotelItems) }),
        ...(resolvedKind === 'OFFER' && transferItems !== undefined && { transferItems: jsonRows(transferItems) }),
        ...(resolvedKind === 'OFFER' && activityItems !== undefined && { activityItems: jsonRows(activityItems) }),
        ...(resolvedKind === 'OFFER' && pricingPeriods !== undefined && { pricingPeriods: jsonRows(pricingPeriods) }),
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
    if ((err as Error).message === 'PACKAGE_HOTEL_REQUIRED' || (err as Error).message === 'PACKAGE_PRICE_PERIOD_INVALID') {
      return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: (err as Error).message });
    }
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
        kind: 'OFFER',
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
