// S15 · PR 327 (Blueprint B4.15 "say only what you were given"; C1.1-C1.6, A5.1-A5.6) — the third real AI-provider
// job dispatcher: wires Doot's own `seoMetaTags` Cost Book job (PR 312) to a live model call, through the same
// guardrail layers PR 304-324 already built and PR 325/326 first called in production — the master switch and
// per-agent on/off (`workingNow`), Doot's own model pick (PR 307) with PR 310's data-class policy applied on top,
// the monthly spend cap (PR 309), the shared usage ledger (PR 315) and the AI diary (PR 319).
//
// Unlike support, and the same as PR 326's product content job, Doot's SEO & meta work is `publicDraft` (Blueprint
// A5.3's own list — a search title and description a person reviews before it ever reaches a page), so a
// free-capable connection is allowed to run it and no PII masking is needed — a product's or category's own naming
// facts carry no customer data.
//
// Unlike support and product content, this job already had a real caller before this PR: `@extas/web`'s own
// `lib/seo/drafts.ts` (PR 221) already calls the already-built `draftSeo`/`AiSeoInput` pair (PR 221/306) for its
// "Draft" button on Website › SEO, but only through a plain, ungated `AI_PROVIDER` connection lookup — no master/
// agent switch, no routed model pick, no spend cap, no usage ledger row, no diary entry. This file is the real,
// guarded caller `drafts.ts` is wired to use first for every candidate page; `drafts.ts` keeps its own existing
// ungated practice-writer fallback for whenever this guarded path answers an honest "not now" (AI off, Doot paused,
// no connection ready for the routed data class, or the monthly cap already reached) — the batch "Draft" action
// must always produce something to review (CLAUDE.md CN-016 "nothing reaches the owner broken"; PR 324's own "every
// agent has a rule or template path that works without AI"), it just is not billed, logged or capped when it does.
//
// Grounding, not invention: `facts` is always the caller's own already-saved naming attributes of a product or
// category (the same shape `AiSeoInput.facts` already uses) — never anything a client posts.
import { createHash } from 'node:crypto';
import { aiWriterAdapters, createConnections, type AiDraftSubject, type AiSeoInput, type AiWriter } from '@extas/adapters';
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

/** The one agent and the one Cost Book job this PR wires — `agents.ts`'s own `doot` owns SEO & blog (C10's own
 * remit list), and `cost-book.ts`'s own `seoMetaTags` row is the job this call is billed as. */
const SEO_META_AGENT_KEY = 'doot' as const;
const SEO_META_JOB_KEY = 'seoMetaTags';

export interface SeoMetaAiDeps {
  db: PrismaClient;
  resolver: Pick<AppResolver, 'value'>;
  vault: Pick<Vault, 'get'> | null;
  now?: () => Date;
}

/** The real, already-saved naming facts a title and description may be grounded on — literally `AiSeoInput`'s own
 * `facts` shape (PR 221/306), built by the caller from the product's or category's own row, never from anything a
 * client posts. */
export type SeoMetaFacts = AiSeoInput['facts'];

export type SeoMetaResult = { ok: true; title: string; description: string; provider: string } | { ok: false; reason: 'AI_OFF' | 'NOT_READY' | 'CAP_EXCEEDED' | 'NO_ANSWER' };

/** The model catalogue entry for `providerKey`, at the job's own recommended tier where one exists, else the
 * cheapest text model that provider has — the same helper PR 325/326's own dispatchers already use. */
function modelForProvider(providerKey: string, tier: ModelCatalogEntry['tier']): ModelCatalogEntry | null {
  const sameTier = MODEL_CATALOG.find((m) => m.providerKey === providerKey && m.kind === 'text' && m.tier === tier);
  if (sameTier) return sameTier;
  return MODEL_CATALOG.filter((m) => m.providerKey === providerKey && m.kind === 'text').sort((a, b) => (a.inputPerMillionMicros ?? 0) - (b.inputPerMillionMicros ?? 0))[0] ?? null;
}

/**
 * Drafts one real, grounded search title and meta description for `subject`/`entityId`, in `locale`, from `facts` —
 * called once per candidate page by `drafts.ts`'s own "Draft" batch action. `ok: false` always carries a plain
 * reason (AI off/paused, no ready connection for Doot's routed data class, the monthly cap would be exceeded, or
 * the model answered with nothing usable) — the caller is expected to fall back to the practice writer on any
 * `ok: false`, so this function never throws for an honest "no"; it only throws for a genuine programmer error
 * (an unknown job/model key, which never happens with the constants above).
 */
