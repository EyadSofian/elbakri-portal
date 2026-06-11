import { z } from 'zod';

const companyCurrencySchema = z.enum(['USD', 'EGP']);

export const createCompanySchema = z.object({
  name: z.string().min(2),
  nameAr: z.string().optional(),
  email: z.string().email(),
  adminEmail: z.string().email().optional().or(z.literal('')),
  adminName: z.string().optional(),
  phone: z.string().min(5),
  address: z.string().optional(),
  billingAddress: z.string().optional(),
  country: z.string().default('EG'),
  taxId: z.string().optional(),
  website: z.string().url().optional().or(z.literal('')),
  creditLimit: z.number().min(0).default(0),
  currency: companyCurrencySchema.optional(),
  market: z.enum(['EGYPTIAN', 'INTERNATIONAL']).default('INTERNATIONAL'),
  tier: z.enum(['STANDARD', 'SILVER', 'GOLD', 'PLATINUM']).default('STANDARD'),
  logoUrl: z.string().optional(),
  themeColor: z.string().optional(),
});

export const updateCompanySchema = z.object({
  name: z.string().min(2).optional(),
  nameAr: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().min(5).optional(),
  address: z.string().optional(),
  billingAddress: z.string().optional(),
  country: z.string().optional(),
  taxId: z.string().optional(),
  website: z.string().url().optional().or(z.literal('')),
  tier: z.enum(['STANDARD', 'SILVER', 'GOLD', 'PLATINUM']).optional(),
  market: z.enum(['EGYPTIAN', 'INTERNATIONAL']).optional(),
  creditLimit: z.number().min(0).optional(),
  currency: companyCurrencySchema.optional(),
  logoUrl: z.string().optional(),
  themeColor: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const topupSchema = z.object({
  amount: z.number().positive(),
  currency: companyCurrencySchema.default('USD'),
  description: z.string().min(1),
  notify: z.boolean().optional(),
});

export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
export type TopupInput = z.infer<typeof topupSchema>;
