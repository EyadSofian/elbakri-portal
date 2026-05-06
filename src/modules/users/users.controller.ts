import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../../config/db';
import { generatePassword, paginate, paginateMeta } from '../../shared/helpers';

const userSelect = {
  id: true, email: true, name: true, nameAr: true, role: true,
  companyId: true, isActive: true, lastLoginAt: true, createdAt: true,
  company: { select: { id: true, name: true } },
};

export async function listUsers(req: Request, res: Response): Promise<void> {
  const caller = req.user!;

  if (caller.role === 'AGENT') {
    res.status(403).json({ success: false, error: 'FORBIDDEN' });
    return;
  }

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
    password?: string; role?: string; companyId?: string;
  };

  if (caller.role === 'COMPANY_ADMIN') {
    if (body.role && body.role !== 'AGENT') {
      res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Can only create AGENT users' });
      return;
    }
    body.companyId = caller.companyId!;
    body.role = 'AGENT';
  }

  const tempPassword = body.password ?? generatePassword(12);
  const hashedPassword = await bcrypt.hash(tempPassword, 12);

  const user = await prisma.user.create({
    data: {
      email: body.email,
      name: body.name,
      nameAr: body.nameAr,
      password: hashedPassword,
      role: (body.role as 'SUPERADMIN' | 'COMPANY_ADMIN' | 'AGENT') ?? 'AGENT',
      companyId: body.companyId,
    },
    select: userSelect,
  });

  res.status(201).json({ success: true, data: { user, tempPassword } });
}

export async function updateUser(req: Request, res: Response): Promise<void> {
  const caller = req.user!;
  const body = req.body as {
    name?: string; nameAr?: string; email?: string;
    role?: string; isActive?: boolean;
  };

  if (body.role && caller.role !== 'SUPERADMIN') {
    res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Only SUPERADMIN can change roles' });
    return;
  }

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: {
      ...(body.name && { name: body.name }),
      ...(body.nameAr !== undefined && { nameAr: body.nameAr }),
      ...(body.email && { email: body.email }),
      ...(body.role && { role: body.role as 'SUPERADMIN' | 'COMPANY_ADMIN' | 'AGENT' }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
    },
    select: userSelect,
  });

  res.json({ success: true, data: user });
}

export async function deleteUser(req: Request, res: Response): Promise<void> {
  await prisma.$transaction([
    prisma.user.update({ where: { id: req.params.id }, data: { isActive: false } }),
    prisma.refreshToken.deleteMany({ where: { userId: req.params.id } }),
  ]);

  res.json({ success: true, data: null });
}
