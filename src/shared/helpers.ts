import { randomInt } from 'crypto';
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

/**
 * Generate a temporary password.
 *
 * Uses crypto.randomInt, not Math.random: these passwords are handed to real
 * users (staff onboarding, admin password resets, the seeded SuperAdmin), and
 * Math.random is a predictable PRNG — anyone who observes a few generated
 * values can narrow down the rest. randomInt is also rejection-sampled, so no
 * character is more likely than another.
 *
 * The alphabet deliberately omits look-alikes (I/l/1, O/0) because these get
 * read aloud and retyped.
 */
export function generatePassword(length = 12): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(randomInt(chars.length));
  }
  return password;
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
};

/**
 * Escape user-controlled text before interpolating it into an HTML string
 * (notification emails). Prevents HTML/markup injection into the message body.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
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

type CustomFieldValue = string | number | boolean | string[];

/**
 * Sanitize the `customFields` map submitted alongside a dynamic Request Form
 * Builder template. Only a flat object of primitive values (or arrays of
 * primitives) survives — nested objects, functions and oversized payloads are
 * rejected. Returns `undefined` when there is nothing safe to store so the
 * caller can simply omit the column.
 */
export function sanitizeCustomFields(input: unknown): Record<string, CustomFieldValue> | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;

  const MAX_KEYS = 40;
  const MAX_STR = 2000;
  const MAX_ARR = 30;
  const out: Record<string, CustomFieldValue> = {};

  const coercePrimitive = (v: unknown): string | number | boolean | undefined => {
    if (typeof v === 'string') return v.slice(0, MAX_STR);
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'boolean') return v;
    return undefined;
  };

  let count = 0;
  for (const [rawKey, rawVal] of Object.entries(input as Record<string, unknown>)) {
    if (count >= MAX_KEYS) break;
    const key = String(rawKey).slice(0, 64);
    if (!/^[a-zA-Z0-9_]+$/.test(key)) continue;
    if (rawVal == null || rawVal === '') continue;

    if (Array.isArray(rawVal)) {
      const arr = rawVal
        .slice(0, MAX_ARR)
        .map(item => coercePrimitive(item))
        .filter((item): item is string | number | boolean => item !== undefined)
        .map(String);
      if (arr.length) { out[key] = arr; count++; }
      continue;
    }
    const val = coercePrimitive(rawVal);
    if (val !== undefined) { out[key] = val; count++; }
  }

  return count ? out : undefined;
}
