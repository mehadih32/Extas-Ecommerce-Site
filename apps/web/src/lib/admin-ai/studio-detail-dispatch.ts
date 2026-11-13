// S15 · PR 332 (Blueprint B4.15 "say only what you were given"; C1.1-C1.6, A5.1-A5.6; Blueprint C7 · S24 · Virtual
// Photoshoot Studio) — the eighth real AI-provider job dispatcher: wires the EXISTING Cost Book job
// `studioDetailFinder` (PR 312, section "studio", owner `gyani`) to a live model call, through the same guardrail
// layers PR 304-324 already built and PR 325-331 first called in production — the master switch and per-agent
// on/off (`workingNow`), the agent's own routed model pick (PR 307/310), the monthly spend cap (PR 309), the shared
// usage ledger (PR 315) and the AI diary (PR 319).
//
// Owned by `gyani` (C10's org chart names "studio, video" as his own remit, the same chief PR 325/328/329 already
// route as `personal` — a garment's own catalogue facts carry no customer data at all, but one chief keeps one
// routing policy, never a second one for the same remit).
//
// Scope decision for this stage of S24 (CLAUDE.md "think beyond the ask"; PR 329-331's own precedent of wiring one
// already-existing Cost Book job at a time): of the Studio section's seven sub-jobs, this PR wires only
// `studioDetailFinder` — a plain TEXT job. The other six (`studioGhostMannequin`, `studioTryOn`,
// `studioDetailReprojection`, `studioUpscale`, `studioFinishing` — all IMAGE jobs needing a real image-generation
// provider adapter that does not exist yet, no `fashn` adapter having been built — and `studioQualityScoring`,
// which scores a *generated* image that no store has yet, since S24's own generation pipeline is only one PR in
// (PR 444, the asset model alone) — are left for S24's own later PRs, once there is a real image to score or a real
// provider to call. Wiring a job with nothing real to ground it on would be exactly the invented-fact risk CLAUDE.md
// rule 1 and this chain's own "say only what you were given" rule exist to prevent.
//
// Grounded, not invented, reusing an existing shape rather than building one (PR 326-331's own precedent): `facts`
// is never a new attribute computed for this PR — it is exactly `product-content-dispatch.ts`'s own
// `ProductDescriptionFacts` (a product's already-saved name, brand, category, fabric, colours, sizes and care
// text), the identical shape PR 326's product-description job already reuses — never a stitch, print or logo
// invented out of nothing. The model is only asked to point at which of these already-recorded attributes a
// generated photo must keep accurate; it is never handed, and the prompt itself (`prompts.ts`'s new
// `STUDIO_DETAIL_RULE`) explicitly forbids it from making, any decision about the shoot itself (which photo to
// keep, whether to regenerate) — the real decision the Blueprint reserves for a person at the mandatory,
// permanent review step (C7.6, PR 458/480, neither built yet).
//
// As honest as PR 315/318/319/326/331 about the one thing that has not changed: S24's own admin pages (the model
// library, shot plans, the generation/review queue) are only one PR into their own 38, so no real page exists yet
// to press a "find key details" button on. This dispatcher and its API route are complete, tested and reachable
// today by any caller holding `photoshoot.generate` — the button itself is a small, clearly-scoped follow-up once
// S24's own model-library/shot-plan pages (PR 445+) exist to put it on.
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
import type { ProductDescriptionFacts } from './product-content-dispatch';
import { agentCapState, wouldExceedCap } from './spend-cap';
import { recordAiUsage } from './usage-ledger';

/** The one agent and the one, already-existing Cost Book job this PR wires — `agents.ts`'s own `gyani` owns
 * "studio, video" (C10's org chart), and `cost-book.ts`'s own `studioDetailFinder` row is the job this call is
 * billed as (no new Cost Book row: the catalogue stays at the count PR 331 left it). */
const STUDIO_DETAIL_AGENT_KEY = 'gyani' as const;
const STUDIO_DETAIL_JOB_KEY = 'studioDetailFinder';
/** A prompt-side ceiling, not a store setting — one short note, never a full shot brief. */
const MAX_NOTE_CHARS = 300; // hardcode-ok: a prompt ceiling, not a business/charge limit

export interface StudioDetailAiDeps {
  db: PrismaClient;
  resolver: Pick<AppResolver, 'value'>;
  vault: Pick<Vault, 'get'> | null;
  now?: () => Date;
}

/** The real, already-saved garment attributes a note may be grounded on — exactly `product-content-dispatch.ts`'s
 * own `ProductDescriptionFacts` shape (PR 326), reused rather than rebuilt, built by the caller from
 * `@extas/catalogue`'s own `ProductView`, never from anything a client posts. */
export type StudioDetailFacts = ProductDescriptionFacts;

/** The model catalogue entry for `providerKey`, at the job's own recommended tier where one exists, else the
 * cheapest text model that provider has — the same helper PR 325-331's own dispatchers already use. */
