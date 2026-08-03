/**
 * Refuse API requests the deployment cannot possibly serve, with a reason.
 *
 * Without this, a deployment that has no `DATABASE_URL` (the state a fresh
 * Vercel project starts in) reaches the controllers, Prisma throws
 * `PrismaClientInitializationError` on the first query, and the caller gets a
 * bare 500 — or, before async errors were handled, no response at all. Either
 * way the login screen reported "invalid email or password", which sent the
 * operator looking for a wrong password instead of a missing variable.
 *
 * Answering 503 up-front, naming the variables that are unset, turns that into a
 * one-line diagnosis. Only names are ever returned — never values.
 */
import type { NextFunction, Request, Response } from 'express';

import { runtimeStatus } from '../config/env';

export function serviceGuard(_req: Request, res: Response, next: NextFunction): void {
  const status = runtimeStatus();
  if (status.ready) {
    next();
    return;
  }

  res.status(503).json({
    success: false,
    error: 'NOT_CONFIGURED',
    message:
      `The server is not configured yet (missing: ${status.missing.join(', ')}). ` +
      'Set these environment variables and redeploy, or set DEMO_MODE=1 to run the portal in preview mode without a database.',
    missing: status.missing,
  });
}
