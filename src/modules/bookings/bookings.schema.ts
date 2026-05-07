import { z } from 'zod';

export const createBookingSchema = z.object({
  type: z.enum(['HOTEL', 'FLIGHT', 'PACKAGE']),
  companyId: z.string().optional(),
  hotelId: z.string().optional(),
  roomId: z.string().optional(),
  checkIn: z.string().optional(),
  checkOut: z.string().optional(),
  nights: z.number().int().positive().optional(),
  origin: z.string().optional(),
  destination: z.string().optional(),
  departureDate: z.string().optional(),
  returnDate: z.string().optional(),
  airline: z.string().optional(),
  flightNumber: z.string().optional(),
  cabinClass: z.enum(['ECONOMY', 'BUSINESS', 'FIRST']).optional(),
  passengerNames: z.array(z.string()).default([]),
  adultsCount: z.number().int().positive().default(1),
  childrenCount: z.number().int().min(0).default(0),
  infantsCount: z.number().int().min(0).default(0),
  roomsCount: z.number().int().positive().optional(),
  baseAmount: z.number().positive().optional(),
  discount: z.number().min(0).default(0),
  currency: z.string().default('USD'),
  notes: z.string().optional(),
});

export const cancelBookingSchema = z.object({
  reason: z.string().min(1),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
