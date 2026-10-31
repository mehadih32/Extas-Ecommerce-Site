-- PR 163 (S06): a repeat refuser's terms, chosen by the owner per case (RefuserTerm). A row is never deleted: "End"
-- writes who, when and why on it.
-- CreateTable
CREATE TABLE "RefuserTerm" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "phone" TEXT NOT NULL,
    "clusterId" UUID,
    "terms" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "refusedAtDecision" INTEGER NOT NULL,
    "decidedById" UUID,
    "decidedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMPTZ(3),
    "endedById" UUID,
    "endReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RefuserTerm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RefuserTerm_storeId_phone_idx" ON "RefuserTerm"("storeId", "phone");

-- CreateIndex
CREATE INDEX "RefuserTerm_storeId_clusterId_idx" ON "RefuserTerm"("storeId", "clusterId");

-- CreateIndex
CREATE INDEX "RefuserTerm_storeId_decidedAt_idx" ON "RefuserTerm"("storeId", "decidedAt");

-- AddForeignKey
ALTER TABLE "RefuserTerm" ADD CONSTRAINT "RefuserTerm_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- The app role may add and end terms, never delete or empty them.
REVOKE DELETE, TRUNCATE ON "RefuserTerm" FROM extas_app;
