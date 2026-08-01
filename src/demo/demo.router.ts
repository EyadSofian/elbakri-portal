/**
 * Preview mode — the portal without a database.
 *
 * Enabled only by `DEMO_MODE=1`. When on, this router is mounted ahead of every
 * real `/api` route and answers the whole surface from in-memory fixtures, so
 * Prisma is never called and no database is needed. The point is to let the
 * interface be reviewed on a hosting platform before any infrastructure exists.
 *
 * Deliberate properties:
 *  - Opt-in only. Absent the env var this file is never mounted and the app
 *    behaves exactly as before.
 *  - Read-only in effect. Writes return a plausible success but persist
 *    nothing, so a reviewer clicking around cannot corrupt anything.
 *  - No real data. Every fixture is invented; there is nothing here to leak.
 *  - Logins mirror prisma/seed.ts, so the same credentials work in preview and
 *    against a seeded database.
 *
 * This is a preview harness, not a mock framework — it is intentionally simple
 * and lives entirely in this directory so it can be deleted in one step.
 */
import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

import {
  DEMO_ACTIVITIES,
  DEMO_AIRPORTS,
  DEMO_BOOKINGS,
  DEMO_COMPANIES,
  DEMO_CRUISES,
  DEMO_DESTINATIONS,
  DEMO_HOTELS,
  DEMO_INVOICES,
  DEMO_LOGINS,
  DEMO_OFFERS,
  DEMO_QUOTES,
  DEMO_REPORT_OVERVIEW,
  DEMO_SIM_PACKAGES,
  DEMO_TRANSACTIONS,
  DEMO_USERS,
} from './demo.fixtures';

export const DEMO_MODE = process.env.DEMO_MODE === '1' || process.env.DEMO_MODE === 'true';

const ok = (data: unknown, meta?: unknown) => ({ success: true, data, ...(meta ? { meta } : {}) });
const page = (rows: unknown[]) => ok(rows, { page: 1, limit: 20, total: rows.length, pages: 1 });

/** Preview tokens are signed with whatever secret is configured, or a fixed
 *  development-only fallback so the mode works with no env at all. */
const SECRET = process.env.JWT_SECRET || 'demo-mode-preview-secret-not-for-production';

function currentUser(req: Request) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(header.slice(7), SECRET) as { id?: string };
      const found = DEMO_USERS.find((u) => u.id === payload.id);
      if (found) return found;
    } catch {
      /* fall through to the default reviewer below */
    }
  }
  return DEMO_USERS[0];
}

/** Company users only ever see their own rows, exactly as the real API scopes. */
function scoped<T extends { companyId?: string | null }>(rows: T[], req: Request): T[] {
  const user = currentUser(req);
  if (user.role === 'SUPERADMIN') return rows;
  return rows.filter((r) => r.companyId === user.companyId);
}

