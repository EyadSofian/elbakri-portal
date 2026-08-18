import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { generatePassword } from '../src/shared/helpers';

/**
 * Base seed: creates the single SuperAdmin account and nothing else.
 *
 * Real catalogue data comes from the dedicated seeds — `db:seed:mea` (rates),
 * `db:seed:hotels` (hotel catalogue), `db:seed:destinations`, `db:seed:airports`.
 * Companies and their users are created through the portal by the SuperAdmin, so
 * no demo companies, agents, bookings or invoices are planted here: this runs
 * against a production database, and fake bookings with fake wallet movements
 * are indistinguishable from real ones once staff start working.
 *
 * The password is NEVER hard-coded. Set SEED_ADMIN_PASSWORD to choose it,
 * otherwise a strong random one is generated and printed once — a committed
 * password is a published password.
 */

const prisma = new PrismaClient();

const ADMIN_EMAIL = (process.env.SEED_ADMIN_EMAIL ?? 'admin@elbakri.com').trim().toLowerCase();

async function main() {
  const existing = await prisma.user.findUnique({
    where: { email: ADMIN_EMAIL },
    select: { id: true },
  });

  if (existing) {
    // Idempotent: never silently reset the password of an account already in
    // use. Rotating it is an explicit action through the portal.
    console.log(`✓ SuperAdmin ${ADMIN_EMAIL} already exists — left untouched.`);
    console.log('\n✅ Seed complete.');
    return;
  }

  const chosen = process.env.SEED_ADMIN_PASSWORD?.trim();
  const password = chosen || generatePassword(20);

  if (chosen && chosen.length < 12) {
    throw new Error('SEED_ADMIN_PASSWORD is shorter than 12 characters — pick a stronger one.');
  }

  await prisma.user.create({
    data: {
      email: ADMIN_EMAIL,
      password: await bcrypt.hash(password, 12),
      name: 'Super Admin',
      nameAr: 'المدير العام',
      role: 'SUPERADMIN',
    },
  });

  console.log('✓ SuperAdmin created.\n');
  console.log('   ─────────────────────────────────────────────');
  console.log(`   Email:    ${ADMIN_EMAIL}`);
  if (chosen) {
    console.log('   Password: (the SEED_ADMIN_PASSWORD you provided)');
  } else {
    console.log(`   Password: ${password}`);
    console.log('   ⚠️  Shown once and never stored in plain text — save it now,');
    console.log('      then change it after the first login.');
  }
  console.log('   ─────────────────────────────────────────────');
  console.log('\n✅ Seed complete.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
