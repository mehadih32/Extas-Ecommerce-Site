// S15 · PR 335 (Blueprint B8 "Competitor Teardown agent", B8.1, B8.2, B8.4; B4.15 "say only what you were given") —
// the eleventh real AI-provider job dispatcher, and the first slice of the Blueprint's own +3-PR split (B8.4: "+3
// PRs in S15: journey walker · comparison and report engine · saved competitors, scheduling and change alerts") —
// this PR builds the journey walker alone; the comparison/report engine (PR 336) and the saved/scheduled list
// (PR 337) are separate, later PRs, same as every multi-PR feature in this chain keeps its own PR's scope narrow.
//
// Wires a NEW Cost Book job, `reportsCompetitorJourneyStep` (PR 312's own `reportsCompetitorScan` is "reads one
// competitor's public PRICE for the same or similar item" — a much smaller job; reusing it here would misstate its
// own cost estimate, since a whole page's own text runs to thousands of input tokens, not a few hundred).
//
// Owned by `gyani` (C10's org chart; the same chief PR 325/328-330/332/333 already route as `personal`). What this
// job reads is a competitor's own PUBLIC page — no customer, no owner, no order data at all — but one chief keeps
// one routing policy, never a second one for the same remit (PR 333's own precedent).
//
// Grounded, not invented (CLAUDE.md rule 1): each step's observation is grounded only in that one page's own
// already-fetched HTML, reduced to plain text by `@extas/catalogue`'s own `plainText` (PR 33's helper, reused, not
// rebuilt) and cut to `MAX_PAGE_TEXT_CHARS`. The prompt (`prompts.ts`'s new `COMPETITOR_STEP_RULE`) forbids
// inventing anything the page's own text does not show, forbids naming a price or a decision, and forbids copying
// the page's own wording or code verbatim — Blueprint B8.2's own limit ("ideas and patterns are studied; wording
// and design are not lifted") — describing a pattern, never quoting it.
//
// Honest limits, stated plainly rather than worked around (Blueprint B8.2's own three "will not" rules):
//  - No real browser automation exists here (no headless-browser/rendering key, no JS execution is run). Each
//    "step" is one plain http(s) GET of a URL the caller already names (the owner's or Gyani's own saved list is
//    PR 337's job; this PR takes the steps as a plain argument), read through the SAME SSRF-safe page reader
//    connection PR 33 already built (`pageReader`, Keys & connections) — never a second, duplicate network reader.
//    Selecting a variant/size and pressing "add to cart" are interactive actions a plain GET cannot perform, so
//    this walk only reaches pages already reachable by an address in hand — it never clicks, never fills or
//    submits a form, and (automatically, since nothing here is ever POSTed to a third-party site) never places a
//    real order, never logs in and never enters a payment flow — Blueprint B8.2's limits hold by construction, not
//    by a separate check.
//  - Screenshots are not built — that needs a real headless-browser/rendering provider, and no key exists for one
//    yet. An honest gap for a later PR, the same shape PR 331/332 already left open for their own missing
//    providers.
//  - A step the reader cannot read at all (an SSRF-blocked address, a timeout, a site error, a non-HTML answer) is
//    reported plainly as `blocked: true` with the reason — never retried, never worked around (B8.2: "the agent
//    reports that plainly instead of working around it").
//
// Each step's own real read (title, or why it could not be read) always happens and is always returned; only the
// short AI-written observation on top of it is ever additive and may honestly be `null` — while AI 360 is off,
// Gyani is paused, no connection is ready for Gyani's routed data class, the monthly cap would be exceeded, or the
// model answered with nothing usable — exactly the same additive shape every dispatcher before this one uses
// (C1.4).
import { createHash } from 'node:crypto';
import { plainText } from '@extas/catalogue';
import { aiWriterAdapters, createConnections, isPageReadError, pageReaderAdapters, type AiWriter, type PageLimits, type PageReader } from '@extas/adapters';
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

/** The one agent and the one, NEW Cost Book job this PR adds (no existing job covers a whole page's own structural
 * read — see the header comment for why `reportsCompetitorScan` is not reused). */
