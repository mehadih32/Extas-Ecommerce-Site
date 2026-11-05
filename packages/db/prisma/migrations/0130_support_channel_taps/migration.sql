-- PR 624 (S22, CN-034, CN-031 lane C): the Messenger button on the shop — taps on the shop's support buttons
-- (Messenger, WhatsApp, the call button) counted by the shop's day, channel and place while the button's counting is
-- on. Numbers only, nothing about the person. Additive: one new table.

-- CreateTable
CREATE TABLE "SupportChannelTap" (
    "id" UUID NOT NULL,
    "storeId" INTEGER NOT NULL,
    "day" DATE NOT NULL,
    "channel" TEXT NOT NULL,
    "place" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SupportChannelTap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupportChannelTap_storeId_day_channel_place_key" ON "SupportChannelTap"("storeId", "day", "channel", "place");

-- AddForeignKey
ALTER TABLE "SupportChannelTap" ADD CONSTRAINT "SupportChannelTap_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
