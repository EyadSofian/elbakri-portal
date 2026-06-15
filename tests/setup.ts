// Loaded via `node -r` BEFORE any app module. Unit tests must never touch a real
// DB, so we point Prisma at a deliberately unreachable URL — the PrismaClient
// constructor reads DATABASE_URL but does not connect, and these tests never query.
process.env.NODE_ENV = 'test';
if (!process.env.DATABASE_URL || !/(_test|localhost|127\.0\.0\.1)/.test(process.env.DATABASE_URL)) {
  process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/disabled';
}
process.env.DIRECT_URL = process.env.DATABASE_URL;
