// S15 · PR 326 (Blueprint B4.15 "say only what you were given"; C1.1-C1.6, A5.1-A5.6) — the product content agent's
// own real caller: wires Doot's own `mktProductDescription` Cost Book job (PR 312) to a live model call, through
// the same guardrail layers PR 304-324 already built and PR 325 first called in production for support — the
// master switch and per-agent on/off (`workingNow`), Doot's own model pick (PR 307) with PR 310's data-class policy
// applied on top, the monthly spend cap (PR 309), the shared usage ledger (PR 315) and the AI diary (PR 319).
//
// Unlike support, Doot's own work is `publicDraft` (Blueprint A5.3's own list — content a person reviews before it
// goes out), so a free-capable connection is allowed to run it (`data-classes.ts`'s `routeProvider` never downgrades
// it) and no PII masking is needed — a product's own attributes carry no customer data.
//
// Grounding, not invention: the model is handed only a product's own already-saved attributes (its name, brand,
// category, fabric, colours, sizes and care text) — never a size, material, feature, price or promise that is not
// already on the row (the same "say only what you were given" rule `prompts.ts` already shares across every draft
// kind). `facts` always comes from the caller's own read of the real `ProductView` (`@extas/catalogue`'s
// `getProduct`), never from a request body — so nothing a client sends can ever pass as a grounded fact.
//
// Scope decision (CLAUDE.md "think beyond the ask" + PR 325's own known-limitation note): this is a deliberate,
// explicit action a staff member presses ("Write with AI" on the product edit page), never a background call made
// on every page view. Support's own rule-based draft already gives the model something to rephrase on every view of
// an open conversation; a product description has no such existing "draft" moment to hook into, and firing a real
// call on every view of every description-less product (there can be hundreds) would be exactly the unbounded-cost
// shape PR 325 already flags as a known limitation, not something to repeat by default here. Each press is billed
// once (a fresh `idempotencyKey` per call, not a content hash) — a repeat press is a genuinely new, deliberate ask,
// same as any other explicit admin action, not a page reload to dedupe against.
import { randomUUID } from 'node:crypto';
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

/** The one agent and the one Cost Book job this PR wires — `agents.ts`'s own `doot` owns marketing/SEO/social
 * content (C10's own remit list), and `cost-book.ts`'s own `mktProductDescription` row is the job this call is
 * billed as. */
const PRODUCT_CONTENT_AGENT_KEY = 'doot' as const;
const PRODUCT_DESCRIPTION_JOB_KEY = 'mktProductDescription';
/** A prompt-side ceiling, not a store setting — `productInput`'s own `descriptionEn`/`descriptionBn` column still
 * allows up to 10,000 characters; this only keeps one draft at a sensible shop-page length. */
const MAX_DESCRIPTION_CHARS = 900; // hardcode-ok: a prompt ceiling, not a business/charge limit

export interface ProductContentAiDeps {
  db: PrismaClient;
  resolver: Pick<AppResolver, 'value'>;
  vault: Pick<Vault, 'get'> | null;
  now?: () => Date;
}

/** The real, already-saved attributes a description may be grounded on — built by the caller from `@extas/catalogue`'s
 * own `ProductView`, never from anything a client posts. */
export interface ProductDescriptionFacts {
  nameEn: string;
  brand?: string | null;
  category?: string | null;
  fabric?: string | null;
  colours?: string[];
  sizes?: string[];
  careEn?: string | null;
}

export type ProductDescriptionResult = { ok: true; body: string } | { ok: false; reason: 'AI_OFF' | 'NOT_READY' | 'CAP_EXCEEDED' | 'NO_ANSWER' };

/** The model catalogue entry for `providerKey`, at the job's own recommended tier where one exists, else the
 * cheapest text model that provider has — the same helper PR 325's `support-dispatch.ts` already uses. */
