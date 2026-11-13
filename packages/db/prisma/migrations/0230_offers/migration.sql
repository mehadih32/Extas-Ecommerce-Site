-- PR 677 (S28 Admin v5) — Offers & Discounts 360: the umbrella over the shop's offers and its history. Additive only; nothing is
-- dropped or renamed. An offer is a facade over the Smart Rules, coupons and the prepaid-reward settings (no engine rewritten).
-- CreateEnum
CREATE TYPE "OfferKind" AS ENUM ('FREE_DELIVERY', 'PERCENT', 'FLAT', 'POINTS', 'WALLET_CREDIT');

-- CreateEnum
CREATE TYPE "OfferState" AS ENUM ('DRAFT', 'AWAITING_OK', 'LIVE', 'PAUSED', 'ENDED');

-- CreateTable
CREATE TABLE "Offer" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "kind" "OfferKind" NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'ANY',
    "state" "OfferState" NOT NULL DEFAULT 'DRAFT',
    "nameEn" TEXT NOT NULL,
    "nameBn" TEXT,
    "value" JSONB NOT NULL,
    "scope" JSONB NOT NULL,
    "who" JSONB NOT NULL,
    "code" TEXT,
    "startsAt" TIMESTAMPTZ(3),
    "endsAt" TIMESTAMPTZ(3),
    "limits" JSONB NOT NULL,
    "ruleId" UUID,
    "couponId" UUID,
    "createdById" UUID,
    "approvedById" UUID,
    "approvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferEvent" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "offerId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" UUID,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfferEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Offer_storeId_state_createdAt_idx" ON "Offer"("storeId", "state", "createdAt");

-- CreateIndex
CREATE INDEX "OfferEvent_offerId_createdAt_idx" ON "OfferEvent"("offerId", "createdAt");

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferEvent" ADD CONSTRAINT "OfferEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferEvent" ADD CONSTRAINT "OfferEvent_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- OfferEvent is @append-only (a history: a correction is a new line): locked at the database (PR 139).
REVOKE UPDATE, DELETE, TRUNCATE ON "OfferEvent" FROM extas_app;
CREATE TRIGGER "OfferEvent_append_only" BEFORE UPDATE OR DELETE ON "OfferEvent" FOR EACH ROW EXECUTE FUNCTION extas_append_only();
CREATE TRIGGER "OfferEvent_no_truncate" BEFORE TRUNCATE ON "OfferEvent" FOR EACH STATEMENT EXECUTE FUNCTION extas_append_only();
