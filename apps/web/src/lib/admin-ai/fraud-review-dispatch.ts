// S15 · PR 329 (Blueprint B4.15 "say only what you were given"; C1.1-C1.6, A5.1-A5.6) — the fifth real AI-provider
// job dispatcher: wires the EXISTING Cost Book job `orderFraudJudge` (PR 312, section "orders", owner `gyani`) to a
// live model call, through the same guardrail layers PR 304-324 already built and PR 325-328 first called in
// production — the master switch and per-agent on/off (`workingNow`), the agent's own routed model pick
// (PR 307/310), the monthly spend cap (PR 309), the shared usage ledger (PR 315) and the AI diary (PR 319).
//
// Owned by `gyani` (S06's own stage owner, C10's org chart — the same agent PR 325/328 already route as
// `personal`): a review card's own matched orders and history carry a customer's own order history, so this reuses
// the same `personal` data-class routing every one of Gyani's other jobs already uses, never a second policy for
// the same chief.
//
// Grounded, not invented, reusing an existing shape rather than building one (CLAUDE.md "think beyond the ask";
// PR 326-328's own precedent): `facts` is never a new score or a new signal computed for this PR. It is always the
// admin order page's own already-built, already-localized `AlertExplainView` words (`alert.ts`'s `alertExplainView`,
// built from `@extas/orders`'s own `alertSummary`, PR 521) — the identical fired-rule lines, risk-signal words,
// matched-order summaries and history lines the review card already shows a staff member today. The model may only
// turn that into one plain paragraph explaining *why* the alert fired; it is never handed the card's own decision
// options or proposed action, and the prompt itself (`prompts.ts`'s `FRAUD_RULE`) forbids it from proposing,
// recommending or even naming a decision — CLAUDE.md rule 6 ("never without the owner's written OK: ... blocking
// anyone ... anything irreversible") and the fraud engine's own locked rule, "a rule only marks and proposes
// (cancel · hold · warn · allow) ... the order service and a person decide" (`duplicate-rules.ts`), are never
// touched by this PR: the AI note sits entirely inside the read-only explain panel, beside the card's existing
// buttons, never wired to any of them.
//
// Additive like every job this chain has wired so far (C1.4): `fraudReviewOption`'s own `null` on any honest "no"
// — AI off, Gyani paused, no connection ready for the routed data class, the monthly cap already reached, or the
// model answered with nothing usable — leaves the review card exactly as PR 521 already built it; the card is a
// complete, correct read either way, since every word on it already came from the deterministic rules/risk engines
// (`packages/orders/src/duplicate-rules.ts`, `risk-score.ts`), never from this call.
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

/** The one agent and the one, already-existing Cost Book job this PR wires — `agents.ts`'s own `gyani` owns S06's
 * fraud & duplicate engine (C10's org chart), and `cost-book.ts`'s own `orderFraudJudge` row is the job this call
 * is billed as (no new Cost Book row: the catalogue stays at the count PR 328 left it). */
const FRAUD_REVIEW_AGENT_KEY = 'gyani' as const;
const FRAUD_REVIEW_JOB_KEY = 'orderFraudJudge';
/** A prompt-side ceiling, not a store setting — one short paragraph, never the whole case file. */
const MAX_NOTE_CHARS = 400; // hardcode-ok: a prompt ceiling, not a business/charge limit

export interface FraudReviewAiDeps {
  db: PrismaClient;
  resolver: Pick<AppResolver, 'value'>;
  vault: Pick<Vault, 'get'> | null;
  now?: () => Date;
}

/** The real, already-decided words behind one review card — built by the caller from the admin order page's own
 * `alertExplainView` (`AlertExplainView`'s own `why`/`matches`/`history`, already localized), never from anything a
 * client posts and never including the card's own decision options or proposed action. */
export interface FraudReviewFacts {
  kind: 'duplicate' | 'risk';
  severity: string | null;
  why: string[];
  matches: string[];
  history: string[];
}

/** The model catalogue entry for `providerKey`, at the job's own recommended tier where one exists, else the
 * cheapest text model that provider has — the same helper PR 325-328's own dispatchers already use. */
function modelForProvider(providerKey: string, tier: ModelCatalogEntry['tier']): ModelCatalogEntry | null {
  const sameTier = MODEL_CATALOG.find((m) => m.providerKey === providerKey && m.kind === 'text' && m.tier === tier);
  if (sameTier) return sameTier;
  return MODEL_CATALOG.filter((m) => m.providerKey === providerKey && m.kind === 'text').sort((a, b) => (a.inputPerMillionMicros ?? 0) - (b.inputPerMillionMicros ?? 0))[0] ?? null;
}

