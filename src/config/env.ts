/**
 * Startup environment validation.
 *
 * Fails fast (throws) when required configuration is missing or unsafe in
 * production, so a misconfigured deploy never boots with, e.g., a placeholder
 * JWT secret. In development the same problems are surfaced as warnings so local
 * work is not blocked. Secret *values* are never printed — only their names.
 */

// Placeholder values shipped in .env.example — must never reach production.
const PLACEHOLDER_SECRETS = new Set([
  'your-super-secret-key-change-this',
  'your-refresh-secret-change-this',
  'change-me',
  'changeme',
  'secret',
]);

const REQUIRED = ['DATABASE_URL', 'JWT_SECRET', 'REFRESH_TOKEN_SECRET', 'BASE_URL'] as const;

// Optional but recommended — email delivery is disabled/degraded without these.
const EMAIL_VARS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'FROM_EMAIL', 'INTERNAL_TEAM_EMAIL'] as const;

export interface EnvCheckResult {
  errors: string[];
  warnings: string[];
}

export function checkEnv(): EnvCheckResult {
  const isProd = process.env.NODE_ENV === 'production';
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const key of REQUIRED) {
    if (!process.env[key] || !String(process.env[key]).trim()) {
      errors.push(`${key} is required but not set.`);
    }
  }

  const jwt = process.env.JWT_SECRET ?? '';
  const refresh = process.env.REFRESH_TOKEN_SECRET ?? '';

  if (jwt && PLACEHOLDER_SECRETS.has(jwt)) errors.push('JWT_SECRET is still the example placeholder — set a strong random value.');
  if (refresh && PLACEHOLDER_SECRETS.has(refresh)) errors.push('REFRESH_TOKEN_SECRET is still the example placeholder — set a strong random value.');
  if (jwt && refresh && jwt === refresh) errors.push('JWT_SECRET and REFRESH_TOKEN_SECRET must be different values.');
  if (isProd && jwt && jwt.length < 24) warnings.push('JWT_SECRET is short (<24 chars) — use a longer random secret in production.');
  if (isProd && refresh && refresh.length < 24) warnings.push('REFRESH_TOKEN_SECRET is short (<24 chars) — use a longer random secret in production.');

  const baseUrl = process.env.BASE_URL ?? '';
  if (isProd && /localhost|127\.0\.0\.1/i.test(baseUrl)) {
    errors.push('BASE_URL points at localhost in production — set it to the public domain (e.g. https://portal.example.com).');
  }
  if (isProd && baseUrl && !/^https:\/\//i.test(baseUrl)) {
    warnings.push('BASE_URL is not https:// — production should be served over HTTPS.');
  }

  const missingEmail = EMAIL_VARS.filter((k) => !process.env[k] || !String(process.env[k]).trim());
  if (missingEmail.length) {
    warnings.push(`Email is not fully configured (missing: ${missingEmail.join(', ')}). Notification emails will be skipped or fail.`);
  }

  return { errors, warnings };
}

/**
 * Validate env at boot. Logs warnings; in production a hard error aborts start.
 * In development errors are downgraded to warnings so local dev is not blocked.
 */
export function validateEnvOrExit(): void {
  const isProd = process.env.NODE_ENV === 'production';
  const { errors, warnings } = checkEnv();

  for (const w of warnings) console.warn(`⚠️  [env] ${w}`);

  if (errors.length) {
    for (const e of errors) console.error(`❌ [env] ${e}`);
    if (isProd && !isServerless()) {
      console.error('❌ [env] Refusing to start with an invalid production configuration.');
      process.exit(1);
    } else if (isProd) {
      // On a serverless host process.exit() kills the invocation with an opaque
      // FUNCTION_INVOCATION_FAILED and no cause in the response — the operator
      // sees a 500 and nothing else. Log loudly and let requests fail with a
      // real error instead, so the misconfiguration is diagnosable.
      console.error('❌ [env] Invalid production configuration — requests will fail until this is fixed.');
    } else {
      console.warn('⚠️  [env] The above would abort startup in production (NODE_ENV=production).');
    }
  }
}

function isServerless(): boolean {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}