const COMPETITOR_AGENT_KEY = 'gyani' as const;
const COMPETITOR_JOB_KEY = 'reportsCompetitorJourneyStep';
/** B8.1's own four stages (category, product, cart, checkout) — a processing ceiling, not a business number. */
const MAX_STEPS = 4; // hardcode-ok: a walk-length ceiling, not a price or policy number
const MAX_PAGE_TEXT_CHARS = 6000; // hardcode-ok: a prompt ceiling, not a business/charge limit
const MAX_NOTE_CHARS = 350; // hardcode-ok: a prompt ceiling
/** The same shape PR 33's own Test button uses for its one read — a processing ceiling, not a business number. */
const READ_LIMITS: PageLimits = { maxBytes: 2_000_000, timeoutMs: 10_000, maxRedirects: 3 };

export interface CompetitorJourneyAiDeps {
  db: PrismaClient;
  resolver: Pick<AppResolver, 'value'>;
  vault: Pick<Vault, 'get'> | null;
  now?: () => Date;
}

/** One step the caller already has a real address for — the owner's or Gyani's own saved list is PR 337's job;
 * this PR takes the steps as a plain argument. `label` is never invented here (B8.1's own stage names, or
 * whatever the caller names the step). */
export interface CompetitorJourneyStepInput {
  label: string;
  url: string;
}

export interface CompetitorJourneyStepResult {
  label: string;
  url: string;
  /** The page's own `<title>`, when the read succeeded. */
  title: string | null;
  /** True when the page could not be read at all (SSRF-blocked, timed out, a site error, not HTML) — reported
   * plainly, never retried or worked around (Blueprint B8.2). */
  blocked: boolean;
  blockReason: string | null;
  /** The grounded, additive observation — `null` on any honest "no" (AI off/paused, no ready connection, the
   * monthly cap, a malformed answer) or whenever the step itself is blocked (nothing to ground a note on). */
  note: string | null;
}

/** The model catalogue entry for `providerKey`, at the job's own recommended tier where one exists, else the
 * cheapest text model that provider has — the same helper PR 325-334's own dispatchers already use. */
function modelForProvider(providerKey: string, tier: ModelCatalogEntry['tier']): ModelCatalogEntry | null {
  const sameTier = MODEL_CATALOG.find((m) => m.providerKey === providerKey && m.kind === 'text' && m.tier === tier);
  if (sameTier) return sameTier;
  return MODEL_CATALOG.filter((m) => m.providerKey === providerKey && m.kind === 'text').sort((a, b) => (a.inputPerMillionMicros ?? 0) - (b.inputPerMillionMicros ?? 0))[0] ?? null;
}

/** The SAME SSRF-safe page reader connection "import from a link" (PR 33) already uses — never a second, duplicate
 * network reader. Runs on the mock's sample page until the owner connects a real page reader in Keys & connections
 * (A1.3), exactly as PR 33's own feature does; that mock behaviour is intentional, not bypassed here. */
async function pageReaderFor(deps: CompetitorJourneyAiDeps, storeId: number): Promise<PageReader> {
  const [testS, cacheS] = await Promise.all([deps.resolver.value('system.integrationTestTimeoutSeconds'), deps.resolver.value('system.integrationKeyCacheSeconds')]);
  const c = createConnections({ db: deps.db, vault: deps.vault ?? { get: async () => null }, adapters: pageReaderAdapters, secretCacheMs: cacheS * 1000, testTimeoutMs: testS * 1000 });
  const link = await c.use<PageReader>('OTHER', { storeId, provider: 'pageReader' });
  return link.api;
}

/**
 * One step's own grounded observation, or `null` on any honest "no" — never throws. `pageText`/`title` are this
 * one step's own already-fetched page (never a second read), already reduced to plain text and cut to
 * `MAX_PAGE_TEXT_CHARS` before the model ever sees it.
 */
