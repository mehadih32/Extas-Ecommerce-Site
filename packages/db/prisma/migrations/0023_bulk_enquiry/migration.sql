-- PR 606 (S04; CN-017 SIM-F-023, Blueprint B8.5 item 4): the bulk / corporate lane's enquiries. One new table, nothing
-- else is changed, dropped or rewritten. An enquiry holds who asks (name, mobile, an optional e-mail and company), what
-- (the bag's lines or his own words), how many, a logo or not, by when, and where he came from; the team's stage, and
-- later the order it became. No price, quote or money is stored here.

-- CreateTable
CREATE TABLE "BulkEnquiry" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "refNo" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "company" TEXT,
    "items" JSONB,
    "itemsText" TEXT,
    "quantity" INTEGER NOT NULL,
    "logo" BOOLEAN NOT NULL DEFAULT false,
    "neededBy" DATE,
    "note" TEXT,
    "source" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "visitorId" TEXT,
    "customerId" UUID,
    "ip" TEXT,
    "orderId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BulkEnquiry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BulkEnquiry_storeId_status_createdAt_idx" ON "BulkEnquiry"("storeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "BulkEnquiry_storeId_phone_createdAt_idx" ON "BulkEnquiry"("storeId", "phone", "createdAt");

-- CreateIndex
CREATE INDEX "BulkEnquiry_storeId_visitorId_createdAt_idx" ON "BulkEnquiry"("storeId", "visitorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BulkEnquiry_storeId_refNo_key" ON "BulkEnquiry"("storeId", "refNo");

-- AddForeignKey
ALTER TABLE "BulkEnquiry" ADD CONSTRAINT "BulkEnquiry_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

