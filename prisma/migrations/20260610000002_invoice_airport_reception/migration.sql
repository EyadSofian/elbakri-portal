-- Phase 6: Airport Assist — link invoices to airport reception bookings so a
-- priced reception can issue a proper invoice (same pattern as transport/activity).

ALTER TABLE "Invoice" ADD COLUMN "airportReceptionId" TEXT;

CREATE UNIQUE INDEX "Invoice_airportReceptionId_key" ON "Invoice"("airportReceptionId");

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_airportReceptionId_fkey"
  FOREIGN KEY ("airportReceptionId") REFERENCES "AirportReception"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
