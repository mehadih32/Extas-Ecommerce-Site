// S24 · PR 452 (Blueprint C7.20, C1.6) — the Photoshoot agent's own monthly spend cap, enforced at the one place
// that actually spends money: `startProcessing` (jobs.ts), the move from QUEUED into PROCESSING that is about to
// call a provider adapter's `generate` (PR 449–450). At 80% the owner already gets a Telegram warning from PR 309's
// generic `checkAgentCapAlerts` (apps/web/src/lib/admin-ai/spend-cap.ts) the moment an `AiAgent` row for this agent
// exists and carries spend — nothing new to build there. At 100% ("new generations pause... the shop is
// unaffected", C7.20) a job may not *start*; it stays `QUEUED`, exactly where PR 451 already leaves a job waiting
// its turn, so pausing costs nothing and loses nothing.
//
// `agentCapState` here is the same whole-number arithmetic PR 309 built and tested (`spentMinor*5 >= capMinor*4` for
// the 80% line, never a float) — duplicated, not imported, because `@extas/photoshoot` is a package and must not
// depend on `apps/web`; the two copies are kept honest by `spendCap.test.ts` asserting the exact same table PR
// 309's own test does. `monthlySpendMinor` reads the one shared `AiUsageLedger` (C7.20: "every generation writes to
// the same ai_usage_ledger... photoshoot cost is not a separate pot of money") by `agentId`, business-wide (an
// `AiAgent`'s cap is installation-wide, like every other agent's — it has no `storeId` of its own).
//
// S24 · PR 468 (item 25, "AI 360 wiring and Cost Book rows for every photoshoot sub-job") closes the half of this
// gap that is honestly this package's own to close: `ensurePhotoshootAgentRow` below seeds the real `AiAgent` row
// keyed `photoshoot`, so `photoshootAgentCapCheck` is no longer reading a row that can never exist. Deliberately
// NOT here (same honest boundary as every unbuilt piece before it): writing an `AiUsageLedger` row for a real
// generation. `recordGenerationCostEntry` (costLedger.ts) knows the real spend in BDT minor units (`amountMinor`)
// and which provider ran it, but `AiUsageLedger.costUsdMicros` is a NOT-NULL real USD figure and `.modelKey` is
// meant to be the provider's own literal model-version string (e.g. FASHN's `tryon-v1.6`) — this package has no
// USD exchange-rate reader (CN-018: never invent a number) and deliberately never imports `@extas/adapters`
// (where that literal model string actually lives), the same boundary this file has kept since PR 452. Wiring the
// real ledger write needs one of those two gaps closed first, by whichever PR owns it; filed in
// `docs/after-golive-notes.md` rather than guessed at here with a placeholder number or string.
import type { PrismaClient } from '@extas/db/client';
import { dayStart, ymdIn } from '@extas/metrics';

/** The one `AiAgent.key` this module ever reads. */
export const PHOTOSHOOT_AGENT_KEY = 'photoshoot';
/** Identity fields for the Photoshoot agent's own `AiAgent` row — never one of the "seven fixed EXTAS agents"
 * (`apps/web/src/lib/admin-ai/agents.ts`, pinned at exactly seven by its own tests, a different lane's shared
 * file, CLAUDE.md rule 10): Photoshoot is a pipeline, not a person, so it gets its own row through its own
 * package rather than joining that fixed roster. */
export const PHOTOSHOOT_AGENT_CODE = 'STUDIO-PHOTOSHOOT';
export const PHOTOSHOOT_AGENT_NAME_EN = 'Photoshoot agent';
export const PHOTOSHOOT_AGENT_NAME_BN = 'ফটোশুট এজেন্ট';
export const PHOTOSHOOT_AGENT_ROLE =
  "Generates, scores and finishes product photos from the owner's own reference photos. Writes to media only — never price, stock, orders or customer data (C7.20).";

