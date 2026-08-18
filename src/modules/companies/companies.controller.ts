import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../../config/db';
import { generatePassword, paginate, paginateMeta } from '../../shared/helpers';
import { sendEmail } from '../../shared/email.templates';
import { welcomeEmail, walletTopupEmail } from '../../shared/email.templates';
import { DuplicateEmailError, isDuplicateEmailError } from '../../shared/prisma-errors';

function nullable(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  const text = String(value).trim();
  return text ? text : null;
}

function defaultCompanyCurrency(market: 'EGYPTIAN' | 'INTERNATIONAL'): 'EGP' | 'USD' {
  return market === 'EGYPTIAN' ? 'EGP' : 'USD';
}

function normalizeCompanyCurrency(
  value: string | undefined,
  market: 'EGYPTIAN' | 'INTERNATIONAL',
): 'EGP' | 'USD' {
  return value === 'EGP' || value === 'USD' ? value : defaultCompanyCurrency(market);
}

export async function listCompanies(req: Request, res: Response): Promise<void> {
  const page = parseInt(String(req.query.page ?? '1'));
  const limit = parseInt(String(req.query.limit ?? '20'));
  const { skip, take } = paginate(page, limit);
  const search = String(req.query.search ?? '');
  const tier = req.query.tier as string | undefined;
  const country = req.query.country ? String(req.query.country) : undefined;
  const status = req.query.status ? String(req.query.status).toUpperCase() : undefined;
  const includeInactive = req.query.includeInactive === 'true';
  const isActive = includeInactive
    ? undefined
    : req.query.isActive !== undefined
      ? req.query.isActive === 'true'
      : status
        ? status === 'ACTIVE'
        : true;

  const where: Prisma.CompanyWhereInput = {
    ...(search && {
      OR: [
        { name: { contains: search, mode: 'insensitive' as const } },
        { nameAr: { contains: search, mode: 'insensitive' as const } },
        { email: { contains: search, mode: 'insensitive' as const } },
        { phone: { contains: search, mode: 'insensitive' as const } },
      ],
    }),
    ...(tier && { tier: tier as 'STANDARD' | 'SILVER' | 'GOLD' | 'PLATINUM' }),
    ...(country && { country }),
    ...(isActive !== undefined && { isActive }),
  };

  const [companies, total] = await Promise.all([
    prisma.company.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, nameAr: true, email: true, phone: true,
        country: true, tier: true, balance: true, creditLimit: true,
        currency: true, market: true, logoUrl: true, website: true, themeColor: true,
        isActive: true, lastActivityAt: true, createdAt: true, updatedAt: true,
        _count: { select: { users: true, bookings: true } },
      },
    }),
    prisma.company.count({ where }),
  ]);

  const data = companies.map((company) => ({
    ...company,
    lastActivityAt: company.lastActivityAt ?? company.updatedAt,
  }));

  res.json({ success: true, data, meta: paginateMeta(total, page, limit) });
}

