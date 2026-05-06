import { PrismaClient } from '@prisma/client';

export async function generateRef(prisma: PrismaClient, prefix: string): Promise<string> {
  const year = new Date().getFullYear();
  const counter = await prisma.$transaction(async (tx) => {
    return tx.bookingCounter.upsert({
      where: { year },
      update: { lastSeq: { increment: 1 } },
      create: { year, lastSeq: 1 },
    });
  });
  return `${prefix}-${year}-${String(counter.lastSeq).padStart(4, '0')}`;
}

export async function generateBookingRef(prisma: PrismaClient): Promise<string> {
  return generateRef(prisma, 'EBK');
}

export async function generateInvoiceNumber(prisma: PrismaClient): Promise<string> {
  const year = new Date().getFullYear();
  const counter = await prisma.$transaction(async (tx) => {
    return tx.invoiceCounter.upsert({
      where: { year },
      update: { lastSeq: { increment: 1 } },
      create: { year, lastSeq: 1 },
    });
  });
  return `INV-${year}-${String(counter.lastSeq).padStart(4, '0')}`;
}

export function generatePassword(length = 12): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

export function paginate(page: number, limit: number) {
  const p = Math.max(1, page);
  const l = Math.min(100, Math.max(1, limit));
  return { skip: (p - 1) * l, take: l, page: p, limit: l };
}

export function paginateMeta(total: number, page: number, limit: number) {
  return {
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  };
}
