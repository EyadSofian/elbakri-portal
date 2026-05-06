import { z } from 'zod';

export const createBookingSchema = z.object({
  type: z.enum(['HOTEL', 'FLIGHT', 'PACKAGE']),
  companyId: z.string().optional(),
  hotelId: z.string().optional(),
  roomId: z.string().optional(),
  checkIn: z.string().datetime().optional(),
  checkOut: z.string().datetime().optional(),
  nights: z.number().int().positive().optional(),
  origin: z.string().optional(),
  destination: z.string().optional(),
  departureDate: z.string().datetime().optional(),
  returnDate: z.string().datetime().optional(),
  airline: z.string().optional(),
  flightNumber: z.string().optional(),
  cabinClass: z.enum(['ECONOMY', 'BUSINESS', 'FIRST']).optional(),
  passengerNames: z.array(z.string()).default([]),
  adultsCount: z.number().int().positive().default(1),
  childrenCount: z.number().int().min(0).default(0),
  infantsCount: z.number().int().min(0).default(0),
  baseAmount: z.number().positive(),
  discount: z.number().min(0).default(0),
  currency: z.string().default('USD'),
  notes: z.string().optional(),
});

export const cancelBookingSchema = z.object({
  reason: z.string().min(1),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