async function stepNote(deps: CompetitorJourneyAiDeps, storeId: number, walkId: string, locale: 'en' | 'bn', label: string, url: string, title: string | null, pageText: string): Promise<string | null> {
  if (!pageText.trim()) return null; // nothing to ground an observation on
  try {
    const agent = await deps.db.aiAgent.findUnique({ where: { key: COMPETITOR_AGENT_KEY } });
    if (!agent || agent.archivedAt) return null;
    const masterOn = await deps.resolver.value('ai.enabled', { storeId });
    const workingNow = (masterOn || agent.keepOnWhenMasterOff) && agent.enabled;
    if (!workingNow) return null;

    const selectedProvider = agent.selectedProvider && isWriterProvider(agent.selectedProvider) ? agent.selectedProvider : null;
    const options = await listWriterOptions(deps.db);
    const selectedOpt = options.find((o) => o.provider === selectedProvider);
    const selectedReady = selectedProvider === null || Boolean(selectedOpt?.ready);
    const routing = routeProvider(agentDataClass(COMPETITOR_AGENT_KEY), selectedProvider, selectedReady, options);
    if (!routing.effectiveProvider) return null;

    const job = jobOf(COMPETITOR_JOB_KEY);
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

    const draft = await link.api.draftCompetitorStep({
      locale,
      facts: { stepLabel: label, url, pageTitle: title ?? undefined, pageText },
      max: { body: MAX_NOTE_CHARS },
    });
    if (!draft.body.trim()) return null;

    // Idempotent per walk + step + the page's own current text: a repeat read of the same still-unchanged page
    // reuses the same ledger row rather than charging it again (the same convention PR 329/333's own dispatchers
    // already use); a page that changed naturally hashes differently and so earns its own, fresh observation and
    // charge.
    const idempotencyKey = `competitor-step:${walkId}:${createHash('sha1').update(`${label}\u0000${url}\u0000${pageText}`).digest('hex')}`;
    const usage: typeof job.usage = draft.usage ? { kind: 'text', ...draft.usage } : job.usage;
    const recorded = await recordAiUsage({ db: deps.db, resolver: deps.resolver }, { idempotencyKey, storeId, agentKey: COMPETITOR_AGENT_KEY, jobTypeKey: COMPETITOR_JOB_KEY, modelKey: model.modelKey, usage, refType: 'CompetitorJourneyStep', refId: walkId });
    if (recorded.ok && !recorded.idempotent) {
      await recordDiaryEntry({ db: deps.db, resolver: deps.resolver, now: deps.now }, { storeId, agentKey: COMPETITOR_AGENT_KEY, summaryBn: `একটা প্রতিদ্বন্দ্বীর পাতার একটা ধাপ ("${label}") দেখে এআই এক লাইনে যা দেখল লিখে দিয়েছে — কোনো দাম বা সিদ্ধান্ত নয়।`, refType: 'CompetitorJourneyStep', refId: walkId });
    }
    return draft.body;
  } catch {
    // Additive like every job this chain has wired so far (C1.4): any failure at all leaves this step's own real
    // read (title, or why it could not be read) exactly as it was, with no observation on top.
    return null;
  }
}

/**
 * Walks up to `MAX_STEPS` already-named pages one plain http(s) GET at a time, through the SSRF-safe page reader
 * connection (PR 33's `pageReader`, Keys & connections). Each step always reports its own real read; the AI
 * observation on top is additive and may honestly be `null`. Never throws — a step the reader cannot read is
 * reported as `blocked: true` with the reason, and the walk continues to the next step.
 */
export async function walkCompetitorJourney(deps: CompetitorJourneyAiDeps, storeId: number, walkId: string, locale: 'en' | 'bn', steps: CompetitorJourneyStepInput[]): Promise<CompetitorJourneyStepResult[]> {
  const reader = await pageReaderFor(deps, storeId);
  const bounded = steps.slice(0, MAX_STEPS);
  const out: CompetitorJourneyStepResult[] = [];
  for (const step of bounded) {
    try {
      const page = await reader.read(step.url, READ_LIMITS);
      const title = page.html.match(/<title[^>]*>([^<]{0,200})/i)?.[1]?.trim() ?? null;
      const text = plainText(page.html, MAX_PAGE_TEXT_CHARS);
      const note = await stepNote(deps, storeId, walkId, locale, step.label, step.url, title, text);
      out.push({ label: step.label, url: step.url, title, blocked: false, blockReason: null, note });
    } catch (e) {
      const reason = isPageReadError(e) ? e.message : 'could not read this page';
      out.push({ label: step.label, url: step.url, title: null, blocked: true, blockReason: reason, note: null });
    }
  }
  return out;
}
