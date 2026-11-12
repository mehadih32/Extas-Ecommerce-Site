// S15 · PR 325 (Blueprint B4.15 "grounded answers... must say 'I don't know' rather than invent"; C1.1-C1.6, A5.1-A5.6)
// — the first real AI-provider job dispatcher: wires one real agent job (the support agent's `supportReply`, PR 312)
// to an actual live model call, through every guardrail layer PR 304-324 already built and, until now, nobody ever
// called in production: the master switch and per-agent on/off (`workingNow`, PR 304/305), the agent's own model
// pick (PR 307) with the data-class routing policy applied on top (PR 310 — support carries personal data, so a
// free-capable connection is never the effective pick), the monthly spend cap (PR 309), the shared usage ledger
// (PR 315) and the AI diary (PR 319). Every one of those files already says, honestly, that nothing in the real
// codebase calls it yet; this file is that first caller.
//
// Grounding, not invention: the model is given only the facts `@extas/support`'s own rule-based engine (PR 432)
// already decided (`SupportReplyFacts`) and the rule-based reply itself (`ruleBasedBody`) — it may only rephrase
// those words more naturally, never add a fact. `ruleBasedBody` is also this function's own floor: any failure,
// timeout, ineligibility or empty answer returns `null`, and `@extas/support`'s `supportDraft` (which calls this as
// its `opts.aiReply`) then ships the rule-based text completely unchanged (C1.4 "AI is additive").
//
// Masking (A5.1-A5.4): `maskSupportPii` strips e-mail addresses and Bangladeshi-shaped phone numbers out of the
// customer's own words before they ever reach a live provider. This is this PR's own, narrowly-scoped copy of the
// same algorithm PR 311's own `packages/adapters/src/ai-writer/masking.ts` describes (that PR is not yet merged to
// this branch — see PROGRESS.md's follow-ups) — a deliberate, acknowledged duplication to converge onto PR 311's
// own file, not a second masking policy, the moment it lands.
//
// Known limitation, not silently hidden (follow-up, PROGRESS.md): a real call is made on every eligible page view of
// a conversation with an unanswered question, not only once per customer message — a staff member who reloads the
// page several times while deciding whether to send makes several real calls, even though `recordAiUsage`'s own
// idempotency key (tied to the conversation and the rule-based answer's own words) means only the first of them is
// ever billed to the ledger. The owner's own monthly cap (PR 309) is the real backstop against that today; caching
// one real answer per question is real, scoped follow-up work, not this PR's own.
import { createHash } from 'node:crypto';
import { aiWriterAdapters, createConnections, type AiWriter } from '@extas/adapters';
import { dayStart, ymdIn } from '@extas/metrics';
import type { PrismaClient } from '@extas/db/client';
import type { SupportReplyFacts } from '@extas/support';
import type { Vault } from '@extas/vault';
import type { AppResolver } from '../settings';
import { pricerFor } from '../exchange-rate';
import { agentDataClass, routeProvider } from './data-classes';
import { estimateMicrosFor, jobOf, MODEL_CATALOG, microsToUsdMinor, modelOf, type ModelCatalogEntry } from './cost-book';
import { recordDiaryEntry } from './diary';
import { isWriterProvider, listWriterOptions } from './model-picks';
import { agentCapState, wouldExceedCap } from './spend-cap';
import { recordAiUsage } from './usage-ledger';

/** The one agent and the one Cost Book job this PR wires — `agents.ts`'s own `gyani` owns support (C10's own remit
 * list), and `cost-book.ts`'s own `supportReply` row is the job this call is billed as. */
const SUPPORT_AGENT_KEY = 'gyani' as const;
const SUPPORT_REPLY_JOB_KEY = 'supportReply';
/** A prompt-side ceiling, not a store setting — the Composer's own `maxChars` still governs what a person actually
 * sends; this only keeps one model answer from running away. */
const MAX_REPLY_CHARS = 600; // hardcode-ok: a prompt ceiling, not a business/charge limit

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/gu;
// Bangladeshi mobile numbers (operator series 013-019), however prefixed: bare 01…, +880 1…, 880 1… or 00880 1…
// (PR 311's own description of the same rule). A digit immediately before or after never matches, so a longer
// number (an order id, a price) is never half-masked.
const PHONE_RE = /(?<!\d)(?:00880|\+880|880|0)1[3-9]\d{8}(?!\d)/gu;

/** This PR's own scoped copy of PR 311's masking algorithm (see the header comment above) — strips any e-mail
 * address and any Bangladeshi-shaped phone number out of the customer's own words before a live provider ever sees
 * them. */
export function maskSupportPii(text: string): string {
  return text.replace(EMAIL_RE, '[EMAIL]').replace(PHONE_RE, '[PHONE]');
}

