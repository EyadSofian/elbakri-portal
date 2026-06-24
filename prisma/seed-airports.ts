import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Seed the standard Egyptian airports as admin-managed Airport rows. Idempotent
// (upsert by unique code) — safe to re-run. Admins can add/edit more in the UI.
const AIRPORTS = [
  { code: 'CAI', nameEn: 'Cairo International Airport', nameAr: 'مطار القاهرة الدولي', city: 'Cairo', cityAr: 'القاهرة' },
  { code: 'HRG', nameEn: 'Hurghada International Airport', nameAr: 'مطار الغردقة الدولي', city: 'Hurghada', cityAr: 'الغردقة' },
  { code: 'SSH', nameEn: 'Sharm El Sheikh International Airport', nameAr: 'مطار شرم الشيخ الدولي', city: 'Sharm El Sheikh', cityAr: 'شرم الشيخ' },
  { code: 'LXR', nameEn: 'Luxor International Airport', nameAr: 'مطار الأقصر الدولي', city: 'Luxor', cityAr: 'الأقصر' },
  { code: 'ASW', nameEn: 'Aswan International Airport', nameAr: 'مطار أسوان الدولي', city: 'Aswan', cityAr: 'أسوان' },
  { code: 'HBE', nameEn: 'Borg El Arab Airport', nameAr: 'مطار برج العرب', city: 'Alexandria', cityAr: 'الإسكندرية' },
  { code: 'MHH', nameEn: 'Marsa Alam International Airport', nameAr: 'مطار مرسى علم الدولي', city: 'Marsa Alam', cityAr: 'مرسى علم' },
];

async function main() {
  for (const a of AIRPORTS) {
    await prisma.airport.upsert({
      where: { code: a.code },
      update: { nameEn: a.nameEn, nameAr: a.nameAr, city: a.city, cityAr: a.cityAr },
      create: { ...a, isActive: true },
    });
  }
  const count = await prisma.airport.count();
  console.log(`✅ Airports seeded. Total airports: ${count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
