// S15 · PR 330 (Blueprint B4.15 "say only what you were given"; C1.1-C1.6, A5.1-A5.6) — the sixth real AI-provider
// job dispatcher: wires the EXISTING Cost Book job `adminApprovalExplain` (PR 312, section "admin", owner `gyani`)
// to a live model call, through the same guardrail layers PR 304-324 already built and PR 325-329 first called in
// production — the master switch and per-agent on/off (`workingNow`), the agent's own routed model pick (PR
// 307/310), the monthly spend cap (PR 309), the shared usage ledger (PR 315) and the AI diary (PR 319).
//
// Owned by `gyani` (S15's own chief, C10's org chart — the same agent PR 325/328/329 already route as `personal`,
// since an approval-queue item can carry a customer's or a campaign's own name): this reuses the identical
// `personal` data-class routing every one of Gyani's other jobs already uses, never a second policy for the same
// chief, even though the item this PR first wires is Tirondaj's own growth-agent proposal (PR 269) — the Cost
// Book's own job, not the proposal's domain agent, decides whose routing and cap apply, exactly as PR 329 already
// established for Gyani explaining a review card that is really the fraud/duplicate engine's own output.
//
// Grounded, not invented (CLAUDE.md "think beyond the ask"; PR 326-329's own precedent): `facts` is never a new
// figure computed for this PR. It is always the caller's own already-built, already-localized words — today,
// Marketing › Ad platforms › Growth agent's own `what(p)`/`why(p)` sentences (growth-agent.ts, PR 269), the same
// title and reason line a person already sees on the proposal card. The model may only turn that into one fuller
// plain paragraph explaining *why the system is asking*; it is never handed the item's own decision (approve/
// reject, pause, raise or lower a budget), and the prompt itself (`prompts.ts`'s `APPROVAL_EXPLAIN_RULE`) forbids
// it from proposing, recommending or even naming one — CLAUDE.md rule 6 ("never without the owner's written OK:
// ... raising ad budgets ... anything irreversible") and the growth agent's own locked rule, "nothing changes until
// a person ... approves" (growth-agent.ts), are never touched by this PR: the AI note sits entirely beside the
// read-only proposal card, never wired to its Approve/Reject buttons.
//
// Additive like every job this chain has wired so far (C1.4): `approvalExplainOption`'s own `null` on any honest
// "no" — AI off, Gyani paused, no connection ready for the routed data class, the monthly cap already reached, or
// the model answered with nothing usable — leaves the proposal card exactly as it already was; the card is a
// complete, correct read either way, since every word on it already came from the deterministic growth model
// (`growth-model.ts`), never from this call.
import { createHash } from 'node:crypto';
import { aiWriterAdapters, createConnections, type AiWriter } from '@extas/adapters';
import { dayStart, ymdIn } from '@extas/metrics';
import type { PrismaClient } from '@extas/db/client';
import type { Vault } from '@extas/vault';
import type { AppResolver } from '../settings';
import { pricerFor } from '../exchange-rate';
import { agentDataClass, routeProvider } from './data-classes';
import { estimateMicrosFor, jobOf, MODEL_CATALOG, microsToUsdMinor, modelOf, type ModelCatalogEntry } from './cost-book';
import { recordDiaryEntry } from './diary';
import { isWriterProvider, listWriterOptions } from './model-picks';
import { agentCapState, wouldExceedCap } from './spend-cap';
import { recordAiUsage } from './usage-ledger';

/** The one agent and the one, already-existing Cost Book job this PR wires — `agents.ts`'s own `gyani` owns S15's
 * AI 360 control room (C10's org chart), and `cost-book.ts`'s own `adminApprovalExplain` row is the job this call
 * is billed as (no new Cost Book row: the catalogue stays at the count PR 329 left it). */
const APPROVAL_EXPLAIN_AGENT_KEY = 'gyani' as const;
const APPROVAL_EXPLAIN_JOB_KEY = 'adminApprovalExplain';
/** A prompt-side ceiling, not a store setting — one short paragraph, never the whole case file. */
const MAX_NOTE_CHARS = 250; // hardcode-ok: a prompt ceiling, not a business/charge limit

export interface ApprovalExplainAiDeps {
  db: PrismaClient;
  resolver: Pick<AppResolver, 'value'>;
  vault: Pick<Vault, 'get'> | null;
  now?: () => Date;
}

/** The real, already-decided words behind one approval-queue item — built by the caller from its own page (today,
 * Marketing › Ad platforms › Growth agent's own `what(p)`/`why(p)`, already localized), never from anything a
 * client posts and never including the item's own decision. */
export interface ApprovalExplainFacts {
  title: string;
  why: string[];
}

/** The model catalogue entry for `providerKey`, at the job's own recommended tier where one exists, else the
 * cheapest text model that provider has — the same helper PR 325-329's own dispatchers already use. */
function modelForProvider(providerKey: string, tier: ModelCatalogEntry['tier']): ModelCatalogEntry | null {
  const sameTier = MODEL_CATALOG.find((m) => m.providerKey === providerKey && m.kind === 'text' && m.tier === tier);
  if (sameTier) return sameTier;
  return MODEL_CATALOG.filter((m) => m.providerKey === providerKey && m.kind === 'text').sort((a, b) => (a.inputPerMillionMicros ?? 0) - (b.inputPerMillionMicros ?? 0))[0] ?? null;
}

