-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPERADMIN', 'COMPANY_ADMIN', 'AGENT');

-- CreateEnum
CREATE TYPE "CompanyTier" AS ENUM ('STANDARD', 'SILVER', 'GOLD', 'PLATINUM');

-- CreateEnum
CREATE TYPE "Market" AS ENUM ('EGYPTIAN', 'INTERNATIONAL', 'GULF', 'FOREIGN');

-- CreateEnum
CREATE TYPE "ServiceScope" AS ENUM ('ACTIVITY', 'TRANSPORT');

-- CreateEnum
CREATE TYPE "PricingAdjustmentType" AS ENUM ('NONE', 'FIXED', 'PERCENTAGE');

-- CreateEnum
CREATE TYPE "HotelSource" AS ENUM ('MANUAL', 'GOOGLE_SHEETS');

-- CreateEnum
CREATE TYPE "RoomType" AS ENUM ('STANDARD', 'DELUXE', 'SUITE', 'EXECUTIVE');

-- CreateEnum
CREATE TYPE "BookingType" AS ENUM ('HOTEL', 'FLIGHT', 'PACKAGE');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'REJECTED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('UNPAID', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('CREDIT', 'DEBIT', 'REFUND', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('SUCCESS', 'FAILED', 'PARTIAL', 'RUNNING');

-- CreateEnum
CREATE TYPE "CabinClass" AS ENUM ('ECONOMY', 'BUSINESS', 'FIRST');

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
CREATE TYPE "TransportServiceMode" AS ENUM ('POINT_TO_POINT', 'AIRPORT_TRANSFER', 'HOURLY_CHARTER', 'DAY_USE');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('SEDAN', 'SUV', 'VAN_6', 'VAN_12', 'MINIBUS_20', 'BUS_45', 'LUXURY_LIMO');

-- CreateEnum
CREATE TYPE "ActivityCategory" AS ENUM ('SIGHTSEEING', 'DIVING', 'SNORKELING', 'DESERT_SAFARI', 'WATER_SPORTS', 'CULTURAL', 'FOOD_TOUR', 'ADVENTURE', 'RELAXATION');

-- CreateEnum
CREATE TYPE "VisaType" AS ENUM ('TOURIST', 'BUSINESS', 'TRANSIT', 'STUDENT', 'MEDICAL', 'UMRAH', 'HAJJ');

-- CreateEnum
CREATE TYPE "MealPlan" AS ENUM ('ROOM_ONLY', 'BREAKFAST', 'HALF_BOARD', 'FULL_BOARD', 'ALL_INCLUSIVE', 'ULTRA_ALL_INCLUSIVE');

-- CreateEnum
CREATE TYPE "ProcessingType" AS ENUM ('NORMAL', 'EXPRESS', 'URGENT');

