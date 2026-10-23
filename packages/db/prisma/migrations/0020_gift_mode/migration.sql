-- PR 605 (S04; CN-014 h, CN-020 (2), SIM-F-007): gift mode. Only columns are added, each nullable or with a default, so
-- every existing order stays valid (not a gift). A gift's own name, phone and address are the RECEIVER's (the sticker,
-- the booking and the courier's calls read them); the sender who pays is stored beside them, with a contact used only
-- for the order's updates. The gift note goes with the parcel, "deliver on or after" is a date, and the receiver's
-- invoice can hide the prices. Nothing is dropped, rewritten or deleted.

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "giftDeliverAfter" DATE,
ADD COLUMN     "giftHidePrices" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "giftNote" TEXT,
ADD COLUMN     "giftSenderContact" TEXT,
ADD COLUMN     "giftSenderName" TEXT,
ADD COLUMN     "isGift" BOOLEAN NOT NULL DEFAULT false;