export function createDemoRouter(): Router {
  const router = Router();

  // ── Auth ────────────────────────────────────────────────────────────────
  router.post('/auth/login', (req: Request, res: Response) => {
    const { email, password } = (req.body ?? {}) as { email?: string; password?: string };
    const key = String(email ?? '').trim().toLowerCase();
    const expected = DEMO_LOGINS[key];
    const user = DEMO_USERS.find((u) => u.email.toLowerCase() === key);

    if (!user || !expected || password !== expected) {
      res.status(401).json({ success: false, error: 'UNAUTHORIZED', message: 'Invalid credentials' });
      return;
    }

    const accessToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role, companyId: user.companyId },
      SECRET,
      { expiresIn: '12h' },
    );

    res.json(ok({
      accessToken,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, companyId: user.companyId, company: user.company },
    }));
  });

  router.get('/auth/me', (req, res) => {
    const u = currentUser(req);
    res.json(ok({ id: u.id, name: u.name, email: u.email, role: u.role, companyId: u.companyId, company: u.company }));
  });

  router.post('/auth/refresh', (req, res) => {
    const u = currentUser(req);
    const accessToken = jwt.sign({ id: u.id, email: u.email, role: u.role, companyId: u.companyId }, SECRET, { expiresIn: '12h' });
    res.json(ok({ accessToken, user: u }));
  });

  router.post('/auth/logout', (_req, res) => res.json(ok({ message: 'Logged out' })));

  // ── Read surfaces ───────────────────────────────────────────────────────
  router.get('/companies', (req, res) => res.json(page(scoped(DEMO_COMPANIES.map((c) => ({ ...c, companyId: c.id })), req))));
  router.get('/companies/:id', (req, res) => {
    const c = DEMO_COMPANIES.find((x) => x.id === req.params.id) ?? DEMO_COMPANIES[0];
    res.json(ok(c));
  });
  router.get('/users', (req, res) => res.json(page(scoped(DEMO_USERS, req))));
  router.get('/destinations', (_req, res) => res.json(ok(DEMO_DESTINATIONS)));
  router.get('/destinations/:id', (req, res) => res.json(ok(DEMO_DESTINATIONS.find((d) => d.id === req.params.id) ?? DEMO_DESTINATIONS[0])));
  router.get('/hotels/areas', (_req, res) => res.json(ok([...new Set(DEMO_HOTELS.map((h) => h.area))])));
  router.get('/hotels/pricing/all', (_req, res) => res.json(ok([])));
  router.get('/hotels', (_req, res) => res.json(page(DEMO_HOTELS)));
  router.get('/hotels/:id/rates', (_req, res) => res.json(ok([])));
  router.get('/hotels/:id/pricing', (_req, res) => res.json(ok([])));
  router.get('/hotels/:id/company-visibility', (_req, res) => res.json(ok([])));
  router.get('/hotels/:id', (req, res) => res.json(ok(DEMO_HOTELS.find((h) => h.id === req.params.id) ?? DEMO_HOTELS[0])));
  router.get('/bookings', (req, res) => res.json(page(scoped(DEMO_BOOKINGS, req))));
  router.get('/bookings/:id', (req, res) => res.json(ok(DEMO_BOOKINGS.find((b) => b.id === req.params.id) ?? DEMO_BOOKINGS[0])));
  router.get('/invoices/consolidated/eligible', (_req, res) => res.json(ok([])));
  router.get('/invoices/consolidated', (_req, res) => res.json(page([])));
  router.get('/invoices', (req, res) => res.json(page(scoped(DEMO_INVOICES, req))));
  router.get('/wallet/balance', (req, res) => {
    const u = currentUser(req);
    const c = DEMO_COMPANIES.find((x) => x.id === u.companyId) ?? DEMO_COMPANIES[0];
    res.json(ok({ balance: c.walletBalance, currency: c.currency, creditLimit: c.creditLimit, available: c.walletBalance + c.creditLimit, totalDeposited: c.walletBalance, totalUsed: 0 }));
  });
  router.get('/wallet/transactions', (req, res) => res.json(page(scoped(DEMO_TRANSACTIONS, req))));
  router.get('/admin/wallet/transactions', (_req, res) => res.json(page(DEMO_TRANSACTIONS)));
  router.get('/admin/wallet/platform', (_req, res) => res.json(ok({ balance: DEMO_REPORT_OVERVIEW.platformWalletBalance, currency: 'EGP', transactions: DEMO_TRANSACTIONS })));
  router.get('/quote-requests', (req, res) => res.json(page(scoped(DEMO_QUOTES, req))));
  router.get('/quote-requests/:id', (req, res) => res.json(ok(DEMO_QUOTES.find((q) => q.id === req.params.id) ?? DEMO_QUOTES[0])));
  router.get('/offers/active', (_req, res) => res.json(ok(DEMO_OFFERS[0])));
  router.get('/offers', (_req, res) => res.json(ok(DEMO_OFFERS)));
  router.get('/offers/:id', (req, res) => res.json(ok(DEMO_OFFERS.find((o) => o.id === req.params.id) ?? DEMO_OFFERS[0])));
  router.get('/cruises', (_req, res) => res.json(ok(DEMO_CRUISES)));
  router.get('/activities', (_req, res) => res.json(ok(DEMO_ACTIVITIES)));
  router.get('/airports', (_req, res) => res.json(ok(DEMO_AIRPORTS)));
  router.get('/sim-card/packages', (_req, res) => res.json(ok(DEMO_SIM_PACKAGES)));
  router.get('/reports/overview', (_req, res) => res.json(ok(DEMO_REPORT_OVERVIEW)));
  router.get('/reports/company/:id', (_req, res) => res.json(ok(DEMO_REPORT_OVERVIEW)));
  router.get('/fx/rates', (_req, res) => res.json(ok({ base: 'USD', rates: { EGP: 48.6, EUR: 0.92, GBP: 0.79 }, fetchedAt: new Date().toISOString() })));

  // Collections the UI asks for that have no interesting preview content.
  for (const path of [
    '/activity-packages', '/activity-bookings', '/cruise-bookings', '/transport-bookings',
    '/transport-rates', '/visa-applications', '/airport-receptions', '/sim-card/requests',
    '/vouchers', '/group-types', '/visa-fees', '/reception-services', '/market-prices',
    '/ui-templates', '/sheets-config', '/admin/market-prices', '/admin/price-rows',
  ]) {
    router.get(path, (_req, res) => res.json(page([])));
  }

  // ── Writes: acknowledged, never persisted ───────────────────────────────
  router.use((req: Request, res: Response) => {
    if (req.method === 'GET') {
      // Anything not modelled above still answers with a valid empty envelope
      // rather than a 404, so a page never breaks mid-render in preview.
      res.json(page([]));
      return;
    }
    res.status(200).json({
      success: true,
      data: { id: 'demo', preview: true },
      message: 'Preview mode — this action was not saved. Connect a database to persist changes.',
    });
  });

  return router;
}
