-- PR 307 (S15, C1.5) — per-agent model choice. `AiAgent.selectedProvider` names one of the AI_PROVIDER connections
-- PR 306 wired (anthropic / openAi / googleAi / openRouter) by its adapter provider key, or stays NULL for the
-- practice writer. No AiModel row is referenced yet (that catalogue arrives with PR 312/580). Additive only; every
-- existing agent keeps NULL (the practice writer) until the owner picks something else.
-- AlterTable
ALTER TABLE "AiAgent" ADD COLUMN     "selectedProvider" TEXT;
