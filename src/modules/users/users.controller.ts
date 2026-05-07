import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../../config/db';
import { generatePassword, paginate, paginateMeta } from '../../shared/helpers';

const userSelect = {
  id: true, email: true, name: true, nameAr: true, role: true,
  companyId: true, isActive: true, lastLoginAt: true, createdAt: true,
  company: { select: { id: true, name: true } },
};

type UserRole = 'SUPERADMIN' | 'COMPANY_ADMIN' | 'AGENT';

function canManageTarget(caller: NonNullable<Request['user']>, target: { id: string; role: UserRole; companyId: string | null }) {
  if (caller.role === 'SUPERADMIN') return true;
  return target.companyId === caller.companyId && target.role === 'AGENT';
}

export async function listUsers(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const page = parseInt(String(req.query.page ?? '1'));
  const limit = parseInt(String(req.query.limit ?? '20'));
  const { skip, take } = paginate(page, limit);

  const where = caller.role === 'SUPERADMIN'
    ? { ...(req.query.companyId && { companyId: String(req.query.companyId) }) }
    : { companyId: caller.companyId! };

  const [users, total] = await Promise.all([
    prisma.user.findMany({ where, skip, take, orderBy: { createdAt: 'desc' }, select: userSelect }),
    prisma.user.count({ where }),
  ]);

  res.json({ success: true, data: users, meta: paginateMeta(total, page, limit) });
}

export async function createUser(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const body = req.body as {
    email: string; name: string; nameAr?: string;
    password?: string; role?: string; companyId?: string | null;
  };

  if (caller.role !== 'SUPERADMIN' && caller.role !== 'COMPANY_ADMIN') {
    res.status(403).json({ success: false, error: 'FORBIDDEN' });
    return;
  }

  if (caller.role === 'COMPANY_ADMIN') {
    if (body.role && body.role !== 'AGENT') {
      res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Can only create AGENT users' });
      return;
    }
    body.companyId = caller.companyId!;
    body.role = 'AGENT';
  }

  const role = (body.role as UserRole) ?? 'AGENT';
  if (role !== 'SUPERADMIN' && !body.companyId) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'companyId is required for company users' });
    return;
  }

  const tempPassword = body.password ?? generatePassword(12);
  const hashedPassword = await bcrypt.hash(tempPassword, 12);

  const user = await prisma.user.create({
    data: {
      email: body.email,
      name: body.name,
      nameAr: body.nameAr,
      password: hashedPassword,
      role,
      companyId: role === 'SUPERADMIN' ? null : body.companyId,
    },
    select: userSelect,
  });

  res.status(201).json({ success: true, data: { user, tempPassword } });
}

export async function updateUser(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const body = req.body as {
    name?: string; nameAr?: string; email?: string;
    role?: UserRole; companyId?: string | null; isActive?: boolean;
  };

  const target = await prisma.user.findUniqueOrThrow({
    where: { id: req.params.id },
    select: { id: true, role: true, companyId: true },
  });

  if (!canManageTarget(caller, target as { id: string; role: UserRole; companyId: string | null })) {
    res.status(403).json({ success: false, error: 'FORBIDDEN' });
    return;
  }

  if (body.role && caller.role !== 'SUPERADMIN') {
    res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Only SUPERADMIN can change roles' });
    return;
  }

  if (body.companyId !== undefined && caller.role !== 'SUPERADMIN') {
    res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Only SUPERADMIN can change company' });
    return;
  }

  const nextRole = (body.role ?? target.role) as UserRole;
  const nextCompanyId = nextRole === 'SUPERADMIN' ? null : (body.companyId !== undefined ? body.companyId : target.companyId);
  if (nextRole !== 'SUPERADMIN' && !nextCompanyId) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'companyId is required for company users' });
    return;
  }

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: {
      ...(body.name && { name: body.name }),
      ...(body.nameAr !== undefined && { nameAr: body.nameAr }),
      ...(body.email && { email: body.email }),
      ...(body.role && { role: body.role }),
      ...(body.companyId !== undefined || body.role ? { companyId: nextCompanyId } : {}),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
    },
    select: userSelect,
  });

  res.json({ success: true, data: user });
}

export async function resetUserPassword(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const target = await prisma.user.findUniqueOrThrow({
    where: { id: req.params.id },
    select: { id: true, role: true, companyId: true, email: true, name: true },
  });

  if (!canManageTarget(caller, target as { id: string; role: UserRole; companyId: string | null })) {
    res.status(403).json({ success: false, error: 'FORBIDDEN' });
    return;
  }

  const tempPassword = req.body.password ?? generatePassword(12);
  const hashedPassword = await bcrypt.hash(tempPassword, 12);

  await prisma.$transaction([
    prisma.user.update({ where: { id: req.params.id }, data: { password: hashedPassword } }),
    prisma.refreshToken.deleteMany({ where: { userId: req.params.id } }),
  ]);

  res.json({ success: true, data: { userId: target.id, email: target.email, name: target.name, tempPassword } });
}

export async function deleteUser(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  if (caller.id === req.params.id) {
    res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'You cannot delete your own user' });
    return;
  }

  const target = await prisma.user.findUniqueOrThrow({
    where: { id: req.params.id },
    select: { id: true, role: true, companyId: true },
  });

  if (!canManageTarget(caller, target as { id: string; role: UserRole; companyId: string | null })) {
    res.status(403).json({ success: false, error: 'FORBIDDEN' });
    return;
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: req.params.id }, data: { isActive: false } }),
    prisma.refreshToken.deleteMany({ where: { userId: req.params.id } }),
  ]);

  res.json({ success: true, data: null });
}
