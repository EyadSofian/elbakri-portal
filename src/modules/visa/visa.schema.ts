import { ProcessingType, VisaType } from '@prisma/client';
import { z } from 'zod';
import { SECURITY_DESTINATION_CODES } from '../../shared/security-destinations';
import { SECURITY_NATIONALITY_CODES } from '../../shared/security-nationalities';

// The admin form posts `null` for blank fields, so optional fields are
// `.nullable().optional()`. Anything not declared here is stripped by
// z.object() before the controller sees it — which is the point: the update
// handler used to hand `req.body` straight to Prisma, so any key a caller
// invented was written to the row.

// Taken from the generated Prisma enums so the accepted values can never drift
// from the database.
const VISA_TYPES = Object.values(VisaType) as [VisaType, ...VisaType[]];
const PROCESSING_TYPES = Object.values(ProcessingType) as [ProcessingType, ...ProcessingType[]];

/** The fields an admin may change on an existing approval. Money, status and
 *  the audit trail are deliberately absent — those move through approve /
 *  reject / repricing, never through a free-form edit. */
export const updateVisaApplicationSchema = z.object({
  applicantName: z.string().min(2).optional(),
  // One of the three nationalities approvals are filed for — an admin edit
  // cannot move an approval onto a passport the authorities will not process.
  nationality: z.enum(SECURITY_NATIONALITY_CODES).optional(),
  passportNumber: z.string().min(3).optional(),
  passportExpiry: z.string().optional(),
  visaType: z.enum(VISA_TYPES).optional(),
  destinationCountry: z.string().min(1).optional(),
  // Where the guests stay, as opposed to destinationCountry, the airport they
  // arrive at. Blank clears it, so an approval filed without one can stay that way.
  destinationCity: z.enum(SECURITY_DESTINATION_CODES).nullable().optional(),
  travelDate: z.string().optional(),
  processingType: z.enum(PROCESSING_TYPES).optional(),
  paxCount: z.coerce.number().int().min(1).max(200).optional(),
  phone: z.string().nullable().optional(),
  hotelName: z.string().nullable().optional(),
  comingFrom: z.string().nullable().optional(),
  flightNumber: z.string().nullable().optional(),
  arrivalTime: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  passportUrl: z.string().nullable().optional(),
  flightTicketUrl: z.string().nullable().optional(),
});

export type UpdateVisaApplicationInput = z.infer<typeof updateVisaApplicationSchema>;
