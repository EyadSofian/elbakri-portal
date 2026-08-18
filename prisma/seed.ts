import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import bcrypt from 'bcryptjs';
import { buildInvoiceTotals } from '../src/shared/invoicing';

const prisma = new PrismaClient();

async function hash(p: string) {
  return bcrypt.hash(p, 12);
}

async function main() {
  console.log('Seeding database...');

  // 1. Super admin
  await prisma.user.upsert({
    where: { email: 'admin@elbakri.com' },
    update: {},
    create: {
      email: 'admin@elbakri.com',
      password: await hash('Admin@1982'),
      name: 'Super Admin',
      nameAr: 'المدير العام',
      role: 'SUPERADMIN',
    },
  });
  console.log('✓ Super admin created');

  // 2. Company 1: Nile Travel Agency
  const nile = await prisma.company.upsert({
    where: { email: 'admin@niletravel.com' },
    update: {},
    create: {
      name: 'Nile Travel Agency',
      nameAr: 'وكالة النيل للسياحة',
      email: 'admin@niletravel.com',
      phone: '+20 2 1234 5678',
      address: '15 Tahrir Square, Cairo, Egypt',
      country: 'EG',
      taxId: 'EG123456789',
      creditLimit: new Decimal(10000),
      balance: new Decimal(5000),
      tier: 'GOLD',
    },
  });

  const nileAdmin = await prisma.user.upsert({
    where: { email: 'admin@niletravel.com' },
    update: {},
    create: {
      email: 'admin@niletravel.com',
      password: await hash('NileAdmin@2024'),
      name: 'Nile Admin',
      nameAr: 'مدير النيل',
      role: 'COMPANY_ADMIN',
      companyId: nile.id,
    },
  });

  const nileAgents = await Promise.all([
    prisma.user.upsert({
      where: { email: 'agent1@niletravel.com' },
      update: {},
      create: {
        email: 'agent1@niletravel.com',
        password: await hash('Agent@12345'),
        name: 'Ahmed Hassan',
        nameAr: 'أحمد حسن',
        role: 'AGENT',
        companyId: nile.id,
      },
    }),
    prisma.user.upsert({
      where: { email: 'agent2@niletravel.com' },
      update: {},
      create: {
        email: 'agent2@niletravel.com',
        password: await hash('Agent@12345'),
        name: 'Sara Mohamed',
        nameAr: 'سارة محمد',
        role: 'AGENT',
        companyId: nile.id,
      },
    }),
  ]);

  console.log('✓ Nile Travel Agency created with 2 agents');

  // 3. Company 2: Pyramids Tours
  const pyramids = await prisma.company.upsert({
    where: { email: 'admin@pyramidstours.com' },
    update: {},
    create: {
      name: 'Pyramids Tours',
      nameAr: 'جولات الأهرامات',
      email: 'admin@pyramidstours.com',
      phone: '+20 2 9876 5432',
      address: '42 Pyramids Road, Giza, Egypt',
      country: 'EG',
      taxId: 'EG987654321',
      creditLimit: new Decimal(8000),
      balance: new Decimal(3000),
      tier: 'SILVER',
    },
  });

  const pyramidsAdmin = await prisma.user.upsert({
    where: { email: 'admin@pyramidstours.com' },
    update: {},
    create: {
      email: 'admin@pyramidstours.com',
      password: await hash('PyramidsAdmin@2024'),
      name: 'Pyramids Admin',
      nameAr: 'مدير الأهرامات',
      role: 'COMPANY_ADMIN',
      companyId: pyramids.id,
    },
  });

  const pyramidsAgents = await Promise.all([
    prisma.user.upsert({
      where: { email: 'agent1@pyramidstours.com' },
      update: {},
      create: {
        email: 'agent1@pyramidstours.com',
        password: await hash('Agent@12345'),
        name: 'Omar Khalil',
        nameAr: 'عمر خليل',
        role: 'AGENT',
        companyId: pyramids.id,
      },
    }),
    prisma.user.upsert({
      where: { email: 'agent2@pyramidstours.com' },
      update: {},
      create: {
        email: 'agent2@pyramidstours.com',
        password: await hash('Agent@12345'),
        name: 'Nour Saad',
        nameAr: 'نور سعد',
        role: 'AGENT',
        companyId: pyramids.id,
      },
    }),
  ]);

  console.log('✓ Pyramids Tours created with 2 agents');

  // 4. Hotels
  const hotelsData = [
    {
      name: 'Nile Ritz-Carlton Cairo', nameAr: 'نيل ريتز كارلتون القاهرة',
      city: 'Cairo', cityAr: 'القاهرة', country: 'EG', stars: 5,
      address: '1113 Corniche El Nil, Cairo', pricePerNight: new Decimal(250),
      currency: 'USD', amenities: ['Pool', 'Spa', 'Restaurant', 'Gym'],
      description: 'Luxury hotel on the banks of the Nile',
    },
    {
      name: 'Fairmont Nile City', nameAr: 'فيرمونت مدينة النيل',
      city: 'Cairo', cityAr: 'القاهرة', country: 'EG', stars: 5,
      address: '2005B Corniche El Nil, Cairo', pricePerNight: new Decimal(180),
      currency: 'USD', amenities: ['Pool', 'Spa', 'Business Center'],
      description: 'Premium city hotel with Nile views',
    },
    {
      name: 'Burj Al Arab Dubai', nameAr: 'برج العرب دبي',
      city: 'Dubai', cityAr: 'دبي', country: 'AE', stars: 7,
      address: 'Jumeirah Beach Road, Dubai', pricePerNight: new Decimal(800),
      currency: 'USD', amenities: ['Private Beach', 'Helicopter Pad', 'Butler Service'],
      description: 'The world\'s most luxurious hotel',
    },
    {
      name: 'Atlantis The Palm', nameAr: 'أتلانتس النخلة',
      city: 'Dubai', cityAr: 'دبي', country: 'AE', stars: 5,
      address: 'Palm Jumeirah, Dubai', pricePerNight: new Decimal(350),
      currency: 'USD', amenities: ['Waterpark', 'Aquarium', 'Beach'],
      description: 'Iconic resort on Palm Jumeirah',
    },
    {
      name: 'Four Seasons Istanbul', nameAr: 'فور سيزونز إسطنبول',
      city: 'Istanbul', cityAr: 'إسطنبول', country: 'TR', stars: 5,
      address: 'Tevfikiye Mah., Istanbul', pricePerNight: new Decimal(320),
      currency: 'USD', amenities: ['Spa', 'Restaurant', 'City View'],
      description: 'Historic palace converted to luxury hotel',
    },
    {
      name: 'The Savoy London', nameAr: 'سافوي لندن',
      city: 'London', cityAr: 'لندن', country: 'GB', stars: 5,
      address: 'The Strand, London', pricePerNight: new Decimal(550),
      currency: 'USD', amenities: ['Restaurant', 'Bar', 'Spa'],
      description: 'London\'s most iconic luxury hotel',
    },
    {
      name: 'Hôtel Plaza Athénée Paris', nameAr: 'فندق بلازا أثيناي باريس',
      city: 'Paris', cityAr: 'باريس', country: 'FR', stars: 5,
      address: '25 Avenue Montaigne, Paris', pricePerNight: new Decimal(700),
      currency: 'USD', amenities: ['Dior Restaurant', 'Spa', 'Eiffel View'],
      description: 'Palace hotel on Avenue Montaigne',
    },
    {
      name: 'Kempinski Hotel Soma Bay', nameAr: 'كمبنسكي سوما باي',
      city: 'Sharm El Sheikh', cityAr: 'شرم الشيخ', country: 'EG', stars: 5,
      address: 'Soma Bay, Red Sea, Egypt', pricePerNight: new Decimal(150),
      currency: 'USD', amenities: ['Private Beach', 'Diving', 'Pool'],
      description: 'Luxury Red Sea resort',
    },
  ];

  const hotels = [];
  for (const data of hotelsData) {
    const hotel = await prisma.hotel.upsert({
      where: { id: data.name.replace(/\s+/g, '-').toLowerCase().slice(0, 20) },
      update: {},
      create: { id: data.name.replace(/\s+/g, '-').toLowerCase().slice(0, 20), ...data },
    });
    hotels.push(hotel);

    // Create 3 room types per hotel
    const roomTypes: Array<{ type: 'STANDARD' | 'DELUXE' | 'SUITE'; multiplier: number }> = [
      { type: 'STANDARD', multiplier: 1 },
      { type: 'DELUXE', multiplier: 1.4 },
      { type: 'SUITE', multiplier: 2 },
    ];

    for (const rt of roomTypes) {
      const existingRoom = await prisma.room.findFirst({ where: { hotelId: hotel.id, type: rt.type } });
      if (!existingRoom) {
        await prisma.room.create({
          data: {
            hotelId: hotel.id,
            type: rt.type,
            capacity: rt.type === 'SUITE' ? 4 : 2,
            pricePerNight: new Decimal(Number(data.pricePerNight) * rt.multiplier),
          },
        });
      }
    }
  }

  console.log('✓ 8 hotels created with 3 room types each');

  // 5. Bookings — 15 across both companies
  const bookingData = [
    // Nile company bookings
    { company: nile, user: nileAdmin, hotel: hotels[0], type: 'HOTEL' as const, status: 'CONFIRMED' as const, nights: 3, base: 750, checkIn: '2026-05-10', checkOut: '2026-05-13' },
    { company: nile, user: nileAgents[0], hotel: hotels[2], type: 'HOTEL' as const, status: 'PENDING' as const, nights: 5, base: 4000, checkIn: '2026-06-01', checkOut: '2026-06-06' },
    { company: nile, user: nileAgents[1], type: 'FLIGHT' as const, status: 'CONFIRMED' as const, base: 1200, origin: 'Cairo', destination: 'Dubai', airline: 'EgyptAir', flightNumber: 'MS600' },
    { company: nile, user: nileAdmin, type: 'FLIGHT' as const, status: 'CANCELLED' as const, base: 900, origin: 'Cairo', destination: 'Istanbul', airline: 'Turkish Airlines', flightNumber: 'TK600' },
    { company: nile, user: nileAgents[0], hotel: hotels[4], type: 'HOTEL' as const, status: 'COMPLETED' as const, nights: 4, base: 1280, checkIn: '2026-04-01', checkOut: '2026-04-05' },
    { company: nile, user: nileAgents[1], type: 'PACKAGE' as const, status: 'CONFIRMED' as const, base: 2500, destination: 'London' },
    { company: nile, user: nileAdmin, hotel: hotels[7], type: 'HOTEL' as const, status: 'PENDING' as const, nights: 7, base: 1050, checkIn: '2026-07-01', checkOut: '2026-07-08' },
    { company: nile, user: nileAgents[0], type: 'FLIGHT' as const, status: 'CONFIRMED' as const, base: 600, origin: 'Cairo', destination: 'Paris', airline: 'Air France', flightNumber: 'AF610' },
    // Pyramids bookings
    { company: pyramids, user: pyramidsAdmin, hotel: hotels[1], type: 'HOTEL' as const, status: 'CONFIRMED' as const, nights: 2, base: 360, checkIn: '2026-05-20', checkOut: '2026-05-22' },
    { company: pyramids, user: pyramidsAgents[0], type: 'FLIGHT' as const, status: 'PENDING' as const, base: 1500, origin: 'Cairo', destination: 'London', airline: 'British Airways', flightNumber: 'BA156' },
    { company: pyramids, user: pyramidsAgents[1], hotel: hotels[3], type: 'HOTEL' as const, status: 'CONFIRMED' as const, nights: 4, base: 1400, checkIn: '2026-06-15', checkOut: '2026-06-19' },
    { company: pyramids, user: pyramidsAdmin, type: 'PACKAGE' as const, status: 'COMPLETED' as const, base: 3200, destination: 'Istanbul' },
    { company: pyramids, user: pyramidsAgents[0], hotel: hotels[6], type: 'HOTEL' as const, status: 'PENDING' as const, nights: 3, base: 2100, checkIn: '2026-08-01', checkOut: '2026-08-04' },
    { company: pyramids, user: pyramidsAgents[1], type: 'FLIGHT' as const, status: 'CANCELLED' as const, base: 800, origin: 'Cairo', destination: 'Dubai', airline: 'Emirates', flightNumber: 'EK924' },
    { company: pyramids, user: pyramidsAdmin, hotel: hotels[5], type: 'HOTEL' as const, status: 'CONFIRMED' as const, nights: 5, base: 2750, checkIn: '2026-09-01', checkOut: '2026-09-06' },
  ];

  for (const [idx, bd] of bookingData.entries()) {
    const year = new Date().getFullYear();
    const refNumber = `EBK-${year}-${String(idx + 1).padStart(4, '0')}`;
    const invoiceNumber = `INV-${year}-${String(idx + 1).padStart(4, '0')}`;
    const totalAmount = new Decimal(bd.base);

    const existing = await prisma.booking.findUnique({ where: { refNumber } });
    if (existing) continue;

    const booking = await prisma.booking.create({
      data: {
        refNumber,
        type: bd.type,
        status: bd.status,
        companyId: bd.company.id,
        createdById: bd.user.id,
        hotelId: bd.hotel?.id,
        checkIn: 'checkIn' in bd && bd.checkIn ? new Date(bd.checkIn) : null,
        checkOut: 'checkOut' in bd && bd.checkOut ? new Date(bd.checkOut) : null,
        nights: 'nights' in bd ? bd.nights : null,
        origin: 'origin' in bd ? bd.origin : null,
        destination: 'destination' in bd ? bd.destination : null,
        airline: 'airline' in bd ? bd.airline : null,
        flightNumber: 'flightNumber' in bd ? bd.flightNumber : null,
        adultsCount: 2,
        baseAmount: totalAmount,
        totalAmount,
        currency: 'USD',
        confirmedAt: bd.status === 'CONFIRMED' || bd.status === 'COMPLETED' ? new Date() : null,
        cancelledAt: bd.status === 'CANCELLED' ? new Date() : null,
        cancellationReason: bd.status === 'CANCELLED' ? 'Customer request' : null,
      },
    });

    // BookingCounter
    await prisma.bookingCounter.upsert({
      where: { year },
      update: { lastSeq: { increment: 1 } },
      create: { year, lastSeq: idx + 1 },
    });

    // Invoice
    const invoiceTotals = buildInvoiceTotals(totalAmount);
    const invoiceStatus = bd.status === 'CANCELLED' ? 'CANCELLED' as const
      : bd.status === 'COMPLETED' ? 'PAID' as const : 'UNPAID' as const;

    await prisma.invoice.upsert({
      where: { invoiceNumber },
      update: {},
      create: {
        invoiceNumber,
        bookingId: booking.id,
        companyId: bd.company.id,
        ...invoiceTotals,
        currency: 'USD',
        status: invoiceStatus,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        paidAt: invoiceStatus === 'PAID' ? new Date() : null,
      },
    });

    await prisma.invoiceCounter.upsert({
      where: { year },
      update: { lastSeq: { increment: 1 } },
      create: { year, lastSeq: idx + 1 },
    });

    // Wallet transaction
    const company = await prisma.company.findUniqueOrThrow({ where: { id: bd.company.id } });
    await prisma.walletTransaction.create({
      data: {
        companyId: bd.company.id,
        type: bd.status === 'CANCELLED' ? 'REFUND' : 'DEBIT',
        amount: totalAmount,
        balanceBefore: company.balance,
        balanceAfter: bd.status === 'CANCELLED' ? company.balance.add(totalAmount) : company.balance.sub(totalAmount),
        reference: refNumber,
        description: `Booking ${refNumber}`,
        createdById: bd.user.id,
      },
    });
  }

  console.log('✓ 15 bookings, invoices, and wallet transactions created');
  console.log('\n✅ Seed complete!');
  console.log('   Login: admin@elbakri.com / Admin@1982');
  console.log('   Nile admin: admin@niletravel.com / NileAdmin@2024');
  console.log('   Pyramids admin: admin@pyramidstours.com / PyramidsAdmin@2024');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
