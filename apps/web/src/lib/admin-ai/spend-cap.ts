// S15 · PR 309 (C1.6) — each agent's own monthly spend cap: at 80% a Telegram warning goes to the owner, at 100%
// new generations pause (already-approved output stays live, the shop is unaffected) — the worked example the
// Blueprint gives for the Photoshoot agent, now true "as with any agent" (the same widening PR 305 did for
// keep-on). No migration: `AiAgent.monthlyCapMinor` was already in the full S00 schema, additive, unused until now.
//
// `agentCapState`/`wouldExceedCap` are the enforcement primitives: pure, tested, and ready for the job dispatcher
// to call before paying for one more run. No such dispatcher exists yet — nothing in this codebase writes an
// `AiUsageLedger` row outside a test fixture (PR 306/307/308 are equally honest about this: the practice writer
// costs nothing, so spend reads truthfully as zero until a real provider is both keyed and actually called by a
// job that does not exist yet). `checkAgentCapAlerts` is real and live, though, not speculative: it runs on every
// read of the Control room and sends the owner's Telegram warning the moment any agent's spend does cross a cap
// the owner set, deduplicated through the audit log so a crossing is announced once per month, never once per page
// view. The owner reads only চলতি বাংলা (CLAUDE.md), so the alert text is always Bengali, independent of whichever
// language an English-reading staff member has the admin UI itself set to.
import type { PrismaClient } from '@extas/db/client';
import { audit, SYSTEM, type Actor, type RequestContext } from '@extas/auth';
import { createConnections, sendOwnerAlert, telegramAdapters } from '@extas/adapters';
import { dayStart, ymdIn } from '@extas/metrics';
import type { Vault } from '@extas/vault';
import { formatMoney, type Money } from '@/components/admin/products/model';
import type { AppResolver } from '../settings';
import { t, type Dict } from '../i18n';
import { AiError } from './errors';
import { isAiAgentKey } from './agents';
import bn from '../../../messages/admin-ai.bn.json';

const INT_MAX = 2_147_483_647; // hardcode-ok: the largest whole number the database column holds
const CAP_DICT = bn.aiControl as unknown as Dict;

export type AgentCapState = 'none' | 'ok' | 'warned' | 'paused';

/**
 * `capMinor` null or 0 is "no cap" (the default — off, same as every other owner-set limit). Otherwise "warned"
 * from 80% of the cap, "paused" at or over 100% — compared with whole-number arithmetic (`spent*5 >= cap*4`),
 * never a float, so the 80% line is exact.
 */
export function agentCapState(spentMinor: number, capMinor: number | null): AgentCapState {
  if (!capMinor) return 'none';
  if (spentMinor >= capMinor) return 'paused';
  if (spentMinor * 5 >= capMinor * 4) return 'warned';
  return 'ok';
}

/** Would one more run of `amountMinor` push this month's spend over the cap? `null` (no cap) never does. The
 * enforcement call a job dispatcher makes before it pays for anything — not yet called by any dispatcher, since
 * none exists; built so it is ready the moment one does. */
export function wouldExceedCap(spentMinor: number, amountMinor: number, capMinor: number | null): boolean {
  return capMinor !== null && spentMinor + amountMinor > capMinor;
}

/** Validates an owner-submitted cap: `null` (off) or a whole number of minor-currency units from 1 up to the
 * column's own limit. Throws `AiError(422, 'INVALID_CAP')` on anything else — never silently rounds or clamps. */
export function parseCapInput(input: unknown): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input !== 'number' || !Number.isInteger(input) || input < 1 || input > INT_MAX) throw new AiError(422, 'INVALID_CAP', ['monthlyCapMinor']);
  return input;
}

/** Sets one agent's own monthly spend cap (`null` turns it off). A no-op when it already is what was asked, so a
 * double tap writes once. */
export async function setAgentMonthlyCap(deps: { db: PrismaClient }, who: { actor: Actor; ctx?: RequestContext }, key: string, input: unknown): Promise<void> {
  if (!isAiAgentKey(key)) throw new AiError(404, 'NOT_FOUND', ['key']);
  const capMinor = parseCapInput(input);
  await deps.db.$transaction(async (tx) => {
    const row = await tx.aiAgent.findUnique({ where: { key } });
    if (!row || row.archivedAt) throw new AiError(404, 'NOT_FOUND', ['key']);
    if (row.monthlyCapMinor === capMinor) return;
    await tx.aiAgent.update({ where: { key }, data: { monthlyCapMinor: capMinor } });
    await audit(tx, who.actor, { action: 'ai.agent.cap', entityType: 'AiAgent', entityId: row.id, before: { monthlyCapMinor: row.monthlyCapMinor }, after: { monthlyCapMinor: capMinor } }, who.ctx ?? {});
  });
}

