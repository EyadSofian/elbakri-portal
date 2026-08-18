import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import {
  PUBLIC_UPLOADS_DIR,
  PRIVATE_UPLOADS_DIR,
  GENERATED_DIR,
} from '../src/config/paths';

/**
 * FULL DATA RESET — empties every table in the database so the catalogue
 * (hotels, destinations, rates, activities, transport …) can be rebuilt from
 * scratch, while the schema itself and the migration history stay untouched.
 *
 * Why not `prisma migrate reset`: that drops and recreates the whole schema.
 * It needs DDL rights on the production database, re-runs every migration, and
 * takes the app down while it works. This script only removes ROWS, so the
 * running app keeps its tables, indexes and enums exactly as they are.
 *
 * Why not the old `prisma/clear-data.ts`: it named 19 models by hand and the
 * schema now has 48. Everything added since — destinations, hotel rates and
 * supplements, quote requests, vouchers, transport rates, airports, activity
 * packages, offers, SIM packages, consolidated invoices, market prices, UI
 * templates … — silently survived a "clear all data" run. This script asks the
 * DATABASE which tables exist, so a model added tomorrow is covered with no
 * edit here.
 *
 * SAFE BY DEFAULT
 *  - Dry-run unless `--yes` is passed: it prints the row count of every table
 *    and changes nothing.
 *  - The SUPERADMIN logins are read before the wipe and restored after it, so
 *    you are never locked out of the portal. `--wipe-superadmin` opts out.
 *  - Uploaded files are left on disk unless `--files` is passed.
 *
 * USAGE — run it from a shell INSIDE the Railway service (`railway ssh`), not
 * through `railway run`: that executes on your own machine, where the
 * DATABASE_URL's `*.railway.internal` host does not resolve. To run it from
 * your machine anyway, override the URL with the public one:
 * `DATABASE_URL="$DATABASE_PUBLIC_URL" npx ts-node prisma/reset-all-data.ts`.
 *
 *   npx ts-node prisma/reset-all-data.ts             # preview only
 *   npx ts-node prisma/reset-all-data.ts --yes       # wipe rows
 *   npx ts-node prisma/reset-all-data.ts --yes --files
 *   npx ts-node prisma/reset-all-data.ts --yes --wipe-superadmin
 *
 * AFTER THE WIPE, rebuild the catalogue (each seed is idempotent):
 *   npm run db:seed              # SuperAdmin (only needed with --wipe-superadmin)
 *   npm run db:seed:hotels       # hotel catalogue
 *   npm run db:seed:mea          # destinations, rates, activities, transport
 *   npm run db:seed:airports     # Egyptian airports
 *   npm run db:seed:destinations # destination hero images
 *   npm run db:apply:images      # hotel hero images
 */

const prisma = new PrismaClient();

const APPLY = process.argv.includes('--yes');
const WIPE_SUPERADMIN = process.argv.includes('--wipe-superadmin');
const WIPE_FILES = process.argv.includes('--files');

/** Postgres identifiers we generate ourselves are still validated before being
 *  interpolated into raw SQL — table names come from the catalogue, but a
 *  whitelist keeps this honest if that ever stops being true. */
const SAFE_IDENT = /^[A-Za-z_][A-Za-z0-9_$]*$/;

/** Prisma's own bookkeeping table — dropping its rows would make the database
 *  look un-migrated and the next `migrate deploy` would try to replay
 *  everything against a schema that already exists. */
const PROTECTED_TABLES = new Set(['_prisma_migrations']);

function quote(schema: string, table: string): string {
  if (!SAFE_IDENT.test(schema) || !SAFE_IDENT.test(table)) {
    throw new Error(`Refusing to touch unsafe identifier: ${schema}.${table}`);
  }
  return `"${schema}"."${table}"`;
}

async function listTables(): Promise<{ schema: string; table: string }[]> {
  const rows = await prisma.$queryRaw<{ table_schema: string; table_name: string }[]>`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;
  return rows
    .filter((r) => !PROTECTED_TABLES.has(r.table_name))
    .map((r) => ({ schema: r.table_schema, table: r.table_name }));
}

async function countRows(tables: { schema: string; table: string }[]) {
  const counts: { table: string; rows: number }[] = [];
  for (const t of tables) {
    const [{ n }] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*)::bigint AS n FROM ${quote(t.schema, t.table)}`,
    );
    counts.push({ table: t.table, rows: Number(n) });
  }
  return counts;
}