export async function createCompany(req: Request, res: Response): Promise<void> {
  const body = req.body as {
    name: string; nameAr?: string;
    // company.email is the company contact/billing email (unique identifier)
    email: string;
    // adminEmail is the login email for the COMPANY_ADMIN user.
    // If not provided, falls back to company email — but MUST be unique in User table.
    adminEmail?: string;
    adminName?: string;
    phone: string;
    address?: string; billingAddress?: string; country?: string; taxId?: string;
    website?: string; creditLimit?: number; tier?: string; currency?: string;
    market?: string;
    logoUrl?: string; themeColor?: string;
  };

  // Determine admin user email — prefer explicit adminEmail to avoid collision
  const adminEmail = body.adminEmail || body.email;

  const tempPassword = generatePassword(12);
  const hashedPassword = await bcrypt.hash(tempPassword, 12);
  const market = body.market === 'EGYPTIAN' ? 'EGYPTIAN' : 'INTERNATIONAL';
  const currency = normalizeCompanyCurrency(body.currency, market);

  // A company and its admin login are created together or not at all. Done as
  // two separate statements, a failure on the second (a duplicate login email,
  // a dropped connection) left a company nobody could sign in to — visible in
  // every list, impossible to use, and needing manual cleanup. Both emails are
  // unique columns, so the create is also where a collision is detected: no
  // pre-check can close the gap between reading and writing.
  let created: { company: Awaited<ReturnType<typeof prisma.company.create>>; adminUser: { id: string; email: string; name: string; role: string; companyId: string | null } };
  try {
    created = await prisma.$transaction(async (tx) => {
      let company;
      try {
        company = await tx.company.create({
          data: {
            name: body.name,
            nameAr: body.nameAr,
            email: body.email,             // company contact/billing email
            contactEmail: nullable(body.adminEmail !== body.email ? body.adminEmail : undefined),
            phone: body.phone,
            address: nullable(body.address),
            billingAddress: nullable(body.billingAddress),
            country: body.country ?? 'EG',
            taxId: nullable(body.taxId),
            website: nullable(body.website),
            creditLimit: new Decimal(body.creditLimit ?? 0),
            currency,
            market,
            tier: (body.tier as 'STANDARD' | 'SILVER' | 'GOLD' | 'PLATINUM') ?? 'STANDARD',
            logoUrl: nullable(body.logoUrl),
            themeColor: nullable(body.themeColor),
            lastActivityAt: new Date(),
          },
        });
      } catch (err) {
        // Tagged so the handler below can name which of the two emails clashed —
        // both violations report the same column name.
        if (isDuplicateEmailError(err)) throw new DuplicateEmailError('company', body.email);
        throw err;
      }

      try {
        const adminUser = await tx.user.create({
          data: {
            email: adminEmail,
            password: hashedPassword,
            name: body.adminName ?? `${body.name} Admin`,
            role: 'COMPANY_ADMIN',
            companyId: company.id,
          },
          select: {
            id: true, email: true, name: true, role: true, companyId: true,
          },
        });
        return { company, adminUser };
      } catch (err) {
        if (isDuplicateEmailError(err)) throw new DuplicateEmailError('user', adminEmail);
        throw err;
      }
    });
  } catch (err) {
    if (err instanceof DuplicateEmailError) {
      res.status(409).json({
        success: false,
        error: 'EMAIL_EXISTS',
        message: err.scope === 'company'
          ? `A company with the email "${err.email}" already exists.`
          : `A user with email "${err.email}" already exists. Use adminEmail to specify a different login email for the company admin.`,
      });
      return;
    }
    throw err;
  }

  const { company, adminUser } = created;

  // Only once the transaction has committed — a welcome email for a company
  // that was rolled back would hand out a password for an account that does
  // not exist.
  const { subject, html } = welcomeEmail(company, { ...adminUser, nameAr: null }, tempPassword);
  // Notify both the company email and the admin login email
  const recipients = [...new Set([body.email, adminEmail, process.env.INTERNAL_TEAM_EMAIL].filter(Boolean) as string[])];
  if (recipients.length) sendEmail(recipients, subject, html).catch(console.error);

  res.status(201).json({ success: true, data: { company, adminUser, tempPassword } });
}

export async function getCompany(req: Request, res: Response): Promise<void> {
  const company = await prisma.company.findUnique({
    where: { id: req.params.id },
    include: {
      users: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, name: true, nameAr: true, email: true, role: true,
          isActive: true, lastLoginAt: true, createdAt: true,
        },
      },
      bookings: {
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true, refNumber: true, type: true, status: true,
          totalAmount: true, currency: true, createdAt: true,
          checkIn: true, checkOut: true, destination: true,
        },
      },
      transactions: {
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true, type: true, amount: true, balanceBefore: true,
          balanceAfter: true, reference: true, description: true, createdAt: true,
        },
      },
      invoices: {
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true, invoiceNumber: true, status: true, subtotal: true,
          taxAmount: true, total: true, currency: true, dueDate: true,
          paidAt: true, createdAt: true,
        },
      },
      _count: { select: { users: true, bookings: true } },
    },
  });

  if (!company) {
    res.status(404).json({ success: false, error: 'NOT_FOUND' });
    return;
  }

  res.json({ success: true, data: company });
}