export async function seoMetaDraft(deps: SeoMetaAiDeps, storeId: number, subject: AiDraftSubject, entityId: string, locale: 'en' | 'bn', facts: SeoMetaFacts, max: { title: number; description: number }): Promise<SeoMetaResult> {
  try {
    const agent = await deps.db.aiAgent.findUnique({ where: { key: SEO_META_AGENT_KEY } });
    if (!agent || agent.archivedAt) return { ok: false, reason: 'AI_OFF' };
    const masterOn = await deps.resolver.value('ai.enabled', { storeId });
    const workingNow = (masterOn || agent.keepOnWhenMasterOff) && agent.enabled;
    if (!workingNow) return { ok: false, reason: 'AI_OFF' };

    const selectedProvider = agent.selectedProvider && isWriterProvider(agent.selectedProvider) ? agent.selectedProvider : null;
    const options = await listWriterOptions(deps.db);
    const selectedOpt = options.find((o) => o.provider === selectedProvider);
    const selectedReady = selectedProvider === null || Boolean(selectedOpt?.ready);
    const routing = routeProvider(agentDataClass(SEO_META_AGENT_KEY), selectedProvider, selectedReady, options);
    if (!routing.effectiveProvider) return { ok: false, reason: 'NOT_READY' };

    const job = jobOf(SEO_META_JOB_KEY);
    const model = modelForProvider(routing.effectiveProvider, modelOf(job.recommendedModelKey).tier);
    if (!model) return { ok: false, reason: 'NOT_READY' };

    const now = deps.now?.() ?? new Date();
    const timeZone = await deps.resolver.value('store.timeZone', { storeId });
    const day = ymdIn(now, timeZone);
    if (agent.monthlyCapMinor) {
      const monthStart = dayStart(`${day.slice(0, 7)}-01`, timeZone);
      const spent = await deps.db.aiUsageLedger.aggregate({ where: { agentId: agent.id, createdAt: { gte: monthStart, lte: now } }, _sum: { costMinor: true } });
      const monthMinor = spent._sum.costMinor ?? 0;
      if (agentCapState(monthMinor, agent.monthlyCapMinor) === 'paused') return { ok: false, reason: 'CAP_EXCEEDED' };
      const pricer = await pricerFor(deps.db, deps.resolver, storeId);
      const estMinor = pricer(microsToUsdMinor(estimateMicrosFor(job.usage, model)), 'USD', day)?.storeMinor;
      if (estMinor != null && wouldExceedCap(monthMinor, estMinor, agent.monthlyCapMinor)) return { ok: false, reason: 'CAP_EXCEEDED' };
    }

    const [testS, cacheS] = await Promise.all([deps.resolver.value('system.integrationTestTimeoutSeconds'), deps.resolver.value('system.integrationKeyCacheSeconds')]);
    const c = createConnections({ db: deps.db, vault: deps.vault ?? { get: async () => null }, adapters: aiWriterAdapters, secretCacheMs: cacheS * 1000, testTimeoutMs: testS * 1000 });
    const link = await c.use<AiWriter>('AI_PROVIDER', { storeId, provider: routing.effectiveProvider });
    if (link.mode === 'MOCK') return { ok: false, reason: 'NOT_READY' }; // defensive: `selectedReady` above already means this should not happen

    const draft = await link.api.draftSeo({ subject, locale, facts, max });
    if (!draft.title.trim() || !draft.description.trim()) return { ok: false, reason: 'NO_ANSWER' };

    // Idempotent per page × language × batch run, the same run never charged twice for the same page on a retry;
    // a later "Draft" press on a page without a draft waiting is a genuinely new run, its own charge (the same
    // convention PR 326's own per-press idempotency key already uses).
    const idempotencyKey = `seo-meta:${subject}:${entityId}:${locale}:${createHash('sha1').update(`${day}:${draft.title}:${draft.description}`).digest('hex')}`;
    const refType = subject === 'category' ? 'Category' : 'Product';
    const usage: typeof job.usage = draft.usage ? { kind: 'text', ...draft.usage } : job.usage;
    const recorded = await recordAiUsage({ db: deps.db, resolver: deps.resolver }, { idempotencyKey, storeId, agentKey: SEO_META_AGENT_KEY, jobTypeKey: SEO_META_JOB_KEY, modelKey: model.modelKey, usage, refType, refId: entityId });
    if (recorded.ok && !recorded.idempotent) {
      await recordDiaryEntry({ db: deps.db, resolver: deps.resolver, now: deps.now }, { storeId, agentKey: SEO_META_AGENT_KEY, summaryBn: 'একটা পাতার সার্চ টাইটেল ও বর্ণনা এআই লিখে দিয়েছে, রিভিউর জন্য।', refType, refId: entityId });
    }
    return { ok: true, title: draft.title, description: draft.description, provider: routing.effectiveProvider };
  } catch {
    // Never breaks the batch "Draft" action (CLAUDE.md CN-016 "nothing reaches the owner broken"): the caller falls
    // back to the practice writer for any `ok: false`, this one included.
    return { ok: false, reason: 'NO_ANSWER' };
  }
}
