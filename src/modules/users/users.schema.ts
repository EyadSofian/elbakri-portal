import { z } from 'zod';

export const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  nameAr: z.string().optional(),
  password: z.string().min(8).optional(),
  role: z.enum(['SUPERADMIN', 'COMPANY_ADMIN', 'AGENT']).default('AGENT'),
  companyId: z.string().optional(),
});

export const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  nameAr: z.string().optional(),
  email: z.string().email().optional(),
  role: z.enum(['SUPERADMIN', 'COMPANY_ADMIN', 'AGENT']).optional(),
  isActive: z.boolean().optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