/**
 * One plain, grounded paragraph explaining why an approval-queue item is asking, in `locale`, for the owner about
 * to decide. `null` on any honest "no" (AI off/paused, no ready connection for the routed data class, the monthly
 * cap would be exceeded, or the model answered with nothing usable) or on any failure — this function never
 * throws; the item's own deterministic title and reason (growth-model.ts) are a complete, correct read either way.
 * Never returns, and the prompt itself never asks for, a decision.
 */
export async function approvalExplainNote(deps: ApprovalExplainAiDeps, storeId: number, refId: string, locale: 'en' | 'bn', facts: ApprovalExplainFacts): Promise<string | null> {
  if (!facts.title.trim()) return null; // nothing to explain
  try {
    const agent = await deps.db.aiAgent.findUnique({ where: { key: APPROVAL_EXPLAIN_AGENT_KEY } });
    if (!agent || agent.archivedAt) return null;
    const masterOn = await deps.resolver.value('ai.enabled', { storeId });
    const workingNow = (masterOn || agent.keepOnWhenMasterOff) && agent.enabled;
    if (!workingNow) return null;

    const selectedProvider = agent.selectedProvider && isWriterProvider(agent.selectedProvider) ? agent.selectedProvider : null;
    const options = await listWriterOptions(deps.db);
    const selectedOpt = options.find((o) => o.provider === selectedProvider);
    const selectedReady = selectedProvider === null || Boolean(selectedOpt?.ready);
    const routing = routeProvider(agentDataClass(APPROVAL_EXPLAIN_AGENT_KEY), selectedProvider, selectedReady, options);
    if (!routing.effectiveProvider) return null;

    const job = jobOf(APPROVAL_EXPLAIN_JOB_KEY);
    const model = modelForProvider(routing.effectiveProvider, modelOf(job.recommendedModelKey).tier);
    if (!model) return null;

    const now = deps.now?.() ?? new Date();
    const timeZone = await deps.resolver.value('store.timeZone', { storeId });
    const day = ymdIn(now, timeZone);
    if (agent.monthlyCapMinor) {
      const monthStart = dayStart(`${day.slice(0, 7)}-01`, timeZone);
      const spent = await deps.db.aiUsageLedger.aggregate({ where: { agentId: agent.id, createdAt: { gte: monthStart, lte: now } }, _sum: { costMinor: true } });
      const monthMinor = spent._sum.costMinor ?? 0;
      if (agentCapState(monthMinor, agent.monthlyCapMinor) === 'paused') return null;
      const pricer = await pricerFor(deps.db, deps.resolver, storeId);
      const estMinor = pricer(microsToUsdMinor(estimateMicrosFor(job.usage, model)), 'USD', day)?.storeMinor;
      if (estMinor != null && wouldExceedCap(monthMinor, estMinor, agent.monthlyCapMinor)) return null;
    }

    const [testS, cacheS] = await Promise.all([deps.resolver.value('system.integrationTestTimeoutSeconds'), deps.resolver.value('system.integrationKeyCacheSeconds')]);
    const c = createConnections({ db: deps.db, vault: deps.vault ?? { get: async () => null }, adapters: aiWriterAdapters, secretCacheMs: cacheS * 1000, testTimeoutMs: testS * 1000 });
    const link = await c.use<AiWriter>('AI_PROVIDER', { storeId, provider: routing.effectiveProvider });
    if (link.mode === 'MOCK') return null; // defensive: `selectedReady` above already means this should not happen

    const draft = await link.api.draftApprovalExplainNote({ locale, facts: { title: facts.title, why: facts.why }, max: { body: MAX_NOTE_CHARS } });
    if (!draft.body.trim()) return null;

    // Idempotent per item + the exact words it explains: a repeat page view of the same still-waiting item reuses
    // the same ledger row rather than charging it again (the same convention PR 329's own review note already
    // uses); a changed title or reason (the figures moved since the last run) naturally hashes differently and so
    // earns its own, fresh explanation and charge.
    const idempotencyKey = `approval-explain:${refId}:${createHash('sha1').update(JSON.stringify(facts)).digest('hex')}`;
    const usage: typeof job.usage = draft.usage ? { kind: 'text', ...draft.usage } : job.usage;
    const recorded = await recordAiUsage({ db: deps.db, resolver: deps.resolver }, { idempotencyKey, storeId, agentKey: APPROVAL_EXPLAIN_AGENT_KEY, jobTypeKey: APPROVAL_EXPLAIN_JOB_KEY, modelKey: model.modelKey, usage, refType: 'AiApprovalRequest', refId });
    if (recorded.ok && !recorded.idempotent) {
      await recordDiaryEntry({ db: deps.db, resolver: deps.resolver, now: deps.now }, { storeId, agentKey: APPROVAL_EXPLAIN_AGENT_KEY, summaryBn: 'অনুমতির অপেক্ষায় থাকা একটা কাজের কারণ এআই বুঝিয়ে দিয়েছে — কোনো সিদ্ধান্ত নেয়নি।', refType: 'AiApprovalRequest', refId });
    }
    return draft.body;
  } catch {
    // Additive like every job this chain has wired so far (C1.4): any failure at all leaves the item's own
    // deterministic title and reason exactly as they were.
    return null;
  }
}

/** The callback a caller builds per approval-queue item: given that item's own already-built title/reason words
 * (never recomputed here) and the admin's own display language, either a grounded explanation paragraph (a real
 * call, fully guarded and logged) or `null`. */
export function approvalExplainOption(deps: ApprovalExplainAiDeps, storeId: number, refId: string, locale: 'en' | 'bn') {
  return (facts: ApprovalExplainFacts): Promise<string | null> => approvalExplainNote(deps, storeId, refId, locale, facts);
}
