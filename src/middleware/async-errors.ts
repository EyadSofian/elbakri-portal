/**
 * Make failing async route handlers answer the request instead of hanging.
 *
 * Express 4 does not understand a handler that returns a rejected promise. Every
 * controller in this codebase is `async` and none of them wrap themselves, so a
 * throw inside one — for example any Prisma call when `DATABASE_URL` is not set —
 * rejects, Express never hears about it, and the request is simply never
 * answered. The browser spins forever; on Vercel the invocation is killed at
 * `maxDuration` with an opaque timeout. That is what turned a misconfigured
 * deployment into "I type my password and nothing happens": the failure was real
 * but no response, and therefore no error message, ever came back.
 *
 * The fix is applied once, centrally, at the point where Express invokes a
 * handler, rather than by wrapping ~170 controllers at their registration sites.
 * Patching the *call* is deliberate: mounted sub-routers are dispatched through
 * this same path, and wrapping them as plain functions would strip the
 * properties Express needs to mount them.
 *
 * The patched method mirrors Express 4's own `Layer.prototype.handle_request`
 * (express/lib/router/layer.js) exactly, and adds one thing: if the handler
 * returned a thenable, a rejection is forwarded to `next` like a synchronous
 * throw already is.
 */
import type { NextFunction, Request, Response } from 'express';

type RequestHandlerLike = (req: Request, res: Response, next: NextFunction) => unknown;

interface LayerLike {
  handle: RequestHandlerLike;
  handle_request(req: Request, res: Response, next: NextFunction): void;
}

let installed = false;

/**
 * Install the patch. Idempotent, and safe to call before any route is
 * registered — it replaces a prototype method, so it applies to every layer
 * regardless of when that layer was created.
 */
export function installAsyncErrorHandling(): void {
  if (installed) return;

  try {
    // Express keeps Layer off its public surface, so this reaches into the
    // package. The path has been stable across all of Express 4.x, which is the
    // range this app pins.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Layer = require('express/lib/router/layer') as { prototype: LayerLike };

    Layer.prototype.handle_request = function handleRequest(
      this: LayerLike,
      req: Request,
      res: Response,
      next: NextFunction,
    ): void {
      const fn = this.handle;

      // Four-argument functions are error middleware; they are dispatched via
      // handle_error, and Express skips them here.
      if (typeof fn !== 'function' || fn.length > 3) {
        next();
        return;
      }

      let result: unknown;
      try {
        result = fn(req, res, next);
      } catch (err) {
        next(err);
        return;
      }

      if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
        Promise.resolve(result).catch(next);
      }
    };

    installed = true;
  } catch (err) {
    // A hardening measure must never stop the app from booting. Without it the
    // old behaviour is back (async failures hang), so make that loud.
    console.error(
      '⚠️  [async-errors] Could not install async error handling — a failing async route will hang instead of returning an error:',
      err,
    );
  }
}
