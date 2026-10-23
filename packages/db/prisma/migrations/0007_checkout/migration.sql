-- PR 125 (S04, the checkout): an order placed with Rocket, Upay or the one "Pay online" page (PR 120) keeps that
-- method. Only enum values are added: nothing is dropped, rewritten or deleted.

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'ROCKET';
ALTER TYPE "PaymentMethod" ADD VALUE 'UPAY';
ALTER TYPE "PaymentMethod" ADD VALUE 'ONLINE';
