-- PR 250: the content performance report — each article's readers a day by where they came from, and the orders placed
-- by a browser that read an article before ordering (money is read from the orders through @extas/metrics, never kept).
CREATE TABLE "BlogPostDailyStat" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "postId" UUID NOT NULL,
    "day" DATE NOT NULL,
    "readers" INTEGER NOT NULL DEFAULT 0,
    "fromSearch" INTEGER NOT NULL DEFAULT 0,
    "fromShop" INTEGER NOT NULL DEFAULT 0,
    "fromOther" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BlogPostDailyStat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BlogOrderRead" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "orderId" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "readAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlogOrderRead_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BlogPostDailyStat_postId_day_key" ON "BlogPostDailyStat"("postId", "day");
CREATE INDEX "BlogPostDailyStat_storeId_day_idx" ON "BlogPostDailyStat"("storeId", "day");
CREATE UNIQUE INDEX "BlogOrderRead_orderId_postId_key" ON "BlogOrderRead"("orderId", "postId");
CREATE INDEX "BlogOrderRead_storeId_postId_idx" ON "BlogOrderRead"("storeId", "postId");

ALTER TABLE "BlogPostDailyStat" ADD CONSTRAINT "BlogPostDailyStat_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BlogOrderRead" ADD CONSTRAINT "BlogOrderRead_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- BlogOrderRead is @append-only (an order's credit to the article it read is written once): locked at the database (PR 139).
REVOKE UPDATE, DELETE, TRUNCATE ON "BlogOrderRead" FROM extas_app;
CREATE TRIGGER "BlogOrderRead_append_only" BEFORE UPDATE OR DELETE ON "BlogOrderRead" FOR EACH ROW EXECUTE FUNCTION extas_append_only();
CREATE TRIGGER "BlogOrderRead_no_truncate" BEFORE TRUNCATE ON "BlogOrderRead" FOR EACH STATEMENT EXECUTE FUNCTION extas_append_only();
