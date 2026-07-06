-- ================================================================
-- Elbakri Portal — Full MySQL/MariaDB initial schema
-- Generated from prisma/schema.prisma (provider = mysql).
-- Import via phpMyAdmin: select your (empty) database, open the
-- Import tab, choose this file, and Go. Requires MySQL 5.7+ or
-- MariaDB 10.2+ (utf8mb4, JSON columns, large index prefix).
-- After importing, set DATABASE_URL and start the app. Do NOT run
-- this against a database that already has data.
-- ================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `password` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `nameAr` VARCHAR(191) NULL,
    `role` ENUM('SUPERADMIN', 'COMPANY_ADMIN', 'AGENT') NOT NULL DEFAULT 'AGENT',
    `companyId` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `lastLoginAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    INDEX `User_email_idx`(`email`),
    INDEX `User_companyId_idx`(`companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RefreshToken` (
    `id` VARCHAR(191) NOT NULL,
    `token` VARCHAR(500) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `RefreshToken_token_key`(`token`),
    INDEX `RefreshToken_userId_idx`(`userId`),
    INDEX `RefreshToken_token_idx`(`token`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Company` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `nameAr` VARCHAR(191) NULL,
    `email` VARCHAR(191) NOT NULL,
    `contactEmail` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NOT NULL,
    `address` TEXT NULL,
    `billingAddress` TEXT NULL,
    `country` VARCHAR(191) NOT NULL DEFAULT 'EG',
    `taxId` VARCHAR(191) NULL,
    `website` VARCHAR(191) NULL,
    `creditLimit` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `balance` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `market` ENUM('EGYPTIAN', 'INTERNATIONAL', 'GULF', 'FOREIGN') NOT NULL DEFAULT 'INTERNATIONAL',
    `tier` ENUM('STANDARD', 'SILVER', 'GOLD', 'PLATINUM') NOT NULL DEFAULT 'STANDARD',
    `logoUrl` TEXT NULL,
    `themeColor` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `lastActivityAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Company_email_key`(`email`),
    INDEX `Company_email_idx`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Destination` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `nameAr` VARCHAR(191) NULL,
    `slug` VARCHAR(191) NOT NULL,
    `country` VARCHAR(191) NOT NULL DEFAULT 'EG',
    `region` VARCHAR(191) NULL,
    `type` ENUM('CITY', 'RESORT', 'AREA', 'REGION') NOT NULL DEFAULT 'CITY',
    `imageUrl` TEXT NULL,
    `imageAltEn` VARCHAR(191) NULL,
    `imageAltAr` VARCHAR(191) NULL,
    `galleryUrls` JSON NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Destination_slug_key`(`slug`),
    INDEX `Destination_slug_idx`(`slug`),
    INDEX `Destination_country_idx`(`country`),
    INDEX `Destination_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Hotel` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `nameAr` VARCHAR(191) NULL,
    `city` VARCHAR(191) NOT NULL,
    `cityAr` VARCHAR(191) NULL,
    `country` VARCHAR(191) NOT NULL,
    `stars` INTEGER NOT NULL DEFAULT 3,
    `address` TEXT NOT NULL,
    `description` TEXT NULL,
    `descriptionAr` TEXT NULL,
    `amenities` JSON NULL,
    `area` VARCHAR(191) NULL,
    `seaFront` BOOLEAN NOT NULL DEFAULT false,
    `privateBeach` BOOLEAN NOT NULL DEFAULT false,
    `sandyBeach` BOOLEAN NOT NULL DEFAULT false,
    `kidsPool` BOOLEAN NOT NULL DEFAULT false,
    `kidsClub` BOOLEAN NOT NULL DEFAULT false,
    `aquaPark` BOOLEAN NOT NULL DEFAULT false,
    `snorkeling` BOOLEAN NOT NULL DEFAULT false,
    `diving` BOOLEAN NOT NULL DEFAULT false,
    `adultsOnly` BOOLEAN NOT NULL DEFAULT false,
    `allInclusive` BOOLEAN NOT NULL DEFAULT false,
    `totalPools` INTEGER NULL,
    `googleRating` DECIMAL(3, 2) NULL,
    `imageUrl` TEXT NULL,
    `galleryUrls` JSON NULL,
    `bookingHotelId` VARCHAR(191) NULL,
    `bookingUrl` TEXT NULL,
    `bookingMatchedName` VARCHAR(191) NULL,
    `bookingMatchScore` DECIMAL(4, 3) NULL,
    `mediaNeedsManualReview` BOOLEAN NOT NULL DEFAULT false,
    `mediaSyncedAt` DATETIME(3) NULL,
    `pricePerNight` DECIMAL(10, 2) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `commissionPercent` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `availableRooms` INTEGER NOT NULL DEFAULT 0,
    `maxGuestsPerRoom` INTEGER NOT NULL DEFAULT 2,
    `showPriceToAgents` BOOLEAN NOT NULL DEFAULT false,
    `allowQuoteRequest` BOOLEAN NOT NULL DEFAULT true,
    `minVisibleTier` ENUM('STANDARD', 'SILVER', 'GOLD', 'PLATINUM') NULL,
    `checkInTime` VARCHAR(191) NULL,
    `checkOutTime` VARCHAR(191) NULL,
    `cancellationPolicy` TEXT NULL,
    `cancellationPolicyAr` TEXT NULL,
    `childrenPolicy` TEXT NULL,
    `childrenPolicyAr` TEXT NULL,
    `extraBedPolicy` TEXT NULL,
    `extraBedPolicyAr` TEXT NULL,
    `mealPolicy` TEXT NULL,
    `mealPolicyAr` TEXT NULL,
    `importantNotes` TEXT NULL,
    `importantNotesAr` TEXT NULL,
    `source` ENUM('MANUAL', 'GOOGLE_SHEETS') NOT NULL DEFAULT 'MANUAL',
    `sheetsRowId` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `destinationId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Hotel_city_idx`(`city`),
    INDEX `Hotel_country_idx`(`country`),
    INDEX `Hotel_sheetsRowId_idx`(`sheetsRowId`),
    INDEX `Hotel_destinationId_idx`(`destinationId`),
    INDEX `Hotel_bookingHotelId_idx`(`bookingHotelId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Room` (
    `id` VARCHAR(191) NOT NULL,
    `hotelId` VARCHAR(191) NOT NULL,
    `type` ENUM('STANDARD', 'DELUXE', 'SUITE', 'EXECUTIVE') NOT NULL DEFAULT 'STANDARD',
    `capacity` INTEGER NOT NULL DEFAULT 2,
    `pricePerNight` DECIMAL(10, 2) NOT NULL,
    `isAvailable` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Room_hotelId_idx`(`hotelId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HotelPricing` (
    `id` VARCHAR(191) NOT NULL,
    `hotelId` VARCHAR(191) NOT NULL,
    `roomType` ENUM('STANDARD', 'DELUXE', 'SUITE', 'EXECUTIVE') NOT NULL,
    `season` ENUM('LOW', 'REGULAR', 'HIGH', 'PEAK') NOT NULL DEFAULT 'REGULAR',
    `pricePerNight` DECIMAL(10, 2) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `validFrom` DATETIME(3) NOT NULL,
    `validTo` DATETIME(3) NOT NULL,
    `sheetsRowId` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `HotelPricing_hotelId_idx`(`hotelId`),
    INDEX `HotelPricing_sheetsRowId_idx`(`sheetsRowId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HotelRate` (
    `id` VARCHAR(191) NOT NULL,
    `hotelId` VARCHAR(191) NOT NULL,
    `roomName` VARCHAR(191) NOT NULL,
    `market` ENUM('EGYPTIAN', 'INTERNATIONAL', 'GULF', 'FOREIGN') NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `singlePrice` DECIMAL(10, 2) NULL,
    `doublePrice` DECIMAL(10, 2) NULL,
    `triplePrice` DECIMAL(10, 2) NULL,
    `mealPlan` ENUM('ROOM_ONLY', 'BREAKFAST', 'HALF_BOARD', 'FULL_BOARD', 'ALL_INCLUSIVE', 'ULTRA_ALL_INCLUSIVE') NULL,
    `validFrom` DATETIME(3) NULL,
    `validTo` DATETIME(3) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `notes` TEXT NULL,
    `displayOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `HotelRate_hotelId_idx`(`hotelId`),
    INDEX `HotelRate_hotelId_isActive_idx`(`hotelId`, `isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HotelRateSupplement` (
    `id` VARCHAR(191) NOT NULL,
    `rateId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` ENUM('FIXED_AMOUNT', 'PERCENTAGE', 'TEXT_ONLY') NOT NULL DEFAULT 'TEXT_ONLY',
    `amount` DECIMAL(10, 2) NULL,
    `currency` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `displayOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `HotelRateSupplement_rateId_idx`(`rateId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HotelCompanyVisibility` (
    `id` VARCHAR(191) NOT NULL,
    `hotelId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `canViewPrice` BOOLEAN NOT NULL DEFAULT true,
    `canRequestQuote` BOOLEAN NULL,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `HotelCompanyVisibility_hotelId_idx`(`hotelId`),
    INDEX `HotelCompanyVisibility_companyId_idx`(`companyId`),
    UNIQUE INDEX `HotelCompanyVisibility_hotelId_companyId_key`(`hotelId`, `companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Booking` (
    `id` VARCHAR(191) NOT NULL,
    `refNumber` VARCHAR(191) NOT NULL,
    `type` ENUM('HOTEL', 'FLIGHT', 'PACKAGE') NOT NULL,
    `status` ENUM('PENDING', 'CONFIRMED', 'CANCELLED', 'REJECTED', 'COMPLETED') NOT NULL DEFAULT 'PENDING',
    `companyId` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `hotelId` VARCHAR(191) NULL,
    `roomId` VARCHAR(191) NULL,
    `checkIn` DATETIME(3) NULL,
    `checkOut` DATETIME(3) NULL,
    `nights` INTEGER NULL,
    `origin` VARCHAR(191) NULL,
    `destination` VARCHAR(191) NULL,
    `departureDate` DATETIME(3) NULL,
    `returnDate` DATETIME(3) NULL,
    `airline` VARCHAR(191) NULL,
    `flightNumber` VARCHAR(191) NULL,
    `cabinClass` ENUM('ECONOMY', 'BUSINESS', 'FIRST') NULL,
    `passengerNames` JSON NULL,
    `adultsCount` INTEGER NOT NULL DEFAULT 1,
    `childrenCount` INTEGER NOT NULL DEFAULT 0,
    `infantsCount` INTEGER NOT NULL DEFAULT 0,
    `roomsCount` INTEGER NOT NULL DEFAULT 1,
    `baseAmount` DECIMAL(12, 2) NOT NULL,
    `commissionPercent` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `commissionAmount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `discount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `totalAmount` DECIMAL(12, 2) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `sourceAmount` DECIMAL(12, 2) NULL,
    `sourceCurrency` VARCHAR(191) NULL,
    `exchangeRate` DECIMAL(18, 8) NULL,
    `exchangeRateAt` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `internalNotes` TEXT NULL,
    `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `confirmedAt` DATETIME(3) NULL,
    `confirmedById` VARCHAR(191) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `cancellationReason` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Booking_refNumber_key`(`refNumber`),
    INDEX `Booking_companyId_idx`(`companyId`),
    INDEX `Booking_status_idx`(`status`),
    INDEX `Booking_type_idx`(`type`),
    INDEX `Booking_refNumber_idx`(`refNumber`),
    INDEX `Booking_createdAt_idx`(`createdAt`),
    INDEX `Booking_confirmedById_idx`(`confirmedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BookingCounter` (
    `year` INTEGER NOT NULL,
    `lastSeq` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`year`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `QuoteRequest` (
    `id` VARCHAR(191) NOT NULL,
    `refNumber` VARCHAR(191) NOT NULL,
    `serviceType` ENUM('HOTEL', 'PACKAGE', 'CRUISE', 'FLIGHT', 'MULTI_SERVICE') NOT NULL,
    `status` ENUM('NEW', 'IN_REVIEW', 'QUOTED', 'ACCEPTED', 'CLOSED', 'CANCELLED') NOT NULL DEFAULT 'NEW',
    `companyId` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `destinationId` VARCHAR(191) NULL,
    `destinationName` VARCHAR(191) NULL,
    `hotelId` VARCHAR(191) NULL,
    `serviceId` VARCHAR(191) NULL,
    `serviceName` VARCHAR(191) NULL,
    `cruiseId` VARCHAR(191) NULL,
    `activityId` VARCHAR(191) NULL,
    `checkIn` DATETIME(3) NULL,
    `checkOut` DATETIME(3) NULL,
    `adultsCount` INTEGER NOT NULL DEFAULT 1,
    `childrenCount` INTEGER NOT NULL DEFAULT 0,
    `infantsCount` INTEGER NOT NULL DEFAULT 0,
    `roomsCount` INTEGER NULL,
    `nationality` VARCHAR(191) NULL,
    `travelFrom` VARCHAR(191) NULL,
    `mealPlan` ENUM('ROOM_ONLY', 'BREAKFAST', 'HALF_BOARD', 'FULL_BOARD', 'ALL_INCLUSIVE', 'ULTRA_ALL_INCLUSIVE') NULL,
    `childAges` JSON NULL,
    `budget` DECIMAL(12, 2) NULL,
    `quotedAmount` DECIMAL(12, 2) NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `customerNotes` TEXT NULL,
    `internalNotes` TEXT NULL,
    `contactPreference` VARCHAR(191) NULL,
    `customFields` JSON NULL,
    `assignedToId` VARCHAR(191) NULL,
    `respondedAt` DATETIME(3) NULL,
    `closedAt` DATETIME(3) NULL,
    `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `confirmedAt` DATETIME(3) NULL,
    `confirmedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `QuoteRequest_refNumber_key`(`refNumber`),
    INDEX `QuoteRequest_companyId_idx`(`companyId`),
    INDEX `QuoteRequest_status_idx`(`status`),
    INDEX `QuoteRequest_serviceType_idx`(`serviceType`),
    INDEX `QuoteRequest_refNumber_idx`(`refNumber`),
    INDEX `QuoteRequest_createdAt_idx`(`createdAt`),
    INDEX `QuoteRequest_assignedToId_idx`(`assignedToId`),
    INDEX `QuoteRequest_confirmedById_idx`(`confirmedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `QuoteRequestCounter` (
    `year` INTEGER NOT NULL,
    `lastSeq` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`year`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Invoice` (
    `id` VARCHAR(191) NOT NULL,
    `invoiceNumber` VARCHAR(191) NOT NULL,
    `bookingId` VARCHAR(191) NULL,
    `activityBookingId` VARCHAR(191) NULL,
    `activityPackageId` VARCHAR(191) NULL,
    `transportBookingId` VARCHAR(191) NULL,
    `airportReceptionId` VARCHAR(191) NULL,
    `cruiseBookingId` VARCHAR(191) NULL,
    `visaApplicationId` VARCHAR(191) NULL,
    `simRequestId` VARCHAR(191) NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `subtotal` DECIMAL(12, 2) NOT NULL,
    `taxRate` DECIMAL(5, 4) NOT NULL DEFAULT 0,
    `taxAmount` DECIMAL(12, 2) NOT NULL,
    `total` DECIMAL(12, 2) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `sourceSubtotal` DECIMAL(12, 2) NULL,
    `sourceCurrency` VARCHAR(191) NULL,
    `exchangeRate` DECIMAL(18, 8) NULL,
    `exchangeRateAt` DATETIME(3) NULL,
    `status` ENUM('UNPAID', 'PAID', 'OVERDUE', 'CANCELLED') NOT NULL DEFAULT 'UNPAID',
    `pdfPath` TEXT NULL,
    `dueDate` DATETIME(3) NOT NULL,
    `paidAt` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Invoice_invoiceNumber_key`(`invoiceNumber`),
    UNIQUE INDEX `Invoice_bookingId_key`(`bookingId`),
    UNIQUE INDEX `Invoice_activityBookingId_key`(`activityBookingId`),
    UNIQUE INDEX `Invoice_activityPackageId_key`(`activityPackageId`),
    UNIQUE INDEX `Invoice_transportBookingId_key`(`transportBookingId`),
    UNIQUE INDEX `Invoice_airportReceptionId_key`(`airportReceptionId`),
    UNIQUE INDEX `Invoice_cruiseBookingId_key`(`cruiseBookingId`),
    UNIQUE INDEX `Invoice_visaApplicationId_key`(`visaApplicationId`),
    UNIQUE INDEX `Invoice_simRequestId_key`(`simRequestId`),
    INDEX `Invoice_companyId_idx`(`companyId`),
    INDEX `Invoice_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ConsolidatedInvoice` (
    `id` VARCHAR(191) NOT NULL,
    `statementNumber` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NULL,
    `periodFrom` DATETIME(3) NULL,
    `periodTo` DATETIME(3) NULL,
    `subtotal` DECIMAL(12, 2) NOT NULL,
    `total` DECIMAL(12, 2) NOT NULL,
    `currency` VARCHAR(191) NOT NULL,
    `status` ENUM('UNPAID', 'PAID', 'OVERDUE', 'CANCELLED') NOT NULL DEFAULT 'UNPAID',
    `pdfPath` TEXT NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ConsolidatedInvoice_statementNumber_key`(`statementNumber`),
    INDEX `ConsolidatedInvoice_companyId_idx`(`companyId`),
    INDEX `ConsolidatedInvoice_status_idx`(`status`),
    INDEX `ConsolidatedInvoice_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ConsolidatedInvoiceLine` (
    `id` VARCHAR(191) NOT NULL,
    `consolidatedInvoiceId` VARCHAR(191) NOT NULL,
    `invoiceId` VARCHAR(191) NOT NULL,
    `invoiceNumber` VARCHAR(191) NOT NULL,
    `refNumber` VARCHAR(191) NULL,
    `service` VARCHAR(191) NOT NULL,
    `serviceDate` DATETIME(3) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `currency` VARCHAR(191) NOT NULL,
    `status` ENUM('UNPAID', 'PAID', 'OVERDUE', 'CANCELLED') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ConsolidatedInvoiceLine_invoiceId_key`(`invoiceId`),
    INDEX `ConsolidatedInvoiceLine_consolidatedInvoiceId_idx`(`consolidatedInvoiceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InvoiceCounter` (
    `year` INTEGER NOT NULL,
    `lastSeq` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`year`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WalletTransaction` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `type` ENUM('CREDIT', 'DEBIT', 'REFUND', 'ADJUSTMENT') NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `balanceBefore` DECIMAL(12, 2) NOT NULL,
    `balanceAfter` DECIMAL(12, 2) NOT NULL,
    `reference` VARCHAR(191) NULL,
    `description` TEXT NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `WalletTransaction_companyId_idx`(`companyId`),
    INDEX `WalletTransaction_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PlatformWallet` (
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `balance` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`currency`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PlatformWalletTransaction` (
    `id` VARCHAR(191) NOT NULL,
    `type` ENUM('CREDIT', 'DEBIT', 'REFUND', 'ADJUSTMENT') NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `balanceBefore` DECIMAL(12, 2) NOT NULL,
    `balanceAfter` DECIMAL(12, 2) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `reference` VARCHAR(191) NULL,
    `description` TEXT NOT NULL,
    `companyId` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PlatformWalletTransaction_currency_idx`(`currency`),
    INDEX `PlatformWalletTransaction_companyId_idx`(`companyId`),
    INDEX `PlatformWalletTransaction_createdById_idx`(`createdById`),
    INDEX `PlatformWalletTransaction_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NileCruise` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `nameAr` VARCHAR(191) NULL,
    `shipType` ENUM('CRUISE', 'DAHABIYA', 'FELUCCA') NOT NULL DEFAULT 'CRUISE',
    `operator` VARCHAR(191) NULL,
    `cabins` INTEGER NOT NULL DEFAULT 0,
    `route` ENUM('LUXOR_ASWAN', 'ASWAN_LUXOR', 'LUXOR_ASWAN_LUXOR') NOT NULL DEFAULT 'LUXOR_ASWAN',
    `departureDays` JSON NULL,
    `duration` INTEGER NOT NULL DEFAULT 4,
    `description` TEXT NULL,
    `descriptionAr` TEXT NULL,
    `imageUrl` TEXT NULL,
    `priceFrom` DECIMAL(10, 2) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `showPriceToAgents` BOOLEAN NOT NULL DEFAULT false,
    `allowQuoteRequest` BOOLEAN NOT NULL DEFAULT true,
    `sheetsRowId` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `NileCruise_sheetsRowId_idx`(`sheetsRowId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CruiseBooking` (
    `id` VARCHAR(191) NOT NULL,
    `refNumber` VARCHAR(191) NOT NULL,
    `cruiseId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `checkIn` DATETIME(3) NOT NULL,
    `checkOut` DATETIME(3) NOT NULL,
    `cabinType` ENUM('STANDARD', 'DELUXE', 'SUITE', 'PRESIDENTIAL') NOT NULL DEFAULT 'STANDARD',
    `passengerNames` JSON NULL,
    `adultsCount` INTEGER NOT NULL DEFAULT 1,
    `childrenCount` INTEGER NOT NULL DEFAULT 0,
    `totalAmount` DECIMAL(12, 2) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `sourceAmount` DECIMAL(12, 2) NULL,
    `sourceCurrency` VARCHAR(191) NULL,
    `exchangeRate` DECIMAL(18, 8) NULL,
    `exchangeRateAt` DATETIME(3) NULL,
    `status` ENUM('PENDING', 'CONFIRMED', 'CANCELLED', 'REJECTED', 'COMPLETED') NOT NULL DEFAULT 'PENDING',
    `notes` TEXT NULL,
    `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `confirmedAt` DATETIME(3) NULL,
    `confirmedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `CruiseBooking_refNumber_key`(`refNumber`),
    INDEX `CruiseBooking_companyId_idx`(`companyId`),
    INDEX `CruiseBooking_status_idx`(`status`),
    INDEX `CruiseBooking_confirmedById_idx`(`confirmedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TransportBooking` (
    `id` VARCHAR(191) NOT NULL,
    `refNumber` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `type` ENUM('AIRPORT_TRANSFER', 'PRIVATE_TRANSFER', 'DAY_TOUR_TRANSPORT', 'INTERCITY') NOT NULL,
    `serviceMode` ENUM('POINT_TO_POINT', 'AIRPORT_TRANSFER', 'HOURLY_CHARTER', 'DAY_USE') NULL,
    `rateId` VARCHAR(191) NULL,
    `matchedDirection` VARCHAR(191) NULL,
    `vehicleType` ENUM('SEDAN', 'SUV', 'VAN_6', 'VAN_12', 'MINIBUS_20', 'BUS_45', 'LUXURY_LIMO') NOT NULL DEFAULT 'SEDAN',
    `fromLocation` VARCHAR(191) NOT NULL,
    `toLocation` VARCHAR(191) NOT NULL,
    `fromType` VARCHAR(191) NULL,
    `toType` VARCHAR(191) NULL,
    `pickupType` VARCHAR(191) NULL,
    `pickupLocation` VARCHAR(191) NULL,
    `pickupAddress` TEXT NULL,
    `pickupHotelName` VARCHAR(191) NULL,
    `dropoffType` VARCHAR(191) NULL,
    `dropoffLocation` VARCHAR(191) NULL,
    `dropoffAddress` TEXT NULL,
    `dropoffHotelName` VARCHAR(191) NULL,
    `pickupDateTime` DATETIME(3) NOT NULL,
    `returnDateTime` DATETIME(3) NULL,
    `isRoundTrip` BOOLEAN NOT NULL DEFAULT false,
    `sameRouteReversed` BOOLEAN NOT NULL DEFAULT true,
    `returnFromLocation` VARCHAR(191) NULL,
    `returnToLocation` VARCHAR(191) NULL,
    `returnFromType` VARCHAR(191) NULL,
    `returnToType` VARCHAR(191) NULL,
    `returnPickupHotelName` VARCHAR(191) NULL,
    `returnPickupAddress` TEXT NULL,
    `returnDropoffHotelName` VARCHAR(191) NULL,
    `returnDropoffAddress` TEXT NULL,
    `passengerCount` INTEGER NOT NULL DEFAULT 1,
    `passengerNames` JSON NULL,
    `passengerName` VARCHAR(191) NULL,
    `flightNumber` VARCHAR(191) NULL,
    `airlineName` VARCHAR(191) NULL,
    `returnFlightNumber` VARCHAR(191) NULL,
    `returnAirlineName` VARCHAR(191) NULL,
    `contactNumber` VARCHAR(191) NULL,
    `groupTypeId` VARCHAR(191) NULL,
    `groupTypeLabel` VARCHAR(191) NULL,
    `totalAmount` DECIMAL(12, 2) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `sourceAmount` DECIMAL(12, 2) NULL,
    `sourceCurrency` VARCHAR(191) NULL,
    `exchangeRate` DECIMAL(18, 8) NULL,
    `exchangeRateAt` DATETIME(3) NULL,
    `status` ENUM('PENDING', 'CONFIRMED', 'CANCELLED', 'REJECTED', 'COMPLETED') NOT NULL DEFAULT 'PENDING',
    `notes` TEXT NULL,
    `customFields` JSON NULL,
    `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `confirmedAt` DATETIME(3) NULL,
    `confirmedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TransportBooking_refNumber_key`(`refNumber`),
    INDEX `TransportBooking_companyId_idx`(`companyId`),
    INDEX `TransportBooking_status_idx`(`status`),
    INDEX `TransportBooking_confirmedById_idx`(`confirmedById`),
    INDEX `TransportBooking_groupTypeId_idx`(`groupTypeId`),
    INDEX `TransportBooking_rateId_idx`(`rateId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TransportRate` (
    `id` VARCHAR(191) NOT NULL,
    `sheetsRowId` VARCHAR(191) NULL,
    `type` ENUM('AIRPORT_TRANSFER', 'PRIVATE_TRANSFER', 'DAY_TOUR_TRANSPORT', 'INTERCITY') NOT NULL DEFAULT 'PRIVATE_TRANSFER',
    `serviceMode` ENUM('POINT_TO_POINT', 'AIRPORT_TRANSFER', 'HOURLY_CHARTER', 'DAY_USE') NOT NULL DEFAULT 'POINT_TO_POINT',
    `serviceNameEn` VARCHAR(191) NULL,
    `serviceNameAr` VARCHAR(191) NULL,
    `serviceArea` VARCHAR(191) NULL,
    `durationHours` INTEGER NULL,
    `vehicleType` ENUM('SEDAN', 'SUV', 'VAN_6', 'VAN_12', 'MINIBUS_20', 'BUS_45', 'LUXURY_LIMO') NOT NULL DEFAULT 'SEDAN',
    `city` VARCHAR(191) NULL,
    `fromLocation` VARCHAR(191) NULL,
    `toLocation` VARCHAR(191) NULL,
    `fromType` ENUM('AIRPORT', 'HOTEL', 'DESTINATION') NULL,
    `fromId` VARCHAR(191) NULL,
    `fromName` VARCHAR(191) NULL,
    `toType` ENUM('AIRPORT', 'HOTEL', 'DESTINATION') NULL,
    `toId` VARCHAR(191) NULL,
    `toName` VARCHAR(191) NULL,
    `isBidirectional` BOOLEAN NOT NULL DEFAULT false,
    `rate` DECIMAL(10, 2) NOT NULL,
    `roundTripRate` DECIMAL(10, 2) NULL,
    `priceEgp` DECIMAL(10, 2) NULL,
    `priceUsd` DECIMAL(10, 2) NULL,
    `roundTripPriceEgp` DECIMAL(10, 2) NULL,
    `roundTripPriceUsd` DECIMAL(10, 2) NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `minCapacity` INTEGER NOT NULL DEFAULT 1,
    `maxCapacity` INTEGER NULL,
    `notes` TEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `destinationId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `TransportRate_sheetsRowId_idx`(`sheetsRowId`),
    INDEX `TransportRate_type_idx`(`type`),
    INDEX `TransportRate_serviceMode_idx`(`serviceMode`),
    INDEX `TransportRate_vehicleType_idx`(`vehicleType`),
    INDEX `TransportRate_destinationId_idx`(`destinationId`),
    INDEX `TransportRate_fromType_fromId_idx`(`fromType`, `fromId`),
    INDEX `TransportRate_toType_toId_idx`(`toType`, `toId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Airport` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `nameEn` VARCHAR(191) NOT NULL,
    `nameAr` VARCHAR(191) NULL,
    `city` VARCHAR(191) NULL,
    `cityAr` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Airport_code_key`(`code`),
    INDEX `Airport_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Activity` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `nameAr` VARCHAR(191) NULL,
    `city` VARCHAR(191) NOT NULL,
    `category` ENUM('SIGHTSEEING', 'DIVING', 'SNORKELING', 'DESERT_SAFARI', 'WATER_SPORTS', 'CULTURAL', 'FOOD_TOUR', 'ADVENTURE', 'RELAXATION') NOT NULL DEFAULT 'SIGHTSEEING',
    `duration` VARCHAR(191) NULL,
    `timeSlots` JSON NULL,
    `description` TEXT NULL,
    `descriptionAr` TEXT NULL,
    `includes` JSON NULL,
    `excludes` JSON NULL,
    `imageUrl` TEXT NULL,
    `priceAdult` DECIMAL(10, 2) NOT NULL,
    `priceChild` DECIMAL(10, 2) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `sheetsRowId` VARCHAR(191) NULL,
    `minPax` INTEGER NOT NULL DEFAULT 1,
    `maxPax` INTEGER NOT NULL DEFAULT 20,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `isConfirmableInApp` BOOLEAN NOT NULL DEFAULT true,
    `destinationId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Activity_city_idx`(`city`),
    INDEX `Activity_sheetsRowId_idx`(`sheetsRowId`),
    INDEX `Activity_destinationId_idx`(`destinationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ActivityPackage` (
    `id` VARCHAR(191) NOT NULL,
    `refNumber` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `clientName` VARCHAR(191) NULL,
    `clientPhone` VARCHAR(191) NULL,
    `hotelName` VARCHAR(191) NULL,
    `adultsCount` INTEGER NOT NULL DEFAULT 1,
    `childrenCount` INTEGER NOT NULL DEFAULT 0,
    `childAges` JSON NULL,
    `notes` TEXT NULL,
    `totalAmount` DECIMAL(12, 2) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `sourceAmount` DECIMAL(12, 2) NULL,
    `sourceCurrency` VARCHAR(191) NULL,
    `exchangeRate` DECIMAL(18, 8) NULL,
    `exchangeRateAt` DATETIME(3) NULL,
    `status` ENUM('PENDING', 'CONFIRMED', 'CANCELLED', 'REJECTED', 'COMPLETED') NOT NULL DEFAULT 'PENDING',
    `customFields` JSON NULL,
    `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `confirmedAt` DATETIME(3) NULL,
    `confirmedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ActivityPackage_refNumber_key`(`refNumber`),
    INDEX `ActivityPackage_companyId_idx`(`companyId`),
    INDEX `ActivityPackage_status_idx`(`status`),
    INDEX `ActivityPackage_confirmedById_idx`(`confirmedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ActivityPackageItem` (
    `id` VARCHAR(191) NOT NULL,
    `packageId` VARCHAR(191) NOT NULL,
    `activityId` VARCHAR(191) NOT NULL,
    `activityName` VARCHAR(191) NOT NULL,
    `city` VARCHAR(191) NULL,
    `activityDate` DATETIME(3) NOT NULL,
    `selectedTime` VARCHAR(191) NULL,
    `endTime` VARCHAR(191) NULL,
    `adultsCount` INTEGER NOT NULL DEFAULT 1,
    `childrenCount` INTEGER NOT NULL DEFAULT 0,
    `childAges` JSON NULL,
    `hotelName` VARCHAR(191) NULL,
    `clientPhone` VARCHAR(191) NULL,
    `activityType` VARCHAR(191) NULL,
    `groupTypeId` VARCHAR(191) NULL,
    `groupTypeLabel` VARCHAR(191) NULL,
    `transferIncluded` BOOLEAN NULL,
    `notes` TEXT NULL,
    `lineAmount` DECIMAL(12, 2) NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `displayOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ActivityPackageItem_packageId_idx`(`packageId`),
    INDEX `ActivityPackageItem_activityId_idx`(`activityId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ActivityPackageCounter` (
    `year` INTEGER NOT NULL,
    `lastSeq` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`year`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ActivityBooking` (
    `id` VARCHAR(191) NOT NULL,
    `refNumber` VARCHAR(191) NOT NULL,
    `activityId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `activityDate` DATETIME(3) NOT NULL,
    `selectedTime` VARCHAR(191) NULL,
    `activityType` VARCHAR(191) NULL,
    `groupTypeId` VARCHAR(191) NULL,
    `groupTypeLabel` VARCHAR(191) NULL,
    `adultsCount` INTEGER NOT NULL DEFAULT 1,
    `childrenCount` INTEGER NOT NULL DEFAULT 0,
    `childAges` JSON NULL,
    `clientName` VARCHAR(191) NULL,
    `clientPhone` VARCHAR(191) NULL,
    `hotelName` VARCHAR(191) NULL,
    `passengerNames` JSON NULL,
    `totalAmount` DECIMAL(12, 2) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `sourceAmount` DECIMAL(12, 2) NULL,
    `sourceCurrency` VARCHAR(191) NULL,
    `exchangeRate` DECIMAL(18, 8) NULL,
    `exchangeRateAt` DATETIME(3) NULL,
    `status` ENUM('PENDING', 'CONFIRMED', 'CANCELLED', 'REJECTED', 'COMPLETED') NOT NULL DEFAULT 'PENDING',
    `notes` TEXT NULL,
    `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `confirmedAt` DATETIME(3) NULL,
    `confirmedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ActivityBooking_refNumber_key`(`refNumber`),
    INDEX `ActivityBooking_companyId_idx`(`companyId`),
    INDEX `ActivityBooking_activityId_idx`(`activityId`),
    INDEX `ActivityBooking_confirmedById_idx`(`confirmedById`),
    INDEX `ActivityBooking_groupTypeId_idx`(`groupTypeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ServiceGroupType` (
    `id` VARCHAR(191) NOT NULL,
    `scope` ENUM('ACTIVITY', 'TRANSPORT') NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `labelEn` VARCHAR(191) NOT NULL,
    `labelAr` VARCHAR(191) NULL,
    `descriptionEn` TEXT NULL,
    `descriptionAr` TEXT NULL,
    `destinationId` VARCHAR(191) NULL,
    `activityId` VARCHAR(191) NULL,
    `transportRateId` VARCHAR(191) NULL,
    `adjustmentType` ENUM('NONE', 'FIXED', 'PERCENTAGE') NOT NULL DEFAULT 'NONE',
    `adjustmentValue` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `minPax` INTEGER NOT NULL DEFAULT 1,
    `maxPax` INTEGER NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `displayOrder` INTEGER NOT NULL DEFAULT 0,
    `validFrom` DATETIME(3) NULL,
    `validTo` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ServiceGroupType_scope_isActive_idx`(`scope`, `isActive`),
    INDEX `ServiceGroupType_destinationId_idx`(`destinationId`),
    INDEX `ServiceGroupType_activityId_idx`(`activityId`),
    INDEX `ServiceGroupType_transportRateId_idx`(`transportRateId`),
    UNIQUE INDEX `ServiceGroupType_scope_code_destinationId_activityId_transpo_key`(`scope`, `code`, `destinationId`, `activityId`, `transportRateId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VisaApplication` (
    `id` VARCHAR(191) NOT NULL,
    `refNumber` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `applicantName` VARCHAR(191) NOT NULL,
    `nationality` VARCHAR(191) NOT NULL,
    `passportNumber` VARCHAR(191) NOT NULL,
    `passportExpiry` DATETIME(3) NOT NULL,
    `visaType` ENUM('TOURIST', 'BUSINESS', 'TRANSIT', 'STUDENT', 'MEDICAL', 'UMRAH', 'HAJJ') NOT NULL,
    `destinationCountry` VARCHAR(191) NOT NULL,
    `travelDate` DATETIME(3) NOT NULL,
    `processingType` ENUM('NORMAL', 'EXPRESS', 'URGENT') NOT NULL DEFAULT 'NORMAL',
    `status` ENUM('PENDING', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `totalAmount` DECIMAL(12, 2) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `sourceAmount` DECIMAL(12, 2) NULL,
    `sourceCurrency` VARCHAR(191) NULL,
    `exchangeRate` DECIMAL(18, 8) NULL,
    `exchangeRateAt` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `phone` VARCHAR(191) NULL,
    `hotelName` VARCHAR(191) NULL,
    `comingFrom` VARCHAR(191) NULL,
    `flightNumber` VARCHAR(191) NULL,
    `arrivalTime` DATETIME(3) NULL,
    `paxCount` INTEGER NOT NULL DEFAULT 1,
    `passportUrl` TEXT NULL,
    `flightTicketUrl` TEXT NULL,
    `customFields` JSON NULL,
    `submittedAt` DATETIME(3) NULL,
    `approvedAt` DATETIME(3) NULL,
    `rejectedAt` DATETIME(3) NULL,
    `rejectionReason` TEXT NULL,
    `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `confirmedAt` DATETIME(3) NULL,
    `confirmedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `VisaApplication_refNumber_key`(`refNumber`),
    INDEX `VisaApplication_companyId_idx`(`companyId`),
    INDEX `VisaApplication_status_idx`(`status`),
    INDEX `VisaApplication_confirmedById_idx`(`confirmedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VisaFee` (
    `id` VARCHAR(191) NOT NULL,
    `sheetsRowId` VARCHAR(191) NULL,
    `visaType` ENUM('TOURIST', 'BUSINESS', 'TRANSIT', 'STUDENT', 'MEDICAL', 'UMRAH', 'HAJJ') NOT NULL,
    `destinationCountry` VARCHAR(191) NOT NULL,
    `processingType` ENUM('NORMAL', 'EXPRESS', 'URGENT') NOT NULL DEFAULT 'NORMAL',
    `fee` DECIMAL(10, 2) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `notes` TEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `VisaFee_sheetsRowId_idx`(`sheetsRowId`),
    INDEX `VisaFee_visaType_idx`(`visaType`),
    INDEX `VisaFee_destinationCountry_idx`(`destinationCountry`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AirportReception` (
    `id` VARCHAR(191) NOT NULL,
    `refNumber` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `serviceType` ENUM('MEET_AND_GREET', 'AHLAN_SERVICE', 'VIP_LOUNGE', 'FULL_ASSISTANCE') NOT NULL,
    `airport` ENUM('CAI', 'HRG', 'SSH', 'LXR', 'ASW', 'HBE', 'MHH') NOT NULL,
    `flightNumber` VARCHAR(191) NOT NULL,
    `flightDateTime` DATETIME(3) NOT NULL,
    `guestName` VARCHAR(191) NOT NULL,
    `guestCount` INTEGER NOT NULL DEFAULT 1,
    `passengerNames` JSON NULL,
    `signboardName` VARCHAR(191) NULL,
    `hotelName` VARCHAR(191) NULL,
    `specialRequests` TEXT NULL,
    `phone` VARCHAR(191) NULL,
    `ticketUrl` TEXT NULL,
    `travelDetails` TEXT NULL,
    `comingFrom` VARCHAR(191) NULL,
    `totalAmount` DECIMAL(12, 2) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `sourceAmount` DECIMAL(12, 2) NULL,
    `sourceCurrency` VARCHAR(191) NULL,
    `exchangeRate` DECIMAL(18, 8) NULL,
    `exchangeRateAt` DATETIME(3) NULL,
    `status` ENUM('PENDING', 'CONFIRMED', 'CANCELLED', 'REJECTED', 'COMPLETED') NOT NULL DEFAULT 'PENDING',
    `notes` TEXT NULL,
    `customFields` JSON NULL,
    `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `confirmedAt` DATETIME(3) NULL,
    `confirmedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AirportReception_refNumber_key`(`refNumber`),
    INDEX `AirportReception_companyId_idx`(`companyId`),
    INDEX `AirportReception_status_idx`(`status`),
    INDEX `AirportReception_confirmedById_idx`(`confirmedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReceptionServiceRate` (
    `id` VARCHAR(191) NOT NULL,
    `sheetsRowId` VARCHAR(191) NULL,
    `serviceType` ENUM('MEET_AND_GREET', 'AHLAN_SERVICE', 'VIP_LOUNGE', 'FULL_ASSISTANCE') NOT NULL,
    `airport` ENUM('CAI', 'HRG', 'SSH', 'LXR', 'ASW', 'HBE', 'MHH') NULL,
    `rate` DECIMAL(10, 2) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `notes` TEXT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ReceptionServiceRate_sheetsRowId_idx`(`sheetsRowId`),
    INDEX `ReceptionServiceRate_serviceType_idx`(`serviceType`),
    INDEX `ReceptionServiceRate_airport_idx`(`airport`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Offer` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `titleAr` VARCHAR(191) NULL,
    `description` TEXT NULL,
    `descriptionAr` TEXT NULL,
    `imageUrl` TEXT NULL,
    `serviceType` VARCHAR(191) NULL,
    `ctaLabel` VARCHAR(191) NULL,
    `ctaLabelAr` VARCHAR(191) NULL,
    `ctaAction` VARCHAR(191) NULL,
    `validFrom` DATETIME(3) NULL,
    `validTo` DATETIME(3) NULL,
    `priority` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Offer_isActive_idx`(`isActive`),
    INDEX `Offer_priority_idx`(`priority`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SimPackage` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `nameAr` VARCHAR(191) NULL,
    `dataSize` VARCHAR(191) NOT NULL,
    `minutes` VARCHAR(191) NULL,
    `validity` VARCHAR(191) NOT NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SimPackage_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SimRequest` (
    `id` VARCHAR(191) NOT NULL,
    `refNumber` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `packageId` VARCHAR(191) NULL,
    `clientName` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `unitAmount` DECIMAL(10, 2) NULL,
    `arrivalDate` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `customFields` JSON NULL,
    `status` ENUM('PENDING', 'CONFIRMED', 'CANCELLED', 'REJECTED', 'COMPLETED') NOT NULL DEFAULT 'PENDING',
    `totalAmount` DECIMAL(12, 2) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `sourceAmount` DECIMAL(12, 2) NULL,
    `sourceCurrency` VARCHAR(191) NULL,
    `exchangeRate` DECIMAL(18, 8) NULL,
    `exchangeRateAt` DATETIME(3) NULL,
    `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `confirmedAt` DATETIME(3) NULL,
    `confirmedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SimRequest_refNumber_key`(`refNumber`),
    INDEX `SimRequest_companyId_idx`(`companyId`),
    INDEX `SimRequest_status_idx`(`status`),
    INDEX `SimRequest_confirmedById_idx`(`confirmedById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UiTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `target` VARCHAR(191) NOT NULL,
    `serviceType` VARCHAR(191) NULL,
    `langMode` VARCHAR(191) NOT NULL DEFAULT 'both',
    `version` INTEGER NOT NULL DEFAULT 1,
    `isActive` BOOLEAN NOT NULL DEFAULT false,
    `config` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `UiTemplate_key_key`(`key`),
    INDEX `UiTemplate_target_idx`(`target`),
    INDEX `UiTemplate_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UiTemplateRevision` (
    `id` VARCHAR(191) NOT NULL,
    `templateId` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `config` JSON NOT NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `UiTemplateRevision_templateId_idx`(`templateId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SheetsConfig` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'default',
    `spreadsheetId` VARCHAR(191) NULL,
    `autoSyncEnabled` BOOLEAN NOT NULL DEFAULT false,
    `cronExpression` VARCHAR(191) NULL,
    `lastTestAt` DATETIME(3) NULL,
    `lastTestStatus` ENUM('SUCCESS', 'FAILED', 'PARTIAL', 'RUNNING') NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SyncLog` (
    `id` VARCHAR(191) NOT NULL,
    `entity` VARCHAR(191) NOT NULL,
    `sheetName` VARCHAR(191) NOT NULL,
    `spreadsheetId` VARCHAR(191) NULL,
    `status` ENUM('SUCCESS', 'FAILED', 'PARTIAL', 'RUNNING') NOT NULL,
    `synced` INTEGER NOT NULL DEFAULT 0,
    `created` INTEGER NOT NULL DEFAULT 0,
    `updated` INTEGER NOT NULL DEFAULT 0,
    `skipped` INTEGER NOT NULL DEFAULT 0,
    `errors` JSON NULL,
    `triggeredById` VARCHAR(191) NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,
    `durationMs` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SyncLog_entity_idx`(`entity`),
    INDEX `SyncLog_status_idx`(`status`),
    INDEX `SyncLog_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MarketPrice` (
    `id` VARCHAR(191) NOT NULL,
    `entityType` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NOT NULL,
    `market` ENUM('EGYPTIAN', 'INTERNATIONAL', 'GULF', 'FOREIGN') NULL,
    `companyId` VARCHAR(191) NULL,
    `label` VARCHAR(191) NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `amount` DECIMAL(12, 2) NULL,
    `priceUsd` DECIMAL(12, 2) NULL,
    `nationalityGroup` VARCHAR(191) NULL,
    `minPax` INTEGER NULL,
    `maxPax` INTEGER NULL,
    `validFrom` DATETIME(3) NULL,
    `validTo` DATETIME(3) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MarketPrice_entityType_entityId_idx`(`entityType`, `entityId`),
    INDEX `MarketPrice_companyId_idx`(`companyId`),
    UNIQUE INDEX `MarketPrice_entityType_entityId_market_companyId_key`(`entityType`, `entityId`, `market`, `companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FxRateCache` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'latest',
    `base` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `rates` JSON NOT NULL,
    `fetchedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Voucher` (
    `id` VARCHAR(191) NOT NULL,
    `voucherNumber` VARCHAR(191) NOT NULL,
    `serviceType` VARCHAR(191) NOT NULL,
    `transportBookingId` VARCHAR(191) NULL,
    `activityBookingId` VARCHAR(191) NULL,
    `activityPackageId` VARCHAR(191) NULL,
    `visaApplicationId` VARCHAR(191) NULL,
    `airportReceptionId` VARCHAR(191) NULL,
    `simRequestId` VARCHAR(191) NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `clientName` VARCHAR(191) NULL,
    `pdfPath` TEXT NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Voucher_voucherNumber_key`(`voucherNumber`),
    UNIQUE INDEX `Voucher_transportBookingId_key`(`transportBookingId`),
    UNIQUE INDEX `Voucher_activityBookingId_key`(`activityBookingId`),
    UNIQUE INDEX `Voucher_activityPackageId_key`(`activityPackageId`),
    UNIQUE INDEX `Voucher_visaApplicationId_key`(`visaApplicationId`),
    UNIQUE INDEX `Voucher_airportReceptionId_key`(`airportReceptionId`),
    UNIQUE INDEX `Voucher_simRequestId_key`(`simRequestId`),
    INDEX `Voucher_companyId_idx`(`companyId`),
    INDEX `Voucher_serviceType_idx`(`serviceType`),
    INDEX `Voucher_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VoucherCounter` (
    `year` INTEGER NOT NULL,
    `lastSeq` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`year`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HotelMediaSyncLog` (
    `id` VARCHAR(191) NOT NULL,
    `stage` VARCHAR(191) NOT NULL,
    `city` VARCHAR(191) NULL,
    `actorId` VARCHAR(191) NULL,
    `dryRun` BOOLEAN NOT NULL DEFAULT true,
    `status` ENUM('SUCCESS', 'FAILED', 'PARTIAL', 'RUNNING') NOT NULL DEFAULT 'RUNNING',
    `total` INTEGER NOT NULL DEFAULT 0,
    `matched` INTEGER NOT NULL DEFAULT 0,
    `manualReview` INTEGER NOT NULL DEFAULT 0,
    `applied` INTEGER NOT NULL DEFAULT 0,
    `skipped` INTEGER NOT NULL DEFAULT 0,
    `errors` INTEGER NOT NULL DEFAULT 0,
    `photoRows` INTEGER NOT NULL DEFAULT 0,
    `triggeredById` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,
    `durationMs` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `HotelMediaSyncLog_stage_idx`(`stage`),
    INDEX `HotelMediaSyncLog_status_idx`(`status`),
    INDEX `HotelMediaSyncLog_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RefreshToken` ADD CONSTRAINT `RefreshToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Hotel` ADD CONSTRAINT `Hotel_destinationId_fkey` FOREIGN KEY (`destinationId`) REFERENCES `Destination`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Room` ADD CONSTRAINT `Room_hotelId_fkey` FOREIGN KEY (`hotelId`) REFERENCES `Hotel`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HotelPricing` ADD CONSTRAINT `HotelPricing_hotelId_fkey` FOREIGN KEY (`hotelId`) REFERENCES `Hotel`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HotelRate` ADD CONSTRAINT `HotelRate_hotelId_fkey` FOREIGN KEY (`hotelId`) REFERENCES `Hotel`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HotelRateSupplement` ADD CONSTRAINT `HotelRateSupplement_rateId_fkey` FOREIGN KEY (`rateId`) REFERENCES `HotelRate`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HotelCompanyVisibility` ADD CONSTRAINT `HotelCompanyVisibility_hotelId_fkey` FOREIGN KEY (`hotelId`) REFERENCES `Hotel`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HotelCompanyVisibility` ADD CONSTRAINT `HotelCompanyVisibility_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_hotelId_fkey` FOREIGN KEY (`hotelId`) REFERENCES `Hotel`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_roomId_fkey` FOREIGN KEY (`roomId`) REFERENCES `Room`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Booking` ADD CONSTRAINT `Booking_confirmedById_fkey` FOREIGN KEY (`confirmedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuoteRequest` ADD CONSTRAINT `QuoteRequest_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuoteRequest` ADD CONSTRAINT `QuoteRequest_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuoteRequest` ADD CONSTRAINT `QuoteRequest_destinationId_fkey` FOREIGN KEY (`destinationId`) REFERENCES `Destination`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuoteRequest` ADD CONSTRAINT `QuoteRequest_hotelId_fkey` FOREIGN KEY (`hotelId`) REFERENCES `Hotel`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuoteRequest` ADD CONSTRAINT `QuoteRequest_assignedToId_fkey` FOREIGN KEY (`assignedToId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QuoteRequest` ADD CONSTRAINT `QuoteRequest_confirmedById_fkey` FOREIGN KEY (`confirmedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `Booking`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_activityBookingId_fkey` FOREIGN KEY (`activityBookingId`) REFERENCES `ActivityBooking`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_activityPackageId_fkey` FOREIGN KEY (`activityPackageId`) REFERENCES `ActivityPackage`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_transportBookingId_fkey` FOREIGN KEY (`transportBookingId`) REFERENCES `TransportBooking`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_airportReceptionId_fkey` FOREIGN KEY (`airportReceptionId`) REFERENCES `AirportReception`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_cruiseBookingId_fkey` FOREIGN KEY (`cruiseBookingId`) REFERENCES `CruiseBooking`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_visaApplicationId_fkey` FOREIGN KEY (`visaApplicationId`) REFERENCES `VisaApplication`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_simRequestId_fkey` FOREIGN KEY (`simRequestId`) REFERENCES `SimRequest`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConsolidatedInvoice` ADD CONSTRAINT `ConsolidatedInvoice_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConsolidatedInvoice` ADD CONSTRAINT `ConsolidatedInvoice_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConsolidatedInvoiceLine` ADD CONSTRAINT `ConsolidatedInvoiceLine_consolidatedInvoiceId_fkey` FOREIGN KEY (`consolidatedInvoiceId`) REFERENCES `ConsolidatedInvoice`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ConsolidatedInvoiceLine` ADD CONSTRAINT `ConsolidatedInvoiceLine_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `Invoice`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WalletTransaction` ADD CONSTRAINT `WalletTransaction_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WalletTransaction` ADD CONSTRAINT `WalletTransaction_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlatformWalletTransaction` ADD CONSTRAINT `PlatformWalletTransaction_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PlatformWalletTransaction` ADD CONSTRAINT `PlatformWalletTransaction_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CruiseBooking` ADD CONSTRAINT `CruiseBooking_cruiseId_fkey` FOREIGN KEY (`cruiseId`) REFERENCES `NileCruise`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CruiseBooking` ADD CONSTRAINT `CruiseBooking_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CruiseBooking` ADD CONSTRAINT `CruiseBooking_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CruiseBooking` ADD CONSTRAINT `CruiseBooking_confirmedById_fkey` FOREIGN KEY (`confirmedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TransportBooking` ADD CONSTRAINT `TransportBooking_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TransportBooking` ADD CONSTRAINT `TransportBooking_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TransportBooking` ADD CONSTRAINT `TransportBooking_rateId_fkey` FOREIGN KEY (`rateId`) REFERENCES `TransportRate`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TransportBooking` ADD CONSTRAINT `TransportBooking_groupTypeId_fkey` FOREIGN KEY (`groupTypeId`) REFERENCES `ServiceGroupType`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TransportBooking` ADD CONSTRAINT `TransportBooking_confirmedById_fkey` FOREIGN KEY (`confirmedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TransportRate` ADD CONSTRAINT `TransportRate_destinationId_fkey` FOREIGN KEY (`destinationId`) REFERENCES `Destination`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Activity` ADD CONSTRAINT `Activity_destinationId_fkey` FOREIGN KEY (`destinationId`) REFERENCES `Destination`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActivityPackage` ADD CONSTRAINT `ActivityPackage_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActivityPackage` ADD CONSTRAINT `ActivityPackage_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActivityPackage` ADD CONSTRAINT `ActivityPackage_confirmedById_fkey` FOREIGN KEY (`confirmedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActivityPackageItem` ADD CONSTRAINT `ActivityPackageItem_packageId_fkey` FOREIGN KEY (`packageId`) REFERENCES `ActivityPackage`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActivityPackageItem` ADD CONSTRAINT `ActivityPackageItem_activityId_fkey` FOREIGN KEY (`activityId`) REFERENCES `Activity`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActivityBooking` ADD CONSTRAINT `ActivityBooking_activityId_fkey` FOREIGN KEY (`activityId`) REFERENCES `Activity`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActivityBooking` ADD CONSTRAINT `ActivityBooking_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActivityBooking` ADD CONSTRAINT `ActivityBooking_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActivityBooking` ADD CONSTRAINT `ActivityBooking_groupTypeId_fkey` FOREIGN KEY (`groupTypeId`) REFERENCES `ServiceGroupType`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActivityBooking` ADD CONSTRAINT `ActivityBooking_confirmedById_fkey` FOREIGN KEY (`confirmedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ServiceGroupType` ADD CONSTRAINT `ServiceGroupType_destinationId_fkey` FOREIGN KEY (`destinationId`) REFERENCES `Destination`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ServiceGroupType` ADD CONSTRAINT `ServiceGroupType_activityId_fkey` FOREIGN KEY (`activityId`) REFERENCES `Activity`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ServiceGroupType` ADD CONSTRAINT `ServiceGroupType_transportRateId_fkey` FOREIGN KEY (`transportRateId`) REFERENCES `TransportRate`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VisaApplication` ADD CONSTRAINT `VisaApplication_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VisaApplication` ADD CONSTRAINT `VisaApplication_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VisaApplication` ADD CONSTRAINT `VisaApplication_confirmedById_fkey` FOREIGN KEY (`confirmedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AirportReception` ADD CONSTRAINT `AirportReception_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AirportReception` ADD CONSTRAINT `AirportReception_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AirportReception` ADD CONSTRAINT `AirportReception_confirmedById_fkey` FOREIGN KEY (`confirmedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SimRequest` ADD CONSTRAINT `SimRequest_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SimRequest` ADD CONSTRAINT `SimRequest_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SimRequest` ADD CONSTRAINT `SimRequest_packageId_fkey` FOREIGN KEY (`packageId`) REFERENCES `SimPackage`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SimRequest` ADD CONSTRAINT `SimRequest_confirmedById_fkey` FOREIGN KEY (`confirmedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UiTemplateRevision` ADD CONSTRAINT `UiTemplateRevision_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `UiTemplate`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MarketPrice` ADD CONSTRAINT `MarketPrice_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Voucher` ADD CONSTRAINT `Voucher_transportBookingId_fkey` FOREIGN KEY (`transportBookingId`) REFERENCES `TransportBooking`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Voucher` ADD CONSTRAINT `Voucher_activityBookingId_fkey` FOREIGN KEY (`activityBookingId`) REFERENCES `ActivityBooking`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Voucher` ADD CONSTRAINT `Voucher_activityPackageId_fkey` FOREIGN KEY (`activityPackageId`) REFERENCES `ActivityPackage`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Voucher` ADD CONSTRAINT `Voucher_visaApplicationId_fkey` FOREIGN KEY (`visaApplicationId`) REFERENCES `VisaApplication`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Voucher` ADD CONSTRAINT `Voucher_airportReceptionId_fkey` FOREIGN KEY (`airportReceptionId`) REFERENCES `AirportReception`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Voucher` ADD CONSTRAINT `Voucher_simRequestId_fkey` FOREIGN KEY (`simRequestId`) REFERENCES `SimRequest`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Voucher` ADD CONSTRAINT `Voucher_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `Company`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;



SET FOREIGN_KEY_CHECKS = 1;