export interface SupportAiDeps {
  db: PrismaClient;
  resolver: Pick<AppResolver, 'value'>;
  vault: Pick<Vault, 'get'> | null;
  now?: () => Date;
}

/** The model catalogue entry for `providerKey`, at the job's own recommended tier where one exists, else the
 * cheapest text model that provider has — `null` only when the provider carries no text model at all, which never
 * happens for the four PR 306 providers today. */
function modelForProvider(providerKey: string, tier: ModelCatalogEntry['tier']): ModelCatalogEntry | null {
  const sameTier = MODEL_CATALOG.find((m) => m.providerKey === providerKey && m.kind === 'text' && m.tier === tier);
  if (sameTier) return sameTier;
  return MODEL_CATALOG.filter((m) => m.providerKey === providerKey && m.kind === 'text').sort((a, b) => (a.inputPerMillionMicros ?? 0) - (b.inputPerMillionMicros ?? 0))[0] ?? null;
}

/**
 * Builds the `opts.aiReply` callback `@extas/support`'s `supportDraft` (PR 432) takes: given the facts that
 * function already decided, either a warmer AI rephrasing (a real call, fully guarded and logged) or `null` (AI is
 * off, the agent is paused, no connection is ready for the routed data class, the cap would be exceeded, or
 * anything at all went wrong) — `supportDraft` ships its own rule-based `ruleBasedBody` unchanged either way.
 * `refId` is the conversation this answer is for, used only to key the usage ledger's idempotency and the diary
 * entry — never read back inside this function.
 */
export function supportAiReplyOption(deps: SupportAiDeps, storeId: number, refId: string): (facts: SupportReplyFacts) => Promise<string | null> {
  return async (facts) => {
    try {
      const agent = await deps.db.aiAgent.findUnique({ where: { key: SUPPORT_AGENT_KEY } });
      if (!agent || agent.archivedAt) return null;
      const masterOn = await deps.resolver.value('ai.enabled', { storeId });
      const workingNow = (masterOn || agent.keepOnWhenMasterOff) && agent.enabled;
      if (!workingNow) return null;

      const selectedProvider = agent.selectedProvider && isWriterProvider(agent.selectedProvider) ? agent.selectedProvider : null;
      const options = await listWriterOptions(deps.db);
      const selectedOpt = options.find((o) => o.provider === selectedProvider);
      const selectedReady = selectedProvider === null || Boolean(selectedOpt?.ready);
      const routing = routeProvider(agentDataClass(SUPPORT_AGENT_KEY), selectedProvider, selectedReady, options);
      // null here means "the practice writer" (not ready, or genuinely not picked) — the rule-based text is already
      // that same honest fallback, so there is nothing of value a real call would add.
      if (!routing.effectiveProvider) return null;

      const job = jobOf(SUPPORT_REPLY_JOB_KEY);
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

      const draft = await link.api.draftSupportReply({
        locale: facts.lang,
        question: maskSupportPii(facts.question),
        facts: {
          intent: facts.intent,
          complaint: facts.complaint,
          orderNumber: facts.order?.number ?? null,
          orderStatus: facts.order?.status ?? null,
          late: facts.order?.late,
          size: facts.size,
          customerName: facts.customerName,
        },
        ruleBasedBody: facts.ruleBasedBody,
        max: { body: MAX_REPLY_CHARS },
      });
      if (!draft.body.trim()) return null;

      // Idempotent on the conversation + the rule-based words it answers: a repeat page view of the same still-open
      // question reuses the same ledger row rather than charging it again (see the header's own known-limitation
      // note on the real call itself).
      const idempotencyKey = `support-reply:${refId}:${createHash('sha1').update(facts.ruleBasedBody).digest('hex')}`;
      const usage: typeof job.usage = draft.usage ? { kind: 'text', ...draft.usage } : job.usage;
      const recorded = await recordAiUsage({ db: deps.db, resolver: deps.resolver }, { idempotencyKey, storeId, agentKey: SUPPORT_AGENT_KEY, jobTypeKey: SUPPORT_REPLY_JOB_KEY, modelKey: model.modelKey, usage, refType: 'Conversation', refId });
      if (recorded.ok && !recorded.idempotent) {
        await recordDiaryEntry({ db: deps.db, resolver: deps.resolver, now: deps.now }, { storeId, agentKey: SUPPORT_AGENT_KEY, summaryBn: 'একটা সাপোর্ট চ্যাটের উত্তর এআই নিজে লিখেছে, সত্যিকারের মডেল দিয়ে।', refType: 'Conversation', refId });
      }
      return draft.body;
    } catch {
      // AI is additive (Blueprint C1.4): any failure at all leaves `supportDraft`'s own rule-based text unchanged.
      return null;
    }
  };
}
