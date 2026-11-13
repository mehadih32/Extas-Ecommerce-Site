-- S28 · PR 673 — courier claims ledger v5. Additive only: two new kinds and a deadline.
ALTER TYPE "CourierClaimKind" ADD VALUE IF NOT EXISTS 'SHORT_COD';
ALTER TYPE "CourierClaimKind" ADD VALUE IF NOT EXISTS 'RETURN_SHORT';
ALTER TABLE "CourierClaim" ADD COLUMN "deadlineAt" TIMESTAMPTZ(3);
