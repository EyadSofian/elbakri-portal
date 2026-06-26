import { Response } from 'express';

/**
 * Send a structured error response. The underlying error (when provided) is
 * logged server-side ONLY — it is never serialized to the client — so internal
 * details (stack traces, Prisma messages, file paths, SQL) never leak. The wire
 * shape is always { success:false, error:CODE, message } so the frontend can
 * surface a stable code and a friendly message.
 */
export function sendError(
  res: Response,
  status: number,
  code: string,
  publicMessage = 'Something went wrong. Please try again.',
  logError?: unknown,
): void {
  if (logError !== undefined) console.error(`[${code}]`, logError);
  res.status(status).json({ success: false, error: code, message: publicMessage });
}
