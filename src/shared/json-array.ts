import { Prisma } from '@prisma/client';

/**
 * Helpers for the array-like fields that were `String[]` under PostgreSQL and are
 * now `Json` under MySQL/MariaDB (Prisma does not support scalar-list `String[]`
 * on MySQL). A `Json` column round-trips whatever JS value we store; these
 * helpers keep every read/write normalised to a plain `string[]` so the UI and
 * business logic never have to care that the storage type changed — and never
 * break when the stored value is `null`, a bare string, or a JSON-encoded string.
 */

/**
 * READ side: coerce whatever Prisma returns for a Json array column into a
 * `string[]`. Handles: null/undefined → [], a real array → mapped to strings,
 * a JSON-encoded array string → parsed, a plain non-empty string → single item.
 */
export function jsonStringArray(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.filter((v) => v != null).map((v) => String(v));
  }
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return [];
    if (s.startsWith('[')) {
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) return parsed.filter((v) => v != null).map((v) => String(v));
      } catch {
        /* fall through — treat as a single value */
      }
    }
    return [s];
  }
  return [];
}

/**
 * INPUT side: turn arbitrary caller/import input into a clean `string[]`.
 * Accepts an array, a JSON-encoded array string, or a delimited string
 * (newline / comma / semicolon / pipe — the delimiters used by the Excel and
 * Google Sheets importers). Trims and drops empties.
 */
export function normalizeStringArrayInput(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return [];
    if (s.startsWith('[')) {
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) return parsed.map((v) => String(v).trim()).filter(Boolean);
      } catch {
        /* fall through — split as a delimited string */
      }
    }
    return s.split(/[\n,;|]+/).map((v) => v.trim()).filter(Boolean);
  }
  return [];
}

/**
 * WRITE side: produce a Prisma-safe value to store in a `Json` array column.
 * Always returns a real JSON array (never null), so a written row is always a
 * `[]`-or-more array on read. Use this in every create/update `data: { ... }`.
 */
export function setJsonStringArray(value: unknown): Prisma.InputJsonValue {
  return normalizeStringArrayInput(value);
}
