import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

// The PrismaClient constructor throws when DATABASE_URL is absent, even though
// it does not connect until the first query. In preview mode there is no
// database by design and no query is ever made — so give the constructor
// something syntactically valid to hold. Any real query against it would fail,
// which is correct: it means preview mode failed to intercept a route.
if (!process.env.DATABASE_URL && (process.env.DEMO_MODE === '1' || process.env.DEMO_MODE === 'true')) {
  process.env.DATABASE_URL = 'postgresql://demo:demo@127.0.0.1:5432/demo_unused';
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
