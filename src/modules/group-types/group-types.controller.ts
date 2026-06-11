import { Request, Response } from 'express';
import { PricingAdjustmentType, ServiceScope } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../config/db';
import { findApplicableGroupTypes } from './group-types.service';

const groupTypeSchema = z.object({
  scope: z.nativeEnum(ServiceScope),
  code: z.string().trim().min(1).max(40).transform((value) => value.toUpperCase().replace(/\s+/g, '_')),
  labelEn: z.string().trim().min(1).max(80),
  labelAr: z.string().trim().max(80).nullish(),
  descriptionEn: z.string().trim().max(300).nullish(),
  descriptionAr: z.string().trim().max(300).nullish(),
  destinationId: z.string().trim().nullish(),
  activityId: z.string().trim().nullish(),
  transportRateId: z.string().trim().nullish(),
  adjustmentType: z.nativeEnum(PricingAdjustmentType).default('NONE'),
  adjustmentValue: z.coerce.number().min(0).max(1000000).default(0),
  minPax: z.coerce.number().int().min(1).max(999).default(1),
  maxPax: z.coerce.number().int().min(1).max(999).nullish(),
  isActive: z.coerce.boolean().default(true),
  displayOrder: z.coerce.number().int().min(0).max(999).default(0),
  validFrom: z.string().datetime().nullish(),
  validTo: z.string().datetime().nullish(),
}).superRefine((data, ctx) => {
  const targetCount = [data.destinationId, data.activityId, data.transportRateId].filter(Boolean).length;
  if (targetCount > 1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['destinationId'], message: 'Select only one target level' });
  }
  if (data.maxPax != null && data.maxPax < data.minPax) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['maxPax'], message: 'maxPax must be greater than or equal to minPax' });
  }
  if (data.scope === 'ACTIVITY' && data.transportRateId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['transportRateId'], message: 'Activity types cannot target a transport rate' });
  }
  if (data.scope === 'TRANSPORT' && data.activityId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['activityId'], message: 'Transport types cannot target an activity' });
  }
  if (data.adjustmentType === 'PERCENTAGE' && data.adjustmentValue > 100) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['adjustmentValue'], message: 'Percentage adjustment cannot exceed 100' });
  }
  if (data.validFrom && data.validTo && new Date(data.validTo) < new Date(data.validFrom)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['validTo'], message: 'validTo must be after validFrom' });
  }
});

function parsedData(body: unknown) {
  const parsed = groupTypeSchema.parse(body);
  return {
    ...parsed,
    labelAr: parsed.labelAr || null,
    descriptionEn: parsed.descriptionEn || null,
    descriptionAr: parsed.descriptionAr || null,
    destinationId: parsed.destinationId || null,
    activityId: parsed.activityId || null,
    transportRateId: parsed.transportRateId || null,
    adjustmentValue: parsed.adjustmentType === 'NONE' ? 0 : parsed.adjustmentValue,
    validFrom: parsed.validFrom ? new Date(parsed.validFrom) : null,
    validTo: parsed.validTo ? new Date(parsed.validTo) : null,
  };
}

async function hasDuplicateTarget(data: ReturnType<typeof parsedData>, excludeId?: string) {
  return prisma.serviceGroupType.findFirst({
    where: {
      ...(excludeId && { id: { not: excludeId } }),
      scope: data.scope,
      code: data.code,
      destinationId: data.destinationId,
      activityId: data.activityId,
      transportRateId: data.transportRateId,
    },
    select: { id: true },
  });
}

export async function listGroupTypes(req: Request, res: Response): Promise<void> {
  const scope = String(req.query.scope ?? '') as ServiceScope;
  if (!Object.values(ServiceScope).includes(scope)) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'scope is required' });
    return;
  }

  const data = req.user?.role === 'SUPERADMIN' && req.query.admin === 'true'
    ? await prisma.serviceGroupType.findMany({
        where: {
          scope,
          ...(req.query.destinationId && { destinationId: String(req.query.destinationId) }),
          ...(req.query.activityId && { activityId: String(req.query.activityId) }),
          ...(req.query.transportRateId && { transportRateId: String(req.query.transportRateId) }),
        },
        include: {
          destination: { select: { id: true, name: true, nameAr: true } },
          activity: { select: { id: true, name: true } },
          transportRate: { select: { id: true, fromLocation: true, toLocation: true, vehicleType: true } },
        },
        orderBy: [{ displayOrder: 'asc' }, { labelEn: 'asc' }],
      })
    : await findApplicableGroupTypes({
        scope,
        destinationId: req.query.destinationId ? String(req.query.destinationId) : undefined,
        activityId: req.query.activityId ? String(req.query.activityId) : undefined,
        transportRateId: req.query.transportRateId ? String(req.query.transportRateId) : undefined,
        pax: req.query.pax ? Number(req.query.pax) : undefined,
        date: req.query.date ? new Date(String(req.query.date)) : undefined,
      });

  res.json({ success: true, data });
}

export async function createGroupType(req: Request, res: Response): Promise<void> {
  try {
    const data = parsedData(req.body);
    if (await hasDuplicateTarget(data)) {
      res.status(409).json({ success: false, error: 'DUPLICATE_GROUP_TYPE', message: 'This service type code already exists for the selected target' });
      return;
    }
    const created = await prisma.serviceGroupType.create({ data });
    res.status(201).json({ success: true, data: created });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'VALIDATION_ERROR', details: error.flatten() });
      return;
    }
    throw error;
  }
}

export async function updateGroupType(req: Request, res: Response): Promise<void> {
  try {
    const data = parsedData(req.body);
    if (await hasDuplicateTarget(data, req.params.id)) {
      res.status(409).json({ success: false, error: 'DUPLICATE_GROUP_TYPE', message: 'This service type code already exists for the selected target' });
      return;
    }
    const updated = await prisma.serviceGroupType.update({ where: { id: req.params.id }, data });
    res.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ success: false, error: 'VALIDATION_ERROR', details: error.flatten() });
      return;
    }
    throw error;
  }
}

export async function deleteGroupType(req: Request, res: Response): Promise<void> {
  await prisma.serviceGroupType.update({ where: { id: req.params.id }, data: { isActive: false } });
  res.json({ success: true });
}
