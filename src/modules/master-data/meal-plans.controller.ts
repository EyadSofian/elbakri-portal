import { Request, Response } from 'express';
import { prisma } from '../../config/db';

// ─────────────────────────────────────────────
// Meal plans an admin maintains themselves.
//
// These used to be a fixed enum, so adding something a contract called for —
// Soft All Inclusive, a bespoke board basis — needed a code change. They now
// live in a table: hotel rate rows store the `code`, and the labels are what
// the portal shows. Codes are stable once a rate points at them, so a code is
// normalised on create and never rewritten afterwards.
// ─────────────────────────────────────────────

/** Turn free text into a stable code: "Soft All Inclusive" → SOFT_ALL_INCLUSIVE. */
function toCode(v: unknown): string {
  return String(v ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

export async function listMealPlans(req: Request, res: Response): Promise<void> {
  const includeInactive = req.query.includeInactive === 'true';
  const plans = await prisma.mealPlanOption.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: [{ displayOrder: 'asc' }, { labelEn: 'asc' }],
  });
  res.json({ success: true, data: plans });
}

export async function createMealPlan(req: Request, res: Response): Promise<void> {
  const body = req.body as { code?: string; labelEn?: string; labelAr?: string; displayOrder?: number; isActive?: boolean };
  const labelEn = String(body.labelEn ?? '').trim();
  if (!labelEn) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'An English name is required.' });
    return;
  }
  // Derive the code from the name unless one was given explicitly.
  const code = toCode(body.code || labelEn);
  if (!code) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'The name must contain letters or numbers.' });
    return;
  }
  const clash = await prisma.mealPlanOption.findUnique({ where: { code }, select: { id: true } });
  if (clash) {
    res.status(409).json({ success: false, error: 'DUPLICATE', message: `A meal plan with the code ${code} already exists.` });
    return;
  }
  const plan = await prisma.mealPlanOption.create({
    data: {
      code,
      labelEn,
      labelAr: body.labelAr?.trim() || null,
      displayOrder: Number.isFinite(Number(body.displayOrder)) ? Number(body.displayOrder) : 0,
      isActive: body.isActive !== false,
    },
  });
  res.status(201).json({ success: true, data: plan });
}

export async function updateMealPlan(req: Request, res: Response): Promise<void> {
  const body = req.body as { labelEn?: string; labelAr?: string; displayOrder?: number; isActive?: boolean };
  const data: Record<string, unknown> = {};
  // The code is deliberately not editable: rate rows reference it, and renaming
  // it would orphan every rate already using the plan.
  if (body.labelEn !== undefined) {
    const labelEn = String(body.labelEn).trim();
    if (!labelEn) {
      res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'An English name is required.' });
      return;
    }
    data.labelEn = labelEn;
  }
  if (body.labelAr !== undefined) data.labelAr = body.labelAr ? String(body.labelAr).trim() : null;
  if (body.displayOrder !== undefined) data.displayOrder = Number(body.displayOrder) || 0;
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);

  const plan = await prisma.mealPlanOption.update({ where: { id: req.params.id }, data });
  res.json({ success: true, data: plan });
}

/**
 * Retire a meal plan. A plan still used by a rate is deactivated rather than
 * deleted, so existing prices keep their meaning and the plan simply stops
 * being offered for new rows.
 */
export async function deleteMealPlan(req: Request, res: Response): Promise<void> {
  const plan = await prisma.mealPlanOption.findUnique({ where: { id: req.params.id } });
  if (!plan) {
    res.status(404).json({ success: false, error: 'NOT_FOUND' });
    return;
  }
  const inUse = await prisma.hotelRate.count({ where: { mealPlan: plan.code } });
  if (inUse > 0) {
    const updated = await prisma.mealPlanOption.update({ where: { id: plan.id }, data: { isActive: false } });
    res.json({
      success: true,
      data: updated,
      message: `Used by ${inUse} rate${inUse === 1 ? '' : 's'}, so it was deactivated instead of deleted.`,
    });
    return;
  }
  await prisma.mealPlanOption.delete({ where: { id: plan.id } });
  res.json({ success: true, data: null });
}