interface CapAgent {
  id: string;
  nameBn: string;
  monthlyCapMinor: number | null;
  monthMinor: number;
}

/** The one Telegram message for a crossing — always Bengali (CLAUDE.md: the owner reads only চলতি বাংলা), from
 * `admin-ai.bn.json`'s `agents.cap.tg.*` keys, the same `t()`/vars shape every other owner alert in this codebase
 * uses (see `ad-alerts.ts`'s `alertText`). */
function capAlertText(state: 'warned' | 'paused', name: string, spentMinor: number, capMinor: number, money: Money): string {
  return t(CAP_DICT, `agents.cap.tg.${state}`, { name, spent: formatMoney(spentMinor, money), cap: formatMoney(capMinor, money) });
}

/** The owner's Telegram bot on Keys & connections, the practice copy until it is connected — never throws. */
async function telegram(deps: { db: PrismaClient; vault: Vault | null; resolver: Pick<AppResolver, 'value'> }, text: string): Promise<void> {
  try {
    const [testS, cacheS] = await Promise.all([deps.resolver.value('system.integrationTestTimeoutSeconds'), deps.resolver.value('system.integrationKeyCacheSeconds')]);
    const c = createConnections({ db: deps.db, vault: deps.vault ?? { get: async () => null }, adapters: telegramAdapters, secretCacheMs: cacheS * 1000, testTimeoutMs: testS * 1000 });
    await sendOwnerAlert(c, text);
  } catch (e) {
    console.warn(`ai agent cap alert: not sent (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
  }
}

/**
 * For every agent whose spend has crossed 80% or 100% of its own cap this month: sends the owner's Telegram
 * warning once, deduplicated through the audit log (a `ai.agent.capWarn80`/`ai.agent.capPaused` row this month for
 * that agent means it was already sent). Cheap and a no-op whenever no agent has a cap set — the common case on
 * every installation until the owner sets one. Never throws: called from a page read, so a Telegram hiccup must
 * never break the screen.
 */
export async function checkAgentCapAlerts(
  deps: { db: PrismaClient; vault: Vault | null; resolver: Pick<AppResolver, 'value'>; now: () => Date; send?: (text: string) => Promise<void> },
  agents: readonly CapAgent[],
  money: Money,
): Promise<void> {
  const crossed = agents
    .map((a) => ({ a, state: agentCapState(a.monthMinor, a.monthlyCapMinor) }))
    .filter((x): x is { a: CapAgent; state: 'warned' | 'paused' } => x.state === 'warned' || x.state === 'paused');
  if (!crossed.length) return;
  try {
    const now = deps.now();
    const month = dayStart(`${ymdIn(now, 'UTC').slice(0, 7)}-01`, 'UTC'); // "this calendar month" — the dedupe window needs no finer a clock than that
    const already = await deps.db.auditLog.findMany({
      where: { entityType: 'AiAgent', entityId: { in: crossed.map((x) => x.a.id) }, action: { in: ['ai.agent.capWarn80', 'ai.agent.capPaused'] }, createdAt: { gte: month } },
      select: { entityId: true, action: true },
    });
    const sentSet = new Set(already.map((r) => `${r.entityId}:${r.action}`));
    for (const { a, state } of crossed) {
      const action = state === 'warned' ? 'ai.agent.capWarn80' : 'ai.agent.capPaused';
      if (sentSet.has(`${a.id}:${action}`)) continue;
      const text = capAlertText(state, a.nameBn, a.monthMinor, a.monthlyCapMinor!, money);
      await (deps.send ?? ((x: string) => telegram(deps, x)))(text);
      await audit(deps.db, SYSTEM, { action, entityType: 'AiAgent', entityId: a.id, after: { monthMinor: a.monthMinor, monthlyCapMinor: a.monthlyCapMinor } }, { source: 'ai-control-room' });
    }
  } catch (e) {
    console.warn(`ai agent cap alerts: skipped (${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
  }
}
