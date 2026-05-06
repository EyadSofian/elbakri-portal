import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  await prisma.walletTransaction.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.activityBooking.deleteMany();
  await prisma.cruiseBooking.deleteMany();
  await prisma.transportBooking.deleteMany();
  await prisma.visaApplication.deleteMany();
  await prisma.airportReception.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.hotelPricing.deleteMany();
  await prisma.room.deleteMany();
  await prisma.hotel.deleteMany();
  await prisma.nileCruise.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.user.deleteMany({ where: { role: { not: 'SUPERADMIN' } } });
  await prisma.company.deleteMany();
  await prisma.bookingCounter.deleteMany();
  await prisma.invoiceCounter.deleteMany();
  console.log('✓ All data cleared. Superadmin preserved.');
}
main().catch(console.error).finally(() => prisma.$disconnect());
