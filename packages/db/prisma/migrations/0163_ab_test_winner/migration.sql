-- PR 83 (S02, A/B test module) — which version a finished test kept: "a" (the shop as it was) or "b" (the test's
-- version, now written to the shop's own settings); empty while it runs or when it ended with no winner. Additive only.
ALTER TABLE "AbTest" ADD COLUMN "winner" TEXT;
