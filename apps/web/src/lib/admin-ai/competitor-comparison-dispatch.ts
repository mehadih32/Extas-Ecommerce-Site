// S15 · PR 336 (Blueprint B8 "Competitor Teardown agent", B8.3, B8.4; B4.15 "say only what you were given") — the
// Competitor Teardown agent's SECOND job, the comparison and report engine (B8.4's own +3-PR split: "journey
// walker (335) · comparison and report engine (336) · saved competitors, scheduling and change alerts (337)").
//
// Builds Blueprint B8.3's own report, in order:
//  1. "Their journey, step by step" — already PR 335's own walk result (`CompetitorJourneyStepResult[]`),
//     unchanged, never re-read here.
//  2. "A side-by-side table — their site versus EXTAS" — a deterministic pairing by label, pure code
//     (`pairCompetitorSteps`), never the model's own guess. A step with no matching page of ours (the caller gave
//     none, or its own label does not match) is marked honestly `ours: null`, never invented.
//  3-5. "Each difference judged" / "a recommendation per item" / "Claude's own view" — the model's own job
//     (`draftCompetitorComparison`), grounded only in each row's already-grounded facts (title, blocked flag, and
//     the short observation PR 335's own job already wrote for it) — never raw page text a second time, never a
//     price or a policy decision.
//  6. "A short list of what EXTAS already does better" — the same model call's own `extasAdvantages`, kept only
//     when grounded in a note the caller actually gave (prompts.ts's own rule forbids crediting an untold detail).
//
// Wires a NEW Cost Book job, `reportsCompetitorComparison` (catalogue 67 -> 68 jobs). Owned by `gyani` — the same
// routing policy PR 335's own journey-walker job already uses for this remit (PR 333's own precedent: one chief,
// one routing policy, never a second one for the same remit).
//
// Honest limits: the deterministic side-by-side table (parts 1-2) needs no AI call at all and is ALWAYS returned,
// even while AI 360 is off — only the judgement on top (parts 3-6) is additive and may honestly be `null`/empty
// for every row, the same additive shape every dispatcher before this one uses (C1.4). A step whose own real read
// was `blocked` is passed to the model as "this page could not be read", never invented as if it had been seen.
import { createHash } from 'node:crypto';
import { aiWriterAdapters, createConnections, type AiWriter } from '@extas/adapters';
import { dayStart, ymdIn } from '@extas/metrics';
import type { PrismaClient } from '@extas/db/client';
import type { Vault } from '@extas/vault';
import type { AppResolver } from '../settings';
import { pricerFor } from '../exchange-rate';
import { agentDataClass, routeProvider } from './data-classes';
import { estimateMicrosFor, jobOf, MODEL_CATALOG, microsToUsdMinor, modelOf, type ModelCatalogEntry } from './cost-book';
import type { CompetitorJourneyStepResult } from './competitor-journey-dispatch';
import { recordDiaryEntry } from './diary';
import { isWriterProvider, listWriterOptions } from './model-picks';
import { agentCapState, wouldExceedCap } from './spend-cap';
import { recordAiUsage } from './usage-ledger';

/** The one agent and the one, NEW Cost Book job this PR adds — see the header comment for why it is a genuinely
 * new job, not a reuse of PR 335's own (differently-shaped, differently-costed) step observation. */
const COMPARISON_AGENT_KEY = 'gyani' as const;
const COMPARISON_JOB_KEY = 'reportsCompetitorComparison';
/** Prompt ceilings, not business/charge limits. */
const MAX_REASON_CHARS = 200; // hardcode-ok: a prompt ceiling
const MAX_CLAUDES_VIEW_CHARS = 500; // hardcode-ok: a prompt ceiling
const MAX_ADVANTAGE_ITEMS = 6; // hardcode-ok: a prompt ceiling (Blueprint B8.3.6's "short list")
const MAX_ADVANTAGE_CHARS = 150; // hardcode-ok: a prompt ceiling