export async function updateCompany(req: Request, res: Response): Promise<void> {
  const body = req.body as {
    name?: string; nameAr?: string; email?: string; contactEmail?: string; phone?: string; address?: string;
    billingAddress?: string; country?: string; taxId?: string; website?: string;
    tier?: string; creditLimit?: number; currency?: string; market?: string; logoUrl?: string;
    themeColor?: string; isActive?: boolean;
  };

  const current = await prisma.company.findUniqueOrThrow({
    where: { id: req.params.id },
    select: { market: true, currency: true },
  });
  const nextMarket = body.market === 'EGYPTIAN'
    ? 'EGYPTIAN'
    : body.market === 'INTERNATIONAL'
      ? 'INTERNATIONAL'
      : (current.market === 'EGYPTIAN' ? 'EGYPTIAN' : 'INTERNATIONAL');
  const nextCurrency = body.currency !== undefined || body.market !== undefined
    ? normalizeCompanyCurrency(body.currency ?? current.currency, nextMarket)
    : undefined;

  let company;
  try {
    company = await prisma.company.update({
      where: { id: req.params.id },
      data: {
        ...(body.name && { name: body.name }),
        ...(body.nameAr !== undefined && { nameAr: body.nameAr }),
        ...(body.email && { email: body.email }),
        ...(body.phone && { phone: body.phone }),
        ...(body.address !== undefined && { address: nullable(body.address) }),
        ...(body.billingAddress !== undefined && { billingAddress: nullable(body.billingAddress) }),
        ...(body.country && { country: body.country }),
        ...(body.contactEmail !== undefined && { contactEmail: nullable(body.contactEmail) }),
        ...(body.taxId !== undefined && { taxId: nullable(body.taxId) }),
        ...(body.website !== undefined && { website: nullable(body.website) }),
        ...(body.tier && { tier: body.tier as 'STANDARD' | 'SILVER' | 'GOLD' | 'PLATINUM' }),
        ...(body.market && { market: nextMarket }),
        ...(body.creditLimit !== undefined && { creditLimit: new Decimal(body.creditLimit) }),
        ...(nextCurrency && { currency: nextCurrency }),
        ...(body.logoUrl !== undefined && { logoUrl: nullable(body.logoUrl) }),
        ...(body.themeColor !== undefined && { themeColor: nullable(body.themeColor) }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
        lastActivityAt: new Date(),
      },
    });
  } catch (err) {
    if (isDuplicateEmailError(err)) {
      res.status(409).json({
        success: false,
        error: 'EMAIL_EXISTS',
        message: `Another company already uses the email "${body.email}".`,
      });
      return;
    }
    throw err;
  }

  res.json({ success: true, data: company });
}

export async function topupCompany(req: Request, res: Response): Promise<void> {
  const { amount, currency, description, notify } = req.body as {
    amount: number; currency?: string; description: string; notify?: boolean;
  };
  const companyId = req.params.id;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
      const amountDecimal = new Decimal(amount);
      const walletCurrency = String(currency || company.currency || 'USD').toUpperCase();
      if (walletCurrency !== company.currency) throw new Error('CURRENCY_MISMATCH');

      const platformWallet = await tx.platformWallet.upsert({
        where: { currency: walletCurrency },
        create: { currency: walletCurrency, balance: new Decimal(0) },
        update: {},
      });
      if (platformWallet.balance.lt(amountDecimal)) throw new Error('INSUFFICIENT_PLATFORM_BALANCE');

      const platformBefore = platformWallet.balance;
      const platformAfter = platformBefore.sub(amountDecimal);
      await tx.platformWallet.update({
        where: { currency: walletCurrency },
        data: { balance: platformAfter },
      });
      await tx.platformWalletTransaction.create({
        data: {
          type: 'DEBIT',
          amount: amountDecimal,
          balanceBefore: platformBefore,
          balanceAfter: platformAfter,
          currency: walletCurrency,
          reference: `TOPUP-${companyId}`,
          description: `Top-up ${company.name}: ${description}`,
          companyId,
          createdById: req.user!.id,
        },
      });

      const balanceBefore = company.balance;
      const balanceAfter = balanceBefore.add(amountDecimal);

      const updated = await tx.company.update({
        where: { id: companyId },
        data: { balance: balanceAfter },
      });

      const transaction = await tx.walletTransaction.create({
        data: {
          companyId,
          type: 'CREDIT',
          amount: amountDecimal,
          balanceBefore,
          balanceAfter,
          description,
          createdById: req.user!.id,
        },
      });

      return { company: updated, transaction, platformBalance: platformAfter };
    });

    if (notify !== false) {
      const recipients = [result.company.email, process.env.INTERNAL_TEAM_EMAIL].filter(Boolean) as string[];
      const { subject, html } = walletTopupEmail(result.company, result.transaction);
      if (recipients.length) sendEmail(recipients, subject, html).catch(console.error);
    }

    res.json({ success: true, data: result });
  } catch (error) {
    const message = String((error as Error).message);
    if (message === 'INSUFFICIENT_PLATFORM_BALANCE') {
      res.status(400).json({
        success: false,
        error: 'INSUFFICIENT_PLATFORM_BALANCE',
        message: 'Platform wallet does not have enough funds. Add funds first.',
      });
      return;
    }
    if (message === 'CURRENCY_MISMATCH') {
      res.status(400).json({
        success: false,
        error: 'CURRENCY_MISMATCH',
        message: 'Top-up currency must match the company wallet currency.',
      });
      return;
    }
    throw error;
  }
}

export async function deleteCompany(req: Request, res: Response): Promise<void> {
  const company = await prisma.company.update({
    where: { id: req.params.id },
    data: { isActive: false, lastActivityAt: new Date() },
  });

  await prisma.user.updateMany({
    where: { companyId: req.params.id },
    data: { isActive: false },
  });

  res.json({ success: true, data: company });
}