function printCounts(counts: { table: string; rows: number }[]) {
  const width = Math.max(...counts.map((c) => c.table.length), 5);
  const nonEmpty = counts.filter((c) => c.rows > 0);
  for (const c of nonEmpty) {
    console.log(`   ${c.table.padEnd(width)}  ${String(c.rows).padStart(8)}`);
  }
  if (!nonEmpty.length) console.log('   (all tables already empty)');
  const total = counts.reduce((s, c) => s + c.rows, 0);
  console.log(`   ${'─'.repeat(width + 10)}`);
  console.log(`   ${'TOTAL'.padEnd(width)}  ${String(total).padStart(8)} rows in ${counts.length} tables\n`);
  return total;
}

/** Empties a directory's contents without removing the directory itself (and
 *  keeps .gitkeep so the folder survives in git). */
function emptyDir(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let removed = 0;
  for (const entry of fs.readdirSync(dir)) {
    if (entry === '.gitkeep') continue;
    fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
    removed++;
  }
  return removed;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set — nothing to reset. Run this through `railway run` or with a local .env.');
  }

  // Show WHICH database is about to be emptied. Host and database name only —
  // the credentials in the URL are never printed.
  try {
    const u = new URL(process.env.DATABASE_URL);
    console.log(`\n🗄️  Target: ${u.hostname}${u.port ? ':' + u.port : ''}${u.pathname}\n`);
  } catch {
    console.log('\n🗄️  Target: (DATABASE_URL could not be parsed for display)\n');
  }

  const tables = await listTables();
  if (!tables.length) {
    console.log('No tables found in the current schema — has `prisma migrate deploy` been run?');
    return;
  }

  console.log('Current contents:');
  const before = await countRows(tables);
  const total = printCounts(before);

  const superadmins = await prisma.user.findMany({ where: { role: 'SUPERADMIN' } });

  if (!APPLY) {
    console.log('DRY RUN — nothing was deleted.');
    console.log(`This would empty all ${tables.length} tables (${total} rows).`);
    if (WIPE_SUPERADMIN) {
      console.log(`The ${superadmins.length} SUPERADMIN login(s) would be deleted too (--wipe-superadmin).`);
      console.log('You would then have to run `npm run db:seed` to create a new one.');
    } else {
      console.log(
        superadmins.length
          ? `${superadmins.length} SUPERADMIN login(s) would be preserved: ${superadmins.map((u) => u.email).join(', ')}`
          : '⚠️  No SUPERADMIN exists — run `npm run db:seed` after the wipe or you cannot log in.',
      );
    }
    if (WIPE_FILES) console.log('Uploaded images, private documents and generated PDFs would be deleted too (--files).');
    console.log('\nRe-run with --yes to actually delete.\n');
    return;
  }

  // ── APPLY ────────────────────────────────────────────────────────────────
  // One TRUNCATE naming every table: CASCADE resolves foreign keys for us, so
  // there is no hand-maintained delete order to get wrong, and it is a single
  // atomic statement — the database is never left half-empty.
  const list = tables.map((t) => quote(t.schema, t.table)).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  console.log(`✓ Emptied ${tables.length} tables.`);

  if (!WIPE_SUPERADMIN && superadmins.length) {
    // companyId is cleared: whatever company it pointed at no longer exists.
    await prisma.user.createMany({
      data: superadmins.map((u) => ({ ...u, companyId: null })),
    });
    console.log(`✓ Restored ${superadmins.length} SUPERADMIN login(s): ${superadmins.map((u) => u.email).join(', ')}`);
    console.log('  (same email, same password — nothing to reset)');
  } else if (WIPE_SUPERADMIN) {
    console.log('✓ SUPERADMIN logins deleted as requested — run `npm run db:seed` to create one.');
  } else {
    console.log('⚠️  There was no SUPERADMIN to preserve — run `npm run db:seed` before trying to log in.');
  }

  if (WIPE_FILES) {
    const pub = emptyDir(PUBLIC_UPLOADS_DIR);
    const priv = emptyDir(PRIVATE_UPLOADS_DIR);
    const gen = emptyDir(GENERATED_DIR);
    console.log(`✓ Deleted files — uploads: ${pub}, private: ${priv}, generated PDFs: ${gen}`);
  } else {
    console.log('ℹ️  Uploaded files left on disk (pass --files to delete them too).');
  }

  console.log('\nAfter:');
  printCounts(await countRows(tables));

  console.log('Now rebuild the catalogue:');
  if (WIPE_SUPERADMIN) console.log('   npm run db:seed              # SuperAdmin login');
  console.log('   npm run db:seed:hotels       # hotel catalogue');
  console.log('   npm run db:seed:mea          # destinations, rates, activities, transport');
  console.log('   npm run db:seed:airports     # Egyptian airports');
  console.log('   npm run db:seed:destinations # destination hero images');
  console.log('   npm run db:apply:images      # hotel hero images');
  console.log('\n✅ Reset complete.\n');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
