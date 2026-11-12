-- PR 463 (S24, C7.10 "Detail Finder") — the owner's own "remove" on a proposed focus region needs its own
-- terminal state, distinct from "not yet reviewed": `approved` alone cannot tell the two apart, and nothing here is
-- ever hard-deleted (a wrongly proposed region stays on file, struck through, so a later read of the same product
-- never re-shows it as still pending). Additive only; every existing `DetailRegion` row keeps `rejectedAt` NULL.
-- AlterTable
ALTER TABLE "DetailRegion" ADD COLUMN     "rejectedAt" TIMESTAMPTZ(3);
