import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { login, refresh, logout, me } from './auth.controller';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { loginSchema } from './auth.schema';

const router = Router();

// Brute-force / credential-stuffing protection: cap login attempts per IP.
// Only failed attempts count toward the limit so a busy legitimate user who
// signs in successfully is never locked out. Applies to /login only — static
// files and normal API usage are unaffected.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10, // 10 attempts per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { success: false, error: 'TOO_MANY_ATTEMPTS', message: 'Too many login attempts. Please try again in a few minutes.' },
});

router.post('/login', loginLimiter, validate(loginSchema), login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.get('/me', authenticate, me);

export default router;
