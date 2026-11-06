-- PR 599 (S02): a new function asked for from inside the admin ("request a feature", Help & Build › Feature requests),
-- with the status the build team gives it. Only adds a table and its two lists; nothing is changed, renamed or dropped.
-- CreateEnum
CREATE TYPE "FeatureRequestUrgency" AS ENUM ('SOON', 'LATER');

-- CreateEnum
CREATE TYPE "FeatureRequestStatus" AS ENUM ('NEW', 'REGISTERED', 'BUILT', 'POSSIBLE', 'DECLINED');

-- CreateTable
CREATE TABLE "FeatureRequest" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "need" TEXT NOT NULL,
    "section" TEXT,
    "page" TEXT,
    "urgency" "FeatureRequestUrgency" NOT NULL DEFAULT 'LATER',
    "status" "FeatureRequestStatus" NOT NULL DEFAULT 'NEW',
    "prNumber" INTEGER,
    "statusNote" TEXT,
    "statusById" UUID,
    "statusAt" TIMESTAMPTZ(3),
    "requestedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FeatureRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeatureRequest_storeId_status_createdAt_idx" ON "FeatureRequest"("storeId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureRequest_storeId_number_key" ON "FeatureRequest"("storeId", "number");

-- AddForeignKey
ALTER TABLE "FeatureRequest" ADD CONSTRAINT "FeatureRequest_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
