import { z } from 'zod';

// Email is trimmed and lower-cased before validation: PostgreSQL compares text
// case-sensitively, so the address stored at sign-up and the one typed at login
// must be normalised to the same form or the lookup silently misses.
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export type LoginInput = z.infer<typeof loginSchema>;
