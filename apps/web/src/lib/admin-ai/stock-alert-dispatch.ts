// S15 · PR 333 (Blueprint B4.15 "say only what you were given"; C1.1-C1.6, A5.1-A5.6) — the ninth real AI-provider
// job dispatcher: wires the EXISTING Cost Book job `reportsStockAlert` (PR 312, section "reports", owner `gyani`) to
// a live model call, through the same guardrail layers PR 304-324 already built and PR 325-332 first called in
// production — the master switch and per-agent on/off (`workingNow`), the agent's own routed model pick (PR
// 307/310), the monthly spend cap (PR 309), the shared usage ledger (PR 315) and the AI diary (PR 319).
//
// Owned by `gyani` (C10's org chart names "reports" as his own remit, the same chief PR 325/328/329/332 already
// route as `personal`): a low-stock alert's own SKU, colour, size and numbers carry no customer data at all, but
// one chief keeps one routing policy, never a second one for the same remit.
//
// Grounded, not invented (CLAUDE.md rule 1; PR 326-332's own precedent): `facts` is never a new figure computed for
// this PR. It is always the stock page's own already-computed `LowStockItem` fields (`@extas/inventory`'s
// `listLowStock`, PR 202) — the identical product name, SKU, colour, size, available count and threshold the
// "Low stock" card (`/admin/stock`) already shows as plain numbers — plus a whole-day count since the alert first
// opened, computed here from `LowStockItem.since` rather than left to the model's own date arithmetic. The model is
// only asked to say, in one short plain line, why this SKU is worth a look; it is never handed, and the prompt
// itself (`prompts.ts`'s new `STOCK_ALERT_RULE`) explicitly forbids it from naming, any reorder decision (quantity,
// supplier, timing) — that stays a person's call, same as the fraud/approval queue's own "never a decision" rule
// (PR 329/330).
//
// Wired into a real, already-live, uncontested page (unlike PR 330/331/332's own "built but not yet wired" state):
// `/admin/stock`'s own "Low stock" card (S09 · PR 202/205) renders this additive line beside the existing raw
// numbers for every open alert, server-side, on every page view — idempotent per alert + its own current numbers
// (below), so a repeat view never charges twice. This page sits outside the S23 marketing/studio files and the ERP
// lane's own `/admin/orders`/`/admin/products` "design" variants three other lanes are mid-way through rewriting,
// so there is nothing here to collide with.
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

/** The one agent and the one, already-existing Cost Book job this PR wires — `agents.ts`'s own `gyani` owns
 * "reports" (C10's org chart), and `cost-book.ts`'s own `reportsStockAlert` row is the job this call is billed as
 * (no new Cost Book row: the catalogue stays at the count PR 332 left it). */
const STOCK_ALERT_AGENT_KEY = 'gyani' as const;
const STOCK_ALERT_JOB_KEY = 'reportsStockAlert';
/** A prompt-side ceiling, not a store setting — one short line, never a paragraph. */
const MAX_NOTE_CHARS = 150; // hardcode-ok: a prompt ceiling, not a business/charge limit

export interface StockAlertAiDeps {
  db: PrismaClient;
  resolver: Pick<AppResolver, 'value'>;
  vault: Pick<Vault, 'get'> | null;
  now?: () => Date;
}

/** The real, already-computed numbers one low-stock alert may be grounded on — exactly `@extas/inventory`'s own
 * `LowStockItem` fields (PR 202) the stock page already reads, never a second, duplicate read of the stock mirror. */
export interface StockAlertFacts {
  productName: string;
  sku: string;
  colour: string | null;
  size: string | null;
  available: number;
  threshold: number;
  /** ISO timestamp the alert first opened (`LowStockItem.since`). */
  since: string;
}

/** The model catalogue entry for `providerKey`, at the job's own recommended tier where one exists, else the
 * cheapest text model that provider has — the same helper PR 325-332's own dispatchers already use. */
function modelForProvider(providerKey: string, tier: ModelCatalogEntry['tier']): ModelCatalogEntry | null {
  const sameTier = MODEL_CATALOG.find((m) => m.providerKey === providerKey && m.kind === 'text' && m.tier === tier);
  if (sameTier) return sameTier;
  return MODEL_CATALOG.filter((m) => m.providerKey === providerKey && m.kind === 'text').sort((a, b) => (a.inputPerMillionMicros ?? 0) - (b.inputPerMillionMicros ?? 0))[0] ?? null;
}

