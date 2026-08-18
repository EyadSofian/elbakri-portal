/**
 * Prisma error helpers.
 *
 * Prisma throws a tagged error object rather than a typed exception the routes
 * can match on, so the codes are interpreted here once instead of at every call
 * site. Only the shape actually needed is read, so this works whether the thrown
 * value is a PrismaClientKnownRequestError or a plain object from a mock.
 */

interface KnownRequestErrorLike {
  code?: unknown;
  meta?: { target?: unknown };
}

/** P2002 — a unique constraint was violated by a create/update. */
export function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as KnownRequestErrorLike).code === 'P2002';
}

/**
 * Which fields the violated unique constraint covers. Prisma reports these in
 * `meta.target`, as an array on most connectors and a string on some — both are
 * normalised here. Returns an empty array when the driver did not say.
 */
export function uniqueConstraintFields(err: unknown): string[] {
  if (!isUniqueConstraintError(err)) return [];
  const target = (err as KnownRequestErrorLike).meta?.target;
  if (Array.isArray(target)) return target.map(String);
  if (typeof target === 'string') return [target];
  return [];
}

/** True when the unique violation was specifically on the email column. */
export function isDuplicateEmailError(err: unknown): boolean {
  return uniqueConstraintFields(err).some((f) => f.toLowerCase().includes('email'));
}

/** P2025 — the record a query required was not found. */
export function isRecordNotFoundError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as KnownRequestErrorLike).code === 'P2025';
}

/**
 * A duplicate-email violation, tagged with which record it came from.
 *
 * Company.email and User.email are both unique columns named `email`, so the
 * P2002 they raise is indistinguishable by column name alone. Throwing this
 * from the failing create lets the route say which of the two addresses is
 * already taken instead of a generic conflict.
 */
export class DuplicateEmailError extends Error {
  constructor(readonly scope: 'company' | 'user', readonly email: string) {
    super(`Duplicate ${scope} email: ${email}`);
    this.name = 'DuplicateEmailError';
  }
}
