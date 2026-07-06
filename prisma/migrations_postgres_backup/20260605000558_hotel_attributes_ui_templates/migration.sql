-- AlterTable
ALTER TABLE "Hotel" ADD COLUMN     "adultsOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "allInclusive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "aquaPark" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "area" TEXT,
ADD COLUMN     "diving" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "googleRating" DECIMAL(3,2),
ADD COLUMN     "kidsClub" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kidsPool" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "privateBeach" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sandyBeach" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "seaFront" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "snorkeling" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "totalPools" INTEGER;

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

-- CreateIndex
CREATE UNIQUE INDEX "UiTemplate_key_key" ON "UiTemplate"("key");

-- CreateIndex
CREATE INDEX "UiTemplate_target_idx" ON "UiTemplate"("target");

-- CreateIndex
CREATE INDEX "UiTemplate_isActive_idx" ON "UiTemplate"("isActive");

-- CreateIndex
CREATE INDEX "UiTemplateRevision_templateId_idx" ON "UiTemplateRevision"("templateId");

-- AddForeignKey
ALTER TABLE "UiTemplateRevision" ADD CONSTRAINT "UiTemplateRevision_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "UiTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
