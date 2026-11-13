-- PR 695 (S28, CN-048) — Marketing › Influencers & affiliates: partners, their personal codes and an append-only payout
-- ledger. Additive only; nothing is dropped or renamed.
CREATE TABLE "Affiliate" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "handle" TEXT,
    "platform" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ON',
    "shareBp" INTEGER,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Affiliate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AffiliateCode" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "affiliateId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "couponId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "AffiliateCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AffiliatePayout" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "affiliateId" UUID NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "note" TEXT,
    "reversesId" UUID,
    "costEntryId" UUID,
    "paidById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AffiliatePayout_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Affiliate_storeId_status_idx" ON "Affiliate"("storeId", "status");
CREATE UNIQUE INDEX "AffiliateCode_storeId_code_key" ON "AffiliateCode"("storeId", "code");
CREATE INDEX "AffiliateCode_affiliateId_idx" ON "AffiliateCode"("affiliateId");
CREATE INDEX "AffiliatePayout_storeId_affiliateId_createdAt_idx" ON "AffiliatePayout"("storeId", "affiliateId", "createdAt");

ALTER TABLE "Affiliate" ADD CONSTRAINT "Affiliate_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AffiliateCode" ADD CONSTRAINT "AffiliateCode_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AffiliateCode" ADD CONSTRAINT "AffiliateCode_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AffiliatePayout" ADD CONSTRAINT "AffiliatePayout_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AffiliatePayout" ADD CONSTRAINT "AffiliatePayout_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The payout ledger is append-only at the database (a correction is a new, negative row).
REVOKE UPDATE, DELETE, TRUNCATE ON "AffiliatePayout" FROM extas_app;
CREATE TRIGGER "AffiliatePayout_append_only" BEFORE UPDATE OR DELETE ON "AffiliatePayout" FOR EACH ROW EXECUTE FUNCTION extas_append_only();
CREATE TRIGGER "AffiliatePayout_no_truncate" BEFORE TRUNCATE ON "AffiliatePayout" FOR EACH STATEMENT EXECUTE FUNCTION extas_append_only();
