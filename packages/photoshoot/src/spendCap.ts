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
// `AiAgent`'s cap is installation-wide, like every other agent's — it has no `storeId` of its own). No `AiAgent`
// row keyed `photoshoot` exists yet (that seed, and the Control room card, are PR 480/S24 item 25's "AI 360
// wiring") — `photoshootAgentCapCheck` treats a missing row exactly like `agentCapState` treats a missing cap:
// "none", never a block. Nothing here writes an `AiUsageLedger` row; nothing here calls a provider.
import type { PrismaClient } from '@extas/db/client';
import { dayStart, ymdIn } from '@extas/metrics';

/** The one `AiAgent.key` this module ever reads. Seeded by a later PR (S24 item 25); until then, "no cap". */
export const PHOTOSHOOT_AGENT_KEY = 'photoshoot';

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
 * through; "paused" is the one state that refuses it. Honestly "none" (never blocks) while no `AiAgent` row keyed
 * `photoshoot` exists yet, or it exists with no cap set — both the ship-as-off default (CN-018).
 */
export async function photoshootAgentCapCheck(db: PrismaClient, now: Date): Promise<{ state: AgentCapState; spentMinor: number; capMinor: number | null }> {
  const agent = await db.aiAgent.findUnique({ where: { key: PHOTOSHOOT_AGENT_KEY } });
  if (!agent || agent.archivedAt) return { state: 'none', spentMinor: 0, capMinor: null };
  const spentMinor = await monthlySpendMinor(db, agent.id, now);
  return { state: agentCapState(spentMinor, agent.monthlyCapMinor), spentMinor, capMinor: agent.monthlyCapMinor };
}
