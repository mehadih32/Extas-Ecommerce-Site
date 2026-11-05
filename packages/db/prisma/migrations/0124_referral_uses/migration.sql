-- PR 273 (S13, referral programme; SIM-F-009 referral half) — each order placed with a friend's invite code, and one
-- invite code per customer. Additive only: one new table and one unique index. Nothing is changed, renamed or dropped.

-- CreateTable
CREATE TABLE "ReferralUse" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "referralId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "refereeCustomerId" UUID,
    "phone" TEXT,
    "status" TEXT NOT NULL,
    "rewardMinor" INTEGER,
    "walletEntryId" UUID,
    "rewardedAt" TIMESTAMPTZ(3),
    "rewardedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ReferralUse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReferralUse_storeId_orderId_key" ON "ReferralUse"("storeId", "orderId");

-- CreateIndex
CREATE INDEX "ReferralUse_referralId_idx" ON "ReferralUse"("referralId");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_storeId_referrerCustomerId_key" ON "Referral"("storeId", "referrerCustomerId");

-- AddForeignKey
ALTER TABLE "ReferralUse" ADD CONSTRAINT "ReferralUse_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralUse" ADD CONSTRAINT "ReferralUse_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "Referral"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
