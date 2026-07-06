-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "timeSlots" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "ActivityBooking" ADD COLUMN     "activityType" TEXT,
ADD COLUMN     "childAges" JSONB,
ADD COLUMN     "clientName" TEXT,
ADD COLUMN     "clientPhone" TEXT,
ADD COLUMN     "hotelName" TEXT,
ADD COLUMN     "selectedTime" TEXT;

-- AlterTable
ALTER TABLE "TransportBooking" ADD COLUMN     "airlineName" TEXT,
ADD COLUMN     "contactNumber" TEXT,
ADD COLUMN     "fromType" TEXT,
ADD COLUMN     "passengerName" TEXT,
ADD COLUMN     "returnAirlineName" TEXT,
ADD COLUMN     "returnFlightNumber" TEXT,
ADD COLUMN     "toType" TEXT;

-- AlterTable
ALTER TABLE "TransportRate" ADD COLUMN     "roundTripRate" DECIMAL(10,2);
