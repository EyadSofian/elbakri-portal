import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

/**
 * Remove the demo companies (and everything hanging off them) that older
 * versions of `db:seed` planted: Nile Travel Agency and Pyramids Tours, their
 * admin + agent logins, and the fake bookings, invoices and wallet movements
 * attributed to them.
 *
 * Changing the seed only stops NEW databases getting demo data — a database
 * that was already seeded still holds it, and fake bookings are impossible to
 * tell apart from real ones once staff start working. This deletes it.
 *
 * Real catalogue data is never touched: hotels, destinations, activities,
 * transport and rates from `db:seed:mea` / `db:seed:hotels` are left alone, and
 * so is the SuperAdmin. Only records belonging to the two demo companies go.
 *
 * Dry-run by default — it prints what it would delete and changes nothing.
 * Pass --yes to actually delete.
 *
 *   railway run npx ts-node prisma/remove-demo-data.ts          # preview
 *   railway run npx ts-node prisma/remove-demo-data.ts --yes    # delete
 */

const prisma = new PrismaClient();

// The two companies the old seed created, identified by the emails it used.
const DEMO_COMPANY_EMAILS = ['admin@niletravel.com', 'admin@pyramidstours.com'];

// Logins the old seed created. The company admins share the company emails
// above; the agents are listed separately because they have their own.
const DEMO_USER_EMAILS = [
  'admin@niletravel.com',
  'agent1@niletravel.com',
  'agent2@niletravel.com',
  'admin@pyramidstours.com',
  'agent1@pyramidstours.com',
  'agent2@pyramidstours.com',
];

const APPLY = process.argv.includes('--yes');

async function main() {
  const companies = await prisma.company.findMany({
    where: { email: { in: DEMO_COMPANY_EMAILS } },
    select: { id: true, name: true, email: true },
  });

  const users = await prisma.user.findMany({
    where: { email: { in: DEMO_USER_EMAILS }, role: { not: 'SUPERADMIN' } },
    select: { id: true, email: true, role: true },
  });

  if (!companies.length && !users.length) {
    console.log('✓ No demo data found — nothing to remove.');
    return;
  }

  const companyIds = companies.map((c) => c.id);
  const userIds = users.map((u) => u.id);
  const scope = { companyId: { in: companyIds } };

  // Counted in the same order they are deleted below, so the preview reflects
  // exactly what the --yes run will do.
  // Ordered exactly as the deletes below run, so the preview matches the apply.
  const counts: Record<string, number> = {
    vouchers: await prisma.voucher.count({ where: scope }),
    consolidatedInvoices: await prisma.consolidatedInvoice.count({ where: scope }),
    invoices: await prisma.invoice.count({ where: scope }),
    walletTransactions: await prisma.walletTransaction.count({ where: scope }),
    activityBookings: await prisma.activityBooking.count({ where: scope }),
    activityPackages: await prisma.activityPackage.count({ where: scope }),
    cruiseBookings: await prisma.cruiseBooking.count({ where: scope }),
    transportBookings: await prisma.transportBooking.count({ where: scope }),
    visaApplications: await prisma.visaApplication.count({ where: scope }),
    airportReceptions: await prisma.airportReception.count({ where: scope }),
    simRequests: await prisma.simRequest.count({ where: scope }),
    quoteRequests: await prisma.quoteRequest.count({ where: scope }),
    bookings: await prisma.booking.count({ where: scope }),
    hotelVisibilityRules: await prisma.hotelCompanyVisibility.count({ where: scope }),
    marketPriceOverrides: await prisma.marketPrice.count({ where: scope }),
    refreshTokens: await prisma.refreshToken.count({ where: { userId: { in: userIds } } }),
    users: users.length,
    companies: companies.length,
  };

  console.log('Demo companies found:');
  for (const c of companies) console.log(`  • ${c.name} <${c.email}>`);
  console.log('\nDemo logins found:');
  for (const u of users) console.log(`  • ${u.email} (${u.role})`);
  console.log('\nRecords that will be deleted:');
  for (const [label, n] of Object.entries(counts)) {
    if (n > 0) console.log(`  ${String(n).padStart(5)}  ${label}`);
  }

  if (!APPLY) {
    console.log('\n⚠️  Dry run — nothing was deleted. Re-run with --yes to apply.');
    return;
  }

  // One transaction: a partial delete would leave a company with orphaned
  // bookings, which is worse than not having started. If any foreign key still
  // blocks a row, the whole thing rolls back and the error names the constraint.
  await prisma.$transaction([
    // Vouchers and invoices point at every kind of service booking with
    // ON DELETE RESTRICT, so they have to go before the bookings they cite.
    prisma.voucher.deleteMany({ where: scope }),
    prisma.consolidatedInvoice.deleteMany({ where: scope }),
    prisma.invoice.deleteMany({ where: scope }),
    prisma.walletTransaction.deleteMany({ where: scope }),
    // Service bookings. Each one also restricts deletion of the user who
    // created it, which is why users are removed after all of these.
    prisma.activityBooking.deleteMany({ where: scope }),
    prisma.activityPackage.deleteMany({ where: scope }),
    prisma.cruiseBooking.deleteMany({ where: scope }),
    prisma.transportBooking.deleteMany({ where: scope }),
    prisma.visaApplication.deleteMany({ where: scope }),
    prisma.airportReception.deleteMany({ where: scope }),
    prisma.simRequest.deleteMany({ where: scope }),
    prisma.quoteRequest.deleteMany({ where: scope }),
    prisma.booking.deleteMany({ where: scope }),
    // Company-scoped settings. These cascade from Company anyway; deleting them
    // explicitly keeps the reported counts honest.
    prisma.hotelCompanyVisibility.deleteMany({ where: scope }),
    prisma.marketPrice.deleteMany({ where: scope }),
    // Finally the logins and the companies themselves.
    prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } }),
    prisma.user.deleteMany({ where: { id: { in: userIds } } }),
    prisma.company.deleteMany({ where: { id: { in: companyIds } } }),
  ]);

  console.log('\n✅ Demo companies, logins and their records removed.');
  console.log('   Hotels, destinations, rates and the SuperAdmin were not touched.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
