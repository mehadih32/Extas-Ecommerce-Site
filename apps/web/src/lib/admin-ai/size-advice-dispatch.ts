// S15 · PR 328 (Blueprint B4.15 "say only what you were given"; C1.1-C1.6, A5.1-A5.6) — the fourth real
// AI-provider job dispatcher: wires a new Cost Book job, `supportSizeAdvice`, to a live model call, through the
// same guardrail layers PR 304-324 already built and PR 325-327 first called in production — the master switch
// and per-agent on/off (`workingNow`), the agent's own routed model pick (PR 307/310), the monthly spend cap
// (PR 309), the shared usage ledger (PR 315) and the AI diary (PR 319).
//
// Owned by `gyani` (support, C10's own remit list) — the same agent, and the same `personal` data-class routing,
// PR 325's own support reply already uses for this exact chat surface. `facts` itself carries no customer data at
// all (a chart's own numbers — never a name, phone or address), but one surface keeps one routing policy, never
// two for the same chat.
//
// Grounded, not invented: `facts` is always the caller's own already-decided `Recommendation`
// (`@extas/catalogue/size-finder`'s own rule engine, PR 58 — the identical engine the product page's own Find My
// Size runs). The model may only explain, in a warmer sentence, why that size was given; it is never asked for,
// and can never change, the size itself. `draft-size-advice.ts` is this PR's own caller, built from
// `draft-size.ts`'s existing lookup rather than a new one (CLAUDE.md "think beyond the ask" + PR 326/327's own
// precedent of reusing an existing grounding shape instead of inventing one).
//
// Additive like every size answer here (C1.4): `sizeAdviceOption`'s own `null` on any honest "no" — AI off,
// Gyani paused, no connection ready for the routed data class, the monthly cap already reached, or the model
// answered with nothing usable — leaves the plain "your size is X" line `drafts.ts` already gives exactly as it
// was; the size question is always answered either way.
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

/** The one agent and the one Cost Book job this PR wires — `agents.ts`'s own `gyani` owns support (C10's own
 * remit list), and `cost-book.ts`'s own `supportSizeAdvice` row is the job this call is billed as. */
const SIZE_ADVICE_AGENT_KEY = 'gyani' as const;
const SIZE_ADVICE_JOB_KEY = 'supportSizeAdvice';
/** A prompt-side ceiling, not a store setting — one short sentence, never the whole reply. */
const MAX_ADVICE_CHARS = 240; // hardcode-ok: a prompt ceiling, not a business/charge limit

export interface SizeAdviceAiDeps {
  db: PrismaClient;
  resolver: Pick<AppResolver, 'value'>;
  vault: Pick<Vault, 'get'> | null;
  now?: () => Date;
}

/** The real, already-decided reasoning behind one Find My Size answer — built by the caller from
 * `@extas/catalogue/size-finder`'s own `Recommendation` (via `draft-size-advice.ts`), never from anything a
 * client posts. */
export interface SizeAdviceFacts {
  sizeLabel: string;
  nextSizeLabel: string | null;
  fieldLabel: string;
  valueInch: number;
  needInch: number;
  bodyInch: number;
  easeInch: number;
  covered: boolean;
  garment: string | null;
  heightIn: number;
  weightKg: number;
}

/** The model catalogue entry for `providerKey`, at the job's own recommended tier where one exists, else the
 * cheapest text model that provider has — the same helper PR 325-327's own dispatchers already use. */
function modelForProvider(providerKey: string, tier: ModelCatalogEntry['tier']): ModelCatalogEntry | null {
  const sameTier = MODEL_CATALOG.find((m) => m.providerKey === providerKey && m.kind === 'text' && m.tier === tier);
  if (sameTier) return sameTier;
  return MODEL_CATALOG.filter((m) => m.providerKey === providerKey && m.kind === 'text').sort((a, b) => (a.inputPerMillionMicros ?? 0) - (b.inputPerMillionMicros ?? 0))[0] ?? null;
}

/**
 * One warm, grounded sentence explaining why Find My Size gave `facts.sizeLabel`, in `locale`. `null` on any
 * honest "no" (AI off/paused, no ready connection for the routed data class, the monthly cap would be exceeded,
 * or the model answered with nothing usable) or on any failure — this function never throws; the caller's own
 * plain size line is a complete answer on its own either way.
 */
