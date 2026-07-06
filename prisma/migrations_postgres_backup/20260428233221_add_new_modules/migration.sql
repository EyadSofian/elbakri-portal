-- CreateEnum
CREATE TYPE "Season" AS ENUM ('LOW', 'REGULAR', 'HIGH', 'PEAK');

-- CreateEnum
CREATE TYPE "ShipType" AS ENUM ('CRUISE', 'DAHABIYA', 'FELUCCA');

-- CreateEnum
CREATE TYPE "CruiseRoute" AS ENUM ('LUXOR_ASWAN', 'ASWAN_LUXOR', 'LUXOR_ASWAN_LUXOR');

-- CreateEnum
CREATE TYPE "CabinType" AS ENUM ('STANDARD', 'DELUXE', 'SUITE', 'PRESIDENTIAL');

-- CreateEnum
CREATE TYPE "TransportType" AS ENUM ('AIRPORT_TRANSFER', 'PRIVATE_TRANSFER', 'DAY_TOUR_TRANSPORT', 'INTERCITY');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('SEDAN', 'SUV', 'VAN_6', 'VAN_12', 'MINIBUS_20', 'BUS_45', 'LUXURY_LIMO');

-- CreateEnum
CREATE TYPE "ActivityCity" AS ENUM ('CAIRO', 'SHARM_EL_SHEIKH', 'DAHAB', 'HURGHADA', 'EL_GOUNA', 'ALEXANDRIA');

-- CreateEnum
CREATE TYPE "ActivityCategory" AS ENUM ('SIGHTSEEING', 'DIVING', 'SNORKELING', 'DESERT_SAFARI', 'WATER_SPORTS', 'CULTURAL', 'FOOD_TOUR', 'ADVENTURE', 'RELAXATION');

-- CreateEnum
CREATE TYPE "VisaType" AS ENUM ('TOURIST', 'BUSINESS', 'TRANSIT', 'STUDENT', 'MEDICAL', 'UMRAH', 'HAJJ');

-- CreateEnum
CREATE TYPE "ProcessingType" AS ENUM ('NORMAL', 'EXPRESS', 'URGENT');