/**
 * One plain, grounded paragraph explaining why a review card's alert fired, in `locale`, for the staff member about
 * to decide. `null` on any honest "no" (AI off/paused, no ready connection for the routed data class, the monthly
 * cap would be exceeded, or the model answered with nothing usable) or on any failure — this function never throws;
 * the card's own deterministic "why" list (PR 521) is a complete, correct read either way. Never returns, and the
 * prompt itself never asks for, a decision.
 */
export async function fraudReviewNote(deps: FraudReviewAiDeps, storeId: number, refId: string, locale: 'en' | 'bn', facts: FraudReviewFacts): Promise<string | null> {
  if (!facts.why.length && !facts.matches.length && !facts.history.length) return null; // nothing to explain
  try {
    const agent = await deps.db.aiAgent.findUnique({ where: { key: FRAUD_REVIEW_AGENT_KEY } });
    if (!agent || agent.archivedAt) return null;
    const masterOn = await deps.resolver.value('ai.enabled', { storeId });
    const workingNow = (masterOn || agent.keepOnWhenMasterOff) && agent.enabled;
    if (!workingNow) return null;

    const selectedProvider = agent.selectedProvider && isWriterProvider(agent.selectedProvider) ? agent.selectedProvider : null;
    const options = await listWriterOptions(deps.db);
    const selectedOpt = options.find((o) => o.provider === selectedProvider);
    const selectedReady = selectedProvider === null || Boolean(selectedOpt?.ready);
    const routing = routeProvider(agentDataClass(FRAUD_REVIEW_AGENT_KEY), selectedProvider, selectedReady, options);
    if (!routing.effectiveProvider) return null;

    const job = jobOf(FRAUD_REVIEW_JOB_KEY);
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

    const draft = await link.api.draftFraudReviewNote({
      locale,
      facts: { kind: facts.kind, severity: facts.severity ?? undefined, why: facts.why, matches: facts.matches, history: facts.history },
      max: { body: MAX_NOTE_CHARS },
    });
    if (!draft.body.trim()) return null;

    // Idempotent per alert + the exact words it explains: a repeat page view of the same still-open review reuses
    // the same ledger row rather than charging it again (the same convention PR 325's own support reply already
    // uses for its own chat surface); an edit that changes the card's own words (PR 142's re-run after an edit)
    // naturally hashes differently and so earns its own, fresh explanation and charge.
    const idempotencyKey = `fraud-review:${refId}:${createHash('sha1').update(JSON.stringify(facts)).digest('hex')}`;
    const usage: typeof job.usage = draft.usage ? { kind: 'text', ...draft.usage } : job.usage;
    const recorded = await recordAiUsage({ db: deps.db, resolver: deps.resolver }, { idempotencyKey, storeId, agentKey: FRAUD_REVIEW_AGENT_KEY, jobTypeKey: FRAUD_REVIEW_JOB_KEY, modelKey: model.modelKey, usage, refType: 'FraudAlert', refId });
    if (recorded.ok && !recorded.idempotent) {
      await recordDiaryEntry({ db: deps.db, resolver: deps.resolver, now: deps.now }, { storeId, agentKey: FRAUD_REVIEW_AGENT_KEY, summaryBn: 'একটা রিভিউ অ্যালার্টের কারণ এআই বুঝিয়ে দিয়েছে, রিভিউর জন্য — কোনো সিদ্ধান্ত নেয়নি।', refType: 'FraudAlert', refId });
    }
    return draft.body;
  } catch {
    // Additive like every job this chain has wired so far (C1.4): any failure at all leaves the review card's own
    // deterministic words exactly as they were.
    return null;
  }
}

/** The callback the order detail page builds per review card: given that card's own already-built
 * `AlertExplainView` words (never recomputed here) and the admin's own display language, either a grounded
 * explanation paragraph (a real call, fully guarded and logged) or `null`. */
export function fraudReviewOption(deps: FraudReviewAiDeps, storeId: number, alertId: string, locale: 'en' | 'bn') {
  return (facts: FraudReviewFacts): Promise<string | null> => fraudReviewNote(deps, storeId, alertId, locale, facts);
}
