-- PR 257 (S13, Blueprint C6.2): server-side event tracking. TrackedEvent keeps each shopper event (a product seen, an
-- item put in the bag, the checkout opened, an order placed) the shop sends to the ad platforms from its own server,
-- with the id a browser pixel would share (each platform counts it once) and the delivery state per platform. Only
-- hashes of a customer's phone or e-mail are kept. Everything here only adds; nothing is changed, renamed or dropped.

-- CreateTable
CREATE TABLE "TrackedEvent" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "test" BOOLEAN NOT NULL DEFAULT false,
    "url" TEXT,
    "valueMinor" INTEGER,
    "currency" TEXT,
    "items" JSONB NOT NULL DEFAULT '[]',
    "orderId" UUID,
    "userData" JSONB NOT NULL DEFAULT '{}',
    "deliveries" JSONB NOT NULL DEFAULT '{}',
    "pending" BOOLEAN NOT NULL DEFAULT true,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TrackedEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrackedEvent_storeId_eventId_key" ON "TrackedEvent"("storeId", "eventId");

-- CreateIndex
CREATE INDEX "TrackedEvent_storeId_occurredAt_idx" ON "TrackedEvent"("storeId", "occurredAt");

-- CreateIndex
CREATE INDEX "TrackedEvent_pending_occurredAt_idx" ON "TrackedEvent"("pending", "occurredAt");

-- AddForeignKey
ALTER TABLE "TrackedEvent" ADD CONSTRAINT "TrackedEvent_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
