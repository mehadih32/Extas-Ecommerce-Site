-- PR 523 (S06): the proposal that fills the blocklist (RiskBlockProposal), and what the register holds about a listed
-- person (RiskBlock.facts). Nothing is blocked by itself; a row is never deleted.
-- AlterTable
ALTER TABLE "RiskBlock" ADD COLUMN     "facts" JSONB;

-- CreateTable
CREATE TABLE "RiskBlockProposal" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "phone" TEXT NOT NULL,
    "clusterId" UUID,
    "state" TEXT NOT NULL,
    "rejections" INTEGER NOT NULL,
    "refused" INTEGER NOT NULL,
    "declined" INTEGER NOT NULL,
    "lastOrderId" UUID,
    "facts" JSONB NOT NULL,
    "rejectionsAtDecision" INTEGER,
    "decidedById" UUID,
    "decidedAt" TIMESTAMPTZ(3),
    "decisionReason" TEXT,
    "blockId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RiskBlockProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RiskBlockProposal_storeId_state_updatedAt_idx" ON "RiskBlockProposal"("storeId", "state", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RiskBlockProposal_storeId_phone_key" ON "RiskBlockProposal"("storeId", "phone");

-- AddForeignKey
ALTER TABLE "RiskBlockProposal" ADD CONSTRAINT "RiskBlockProposal_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- The app role may add and decide proposals, never delete or empty them.
REVOKE DELETE, TRUNCATE ON "RiskBlockProposal" FROM extas_app;
