-- PR 162 (S06): the blocklist (RiskBlock). A row is never deleted: "Undo" writes who, when and why on it.
-- CreateTable
CREATE TABLE "RiskBlock" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "phone" TEXT NOT NULL,
    "clusterId" UUID,
    "orderId" UUID,
    "reason" TEXT NOT NULL,
    "blockedById" UUID,
    "blockedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undoneAt" TIMESTAMPTZ(3),
    "undoneById" UUID,
    "undoReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RiskBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RiskBlock_storeId_phone_idx" ON "RiskBlock"("storeId", "phone");

-- CreateIndex
CREATE INDEX "RiskBlock_storeId_clusterId_idx" ON "RiskBlock"("storeId", "clusterId");

-- CreateIndex
CREATE INDEX "RiskBlock_storeId_blockedAt_idx" ON "RiskBlock"("storeId", "blockedAt");

-- AddForeignKey
ALTER TABLE "RiskBlock" ADD CONSTRAINT "RiskBlock_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- The app role may add and undo, never delete or empty the list.
REVOKE DELETE, TRUNCATE ON "RiskBlock" FROM extas_app;