function modelForProvider(providerKey: string, tier: ModelCatalogEntry['tier']): ModelCatalogEntry | null {
  const sameTier = MODEL_CATALOG.find((m) => m.providerKey === providerKey && m.kind === 'text' && m.tier === tier);
  if (sameTier) return sameTier;
  return MODEL_CATALOG.filter((m) => m.providerKey === providerKey && m.kind === 'text').sort((a, b) => (a.inputPerMillionMicros ?? 0) - (b.inputPerMillionMicros ?? 0))[0] ?? null;
}

/**
 * Drafts one real, grounded shop-facing description for `productId`, in `locale`, from `facts` — the one explicit
 * "Write with AI" action a staff member presses on the product edit page. `ok: false` always carries a plain reason
 * (AI off/paused, no ready connection for Doot's routed data class, the monthly cap would be exceeded, or the model
 * answered with nothing usable) — this function never throws for an honest "no" the admin page can show as a
 * notice; it only throws for a genuine programmer error (an unknown job/model key, which never happens with the
 * constants above).
 */
export async function productDescriptionDraft(deps: ProductContentAiDeps, storeId: number, productId: string, locale: 'en' | 'bn', facts: ProductDescriptionFacts): Promise<ProductDescriptionResult> {
  try {
    const agent = await deps.db.aiAgent.findUnique({ where: { key: PRODUCT_CONTENT_AGENT_KEY } });
    if (!agent || agent.archivedAt) return { ok: false, reason: 'AI_OFF' };
    const masterOn = await deps.resolver.value('ai.enabled', { storeId });
    const workingNow = (masterOn || agent.keepOnWhenMasterOff) && agent.enabled;
    if (!workingNow) return { ok: false, reason: 'AI_OFF' };

    const selectedProvider = agent.selectedProvider && isWriterProvider(agent.selectedProvider) ? agent.selectedProvider : null;
    const options = await listWriterOptions(deps.db);
    const selectedOpt = options.find((o) => o.provider === selectedProvider);
    const selectedReady = selectedProvider === null || Boolean(selectedOpt?.ready);
    const routing = routeProvider(agentDataClass(PRODUCT_CONTENT_AGENT_KEY), selectedProvider, selectedReady, options);
    if (!routing.effectiveProvider) return { ok: false, reason: 'NOT_READY' };

    const job = jobOf(PRODUCT_DESCRIPTION_JOB_KEY);
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

    const draft = await link.api.draftProductDescription({
      locale,
      facts: { name: facts.nameEn, brand: facts.brand ?? undefined, category: facts.category ?? undefined, colours: facts.colours, sizes: facts.sizes, fabric: facts.fabric ?? undefined, care: facts.careEn ?? undefined },
      max: { body: MAX_DESCRIPTION_CHARS },
    });
    if (!draft.body.trim()) return { ok: false, reason: 'NO_ANSWER' };

    // One deliberate press, one charge: a fresh id per call, never a content hash (unlike support's own per-question
    // idempotency — see the header comment on why this job has no "repeat page view" to dedupe against).
    const idempotencyKey = `product-description:${productId}:${randomUUID()}`;
    const usage: typeof job.usage = draft.usage ? { kind: 'text', ...draft.usage } : job.usage;
    const recorded = await recordAiUsage({ db: deps.db, resolver: deps.resolver }, { idempotencyKey, storeId, agentKey: PRODUCT_CONTENT_AGENT_KEY, jobTypeKey: PRODUCT_DESCRIPTION_JOB_KEY, modelKey: model.modelKey, usage, refType: 'Product', refId: productId });
    if (recorded.ok) {
      await recordDiaryEntry({ db: deps.db, resolver: deps.resolver, now: deps.now }, { storeId, agentKey: PRODUCT_CONTENT_AGENT_KEY, summaryBn: 'একটা প্রোডাক্টের বর্ণনা এআই লিখে দিয়েছে, রিভিউর জন্য।', refType: 'Product', refId: productId });
    }
    return { ok: true, body: draft.body };
  } catch {
    // Never breaks the explicit action the staff member pressed (CLAUDE.md CN-016 "nothing reaches the owner
    // broken"): any unexpected failure anywhere above is an honest "no answer", not a 500.
    return { ok: false, reason: 'NO_ANSWER' };
  }
}