-- CreateEnum
CREATE TYPE "VisaStatus" AS ENUM ('PENDING', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReceptionType" AS ENUM ('MEET_AND_GREET', 'AHLAN_SERVICE', 'VIP_LOUNGE', 'FULL_ASSISTANCE');

-- CreateEnum
CREATE TYPE "EgyptAirport" AS ENUM ('CAI', 'HRG', 'SSH', 'LXR', 'ASW', 'HBE', 'MHH');

-- CreateEnum
CREATE TYPE "DestinationType" AS ENUM ('CITY', 'RESORT', 'AREA', 'REGION');

-- CreateEnum
CREATE TYPE "QuoteRequestStatus" AS ENUM ('NEW', 'IN_REVIEW', 'QUOTED', 'ACCEPTED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QuoteServiceType" AS ENUM ('HOTEL', 'PACKAGE', 'CRUISE', 'FLIGHT', 'MULTI_SERVICE');

-- CreateEnum
CREATE TYPE "TransportEndpointType" AS ENUM ('AIRPORT', 'HOTEL', 'DESTINATION');

-- CreateEnum
CREATE TYPE "HotelSupplementType" AS ENUM ('FIXED_AMOUNT', 'PERCENTAGE', 'TEXT_ONLY');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "role" "Role" NOT NULL DEFAULT 'AGENT',
    "companyId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "token" VARCHAR(500) NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "email" TEXT NOT NULL,
    "contactEmail" TEXT,
    "phone" TEXT NOT NULL,
    "address" TEXT,
    "billingAddress" TEXT,
    "country" TEXT NOT NULL DEFAULT 'EG',
    "taxId" TEXT,
    "website" TEXT,
    "creditLimit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "market" "Market" NOT NULL DEFAULT 'INTERNATIONAL',
    "tier" "CompanyTier" NOT NULL DEFAULT 'STANDARD',
    "logoUrl" TEXT,
    "themeColor" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastActivityAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Destination" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "slug" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'EG',
    "region" TEXT,
    "type" "DestinationType" NOT NULL DEFAULT 'CITY',
    "imageUrl" TEXT,
    "imageAltEn" TEXT,
    "imageAltAr" TEXT,
    "galleryUrls" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Destination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hotel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "city" TEXT NOT NULL,
    "cityAr" TEXT,
    "country" TEXT NOT NULL,
    "stars" INTEGER NOT NULL DEFAULT 3,
    "address" TEXT NOT NULL,
    "description" TEXT,
    "descriptionAr" TEXT,
    "amenities" JSONB,
    "area" TEXT,
    "seaFront" BOOLEAN NOT NULL DEFAULT false,
    "privateBeach" BOOLEAN NOT NULL DEFAULT false,
    "sandyBeach" BOOLEAN NOT NULL DEFAULT false,
    "kidsPool" BOOLEAN NOT NULL DEFAULT false,
    "kidsClub" BOOLEAN NOT NULL DEFAULT false,
    "aquaPark" BOOLEAN NOT NULL DEFAULT false,
    "snorkeling" BOOLEAN NOT NULL DEFAULT false,
    "diving" BOOLEAN NOT NULL DEFAULT false,
    "adultsOnly" BOOLEAN NOT NULL DEFAULT false,
    "allInclusive" BOOLEAN NOT NULL DEFAULT false,
    "totalPools" INTEGER,
    "googleRating" DECIMAL(3,2),
    "imageUrl" TEXT,
    "galleryUrls" JSONB,
    "bookingHotelId" TEXT,
    "bookingUrl" TEXT,
    "bookingMatchedName" TEXT,
    "bookingMatchScore" DECIMAL(4,3),
    "mediaNeedsManualReview" BOOLEAN NOT NULL DEFAULT false,
    "mediaSyncedAt" TIMESTAMP(3),
    "pricePerNight" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "commissionPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "availableRooms" INTEGER NOT NULL DEFAULT 0,
    "maxGuestsPerRoom" INTEGER NOT NULL DEFAULT 2,
    "showPriceToAgents" BOOLEAN NOT NULL DEFAULT false,
    "allowQuoteRequest" BOOLEAN NOT NULL DEFAULT true,
    "minVisibleTier" "CompanyTier",
    "checkInTime" TEXT,
    "checkOutTime" TEXT,
    "cancellationPolicy" TEXT,
    "cancellationPolicyAr" TEXT,
    "childrenPolicy" TEXT,
    "childrenPolicyAr" TEXT,
    "extraBedPolicy" TEXT,
    "extraBedPolicyAr" TEXT,
    "mealPolicy" TEXT,
    "mealPolicyAr" TEXT,
    "importantNotes" TEXT,
    "importantNotesAr" TEXT,
    "source" "HotelSource" NOT NULL DEFAULT 'MANUAL',
    "sheetsRowId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "destinationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hotel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "type" "RoomType" NOT NULL DEFAULT 'STANDARD',
    "capacity" INTEGER NOT NULL DEFAULT 2,
    "pricePerNight" DECIMAL(10,2) NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

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
    "sheetsRowId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelPricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelRate" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "roomName" TEXT NOT NULL,
    "market" "Market",
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "singlePrice" DECIMAL(10,2),
    "doublePrice" DECIMAL(10,2),
    "triplePrice" DECIMAL(10,2),
    "mealPlan" "MealPlan",
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelRateSupplement" (
    "id" TEXT NOT NULL,
    "rateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "HotelSupplementType" NOT NULL DEFAULT 'TEXT_ONLY',
    "amount" DECIMAL(10,2),
    "currency" TEXT,
    "notes" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelRateSupplement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelCompanyVisibility" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "canViewPrice" BOOLEAN NOT NULL DEFAULT true,
    "canRequestQuote" BOOLEAN,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelCompanyVisibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "refNumber" TEXT NOT NULL,
    "type" "BookingType" NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "companyId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "hotelId" TEXT,
    "roomId" TEXT,
    "checkIn" TIMESTAMP(3),
    "checkOut" TIMESTAMP(3),
    "nights" INTEGER,
    "origin" TEXT,
    "destination" TEXT,
    "departureDate" TIMESTAMP(3),
    "returnDate" TIMESTAMP(3),
    "airline" TEXT,
    "flightNumber" TEXT,
    "cabinClass" "CabinClass",
    "passengerNames" JSONB,
    "adultsCount" INTEGER NOT NULL DEFAULT 1,
    "childrenCount" INTEGER NOT NULL DEFAULT 0,
    "infantsCount" INTEGER NOT NULL DEFAULT 0,
    "roomsCount" INTEGER NOT NULL DEFAULT 1,
    "baseAmount" DECIMAL(12,2) NOT NULL,
    "commissionPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "commissionAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "sourceAmount" DECIMAL(12,2),
    "sourceCurrency" TEXT,
    "exchangeRate" DECIMAL(18,8),
    "exchangeRateAt" TIMESTAMP(3),
    "notes" TEXT,
    "internalNotes" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingCounter" (
    "year" INTEGER NOT NULL,
    "lastSeq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BookingCounter_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "QuoteRequest" (
    "id" TEXT NOT NULL,
    "refNumber" TEXT NOT NULL,
    "serviceType" "QuoteServiceType" NOT NULL,
    "status" "QuoteRequestStatus" NOT NULL DEFAULT 'NEW',
    "companyId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "destinationId" TEXT,
    "destinationName" TEXT,
    "hotelId" TEXT,
    "serviceId" TEXT,
    "serviceName" TEXT,
    "cruiseId" TEXT,
    "activityId" TEXT,
    "checkIn" TIMESTAMP(3),
    "checkOut" TIMESTAMP(3),
    "adultsCount" INTEGER NOT NULL DEFAULT 1,
    "childrenCount" INTEGER NOT NULL DEFAULT 0,
    "infantsCount" INTEGER NOT NULL DEFAULT 0,
    "roomsCount" INTEGER,
    "nationality" TEXT,
    "travelFrom" TEXT,
    "mealPlan" "MealPlan",
    "childAges" JSONB,
    "budget" DECIMAL(12,2),
    "quotedAmount" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "customerNotes" TEXT,
    "internalNotes" TEXT,
    "contactPreference" TEXT,
    "customFields" JSONB,
    "assignedToId" TEXT,
    "respondedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteRequestCounter" (
    "year" INTEGER NOT NULL,
    "lastSeq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "QuoteRequestCounter_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "bookingId" TEXT,
    "activityBookingId" TEXT,
    "activityPackageId" TEXT,
    "transportBookingId" TEXT,
    "airportReceptionId" TEXT,
    "cruiseBookingId" TEXT,
    "visaApplicationId" TEXT,
    "simRequestId" TEXT,
    "companyId" TEXT NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "taxRate" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "sourceSubtotal" DECIMAL(12,2),
    "sourceCurrency" TEXT,
    "exchangeRate" DECIMAL(18,8),
    "exchangeRateAt" TIMESTAMP(3),
    "status" "InvoiceStatus" NOT NULL DEFAULT 'UNPAID',
    "pdfPath" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsolidatedInvoice" (
    "id" TEXT NOT NULL,
    "statementNumber" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdById" TEXT,
    "periodFrom" TIMESTAMP(3),
    "periodTo" TIMESTAMP(3),
    "subtotal" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'UNPAID',
    "pdfPath" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsolidatedInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsolidatedInvoiceLine" (
    "id" TEXT NOT NULL,
    "consolidatedInvoiceId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "refNumber" TEXT,
    "service" TEXT NOT NULL,
    "serviceDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsolidatedInvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceCounter" (
    "year" INTEGER NOT NULL,
    "lastSeq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceCounter_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "WalletTransaction" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "balanceBefore" DECIMAL(12,2) NOT NULL,
    "balanceAfter" DECIMAL(12,2) NOT NULL,
    "reference" TEXT,
    "description" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformWallet" (
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformWallet_pkey" PRIMARY KEY ("currency")
);

-- CreateTable
CREATE TABLE "PlatformWalletTransaction" (
    "id" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "balanceBefore" DECIMAL(12,2) NOT NULL,
    "balanceAfter" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "reference" TEXT,
    "description" TEXT NOT NULL,
    "companyId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformWalletTransaction_pkey" PRIMARY KEY ("id")
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
    "departureDays" JSONB,
    "duration" INTEGER NOT NULL DEFAULT 4,
    "description" TEXT,
    "descriptionAr" TEXT,
    "imageUrl" TEXT,
    "priceFrom" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "showPriceToAgents" BOOLEAN NOT NULL DEFAULT false,
    "allowQuoteRequest" BOOLEAN NOT NULL DEFAULT true,
    "sheetsRowId" TEXT,
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
    "passengerNames" JSONB,
    "adultsCount" INTEGER NOT NULL DEFAULT 1,
    "childrenCount" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "sourceAmount" DECIMAL(12,2),
    "sourceCurrency" TEXT,
    "exchangeRate" DECIMAL(18,8),
    "exchangeRateAt" TIMESTAMP(3),
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
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
    "serviceMode" "TransportServiceMode",
    "rateId" TEXT,
    "matchedDirection" TEXT,
    "vehicleType" "VehicleType" NOT NULL DEFAULT 'SEDAN',
    "fromLocation" TEXT NOT NULL,
    "toLocation" TEXT NOT NULL,
    "fromType" TEXT,
    "toType" TEXT,
    "pickupType" TEXT,
    "pickupLocation" TEXT,
    "pickupAddress" TEXT,
    "pickupHotelName" TEXT,
    "dropoffType" TEXT,
    "dropoffLocation" TEXT,
    "dropoffAddress" TEXT,
    "dropoffHotelName" TEXT,
    "pickupDateTime" TIMESTAMP(3) NOT NULL,
    "returnDateTime" TIMESTAMP(3),
    "isRoundTrip" BOOLEAN NOT NULL DEFAULT false,
    "sameRouteReversed" BOOLEAN NOT NULL DEFAULT true,
    "returnFromLocation" TEXT,
    "returnToLocation" TEXT,
    "returnFromType" TEXT,
    "returnToType" TEXT,
    "returnPickupHotelName" TEXT,
    "returnPickupAddress" TEXT,
    "returnDropoffHotelName" TEXT,
    "returnDropoffAddress" TEXT,
    "passengerCount" INTEGER NOT NULL DEFAULT 1,
    "passengerNames" JSONB,
    "passengerName" TEXT,
    "flightNumber" TEXT,
    "airlineName" TEXT,
    "returnFlightNumber" TEXT,
    "returnAirlineName" TEXT,
    "contactNumber" TEXT,
    "groupTypeId" TEXT,
    "groupTypeLabel" TEXT,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "sourceAmount" DECIMAL(12,2),
    "sourceCurrency" TEXT,
    "exchangeRate" DECIMAL(18,8),
    "exchangeRateAt" TIMESTAMP(3),
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "customFields" JSONB,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportRate" (
    "id" TEXT NOT NULL,
    "sheetsRowId" TEXT,
    "type" "TransportType" NOT NULL DEFAULT 'PRIVATE_TRANSFER',
    "serviceMode" "TransportServiceMode" NOT NULL DEFAULT 'POINT_TO_POINT',
    "serviceNameEn" TEXT,
    "serviceNameAr" TEXT,
    "serviceArea" TEXT,
    "durationHours" INTEGER,
    "vehicleType" "VehicleType" NOT NULL DEFAULT 'SEDAN',
    "city" TEXT,
    "fromLocation" TEXT,
    "toLocation" TEXT,
    "fromType" "TransportEndpointType",
    "fromId" TEXT,
    "fromName" TEXT,
    "toType" "TransportEndpointType",
    "toId" TEXT,
    "toName" TEXT,
    "isBidirectional" BOOLEAN NOT NULL DEFAULT false,
    "rate" DECIMAL(10,2) NOT NULL,
    "roundTripRate" DECIMAL(10,2),
    "priceEgp" DECIMAL(10,2),
    "priceUsd" DECIMAL(10,2),
    "roundTripPriceEgp" DECIMAL(10,2),
    "roundTripPriceUsd" DECIMAL(10,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "minCapacity" INTEGER NOT NULL DEFAULT 1,
    "maxCapacity" INTEGER,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "destinationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Airport" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT,
    "city" TEXT,
    "cityAr" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Airport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "city" TEXT NOT NULL,
    "category" "ActivityCategory" NOT NULL DEFAULT 'SIGHTSEEING',
    "duration" TEXT,
    "timeSlots" JSONB,
    "description" TEXT,
    "descriptionAr" TEXT,
    "includes" JSONB,
    "excludes" JSONB,
    "imageUrl" TEXT,
    "priceAdult" DECIMAL(10,2) NOT NULL,
    "priceChild" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "sheetsRowId" TEXT,
    "minPax" INTEGER NOT NULL DEFAULT 1,
    "maxPax" INTEGER NOT NULL DEFAULT 20,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isConfirmableInApp" BOOLEAN NOT NULL DEFAULT true,
    "destinationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityPackage" (
    "id" TEXT NOT NULL,
    "refNumber" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "clientName" TEXT,
    "clientPhone" TEXT,
    "hotelName" TEXT,
    "adultsCount" INTEGER NOT NULL DEFAULT 1,
    "childrenCount" INTEGER NOT NULL DEFAULT 0,
    "childAges" JSONB,
    "notes" TEXT,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "sourceAmount" DECIMAL(12,2),
    "sourceCurrency" TEXT,
    "exchangeRate" DECIMAL(18,8),
    "exchangeRateAt" TIMESTAMP(3),
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "customFields" JSONB,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivityPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityPackageItem" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "activityName" TEXT NOT NULL,
    "city" TEXT,
    "activityDate" TIMESTAMP(3) NOT NULL,
    "selectedTime" TEXT,
    "endTime" TEXT,
    "adultsCount" INTEGER NOT NULL DEFAULT 1,
    "childrenCount" INTEGER NOT NULL DEFAULT 0,
    "childAges" JSONB,
    "hotelName" TEXT,
    "clientPhone" TEXT,
    "activityType" TEXT,
    "groupTypeId" TEXT,
    "groupTypeLabel" TEXT,
    "transferIncluded" BOOLEAN,
    "notes" TEXT,
    "lineAmount" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivityPackageItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityPackageCounter" (
    "year" INTEGER NOT NULL,
    "lastSeq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ActivityPackageCounter_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "ActivityBooking" (
    "id" TEXT NOT NULL,
    "refNumber" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "activityDate" TIMESTAMP(3) NOT NULL,
    "selectedTime" TEXT,
    "activityType" TEXT,
    "groupTypeId" TEXT,
    "groupTypeLabel" TEXT,
    "adultsCount" INTEGER NOT NULL DEFAULT 1,
    "childrenCount" INTEGER NOT NULL DEFAULT 0,
    "childAges" JSONB,
    "clientName" TEXT,
    "clientPhone" TEXT,
    "hotelName" TEXT,
    "passengerNames" JSONB,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "sourceAmount" DECIMAL(12,2),
    "sourceCurrency" TEXT,
    "exchangeRate" DECIMAL(18,8),
    "exchangeRateAt" TIMESTAMP(3),
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivityBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceGroupType" (
    "id" TEXT NOT NULL,
    "scope" "ServiceScope" NOT NULL,
    "code" TEXT NOT NULL,
    "labelEn" TEXT NOT NULL,
    "labelAr" TEXT,
    "descriptionEn" TEXT,
    "descriptionAr" TEXT,
    "destinationId" TEXT,
    "activityId" TEXT,
    "transportRateId" TEXT,
    "adjustmentType" "PricingAdjustmentType" NOT NULL DEFAULT 'NONE',
    "adjustmentValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "minPax" INTEGER NOT NULL DEFAULT 1,
    "maxPax" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceGroupType_pkey" PRIMARY KEY ("id")
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
    "sourceAmount" DECIMAL(12,2),
    "sourceCurrency" TEXT,
    "exchangeRate" DECIMAL(18,8),
    "exchangeRateAt" TIMESTAMP(3),
    "notes" TEXT,
    "phone" TEXT,
    "hotelName" TEXT,
    "comingFrom" TEXT,
    "flightNumber" TEXT,
    "arrivalTime" TIMESTAMP(3),
    "paxCount" INTEGER NOT NULL DEFAULT 1,
    "passportUrl" TEXT,
    "flightTicketUrl" TEXT,
    "customFields" JSONB,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisaApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisaFee" (
    "id" TEXT NOT NULL,
    "sheetsRowId" TEXT,
    "visaType" "VisaType" NOT NULL,
    "destinationCountry" TEXT NOT NULL,
    "processingType" "ProcessingType" NOT NULL DEFAULT 'NORMAL',
    "fee" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisaFee_pkey" PRIMARY KEY ("id")
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
    "passengerNames" JSONB,
    "signboardName" TEXT,
    "hotelName" TEXT,
    "specialRequests" TEXT,
    "phone" TEXT,
    "ticketUrl" TEXT,
    "travelDetails" TEXT,
    "comingFrom" TEXT,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "sourceAmount" DECIMAL(12,2),
    "sourceCurrency" TEXT,
    "exchangeRate" DECIMAL(18,8),
    "exchangeRateAt" TIMESTAMP(3),
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "customFields" JSONB,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AirportReception_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceptionServiceRate" (
    "id" TEXT NOT NULL,
    "sheetsRowId" TEXT,
    "serviceType" "ReceptionType" NOT NULL,
    "airport" "EgyptAirport",
    "rate" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReceptionServiceRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleAr" TEXT,
    "description" TEXT,
    "descriptionAr" TEXT,
    "imageUrl" TEXT,
    "serviceType" TEXT,
    "ctaLabel" TEXT,
    "ctaLabelAr" TEXT,
    "ctaAction" TEXT,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SimPackage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "dataSize" TEXT NOT NULL,
    "minutes" TEXT,
    "validity" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SimPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SimRequest" (
    "id" TEXT NOT NULL,
    "refNumber" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "packageId" TEXT,
    "clientName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitAmount" DECIMAL(10,2),
    "arrivalDate" TIMESTAMP(3),
    "notes" TEXT,
    "customFields" JSONB,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "sourceAmount" DECIMAL(12,2),
    "sourceCurrency" TEXT,
    "exchangeRate" DECIMAL(18,8),
    "exchangeRateAt" TIMESTAMP(3),
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SimRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UiTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "serviceType" TEXT,
    "langMode" TEXT NOT NULL DEFAULT 'both',
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UiTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UiTemplateRevision" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "config" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UiTemplateRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SheetsConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "spreadsheetId" TEXT,
    "autoSyncEnabled" BOOLEAN NOT NULL DEFAULT false,
    "cronExpression" TEXT,
    "lastTestAt" TIMESTAMP(3),
    "lastTestStatus" "SyncStatus",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SheetsConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "sheetName" TEXT NOT NULL,
    "spreadsheetId" TEXT,
    "status" "SyncStatus" NOT NULL,
    "synced" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "triggeredById" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketPrice" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "market" "Market",
    "companyId" TEXT,
    "label" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "amount" DECIMAL(12,2),
    "priceUsd" DECIMAL(12,2),
    "nationalityGroup" TEXT,
    "minPax" INTEGER,
    "maxPax" INTEGER,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FxRateCache" (
    "id" TEXT NOT NULL DEFAULT 'latest',
    "base" TEXT NOT NULL DEFAULT 'USD',
    "rates" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FxRateCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Voucher" (
    "id" TEXT NOT NULL,
    "voucherNumber" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL,
    "transportBookingId" TEXT,
    "activityBookingId" TEXT,
    "activityPackageId" TEXT,
    "visaApplicationId" TEXT,
    "airportReceptionId" TEXT,
    "simRequestId" TEXT,
    "companyId" TEXT NOT NULL,
    "clientName" TEXT,
    "pdfPath" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Voucher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoucherCounter" (
    "year" INTEGER NOT NULL,
    "lastSeq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "VoucherCounter_pkey" PRIMARY KEY ("year")
);

-- CreateTable
CREATE TABLE "HotelMediaSyncLog" (
    "id" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "city" TEXT,
    "actorId" TEXT,
    "dryRun" BOOLEAN NOT NULL DEFAULT true,
    "status" "SyncStatus" NOT NULL DEFAULT 'RUNNING',
    "total" INTEGER NOT NULL DEFAULT 0,
    "matched" INTEGER NOT NULL DEFAULT 0,
    "manualReview" INTEGER NOT NULL DEFAULT 0,
    "applied" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "photoRows" INTEGER NOT NULL DEFAULT 0,
    "triggeredById" TEXT,
    "notes" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HotelMediaSyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_companyId_idx" ON "User"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_token_idx" ON "RefreshToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Company_email_key" ON "Company"("email");

-- CreateIndex
CREATE INDEX "Company_email_idx" ON "Company"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Destination_slug_key" ON "Destination"("slug");

-- CreateIndex
CREATE INDEX "Destination_slug_idx" ON "Destination"("slug");

-- CreateIndex
CREATE INDEX "Destination_country_idx" ON "Destination"("country");

-- CreateIndex
CREATE INDEX "Destination_isActive_idx" ON "Destination"("isActive");

-- CreateIndex
CREATE INDEX "Hotel_city_idx" ON "Hotel"("city");

-- CreateIndex
CREATE INDEX "Hotel_country_idx" ON "Hotel"("country");

-- CreateIndex
CREATE INDEX "Hotel_sheetsRowId_idx" ON "Hotel"("sheetsRowId");

-- CreateIndex
CREATE INDEX "Hotel_destinationId_idx" ON "Hotel"("destinationId");

-- CreateIndex
CREATE INDEX "Hotel_bookingHotelId_idx" ON "Hotel"("bookingHotelId");

-- CreateIndex
CREATE INDEX "Room_hotelId_idx" ON "Room"("hotelId");

-- CreateIndex
CREATE INDEX "HotelPricing_hotelId_idx" ON "HotelPricing"("hotelId");

-- CreateIndex
CREATE INDEX "HotelPricing_sheetsRowId_idx" ON "HotelPricing"("sheetsRowId");

-- CreateIndex
CREATE INDEX "HotelRate_hotelId_idx" ON "HotelRate"("hotelId");

-- CreateIndex
CREATE INDEX "HotelRate_hotelId_isActive_idx" ON "HotelRate"("hotelId", "isActive");

-- CreateIndex
CREATE INDEX "HotelRateSupplement_rateId_idx" ON "HotelRateSupplement"("rateId");

-- CreateIndex
CREATE INDEX "HotelCompanyVisibility_hotelId_idx" ON "HotelCompanyVisibility"("hotelId");

-- CreateIndex
CREATE INDEX "HotelCompanyVisibility_companyId_idx" ON "HotelCompanyVisibility"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "HotelCompanyVisibility_hotelId_companyId_key" ON "HotelCompanyVisibility"("hotelId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_refNumber_key" ON "Booking"("refNumber");

-- CreateIndex
CREATE INDEX "Booking_companyId_idx" ON "Booking"("companyId");

-- CreateIndex
CREATE INDEX "Booking_status_idx" ON "Booking"("status");

-- CreateIndex
CREATE INDEX "Booking_type_idx" ON "Booking"("type");

-- CreateIndex
CREATE INDEX "Booking_refNumber_idx" ON "Booking"("refNumber");

-- CreateIndex
CREATE INDEX "Booking_createdAt_idx" ON "Booking"("createdAt");

-- CreateIndex
CREATE INDEX "Booking_confirmedById_idx" ON "Booking"("confirmedById");

-- CreateIndex
CREATE UNIQUE INDEX "QuoteRequest_refNumber_key" ON "QuoteRequest"("refNumber");

-- CreateIndex
CREATE INDEX "QuoteRequest_companyId_idx" ON "QuoteRequest"("companyId");

-- CreateIndex
CREATE INDEX "QuoteRequest_status_idx" ON "QuoteRequest"("status");

-- CreateIndex
CREATE INDEX "QuoteRequest_serviceType_idx" ON "QuoteRequest"("serviceType");

-- CreateIndex
CREATE INDEX "QuoteRequest_refNumber_idx" ON "QuoteRequest"("refNumber");

-- CreateIndex
CREATE INDEX "QuoteRequest_createdAt_idx" ON "QuoteRequest"("createdAt");

-- CreateIndex
CREATE INDEX "QuoteRequest_assignedToId_idx" ON "QuoteRequest"("assignedToId");

-- CreateIndex
CREATE INDEX "QuoteRequest_confirmedById_idx" ON "QuoteRequest"("confirmedById");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_bookingId_key" ON "Invoice"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_activityBookingId_key" ON "Invoice"("activityBookingId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_activityPackageId_key" ON "Invoice"("activityPackageId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_transportBookingId_key" ON "Invoice"("transportBookingId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_airportReceptionId_key" ON "Invoice"("airportReceptionId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_cruiseBookingId_key" ON "Invoice"("cruiseBookingId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_visaApplicationId_key" ON "Invoice"("visaApplicationId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_simRequestId_key" ON "Invoice"("simRequestId");

-- CreateIndex
CREATE INDEX "Invoice_companyId_idx" ON "Invoice"("companyId");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ConsolidatedInvoice_statementNumber_key" ON "ConsolidatedInvoice"("statementNumber");

-- CreateIndex
CREATE INDEX "ConsolidatedInvoice_companyId_idx" ON "ConsolidatedInvoice"("companyId");

-- CreateIndex
CREATE INDEX "ConsolidatedInvoice_status_idx" ON "ConsolidatedInvoice"("status");

-- CreateIndex
CREATE INDEX "ConsolidatedInvoice_createdAt_idx" ON "ConsolidatedInvoice"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConsolidatedInvoiceLine_invoiceId_key" ON "ConsolidatedInvoiceLine"("invoiceId");

-- CreateIndex
CREATE INDEX "ConsolidatedInvoiceLine_consolidatedInvoiceId_idx" ON "ConsolidatedInvoiceLine"("consolidatedInvoiceId");

-- CreateIndex
CREATE INDEX "WalletTransaction_companyId_idx" ON "WalletTransaction"("companyId");

-- CreateIndex
CREATE INDEX "WalletTransaction_createdAt_idx" ON "WalletTransaction"("createdAt");

-- CreateIndex
CREATE INDEX "PlatformWalletTransaction_currency_idx" ON "PlatformWalletTransaction"("currency");

-- CreateIndex
CREATE INDEX "PlatformWalletTransaction_companyId_idx" ON "PlatformWalletTransaction"("companyId");

-- CreateIndex
CREATE INDEX "PlatformWalletTransaction_createdById_idx" ON "PlatformWalletTransaction"("createdById");

-- CreateIndex
CREATE INDEX "PlatformWalletTransaction_createdAt_idx" ON "PlatformWalletTransaction"("createdAt");

-- CreateIndex
CREATE INDEX "NileCruise_sheetsRowId_idx" ON "NileCruise"("sheetsRowId");

-- CreateIndex
CREATE UNIQUE INDEX "CruiseBooking_refNumber_key" ON "CruiseBooking"("refNumber");

-- CreateIndex
CREATE INDEX "CruiseBooking_companyId_idx" ON "CruiseBooking"("companyId");

-- CreateIndex
CREATE INDEX "CruiseBooking_status_idx" ON "CruiseBooking"("status");

-- CreateIndex
CREATE INDEX "CruiseBooking_confirmedById_idx" ON "CruiseBooking"("confirmedById");

-- CreateIndex
CREATE UNIQUE INDEX "TransportBooking_refNumber_key" ON "TransportBooking"("refNumber");

-- CreateIndex
CREATE INDEX "TransportBooking_companyId_idx" ON "TransportBooking"("companyId");

-- CreateIndex
CREATE INDEX "TransportBooking_status_idx" ON "TransportBooking"("status");

-- CreateIndex
CREATE INDEX "TransportBooking_confirmedById_idx" ON "TransportBooking"("confirmedById");

-- CreateIndex
CREATE INDEX "TransportBooking_groupTypeId_idx" ON "TransportBooking"("groupTypeId");

-- CreateIndex
CREATE INDEX "TransportBooking_rateId_idx" ON "TransportBooking"("rateId");

-- CreateIndex
CREATE INDEX "TransportRate_sheetsRowId_idx" ON "TransportRate"("sheetsRowId");

-- CreateIndex
CREATE INDEX "TransportRate_type_idx" ON "TransportRate"("type");

-- CreateIndex
CREATE INDEX "TransportRate_serviceMode_idx" ON "TransportRate"("serviceMode");

-- CreateIndex
CREATE INDEX "TransportRate_vehicleType_idx" ON "TransportRate"("vehicleType");

-- CreateIndex
CREATE INDEX "TransportRate_destinationId_idx" ON "TransportRate"("destinationId");

-- CreateIndex
CREATE INDEX "TransportRate_fromType_fromId_idx" ON "TransportRate"("fromType", "fromId");

-- CreateIndex
CREATE INDEX "TransportRate_toType_toId_idx" ON "TransportRate"("toType", "toId");

-- CreateIndex
CREATE UNIQUE INDEX "Airport_code_key" ON "Airport"("code");

-- CreateIndex
CREATE INDEX "Airport_isActive_idx" ON "Airport"("isActive");

-- CreateIndex
CREATE INDEX "Activity_city_idx" ON "Activity"("city");

-- CreateIndex
CREATE INDEX "Activity_sheetsRowId_idx" ON "Activity"("sheetsRowId");

-- CreateIndex
CREATE INDEX "Activity_destinationId_idx" ON "Activity"("destinationId");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityPackage_refNumber_key" ON "ActivityPackage"("refNumber");

-- CreateIndex
CREATE INDEX "ActivityPackage_companyId_idx" ON "ActivityPackage"("companyId");

-- CreateIndex
CREATE INDEX "ActivityPackage_status_idx" ON "ActivityPackage"("status");

-- CreateIndex
CREATE INDEX "ActivityPackage_confirmedById_idx" ON "ActivityPackage"("confirmedById");

-- CreateIndex
CREATE INDEX "ActivityPackageItem_packageId_idx" ON "ActivityPackageItem"("packageId");

-- CreateIndex
CREATE INDEX "ActivityPackageItem_activityId_idx" ON "ActivityPackageItem"("activityId");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityBooking_refNumber_key" ON "ActivityBooking"("refNumber");

-- CreateIndex
CREATE INDEX "ActivityBooking_companyId_idx" ON "ActivityBooking"("companyId");

-- CreateIndex
CREATE INDEX "ActivityBooking_activityId_idx" ON "ActivityBooking"("activityId");

-- CreateIndex
CREATE INDEX "ActivityBooking_confirmedById_idx" ON "ActivityBooking"("confirmedById");

-- CreateIndex
CREATE INDEX "ActivityBooking_groupTypeId_idx" ON "ActivityBooking"("groupTypeId");

-- CreateIndex
CREATE INDEX "ServiceGroupType_scope_isActive_idx" ON "ServiceGroupType"("scope", "isActive");

-- CreateIndex
CREATE INDEX "ServiceGroupType_destinationId_idx" ON "ServiceGroupType"("destinationId");

-- CreateIndex
CREATE INDEX "ServiceGroupType_activityId_idx" ON "ServiceGroupType"("activityId");

-- CreateIndex
CREATE INDEX "ServiceGroupType_transportRateId_idx" ON "ServiceGroupType"("transportRateId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceGroupType_scope_code_destinationId_activityId_transp_key" ON "ServiceGroupType"("scope", "code", "destinationId", "activityId", "transportRateId");

-- CreateIndex
CREATE UNIQUE INDEX "VisaApplication_refNumber_key" ON "VisaApplication"("refNumber");

-- CreateIndex
CREATE INDEX "VisaApplication_companyId_idx" ON "VisaApplication"("companyId");

-- CreateIndex
CREATE INDEX "VisaApplication_status_idx" ON "VisaApplication"("status");

-- CreateIndex
CREATE INDEX "VisaApplication_confirmedById_idx" ON "VisaApplication"("confirmedById");

-- CreateIndex
CREATE INDEX "VisaFee_sheetsRowId_idx" ON "VisaFee"("sheetsRowId");

-- CreateIndex
CREATE INDEX "VisaFee_visaType_idx" ON "VisaFee"("visaType");

-- CreateIndex
CREATE INDEX "VisaFee_destinationCountry_idx" ON "VisaFee"("destinationCountry");

-- CreateIndex
CREATE UNIQUE INDEX "AirportReception_refNumber_key" ON "AirportReception"("refNumber");

-- CreateIndex
CREATE INDEX "AirportReception_companyId_idx" ON "AirportReception"("companyId");

-- CreateIndex
CREATE INDEX "AirportReception_status_idx" ON "AirportReception"("status");

-- CreateIndex
CREATE INDEX "AirportReception_confirmedById_idx" ON "AirportReception"("confirmedById");

-- CreateIndex
CREATE INDEX "ReceptionServiceRate_sheetsRowId_idx" ON "ReceptionServiceRate"("sheetsRowId");

-- CreateIndex
CREATE INDEX "ReceptionServiceRate_serviceType_idx" ON "ReceptionServiceRate"("serviceType");

-- CreateIndex
CREATE INDEX "ReceptionServiceRate_airport_idx" ON "ReceptionServiceRate"("airport");

-- CreateIndex
CREATE INDEX "Offer_isActive_idx" ON "Offer"("isActive");

-- CreateIndex
CREATE INDEX "Offer_priority_idx" ON "Offer"("priority");

-- CreateIndex
CREATE INDEX "SimPackage_isActive_idx" ON "SimPackage"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "SimRequest_refNumber_key" ON "SimRequest"("refNumber");

-- CreateIndex
CREATE INDEX "SimRequest_companyId_idx" ON "SimRequest"("companyId");

-- CreateIndex
CREATE INDEX "SimRequest_status_idx" ON "SimRequest"("status");

-- CreateIndex
CREATE INDEX "SimRequest_confirmedById_idx" ON "SimRequest"("confirmedById");

-- CreateIndex
CREATE UNIQUE INDEX "UiTemplate_key_key" ON "UiTemplate"("key");

-- CreateIndex
CREATE INDEX "UiTemplate_target_idx" ON "UiTemplate"("target");

-- CreateIndex
CREATE INDEX "UiTemplate_isActive_idx" ON "UiTemplate"("isActive");

-- CreateIndex
CREATE INDEX "UiTemplateRevision_templateId_idx" ON "UiTemplateRevision"("templateId");

-- CreateIndex
CREATE INDEX "SyncLog_entity_idx" ON "SyncLog"("entity");

-- CreateIndex
CREATE INDEX "SyncLog_status_idx" ON "SyncLog"("status");

-- CreateIndex
CREATE INDEX "SyncLog_createdAt_idx" ON "SyncLog"("createdAt");

-- CreateIndex
CREATE INDEX "MarketPrice_entityType_entityId_idx" ON "MarketPrice"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "MarketPrice_companyId_idx" ON "MarketPrice"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketPrice_entityType_entityId_market_companyId_key" ON "MarketPrice"("entityType", "entityId", "market", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Voucher_voucherNumber_key" ON "Voucher"("voucherNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Voucher_transportBookingId_key" ON "Voucher"("transportBookingId");

-- CreateIndex
CREATE UNIQUE INDEX "Voucher_activityBookingId_key" ON "Voucher"("activityBookingId");

-- CreateIndex
CREATE UNIQUE INDEX "Voucher_activityPackageId_key" ON "Voucher"("activityPackageId");

-- CreateIndex
CREATE UNIQUE INDEX "Voucher_visaApplicationId_key" ON "Voucher"("visaApplicationId");

-- CreateIndex
CREATE UNIQUE INDEX "Voucher_airportReceptionId_key" ON "Voucher"("airportReceptionId");

-- CreateIndex
CREATE UNIQUE INDEX "Voucher_simRequestId_key" ON "Voucher"("simRequestId");

-- CreateIndex
CREATE INDEX "Voucher_companyId_idx" ON "Voucher"("companyId");

-- CreateIndex
CREATE INDEX "Voucher_serviceType_idx" ON "Voucher"("serviceType");

-- CreateIndex
CREATE INDEX "Voucher_createdAt_idx" ON "Voucher"("createdAt");

-- CreateIndex
CREATE INDEX "HotelMediaSyncLog_stage_idx" ON "HotelMediaSyncLog"("stage");

-- CreateIndex
CREATE INDEX "HotelMediaSyncLog_status_idx" ON "HotelMediaSyncLog"("status");

-- CreateIndex
CREATE INDEX "HotelMediaSyncLog_createdAt_idx" ON "HotelMediaSyncLog"("createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hotel" ADD CONSTRAINT "Hotel_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelPricing" ADD CONSTRAINT "HotelPricing_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelRate" ADD CONSTRAINT "HotelRate_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelRateSupplement" ADD CONSTRAINT "HotelRateSupplement_rateId_fkey" FOREIGN KEY ("rateId") REFERENCES "HotelRate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelCompanyVisibility" ADD CONSTRAINT "HotelCompanyVisibility_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotelCompanyVisibility" ADD CONSTRAINT "HotelCompanyVisibility_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteRequest" ADD CONSTRAINT "QuoteRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteRequest" ADD CONSTRAINT "QuoteRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteRequest" ADD CONSTRAINT "QuoteRequest_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteRequest" ADD CONSTRAINT "QuoteRequest_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteRequest" ADD CONSTRAINT "QuoteRequest_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteRequest" ADD CONSTRAINT "QuoteRequest_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_activityBookingId_fkey" FOREIGN KEY ("activityBookingId") REFERENCES "ActivityBooking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_activityPackageId_fkey" FOREIGN KEY ("activityPackageId") REFERENCES "ActivityPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_transportBookingId_fkey" FOREIGN KEY ("transportBookingId") REFERENCES "TransportBooking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_airportReceptionId_fkey" FOREIGN KEY ("airportReceptionId") REFERENCES "AirportReception"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_cruiseBookingId_fkey" FOREIGN KEY ("cruiseBookingId") REFERENCES "CruiseBooking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_visaApplicationId_fkey" FOREIGN KEY ("visaApplicationId") REFERENCES "VisaApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_simRequestId_fkey" FOREIGN KEY ("simRequestId") REFERENCES "SimRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsolidatedInvoice" ADD CONSTRAINT "ConsolidatedInvoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsolidatedInvoice" ADD CONSTRAINT "ConsolidatedInvoice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsolidatedInvoiceLine" ADD CONSTRAINT "ConsolidatedInvoiceLine_consolidatedInvoiceId_fkey" FOREIGN KEY ("consolidatedInvoiceId") REFERENCES "ConsolidatedInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsolidatedInvoiceLine" ADD CONSTRAINT "ConsolidatedInvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformWalletTransaction" ADD CONSTRAINT "PlatformWalletTransaction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformWalletTransaction" ADD CONSTRAINT "PlatformWalletTransaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CruiseBooking" ADD CONSTRAINT "CruiseBooking_cruiseId_fkey" FOREIGN KEY ("cruiseId") REFERENCES "NileCruise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CruiseBooking" ADD CONSTRAINT "CruiseBooking_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CruiseBooking" ADD CONSTRAINT "CruiseBooking_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CruiseBooking" ADD CONSTRAINT "CruiseBooking_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportBooking" ADD CONSTRAINT "TransportBooking_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportBooking" ADD CONSTRAINT "TransportBooking_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportBooking" ADD CONSTRAINT "TransportBooking_rateId_fkey" FOREIGN KEY ("rateId") REFERENCES "TransportRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportBooking" ADD CONSTRAINT "TransportBooking_groupTypeId_fkey" FOREIGN KEY ("groupTypeId") REFERENCES "ServiceGroupType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportBooking" ADD CONSTRAINT "TransportBooking_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportRate" ADD CONSTRAINT "TransportRate_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityPackage" ADD CONSTRAINT "ActivityPackage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityPackage" ADD CONSTRAINT "ActivityPackage_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityPackage" ADD CONSTRAINT "ActivityPackage_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityPackageItem" ADD CONSTRAINT "ActivityPackageItem_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "ActivityPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityPackageItem" ADD CONSTRAINT "ActivityPackageItem_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityBooking" ADD CONSTRAINT "ActivityBooking_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityBooking" ADD CONSTRAINT "ActivityBooking_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityBooking" ADD CONSTRAINT "ActivityBooking_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityBooking" ADD CONSTRAINT "ActivityBooking_groupTypeId_fkey" FOREIGN KEY ("groupTypeId") REFERENCES "ServiceGroupType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityBooking" ADD CONSTRAINT "ActivityBooking_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceGroupType" ADD CONSTRAINT "ServiceGroupType_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceGroupType" ADD CONSTRAINT "ServiceGroupType_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceGroupType" ADD CONSTRAINT "ServiceGroupType_transportRateId_fkey" FOREIGN KEY ("transportRateId") REFERENCES "TransportRate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisaApplication" ADD CONSTRAINT "VisaApplication_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisaApplication" ADD CONSTRAINT "VisaApplication_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisaApplication" ADD CONSTRAINT "VisaApplication_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AirportReception" ADD CONSTRAINT "AirportReception_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AirportReception" ADD CONSTRAINT "AirportReception_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AirportReception" ADD CONSTRAINT "AirportReception_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimRequest" ADD CONSTRAINT "SimRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimRequest" ADD CONSTRAINT "SimRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimRequest" ADD CONSTRAINT "SimRequest_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "SimPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimRequest" ADD CONSTRAINT "SimRequest_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UiTemplateRevision" ADD CONSTRAINT "UiTemplateRevision_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "UiTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketPrice" ADD CONSTRAINT "MarketPrice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_transportBookingId_fkey" FOREIGN KEY ("transportBookingId") REFERENCES "TransportBooking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_activityBookingId_fkey" FOREIGN KEY ("activityBookingId") REFERENCES "ActivityBooking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_activityPackageId_fkey" FOREIGN KEY ("activityPackageId") REFERENCES "ActivityPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_visaApplicationId_fkey" FOREIGN KEY ("visaApplicationId") REFERENCES "VisaApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_airportReceptionId_fkey" FOREIGN KEY ("airportReceptionId") REFERENCES "AirportReception"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_simRequestId_fkey" FOREIGN KEY ("simRequestId") REFERENCES "SimRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