-- CreateEnum
CREATE TYPE "VisaStatus" AS ENUM ('PENDING', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReceptionType" AS ENUM ('MEET_AND_GREET', 'AHLAN_SERVICE', 'VIP_LOUNGE', 'FULL_ASSISTANCE');

-- CreateEnum
CREATE TYPE "EgyptAirport" AS ENUM ('CAI', 'HRG', 'SSH', 'LXR', 'ASW', 'HBE', 'MHH');

-- CreateTable
CREATE TABLE "HotelPricing" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "roomType" "RoomType" NOT NULL,
    "season" "Season" NOT NULL DEFAULT 'REGULAR',
    "pricePerNight" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelPricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NileCruise" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "shipType" "ShipType" NOT NULL DEFAULT 'CRUISE',
    "operator" TEXT,
    "cabins" INTEGER NOT NULL DEFAULT 0,
    "route" "CruiseRoute" NOT NULL DEFAULT 'LUXOR_ASWAN',
    "departureDays" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "duration" INTEGER NOT NULL DEFAULT 4,
    "description" TEXT,
    "descriptionAr" TEXT,
    "imageUrl" TEXT,
    "priceFrom" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NileCruise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CruiseBooking" (
    "id" TEXT NOT NULL,
    "refNumber" TEXT NOT NULL,
    "cruiseId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "checkIn" TIMESTAMP(3) NOT NULL,
    "checkOut" TIMESTAMP(3) NOT NULL,
    "cabinType" "CabinType" NOT NULL DEFAULT 'STANDARD',
    "passengerNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "adultsCount" INTEGER NOT NULL DEFAULT 1,
    "childrenCount" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CruiseBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportBooking" (
    "id" TEXT NOT NULL,
    "refNumber" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "type" "TransportType" NOT NULL,
    "vehicleType" "VehicleType" NOT NULL DEFAULT 'SEDAN',
    "fromLocation" TEXT NOT NULL,
    "toLocation" TEXT NOT NULL,
    "pickupDateTime" TIMESTAMP(3) NOT NULL,
    "returnDateTime" TIMESTAMP(3),
    "isRoundTrip" BOOLEAN NOT NULL DEFAULT false,
    "passengerCount" INTEGER NOT NULL DEFAULT 1,
    "passengerNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "flightNumber" TEXT,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "city" "ActivityCity" NOT NULL,
    "category" "ActivityCategory" NOT NULL DEFAULT 'SIGHTSEEING',
    "duration" TEXT,
    "description" TEXT,
    "descriptionAr" TEXT,
    "includes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excludes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "imageUrl" TEXT,
    "priceAdult" DECIMAL(10,2) NOT NULL,
    "priceChild" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "minPax" INTEGER NOT NULL DEFAULT 1,
    "maxPax" INTEGER NOT NULL DEFAULT 20,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityBooking" (
    "id" TEXT NOT NULL,
    "refNumber" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "activityDate" TIMESTAMP(3) NOT NULL,
    "adultsCount" INTEGER NOT NULL DEFAULT 1,
    "childrenCount" INTEGER NOT NULL DEFAULT 0,
    "passengerNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivityBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisaApplication" (
    "id" TEXT NOT NULL,
    "refNumber" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "applicantName" TEXT NOT NULL,
    "nationality" TEXT NOT NULL,
    "passportNumber" TEXT NOT NULL,
    "passportExpiry" TIMESTAMP(3) NOT NULL,
    "visaType" "VisaType" NOT NULL,
    "destinationCountry" TEXT NOT NULL,
    "travelDate" TIMESTAMP(3) NOT NULL,
    "processingType" "ProcessingType" NOT NULL DEFAULT 'NORMAL',
    "status" "VisaStatus" NOT NULL DEFAULT 'PENDING',
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "notes" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisaApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AirportReception" (
    "id" TEXT NOT NULL,
    "refNumber" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "serviceType" "ReceptionType" NOT NULL,
    "airport" "EgyptAirport" NOT NULL,
    "flightNumber" TEXT NOT NULL,
    "flightDateTime" TIMESTAMP(3) NOT NULL,
    "guestName" TEXT NOT NULL,
    "guestCount" INTEGER NOT NULL DEFAULT 1,
    "passengerNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "signboardName" TEXT,
    "hotelName" TEXT,
    "specialRequests" TEXT,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AirportReception_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HotelPricing_hotelId_idx" ON "HotelPricing"("hotelId");

-- CreateIndex
CREATE UNIQUE INDEX "CruiseBooking_refNumber_key" ON "CruiseBooking"("refNumber");

-- CreateIndex
CREATE INDEX "CruiseBooking_companyId_idx" ON "CruiseBooking"("companyId");

-- CreateIndex
CREATE INDEX "CruiseBooking_status_idx" ON "CruiseBooking"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TransportBooking_refNumber_key" ON "TransportBooking"("refNumber");

-- CreateIndex
CREATE INDEX "TransportBooking_companyId_idx" ON "TransportBooking"("companyId");

-- CreateIndex
CREATE INDEX "TransportBooking_status_idx" ON "TransportBooking"("status");

-- CreateIndex
CREATE INDEX "Activity_city_idx" ON "Activity"("city");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityBooking_refNumber_key" ON "ActivityBooking"("refNumber");

-- CreateIndex
CREATE INDEX "ActivityBooking_companyId_idx" ON "ActivityBooking"("companyId");

-- CreateIndex
CREATE INDEX "ActivityBooking_activityId_idx" ON "ActivityBooking"("activityId");

-- CreateIndex
CREATE UNIQUE INDEX "VisaApplication_refNumber_key" ON "VisaApplication"("refNumber");

-- CreateIndex
CREATE INDEX "VisaApplication_companyId_idx" ON "VisaApplication"("companyId");

-- CreateIndex
CREATE INDEX "VisaApplication_status_idx" ON "VisaApplication"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AirportReception_refNumber_key" ON "AirportReception"("refNumber");

-- CreateIndex
CREATE INDEX "AirportReception_companyId_idx" ON "AirportReception"("companyId");

-- CreateIndex
CREATE INDEX "AirportReception_status_idx" ON "AirportReception"("status");

-- AddForeignKey
ALTER TABLE "HotelPricing" ADD CONSTRAINT "HotelPricing_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CruiseBooking" ADD CONSTRAINT "CruiseBooking_cruiseId_fkey" FOREIGN KEY ("cruiseId") REFERENCES "NileCruise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CruiseBooking" ADD CONSTRAINT "CruiseBooking_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CruiseBooking" ADD CONSTRAINT "CruiseBooking_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportBooking" ADD CONSTRAINT "TransportBooking_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportBooking" ADD CONSTRAINT "TransportBooking_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityBooking" ADD CONSTRAINT "ActivityBooking_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityBooking" ADD CONSTRAINT "ActivityBooking_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityBooking" ADD CONSTRAINT "ActivityBooking_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisaApplication" ADD CONSTRAINT "VisaApplication_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisaApplication" ADD CONSTRAINT "VisaApplication_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AirportReception" ADD CONSTRAINT "AirportReception_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AirportReception" ADD CONSTRAINT "AirportReception_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