/**
 * Keeps the Photoshoot agent's own identity row in step with the constants above (the same idea as admin-ai's own
 * `ensureAgentRows` for the seven human-named agents) — never touches `enabled`, `monthlyCapMinor`,
 * `keepOnWhenMasterOff` or `schedule`, which stay the owner's own choice once a screen lets him set them. Called
 * from `photoshootAgentCapCheck` below, so the row always exists by the time anything asks about the cap, and any
 * later Studio settings screen has a real row to read and write from its very first load.
 */
export async function ensurePhotoshootAgentRow(db: Pick<PrismaClient, 'aiAgent'>) {
  return db.aiAgent.upsert({
    where: { key: PHOTOSHOOT_AGENT_KEY },
    create: {
      key: PHOTOSHOOT_AGENT_KEY,
      code: PHOTOSHOOT_AGENT_CODE,
      nameEn: PHOTOSHOOT_AGENT_NAME_EN,
      nameBn: PHOTOSHOOT_AGENT_NAME_BN,
      role: PHOTOSHOOT_AGENT_ROLE,
      isChief: false,
      enabled: false,
      keepOnWhenMasterOff: false,
      verified: true,
    },
    update: { code: PHOTOSHOOT_AGENT_CODE, nameEn: PHOTOSHOOT_AGENT_NAME_EN, nameBn: PHOTOSHOOT_AGENT_NAME_BN, role: PHOTOSHOOT_AGENT_ROLE },
  });
}

export type AgentCapState = 'none' | 'ok' | 'warned' | 'paused';

/**
 * Mirrors `apps/web/src/lib/admin-ai/spend-cap.ts`'s `agentCapState` exactly (PR 309, C1.6): `capMinor` null or 0 is
 * "no cap" (off, the default, CN-018); otherwise "warned" from 80% of the cap, "paused" at or over 100% —
 * cross-multiplied in whole numbers so the 80% line is exact, never a float.
 */
export function agentCapState(spentMinor: number, capMinor: number | null): AgentCapState {
  if (!capMinor) return 'none';
  if (spentMinor >= capMinor) return 'paused';
  if (spentMinor * 5 >= capMinor * 4) return 'warned';
  return 'ok';
}

/** The "this calendar month" window `checkAgentCapAlerts` (PR 309) already dedupes alerts on — read in UTC, no
 * finer a clock than the day is needed for a monthly cap. */
export function monthStart(now: Date): Date {
  return dayStart(`${ymdIn(now, 'UTC').slice(0, 7)}-01`, 'UTC');
}

/** This month's spend for one AiAgent, summed from the one shared `AiUsageLedger` (C7.20). 0 when nothing has been
 * logged yet — true on every installation until a real provider is both keyed and actually called. */
export async function monthlySpendMinor(db: PrismaClient, agentId: string, now: Date): Promise<number> {
  const r = await db.aiUsageLedger.aggregate({ where: { agentId, createdAt: { gte: monthStart(now) } }, _sum: { costMinor: true } });
  return r._sum.costMinor ?? 0;
}

/**
 * The enforcement check `startProcessing` makes before letting a job spend: "none"/"ok"/"warned" all let the job
 * through; "paused" is the one state that refuses it. Ensures the Photoshoot agent's own row exists (idempotent,
 * never touches a cap the owner already set) and is honestly "none" (never blocks) while that row carries no cap
 * yet, or was archived — both the ship-as-off default (CN-018).
 */
export async function photoshootAgentCapCheck(db: PrismaClient, now: Date): Promise<{ state: AgentCapState; spentMinor: number; capMinor: number | null }> {
  const agent = await ensurePhotoshootAgentRow(db);
  if (agent.archivedAt) return { state: 'none', spentMinor: 0, capMinor: null };
  const spentMinor = await monthlySpendMinor(db, agent.id, now);
  return { state: agentCapState(spentMinor, agent.monthlyCapMinor), spentMinor, capMinor: agent.monthlyCapMinor };
}
