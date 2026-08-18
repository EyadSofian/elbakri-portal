import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wrap an async route handler so a rejected promise reaches Express.
 *
 * Express 4 does not await handlers: if an `async` handler rejects, Express
 * never sees the error, the global error middleware never runs, and no response
 * is ever written — the request hangs until the client times out, with only an
 * `unhandledRejection` line in the logs. Wrapping forwards the rejection to
 * `next()`, so the global handler returns a real 500 instead.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