export interface CompetitorComparisonAiDeps {
  db: PrismaClient;
  resolver: Pick<AppResolver, 'value'>;
  vault: Pick<Vault, 'get'> | null;
  now?: () => Date;
}

/** One already-walked step of theirs, paired with the matching already-walked step of ours (by label, case- and
 * whitespace-insensitive) — `ours` is honestly `null` when the caller gave no matching step, never invented. */
export interface SideBySideStep {
  label: string;
  theirs: CompetitorJourneyStepResult;
  ours: CompetitorJourneyStepResult | null;
}

export type ComparisonVerdict = 'they_better' | 'we_better' | 'neither_matters';
export type ComparisonRecommendation = 'pick' | 'pick_with_changes' | 'skip';

export interface ComparisonRow extends SideBySideStep {
  /** `null` on any honest "no" judgement at all (AI off/paused, no ready connection, the monthly cap, a
   * malformed answer) — the row's own already-walked facts (`theirs`/`ours`) are returned regardless. */
  verdict: ComparisonVerdict | null;
  recommendation: ComparisonRecommendation | null;
  reason: string | null;
}

export interface CompetitorComparisonReport {
  rows: ComparisonRow[];
  /** Blueprint B8.3.5 — may honestly be `null` (no judgement ran, or the model found nothing worth adding). */
  claudesView: string | null;
  /** Blueprint B8.3.6 — may honestly be empty. */
  extasAdvantages: string[];
}

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase();
}

/** Blueprint B8.3's own "side-by-side table — their site versus EXTAS, one row per step" — pure, deterministic
 * code, never the model's own guess at which step matches which. */
export function pairCompetitorSteps(theirs: CompetitorJourneyStepResult[], ours: CompetitorJourneyStepResult[]): SideBySideStep[] {
  const byLabel = new Map(ours.map((o) => [normalizeLabel(o.label), o]));
  return theirs.map((t) => ({ label: t.label, theirs: t, ours: byLabel.get(normalizeLabel(t.label)) ?? null }));
}

/** The model catalogue entry for `providerKey`, at the job's own recommended tier where one exists, else the
 * cheapest text model that provider has — the same helper PR 325-335's own dispatchers already use. */
function modelForProvider(providerKey: string, tier: ModelCatalogEntry['tier']): ModelCatalogEntry | null {
  const sameTier = MODEL_CATALOG.find((m) => m.providerKey === providerKey && m.kind === 'text' && m.tier === tier);
  if (sameTier) return sameTier;
  return MODEL_CATALOG.filter((m) => m.providerKey === providerKey && m.kind === 'text').sort((a, b) => (a.inputPerMillionMicros ?? 0) - (b.inputPerMillionMicros ?? 0))[0] ?? null;
}

interface Judgement {
  rows: Map<string, { verdict: ComparisonVerdict; recommendation: ComparisonRecommendation; reason: string }>;
  claudesView: string | null;
  extasAdvantages: string[];
}

/**
 * The model's own judgement over an already-paired side-by-side table, or `null` on any honest "no" — never
 * throws. Grounded only in each row's already-grounded facts (title, blocked flag, PR 335's own already-written
 * observation) — never raw page text, never a price.
 */
