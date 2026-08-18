import { z } from 'zod';

// Emails are normalised here rather than in the controllers so every route
// using these schemas stores the same canonical form — see auth.schema.ts.
export const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().min(2),
  nameAr: z.string().optional(),
  password: z.string().min(8).optional(),
  role: z.enum(['SUPERADMIN', 'COMPANY_ADMIN', 'AGENT']).default('AGENT'),
  companyId: z.string().nullable().optional(),
});

export const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  nameAr: z.string().optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  role: z.enum(['SUPERADMIN', 'COMPANY_ADMIN', 'AGENT']).optional(),
  companyId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

export const resetPasswordSchema = z.object({
  password: z.string().min(8).optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
