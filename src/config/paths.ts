import fs from 'fs';
import path from 'path';

/**
 * Single source of truth for on-disk storage locations.
 *
 * All three consumers (the generic uploader, the hotel-image uploader, and the
 * static file server in app.ts) MUST resolve their directories from here so a
 * `UPLOAD_DIR` / `PDF_DIR` override is honoured consistently.
 *
 * Public vs private:
 *  - PUBLIC_UPLOADS_DIR  → served statically at /uploads (hotel/destination images)
 *  - PRIVATE_UPLOADS_DIR → NEVER served statically; a *sibling* directory, so a
 *    static mount on the public dir can never leak a private file. Access is only
 *    through the authenticated, ownership-checked route GET /api/files/private/:filename.
 *
 * Paths are resolved to absolute at load time against the project root
 * (dist/config/paths.js → ../../ = project root), so the app works regardless of
 * the current working directory it is started from (e.g. cPanel Passenger).
 */

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

/**
 * Serverless hosts (Vercel, Lambda) mount the deployment read-only; only /tmp
 * is writable, and it is per-instance and short-lived. Storage therefore
 * defaults there so writes succeed, but nothing written survives — a serverless
 * deploy needs object storage (S3/R2/Blob) before uploads and generated PDFs
 * can be relied on. See DEPLOYMENT_VERCEL.md.
 */
export const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

const STORAGE_ROOT = IS_SERVERLESS ? '/tmp' : PROJECT_ROOT;

function resolveDir(envValue: string | undefined, fallbackRelative: string): string {
  const target = envValue && envValue.trim() ? envValue.trim() : fallbackRelative;
  return path.isAbsolute(target) ? target : path.resolve(STORAGE_ROOT, target);
}

/** Publicly served uploads (images). Default <root>/uploads. */
export const PUBLIC_UPLOADS_DIR = resolveDir(process.env.UPLOAD_DIR, './uploads');

/**
 * Private uploads (passports, tickets, private docs). Default <root>/uploads-private.
 * A dedicated env override is supported; otherwise it is a SIBLING of the public
 * dir (never a child), guaranteeing the /uploads static mount cannot serve it.
 */
export const PRIVATE_UPLOADS_DIR = resolveDir(
  process.env.PRIVATE_UPLOAD_DIR,
  process.env.UPLOAD_DIR ? path.join(process.env.UPLOAD_DIR.trim(), '..', 'uploads-private') : './uploads-private',
);

/** Generated PDFs (invoices, vouchers, statements). Default <root>/generated. */
export const GENERATED_DIR = resolveDir(process.env.PDF_DIR, './generated');

/**
 * Create the storage directories up-front so first write never fails.
 *
 * Never throws: this runs at module load, and on a read-only host an
 * uncaught EROFS/EACCES here takes the whole process (or serverless
 * invocation) down before a single route is registered. A directory that
 * cannot be created is reported and left to fail at actual write time, where
 * the error reaches one request instead of every request.
 */
export function ensureStorageDirs(): void {
  for (const dir of [PUBLIC_UPLOADS_DIR, PRIVATE_UPLOADS_DIR, GENERATED_DIR]) {
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
      console.warn(`⚠️  [paths] could not create storage dir ${dir}:`, (err as Error).message);
    }
  }
}

/**
 * Safely resolve a caller-supplied filename to an absolute path inside `baseDir`,
 * rejecting any path traversal. Returns null when the name is unsafe or escapes
 * the base directory.
 */
export function safeResolveInside(baseDir: string, filename: string): string | null {
  // Only ever trust the basename — strips any directory components / traversal.
  const base = path.basename(String(filename || ''));
  if (!base || base === '.' || base === '..') return null;
  if (/[/\\]/.test(base)) return null;
  const resolved = path.resolve(baseDir, base);
  const baseWithSep = baseDir.endsWith(path.sep) ? baseDir : baseDir + path.sep;
  if (resolved !== baseDir && !resolved.startsWith(baseWithSep)) return null;
  return resolved;
}
