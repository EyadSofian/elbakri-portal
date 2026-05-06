import { z } from 'zod';

export const createHotelSchema = z.object({
  name: z.string().min(2),
  nameAr: z.string().optional(),
  city: z.string().min(1),
  cityAr: z.string().optional(),
  country: z.string().min(2),
  stars: z.number().int().min(1).max(7).default(3),
  address: z.string().min(5),
  description: z.string().optional(),
  descriptionAr: z.string().optional(),
  amenities: z.array(z.string()).default([]),
  imageUrl: z.string().url().optional(),
  pricePerNight: z.number().positive(),
  currency: z.string().default('USD'),
});

export const updateHotelSchema = createHotelSchema.partial();

export type CreateHotelInput = z.infer<typeof createHotelSchema>;
export type UpdateHotelInput = z.infer<typeof updateHotelSchema>;