async function comparisonJudgement(deps: CompetitorComparisonAiDeps, storeId: number, reportId: string, locale: 'en' | 'bn', paired: SideBySideStep[]): Promise<Judgement | null> {
  if (!paired.length) return null;
  try {
    const agent = await deps.db.aiAgent.findUnique({ where: { key: COMPARISON_AGENT_KEY } });
    if (!agent || agent.archivedAt) return null;
    const masterOn = await deps.resolver.value('ai.enabled', { storeId });
    const workingNow = (masterOn || agent.keepOnWhenMasterOff) && agent.enabled;
    if (!workingNow) return null;

    const selectedProvider = agent.selectedProvider && isWriterProvider(agent.selectedProvider) ? agent.selectedProvider : null;
    const options = await listWriterOptions(deps.db);
    const selectedOpt = options.find((o) => o.provider === selectedProvider);
    const selectedReady = selectedProvider === null || Boolean(selectedOpt?.ready);
    const routing = routeProvider(agentDataClass(COMPARISON_AGENT_KEY), selectedProvider, selectedReady, options);
    if (!routing.effectiveProvider) return null;

    const job = jobOf(COMPARISON_JOB_KEY);
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

    const facts = {
      steps: paired.map((p) => ({
        label: p.label,
        theirs: { blocked: p.theirs.blocked, title: p.theirs.title, note: p.theirs.note },
        ours: p.ours ? { blocked: p.ours.blocked, title: p.ours.title, note: p.ours.note } : null,
      })),
    };
    const draft = await link.api.draftCompetitorComparison({
      locale,
      facts,
      max: { reason: MAX_REASON_CHARS, claudesView: MAX_CLAUDES_VIEW_CHARS, advantageItems: MAX_ADVANTAGE_ITEMS, advantageLength: MAX_ADVANTAGE_CHARS },
    });
    if (!draft.rows.length) return null;

    // Idempotent per report + the paired table's own current facts: a repeat judgement of the same still-unchanged
    // walk reuses the same ledger row rather than charging it again (PR 329/333/335's own convention); a walk
    // whose own facts changed hashes differently and so earns its own, fresh judgement and charge.
    const idempotencyKey = `competitor-comparison:${reportId}:${createHash('sha1').update(JSON.stringify(facts)).digest('hex')}`;
    const usage: typeof job.usage = draft.usage ? { kind: 'text', ...draft.usage } : job.usage;
    const recorded = await recordAiUsage({ db: deps.db, resolver: deps.resolver }, { idempotencyKey, storeId, agentKey: COMPARISON_AGENT_KEY, jobTypeKey: COMPARISON_JOB_KEY, modelKey: model.modelKey, usage, refType: 'CompetitorComparisonReport', refId: reportId });
    if (recorded.ok && !recorded.idempotent) {
      await recordDiaryEntry({ db: deps.db, resolver: deps.resolver, now: deps.now }, { storeId, agentKey: COMPARISON_AGENT_KEY, summaryBn: 'একটা প্রতিদ্বন্দ্বীর হাঁটা আমাদের নিজের পাতার সঙ্গে পাশাপাশি রেখে এআই একটা তুলনা-রিপোর্ট লিখেছে — কোনো দাম বা পলিসি সিদ্ধান্ত নয়।', refType: 'CompetitorComparisonReport', refId: reportId });
    }

    const rows = new Map(draft.rows.map((r) => [r.label, { verdict: r.verdict, recommendation: r.recommendation, reason: r.reason }]));
    return { rows, claudesView: draft.claudesView, extasAdvantages: draft.extasAdvantages };
  } catch {
    // Additive like every job this chain has wired so far (C1.4): any failure at all leaves the deterministic
    // side-by-side table exactly as it was, with no judgement on top.
    return null;
  }
}

/**
 * Builds Blueprint B8.3's own report from two already-walked journeys (PR 335's own `walkCompetitorJourney`, run
 * once for the competitor and once for our own matching pages — never a third network read here). The
 * deterministic side-by-side table (parts 1-2) is always returned; the model's own judgement on top (parts 3-6)
 * is additive and may honestly be absent for every row. Never throws.
 */
export async function buildCompetitorComparisonReport(deps: CompetitorComparisonAiDeps, storeId: number, reportId: string, locale: 'en' | 'bn', theirs: CompetitorJourneyStepResult[], ours: CompetitorJourneyStepResult[]): Promise<CompetitorComparisonReport> {
  const paired = pairCompetitorSteps(theirs, ours);
  const judgement = await comparisonJudgement(deps, storeId, reportId, locale, paired);
  const rows: ComparisonRow[] = paired.map((p) => {
    const j = judgement?.rows.get(p.label) ?? null;
    return { ...p, verdict: j?.verdict ?? null, recommendation: j?.recommendation ?? null, reason: j?.reason ?? null };
  });
  return { rows, claudesView: judgement?.claudesView ?? null, extasAdvantages: judgement?.extasAdvantages ?? [] };
}