/**
 * One plain, grounded line on why one SKU's own open low-stock alert is worth a look, in `locale`, beside the stock
 * page's own raw numbers. `null` on any honest "no" (AI off/paused, no ready connection for the routed data class,
 * the monthly cap would be exceeded, or the model answered with nothing usable) or on any failure — this function
 * never throws; it is purely additive, so a caller that gets `null` simply shows the numbers alone, exactly as the
 * page already did before this PR. Never returns, and the prompt itself never asks for, a reorder decision.
 */
export async function stockAlertNote(deps: StockAlertAiDeps, storeId: number, alertId: string, locale: 'en' | 'bn', facts: StockAlertFacts): Promise<string | null> {
  if (!facts.productName.trim() || !facts.sku.trim()) return null; // nothing to ground a line on
  try {
    const agent = await deps.db.aiAgent.findUnique({ where: { key: STOCK_ALERT_AGENT_KEY } });
    if (!agent || agent.archivedAt) return null;
    const masterOn = await deps.resolver.value('ai.enabled', { storeId });
    const workingNow = (masterOn || agent.keepOnWhenMasterOff) && agent.enabled;
    if (!workingNow) return null;

    const selectedProvider = agent.selectedProvider && isWriterProvider(agent.selectedProvider) ? agent.selectedProvider : null;
    const options = await listWriterOptions(deps.db);
    const selectedOpt = options.find((o) => o.provider === selectedProvider);
    const selectedReady = selectedProvider === null || Boolean(selectedOpt?.ready);
    const routing = routeProvider(agentDataClass(STOCK_ALERT_AGENT_KEY), selectedProvider, selectedReady, options);
    if (!routing.effectiveProvider) return null;

    const job = jobOf(STOCK_ALERT_JOB_KEY);
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

    const sinceDays = Math.max(0, Math.floor((now.getTime() - new Date(facts.since).getTime()) / 86_400_000));
    const draft = await link.api.draftStockAlertNote({
      locale,
      facts: { productName: facts.productName, sku: facts.sku, colour: facts.colour ?? undefined, size: facts.size ?? undefined, available: facts.available, threshold: facts.threshold, sinceDays },
      max: { body: MAX_NOTE_CHARS },
    });
    if (!draft.body.trim()) return null;

    // Idempotent per alert + its own current numbers: a repeat page view of the same still-open alert at the same
    // available/threshold count reuses the same ledger row rather than charging it again (the same convention PR
    // 329's own fraud review note already uses); a changed count (stock moved, or the next ERP pull) naturally
    // hashes differently and so earns its own, fresh line and charge.
    const idempotencyKey = `stock-alert:${alertId}:${createHash('sha1').update(JSON.stringify({ available: facts.available, threshold: facts.threshold })).digest('hex')}`;
    const usage: typeof job.usage = draft.usage ? { kind: 'text', ...draft.usage } : job.usage;
    const recorded = await recordAiUsage({ db: deps.db, resolver: deps.resolver }, { idempotencyKey, storeId, agentKey: STOCK_ALERT_AGENT_KEY, jobTypeKey: STOCK_ALERT_JOB_KEY, modelKey: model.modelKey, usage, refType: 'LowStockAlert', refId: alertId });
    if (recorded.ok && !recorded.idempotent) {
      await recordDiaryEntry({ db: deps.db, resolver: deps.resolver, now: deps.now }, { storeId, agentKey: STOCK_ALERT_AGENT_KEY, summaryBn: 'একটা কম-স্টকের সতর্কতা কেন দেখার মতো, তা এআই এক লাইনে লিখে দিয়েছে — কোনো রিঅর্ডারের সিদ্ধান্ত নেয়নি।', refType: 'LowStockAlert', refId: alertId });
    }
    return draft.body;
  } catch {
    // Additive like every job this chain has wired so far (C1.4): any failure at all leaves the stock page's own
    // raw numbers exactly as they were.
    return null;
  }
}

/** The callback the stock page builds per open alert: given that alert's own already-computed `LowStockItem`
 * numbers (never recomputed here) and the admin's own display language, either a grounded one-line note (a real
 * call, fully guarded and logged) or `null`. */
export function stockAlertOption(deps: StockAlertAiDeps, storeId: number, alertId: string, locale: 'en' | 'bn') {
  return (facts: StockAlertFacts): Promise<string | null> => stockAlertNote(deps, storeId, alertId, locale, facts);
}
