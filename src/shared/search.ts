import { Prisma } from '@prisma/client';

/**
 * Case-insensitive "contains" filter for Prisma string fields.
 *
 * MySQL's default collation (utf8mb4_general_ci) made every LIKE comparison
 * case-insensitive for free, so the portal's search filters were written as a
 * bare `{ contains: term }`. PostgreSQL's LIKE is case-SENSITIVE, so on Postgres
 * that same filter silently stops matching "cairo" against "Cairo" — the search
 * boxes look broken rather than erroring. Postgres needs `mode: 'insensitive'`
 * (which Prisma compiles to ILIKE) to keep the previous behaviour.
 *
 * The helper exists so the query-mode literal keeps its narrow `Prisma.QueryMode`
 * type: written inline inside a `where` object literal it widens to `string` and
 * no longer satisfies Prisma's generated filter types.
 */
export function contains(value: string) {
  return { contains: value, mode: Prisma.QueryMode.insensitive };
}
