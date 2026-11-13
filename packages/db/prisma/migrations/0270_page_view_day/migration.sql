-- PR 700 (S28; admin prototype v5, Website -> Analytics -> Overview): the daily roll-up of first-party page views. One new table, nothing else is changed, dropped or rewritten.

-- CreateTable
CREATE TABLE "PageViewDay" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "day" DATE NOT NULL,
    "dim" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT '',
    "views" INTEGER NOT NULL DEFAULT 0,
    "visitors" INTEGER NOT NULL DEFAULT 0,
    "sessions" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PageViewDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PageViewDay_storeId_day_idx" ON "PageViewDay"("storeId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "PageViewDay_storeId_day_dim_key_key" ON "PageViewDay"("storeId", "day", "dim", "key");

-- AddForeignKey
ALTER TABLE "PageViewDay" ADD CONSTRAINT "PageViewDay_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

