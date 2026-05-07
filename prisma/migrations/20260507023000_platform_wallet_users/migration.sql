-- Platform wallet stores the funds owned by Elbakri before allocating balance to agencies.
CREATE TABLE "PlatformWallet" (
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "balance" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformWallet_pkey" PRIMARY KEY ("currency")
);

CREATE TABLE "PlatformWalletTransaction" (
  "id" TEXT NOT NULL,
  "type" "TransactionType" NOT NULL,
  "amount" DECIMAL(12, 2) NOT NULL,
  "balanceBefore" DECIMAL(12, 2) NOT NULL,
  "balanceAfter" DECIMAL(12, 2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "reference" TEXT,
  "description" TEXT NOT NULL,
  "companyId" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformWalletTransaction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlatformWalletTransaction_currency_idx" ON "PlatformWalletTransaction"("currency");
CREATE INDEX "PlatformWalletTransaction_companyId_idx" ON "PlatformWalletTransaction"("companyId");
CREATE INDEX "PlatformWalletTransaction_createdById_idx" ON "PlatformWalletTransaction"("createdById");
CREATE INDEX "PlatformWalletTransaction_createdAt_idx" ON "PlatformWalletTransaction"("createdAt");

ALTER TABLE "PlatformWalletTransaction"
  ADD CONSTRAINT "PlatformWalletTransaction_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PlatformWalletTransaction"
  ADD CONSTRAINT "PlatformWalletTransaction_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