export async function sizeAdviceNote(deps: SizeAdviceAiDeps, storeId: number, refId: string, locale: 'en' | 'bn', facts: SizeAdviceFacts): Promise<string | null> {
  try {
    const agent = await deps.db.aiAgent.findUnique({ where: { key: SIZE_ADVICE_AGENT_KEY } });
    if (!agent || agent.archivedAt) return null;
    const masterOn = await deps.resolver.value('ai.enabled', { storeId });
    const workingNow = (masterOn || agent.keepOnWhenMasterOff) && agent.enabled;
    if (!workingNow) return null;

    const selectedProvider = agent.selectedProvider && isWriterProvider(agent.selectedProvider) ? agent.selectedProvider : null;
    const options = await listWriterOptions(deps.db);
    const selectedOpt = options.find((o) => o.provider === selectedProvider);
    const selectedReady = selectedProvider === null || Boolean(selectedOpt?.ready);
    const routing = routeProvider(agentDataClass(SIZE_ADVICE_AGENT_KEY), selectedProvider, selectedReady, options);
    if (!routing.effectiveProvider) return null;

    const job = jobOf(SIZE_ADVICE_JOB_KEY);
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

    const draft = await link.api.draftSizeAdvice({
      locale,
      facts: {
        sizeLabel: facts.sizeLabel,
        nextSizeLabel: facts.nextSizeLabel ?? undefined,
        fieldLabel: facts.fieldLabel,
        valueInch: facts.valueInch,
        needInch: facts.needInch,
        bodyInch: facts.bodyInch,
        easeInch: facts.easeInch,
        covered: facts.covered,
        garment: facts.garment ?? undefined,
        heightIn: facts.heightIn,
        weightKg: facts.weightKg,
      },
      max: { body: MAX_ADVICE_CHARS },
    });
    if (!draft.body.trim()) return null;

    // Idempotent per conversation + the exact answer it explains: a repeat page view of the same still-open
    // question reuses the same ledger row rather than charging it again (the same convention PR 325's own support
    // reply already uses for this same chat surface).
    const idempotencyKey = `size-advice:${refId}:${createHash('sha1').update(`${facts.sizeLabel}:${facts.heightIn}:${facts.weightKg}`).digest('hex')}`;
    const usage: typeof job.usage = draft.usage ? { kind: 'text', ...draft.usage } : job.usage;
    const recorded = await recordAiUsage({ db: deps.db, resolver: deps.resolver }, { idempotencyKey, storeId, agentKey: SIZE_ADVICE_AGENT_KEY, jobTypeKey: SIZE_ADVICE_JOB_KEY, modelKey: model.modelKey, usage, refType: 'Conversation', refId });
    if (recorded.ok && !recorded.idempotent) {
      await recordDiaryEntry({ db: deps.db, resolver: deps.resolver, now: deps.now }, { storeId, agentKey: SIZE_ADVICE_AGENT_KEY, summaryBn: 'একটা সাইজ সাজেশনের কারণ এআই বুঝিয়ে দিয়েছে, রিভিউর জন্য।', refType: 'Conversation', refId });
    }
    return draft.body;
  } catch {
    // Additive like every size answer here (C1.4): any failure at all leaves the caller's own plain size line
    // exactly as it was.
    return null;
  }
}

/** The `opts.sizeAdvice` callback `@extas/support`'s `supportDraft` (PR 432) takes: given the product, the
 * measures `opts.sizeFor` already answered for, and this same draft's own reply language, either a grounded
 * explanation sentence (a real call, fully guarded and logged) or `null` — `facts` builds the real
 * `Recommendation` facts via `draft-size-advice.ts`'s `draftSizeAdviceFacts`, so this function itself never
 * touches the database or the catalogue directly. */
export function sizeAdviceOption(deps: SizeAdviceAiDeps, storeId: number, refId: string, facts: (productId: string, body: { heightIn: number; weightKg: number }) => Promise<SizeAdviceFacts | null>) {
  return async (productId: string, body: { heightIn: number; weightKg: number }, lang: 'en' | 'bn'): Promise<string | null> => {
    const f = await facts(productId, body);
    if (!f) return null;
    return sizeAdviceNote(deps, storeId, refId, lang, f);
  };
}
