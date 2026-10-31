-- PR 505 follow-up (go-live gate SIM-F-025 / F-047): the language the customer ordered in, so his messages follow it
-- (`messages.language` = "customer"); null for older orders and orders from other channels: the store's language.
-- AlterTable
ALTER TABLE "Order" ADD COLUMN "lang" TEXT;
