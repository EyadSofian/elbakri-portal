import { Request, Response } from 'express';
import { prisma } from '../../config/db';
import { sendError } from '../../shared/http';
import {
  createTemplateSchema,
  updateTemplateSchema,
  templateConfigSchema,
  ALLOWED_TARGETS,
} from './ui-templates.schema';

function zodError(err: unknown) {
  if (err && typeof err === 'object' && 'issues' in err) {
    const issues = (err as { issues: { path: (string | number)[]; message: string }[] }).issues;
    return issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
  }
  return (err as Error).message;
}

// ─── Admin: list / get ────────────────────────────────────────────────────────

export async function listTemplates(req: Request, res: Response) {
  try {
    const { target } = req.query as Record<string, string>;
    const where = target ? { target } : {};
    const templates = await prisma.uiTemplate.findMany({
      where,
      orderBy: [{ target: 'asc' }, { updatedAt: 'desc' }],
    });
    res.json({ success: true, data: templates });
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', undefined, err);
  }
}

export async function getTemplate(req: Request, res: Response) {
  try {
    const tpl = await prisma.uiTemplate.findUnique({ where: { id: req.params.id } });
    if (!tpl) return res.status(404).json({ success: false, message: 'Template not found' });
    res.json({ success: true, data: tpl });
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', undefined, err);
  }
}

// ─── Admin: create ────────────────────────────────────────────────────────────

export async function createTemplate(req: Request, res: Response) {
  const parsed = createTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: 'INVALID_CONFIG', message: zodError(parsed.error) });
  }
  try {
    const { key, name, target, serviceType, langMode, isActive, config } = parsed.data;

    const exists = await prisma.uiTemplate.findUnique({ where: { key } });
    if (exists) return res.status(409).json({ success: false, message: 'A template with this key already exists' });

    // If activating, deactivate other templates for the same target+serviceType
    if (isActive) {
      await prisma.uiTemplate.updateMany({
        where: { target, serviceType: serviceType ?? null },
        data: { isActive: false },
      });
    }

    const tpl = await prisma.uiTemplate.create({
      data: {
        key, name, target,
        serviceType: serviceType ?? null,
        langMode: langMode ?? 'both',
        isActive: isActive ?? false,
        config: config as object,
      },
    });
    res.status(201).json({ success: true, data: tpl });
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', undefined, err);
  }
}

// ─── Admin: update ────────────────────────────────────────────────────────────

export async function updateTemplate(req: Request, res: Response) {
  const parsed = updateTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: 'INVALID_CONFIG', message: zodError(parsed.error) });
  }
  try {
    const { id } = req.params;
    const existing = await prisma.uiTemplate.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Template not found' });

    const d = parsed.data;

    // Snapshot current config as a revision before overwriting
    if (d.config) {
      await prisma.uiTemplateRevision.create({
        data: { templateId: id, version: existing.version, config: existing.config as object, createdById: req.user?.id ?? null },
      });
    }

    if (d.isActive) {
      await prisma.uiTemplate.updateMany({
        where: { target: d.target ?? existing.target, serviceType: (d.serviceType ?? existing.serviceType) ?? null, id: { not: id } },
        data: { isActive: false },
      });
    }

    const tpl = await prisma.uiTemplate.update({
      where: { id },
      data: {
        ...(d.name !== undefined && { name: d.name }),
        ...(d.target !== undefined && { target: d.target }),
        ...(d.serviceType !== undefined && { serviceType: d.serviceType }),
        ...(d.langMode !== undefined && { langMode: d.langMode }),
        ...(d.isActive !== undefined && { isActive: d.isActive }),
        ...(d.config !== undefined && { config: d.config as object, version: existing.version + 1 }),
      },
    });
    res.json({ success: true, data: tpl });
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', undefined, err);
  }
}

// ─── Admin: activate / duplicate / preview / delete ───────────────────────────

export async function activateTemplate(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const tpl = await prisma.uiTemplate.findUnique({ where: { id } });
    if (!tpl) return res.status(404).json({ success: false, message: 'Template not found' });

    await prisma.uiTemplate.updateMany({
      where: { target: tpl.target, serviceType: tpl.serviceType, id: { not: id } },
      data: { isActive: false },
    });
    const updated = await prisma.uiTemplate.update({ where: { id }, data: { isActive: true } });
    res.json({ success: true, data: updated });
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', undefined, err);
  }
}

export async function duplicateTemplate(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const src = await prisma.uiTemplate.findUnique({ where: { id } });
    if (!src) return res.status(404).json({ success: false, message: 'Template not found' });

    const copy = await prisma.uiTemplate.create({
      data: {
        key: `${src.key}-copy-${Date.now().toString(36)}`,
        name: `${src.name} (Copy)`,
        target: src.target,
        serviceType: src.serviceType,
        langMode: src.langMode,
        isActive: false,
        config: src.config as object,
      },
    });
    res.status(201).json({ success: true, data: copy });
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', undefined, err);
  }
}

/** Validate a config without saving (used by the admin live preview) */
export async function previewTemplate(req: Request, res: Response) {
  const parsed = templateConfigSchema.safeParse(req.body?.config ?? req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, error: 'INVALID_CONFIG', message: zodError(parsed.error) });
  }
  res.json({ success: true, data: { valid: true, config: parsed.data } });
}

export async function deleteTemplate(req: Request, res: Response) {
  try {
    await prisma.uiTemplate.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', undefined, err);
  }
}

// ─── User: fetch active template for a target (+ optional serviceType) ─────────

export async function getActiveTemplate(req: Request, res: Response) {
  try {
    const target = String(req.params.target);
    if (!ALLOWED_TARGETS.includes(target as never)) {
      return res.status(400).json({ success: false, message: 'Unknown target' });
    }
    const serviceType = req.params.serviceType ?? null;

    // Prefer a serviceType-specific active template, then fall back to target-level
    let tpl = serviceType
      ? await prisma.uiTemplate.findFirst({ where: { target, serviceType, isActive: true }, orderBy: { updatedAt: 'desc' } })
      : null;
    if (!tpl) {
      tpl = await prisma.uiTemplate.findFirst({ where: { target, serviceType: null, isActive: true }, orderBy: { updatedAt: 'desc' } });
    }
    // Returns null data when no template — frontend falls back to its built-in default
    res.json({ success: true, data: tpl ?? null });
  } catch (err) {
    sendError(res, 500, 'INTERNAL_ERROR', undefined, err);
  }
}
