// S15 · PR 331 (Blueprint B4.15 "say only what you were given"; C1.1-C1.6, A5.1-A5.6; Blueprint C5 · Social &
// content studio) — the seventh real AI-provider job dispatcher: wires the existing Cost Book job
// `socialReelCaption` (PR 312, section "social", owner `doot`) to a live model call, through the same guardrail
// layers PR 304-324 already built and PR 325-330 already called in production — the master switch and per-agent
// on/off (`workingNow`), Doot's own model pick (PR 307) with PR 310's data-class policy applied on top, the monthly
// spend cap (PR 309), the shared usage ledger (PR 315) and the AI diary (PR 319).
//
// The matching deterministic draft (CLAUDE.md "think beyond the ask" + PR 326-330's own precedent of reusing an
// existing grounding shape instead of inventing one): Marketing › Studio's own render-queue form
// (`lib/marketing/studio.ts`/`StudioForms.tsx`, PR 439) already lets a staff member type a caption for a reel/short
// render job, and its own placeholder already named the gap honestly — "nothing here writes this for you yet"
// (`messages/admin-marketing-studio.en.json`). `render.ts`'s own header comment names the exact setting this PR
// wires: "may spend on AI captions once the owner turns that on" — `studio.ai.captions` (`registry-studio.ts`,
// version 281, off as it ships) — and `catalogue.ts`'s own permission note names the exact permission —
// "run a generate job, which may spend on AI captions once the owner turns that on (`studio.generate`)". This PR
// adds no new setting and no new permission; both already existed, waiting for this wiring.
//
// Scope decision for this PR (one job per dispatcher, the same granularity PR 325-330 all kept): the Cost Book's
// `social` section has five jobs (`socialReelCaption`, `socialPostIdea`, `socialCommentReply`, `socialHashtagSet`,
// `socialStoryCaption`), all owned by Doot. This PR wires only `socialReelCaption`, and only for a template whose
// own `kind` is `reel` or `short` (both are short-form video, the exact shape that job's own Cost Book description
// names — "a caption with a hook for one short video"). A `story`/`image` template's caption field is left exactly
// as it was; wiring `socialStoryCaption`/`socialPostIdea` to the same form is a follow-up PR, not a second job
// folded into this one.
//
// Grounded, not invented: `facts` is always the real template's own already-saved `name` and `spec.notes` (never a
// product, a price, an offer, a discount or a size the staff has not typed into the template itself — the caller
// loads the template server-side through `@extas/studio`'s own `studioTemplates`, never from anything a client
// posts) plus the store's own already-saved brand voice tone line (`studio.voice`'s `toneEn`, PR 437). The model is
// never asked for hashtags (`studio.voice`'s own `hashtagSet` is a separate, already-built store setting a later PR
// adds to the caption, never the model's own invention) and its draft is refused — never shown — if it uses one of
// the store's own `studio.voice.blockedWords` (checked in code, never left to the model to avoid on its own).
//
// Additive like every draft here (C1.4): `socialReelCaptionDraft`'s own honest `ok: false` reasons — the feature
// switch itself off (`FEATURE_OFF`), AI off/paused, no connection ready for Doot's routed data class, the monthly
// cap already reached, the model answered with nothing usable, or its draft used a blocked word — leave the
// caption field's own plain textarea exactly as it was; the staff member can always type the caption by hand either
// way, and a press never saves or queues anything by itself.
//
// Deliberately not wired into `StudioForms.tsx`/`studio/page.tsx` in this PR (CLAUDE.md rule 10, "shared files...
// only through their single owner" — the spirit of it, even though this trio is not on the rule's own named list):
// at the moment this PR was built, three concurrent S23 branches (`pr-440-social-publish-adapters`,
// `pr-441-publishing-adapters-tiktok-youtube`, `pr-442-content-calendar-approval-queue`) were each independently
// rewriting `lib/marketing/studio.ts`/`StudioForms.tsx`/`studio/page.tsx` with 80-800 line diffs of their own —
// adding a small edit there now would almost certainly conflict three ways at the FIX lane's merge, for a page this
// dispatcher does not itself own. The dispatcher and its API route (`social-caption-api.ts`,
// `/api/admin/marketing/studio/ai-caption`) are complete, tested and reachable today by any caller with
// `studio.generate` — only the "Draft a caption with AI" button itself is left as a small follow-up PR, to land
// once S23's own stack has settled (the same "no job dispatcher calls this in production yet" honest gap PR
// 315/318/319 already named for other library-first work, except this one is reachable over the API already).
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
 * content (C10's own remit list), and `cost-book.ts`'s own `socialReelCaption` row is the job this call is billed
 * as. */
const SOCIAL_CAPTION_AGENT_KEY = 'doot' as const;
const SOCIAL_CAPTION_JOB_KEY = 'socialReelCaption';
/** A prompt-side ceiling, not a store setting — a reel caption with a hook stays short; the render queue's own
 * caption column still allows up to 2200 characters (`render.ts`'s own Instagram-sized `CAPTION_MAX`). */
const MAX_CAPTION_CHARS = 220; // hardcode-ok: a prompt ceiling, not a business/charge limit

export interface SocialCaptionAiDeps {
  db: PrismaClient;
  resolver: Pick<AppResolver, 'value'>;
  vault: Pick<Vault, 'get'> | null;
  now?: () => Date;
}

/** The real, already-saved template facts a caption may be grounded on — built by the caller from
 * `@extas/studio`'s own `StudioTemplateRow`, never from anything a client posts. */
export interface SocialCaptionFacts {
  templateName: string;
  notes?: string | null;
}

export type SocialCaptionResult = { ok: true; body: string } | { ok: false; reason: 'FEATURE_OFF' | 'AI_OFF' | 'NOT_READY' | 'CAP_EXCEEDED' | 'NO_ANSWER' | 'BLOCKED_WORD' };

/** The model catalogue entry for `providerKey`, at the job's own recommended tier where one exists, else the
 * cheapest text model that provider has — the same helper PR 325-330's own dispatchers already use. */
function modelForProvider(providerKey: string, tier: ModelCatalogEntry['tier']): ModelCatalogEntry | null {
  const sameTier = MODEL_CATALOG.find((m) => m.providerKey === providerKey && m.kind === 'text' && m.tier === tier);
  if (sameTier) return sameTier;
  return MODEL_CATALOG.filter((m) => m.providerKey === providerKey && m.kind === 'text').sort((a, b) => (a.inputPerMillionMicros ?? 0) - (b.inputPerMillionMicros ?? 0))[0] ?? null;
}

/**
 * Drafts one real, grounded reel caption for `templateId`, in `locale`, from `facts` — the one explicit
 * "Draft a caption with AI" action a staff member presses on Marketing › Studio's render-queue form, for a
 * reel/short template. `ok: false` always carries a plain reason (the `studio.ai.captions` feature switch itself
 * off, AI off/paused, no ready connection for Doot's routed data class, the monthly cap would be exceeded, the
 * model answered with nothing usable, or its draft used one of the store's own blocked words) — this function
 * never throws for an honest "no" the admin page can show as a notice; it only throws for a genuine programmer
 * error (an unknown job/model key, which never happens with the constants above).
 */
export async function socialReelCaptionDraft(deps: SocialCaptionAiDeps, storeId: number, templateId: string, locale: 'en' | 'bn', facts: SocialCaptionFacts): Promise<SocialCaptionResult> {
  try {
    const captionsOn = await deps.resolver.value('studio.ai.captions', { storeId });
    if (!captionsOn) return { ok: false, reason: 'FEATURE_OFF' };

    const agent = await deps.db.aiAgent.findUnique({ where: { key: SOCIAL_CAPTION_AGENT_KEY } });
    if (!agent || agent.archivedAt) return { ok: false, reason: 'AI_OFF' };
    const masterOn = await deps.resolver.value('ai.enabled', { storeId });
    const workingNow = (masterOn || agent.keepOnWhenMasterOff) && agent.enabled;
    if (!workingNow) return { ok: false, reason: 'AI_OFF' };

    const selectedProvider = agent.selectedProvider && isWriterProvider(agent.selectedProvider) ? agent.selectedProvider : null;
    const options = await listWriterOptions(deps.db);
    const selectedOpt = options.find((o) => o.provider === selectedProvider);
    const selectedReady = selectedProvider === null || Boolean(selectedOpt?.ready);
    const routing = routeProvider(agentDataClass(SOCIAL_CAPTION_AGENT_KEY), selectedProvider, selectedReady, options);
    if (!routing.effectiveProvider) return { ok: false, reason: 'NOT_READY' };

    const job = jobOf(SOCIAL_CAPTION_JOB_KEY);
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

    const [testS, cacheS, voice] = await Promise.all([
      deps.resolver.value('system.integrationTestTimeoutSeconds'),
      deps.resolver.value('system.integrationKeyCacheSeconds'),
      deps.resolver.value('studio.voice', { storeId }),
    ]);
    const c = createConnections({ db: deps.db, vault: deps.vault ?? { get: async () => null }, adapters: aiWriterAdapters, secretCacheMs: cacheS * 1000, testTimeoutMs: testS * 1000 });
    const link = await c.use<AiWriter>('AI_PROVIDER', { storeId, provider: routing.effectiveProvider });
    if (link.mode === 'MOCK') return { ok: false, reason: 'NOT_READY' }; // defensive: `selectedReady` above already means this should not happen

    const draft = await link.api.draftSocialReelCaption({
      locale,
      facts: { templateName: facts.templateName, notes: facts.notes?.trim() || undefined, toneEn: voice.toneEn.trim() || undefined },
      max: { body: MAX_CAPTION_CHARS },
    });
    if (!draft.body.trim()) return { ok: false, reason: 'NO_ANSWER' };

    // One deliberate press, one charge: a fresh id per call, never a content hash (the same "no existing draft
    // moment to hook into" convention `product-content-dispatch.ts`'s own header comment already explains).
    const idempotencyKey = `social-caption:${templateId}:${randomUUID()}`;
    const usage: typeof job.usage = draft.usage ? { kind: 'text', ...draft.usage } : job.usage;
    const recorded = await recordAiUsage({ db: deps.db, resolver: deps.resolver }, { idempotencyKey, storeId, agentKey: SOCIAL_CAPTION_AGENT_KEY, jobTypeKey: SOCIAL_CAPTION_JOB_KEY, modelKey: model.modelKey, usage, refType: 'StudioTemplate', refId: templateId });
    if (recorded.ok) {
      await recordDiaryEntry({ db: deps.db, resolver: deps.resolver, now: deps.now }, { storeId, agentKey: SOCIAL_CAPTION_AGENT_KEY, summaryBn: 'একটা রিলের ক্যাপশন এআই লিখে দিয়েছে, রিভিউর জন্য।', refType: 'StudioTemplate', refId: templateId });
    }

    // The real call was made and is charged either way (the cost is real whether or not the words are shown); a
    // caption using one of the store's own blocked words is simply never handed back for the staff to see
    // (`studio.voice.blockedWords` — the same list a queued caption is meant to be checked against).
    const lower = draft.body.toLowerCase();
    if (voice.blockedWords.some((w) => lower.includes(w.toLowerCase()))) return { ok: false, reason: 'BLOCKED_WORD' };

    return { ok: true, body: draft.body };
  } catch {
    // Never breaks the explicit action the staff member pressed (CLAUDE.md CN-016 "nothing reaches the owner
    // broken"): any unexpected failure anywhere above is an honest "no answer", not a 500.
    return { ok: false, reason: 'NO_ANSWER' };
  }
}