function modelForProvider(providerKey: string, tier: ModelCatalogEntry['tier']): ModelCatalogEntry | null {
  const sameTier = MODEL_CATALOG.find((m) => m.providerKey === providerKey && m.kind === 'text' && m.tier === tier);
  if (sameTier) return sameTier;
  return MODEL_CATALOG.filter((m) => m.providerKey === providerKey && m.kind === 'text').sort((a, b) => (a.inputPerMillionMicros ?? 0) - (b.inputPerMillionMicros ?? 0))[0] ?? null;
}

/**
 * One plain, grounded note on which of a garment's own already-saved attributes a generated photo must keep
 * accurate, in `locale`, before the Photoshoot Studio runs a generation job on it. `null` on any honest "no" (AI
 * off/paused, no ready connection for the routed data class, the monthly cap would be exceeded, or the model
 * answered with nothing usable) or on any failure — this function never throws; it is purely additive information,
 * so a caller that gets `null` simply shows nothing extra, same as before this PR existed. Never returns, and the
 * prompt itself never asks for, a decision about the shoot.
 */
export async function studioDetailNote(deps: StudioDetailAiDeps, storeId: number, productId: string, locale: 'en' | 'bn', facts: StudioDetailFacts): Promise<string | null> {
  if (!facts.nameEn.trim()) return null; // nothing to ground a note on
  try {
    const agent = await deps.db.aiAgent.findUnique({ where: { key: STUDIO_DETAIL_AGENT_KEY } });
    if (!agent || agent.archivedAt) return null;
    const masterOn = await deps.resolver.value('ai.enabled', { storeId });
    const workingNow = (masterOn || agent.keepOnWhenMasterOff) && agent.enabled;
    if (!workingNow) return null;

    const selectedProvider = agent.selectedProvider && isWriterProvider(agent.selectedProvider) ? agent.selectedProvider : null;
    const options = await listWriterOptions(deps.db);
    const selectedOpt = options.find((o) => o.provider === selectedProvider);
    const selectedReady = selectedProvider === null || Boolean(selectedOpt?.ready);
    const routing = routeProvider(agentDataClass(STUDIO_DETAIL_AGENT_KEY), selectedProvider, selectedReady, options);
    if (!routing.effectiveProvider) return null;

    const job = jobOf(STUDIO_DETAIL_JOB_KEY);
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

    const draft = await link.api.draftStudioDetailNote({
      locale,
      facts: { name: facts.nameEn, brand: facts.brand ?? undefined, category: facts.category ?? undefined, colours: facts.colours, sizes: facts.sizes, fabric: facts.fabric ?? undefined, care: facts.careEn ?? undefined },
      max: { body: MAX_NOTE_CHARS },
    });
    if (!draft.body.trim()) return null;

    // Idempotent per product + the exact attributes it was grounded on: a repeat view of the same product's own
    // still-unchanged facts reuses the same ledger row rather than charging it again (the same convention PR 329's
    // own fraud review note already uses for its own alert card); an edited product (a new fabric, colour or care
    // line) naturally hashes differently and so earns its own, fresh note and charge.
    const idempotencyKey = `studio-detail:${productId}:${createHash('sha1').update(JSON.stringify(facts)).digest('hex')}`;
    const usage: typeof job.usage = draft.usage ? { kind: 'text', ...draft.usage } : job.usage;
    const recorded = await recordAiUsage({ db: deps.db, resolver: deps.resolver }, { idempotencyKey, storeId, agentKey: STUDIO_DETAIL_AGENT_KEY, jobTypeKey: STUDIO_DETAIL_JOB_KEY, modelKey: model.modelKey, usage, refType: 'Product', refId: productId });
    if (recorded.ok && !recorded.idempotent) {
      await recordDiaryEntry({ db: deps.db, resolver: deps.resolver, now: deps.now }, { storeId, agentKey: STUDIO_DETAIL_AGENT_KEY, summaryBn: 'ফটোশুটের আগে একটা পোশাকের কোন বিবরণ ঠিক রাখতে হবে, তা এআই খুঁজে দিয়েছে।', refType: 'Product', refId: productId });
    }
    return draft.body;
  } catch {
    // Additive like every job this chain has wired so far (C1.4): any failure at all leaves the caller exactly as
    // it was before this PR, since nothing yet depends on this note to work.
    return null;
  }
}

/** The callback a future Studio page builds per product (PR 445+, once the model library/shot-plan pages exist):
 * given that product's own already-saved attributes (never recomputed here) and the admin's own display language,
 * either a grounded detail note (a real call, fully guarded and logged) or `null`. */
export function studioDetailOption(deps: StudioDetailAiDeps, storeId: number, productId: string, locale: 'en' | 'bn') {
  return (facts: StudioDetailFacts): Promise<string | null> => studioDetailNote(deps, storeId, productId, locale, facts);
}
