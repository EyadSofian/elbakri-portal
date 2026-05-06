import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/db';

const ACCESS_EXPIRES = process.env.JWT_EXPIRES_IN ?? '1h';
const REFRESH_EXPIRES_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function signAccess(payload: object) {
  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: ACCESS_EXPIRES } as jwt.SignOptions);
}

function signRefresh(payload: object) {
  return jwt.sign(payload, process.env.REFRESH_TOKEN_SECRET!, { expiresIn: '30d' } as jwt.SignOptions);
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    maxAge: REFRESH_EXPIRES_MS,
  };
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as { email: string; password: string };

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) {
    res.status(401).json({ success: false, error: 'UNAUTHORIZED', message: 'Invalid credentials' });
    return;
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    res.status(401).json({ success: false, error: 'UNAUTHORIZED', message: 'Invalid credentials' });
    return;
  }

  const jwtPayload = { id: user.id, email: user.email, role: user.role, companyId: user.companyId };
  const accessToken = signAccess(jwtPayload);
  const refreshToken = signRefresh({ id: user.id });

  await prisma.$transaction([
    prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: new Date(Date.now() + REFRESH_EXPIRES_MS),
      },
    }),
    prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
  ]);

  res.cookie('refreshToken', refreshToken, cookieOptions());
  res.json({
    success: true,
    data: {
      accessToken,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, companyId: user.companyId },
    },
  });
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.refreshToken as string | undefined;
  if (!token) {
    res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
    return;
  }

  let payload: { id: string };
  try {
    payload = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET!) as { id: string };
  } catch {
    res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
    return;
  }

  const stored = await prisma.refreshToken.findUnique({ where: { token }, include: { user: true } });
  if (!stored || stored.expiresAt < new Date() || !stored.user.isActive) {
    res.status(401).json({ success: false, error: 'UNAUTHORIZED' });
    return;
  }

  const user = stored.user;
  const accessToken = signAccess({ id: user.id, email: user.email, role: user.role, companyId: user.companyId });
  res.json({ success: true, data: { accessToken } });
}

export async function logout(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.refreshToken as string | undefined;
  if (token) {
    await prisma.refreshToken.deleteMany({ where: { token } }).catch(() => null);
  }
  res.clearCookie('refreshToken');
  res.json({ success: true, data: null });
}

export async function me(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true, email: true, name: true, nameAr: true, role: true,
      companyId: true, isActive: true, lastLoginAt: true, createdAt: true,
      company: { select: { id: true, name: true, nameAr: true, balance: true } },
    },
  });

  if (!user) {
    res.status(404).json({ success: false, error: 'NOT_FOUND' });
    return;
  }

  res.json({ success: true, data: user });
}
