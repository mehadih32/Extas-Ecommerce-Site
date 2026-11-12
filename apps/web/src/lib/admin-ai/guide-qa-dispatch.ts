// S15 · PR 334 (Blueprint B4.15 "say only what you were given"; C1.1-C1.6, A5.1-A5.6; CLAUDE.md CN-026 "the
// page-aware AI helper explains, walks through ... and takes commands through the approval queue") — the tenth real
// AI-provider job dispatcher: wires the EXISTING Cost Book job `adminGuideAnswer` (PR 312, section "admin", owner
// `prohori`) to a live model call, through the same guardrail layers PR 304-324 already built and PR 325-333 first
// called in production — the master switch and per-agent on/off (`workingNow`), the agent's own routed model pick
// (PR 307/310), the monthly spend cap (PR 309), the shared usage ledger (PR 315) and the AI diary (PR 319).
//
// Owned by `prohori` (C10's org chart; `agents.ts`'s own role line names "settings framework ... site health &
// audit" — the admin shell and its own guide panel sit squarely in that remit), `business` data-class routing
// (the same class his other jobs already carry — a question about how an admin page works carries no customer
// data at all, but one agent keeps one routing policy).
//
// Scope decision ("System Q&A agent — the owner asks the system how it works", the register's own name for this
// PR): of the `admin` section's six jobs, this PR wires `adminGuideAnswer` — the one that answers a question about
// the page the owner is already on, the plainest fit for "ask the system how it works". `adminGuideWalkthrough`
// ("Show me", a step-by-step UI walkthrough — needs a highlighting/screenshot mechanism this PR does not build),
// `adminSettingSuggest`/`adminBugTriage`/`adminAuditSummary`/`adminSearchAnswer` are left for their own later PRs,
// each wiring one more already-existing Cost Book job at a time (PR 325-333's own precedent).
//
// Grounded, not invented: `facts` is never an answer invented for this PR — it is always the current admin page's
// own already-written Bengali guide (`docs/admin-guide/pages/<section>/<page>.md`, read through
// `@/lib/admin-shell/guide`'s own `readPageGuide`, flattened to plain text here, struck-through/superseded lines
// dropped since CN-026's own convention marks those "no longer true"). The model may only answer from that text; the
// prompt itself (`prompts.ts`'s new `GUIDE_QA_RULE`) requires it to say plainly when the guide does not cover the
// question, rather than invent a button, field or step that is not already written there. The guide text itself is
// always written in Bengali (CN-014); the answer follows the admin interface's own English/Bengali toggle (`locale`)
// — a translated answer grounded in that same Bengali text, never a second, invented guide in either language.
import { createHash } from 'node:crypto';
import { aiWriterAdapters, createConnections, cutTo, type AiWriter } from '@extas/adapters';
import { dayStart, ymdIn } from '@extas/metrics';
import type { PrismaClient } from '@extas/db/client';
import type { Vault } from '@extas/vault';
import type { Block, Inline } from '../admin-shell/guide';
import type { AppResolver } from '../settings';
import { pricerFor } from '../exchange-rate';
import { agentDataClass, routeProvider } from './data-classes';
import { estimateMicrosFor, jobOf, MODEL_CATALOG, microsToUsdMinor, modelOf, type ModelCatalogEntry } from './cost-book';
import { recordDiaryEntry } from './diary';
import { isWriterProvider, listWriterOptions } from './model-picks';
import { agentCapState, wouldExceedCap } from './spend-cap';
import { recordAiUsage } from './usage-ledger';

/** The one agent and the one, already-existing Cost Book job this PR wires — `agents.ts`'s own `prohori` owns the
 * admin shell/site-health remit (C10's org chart), and `cost-book.ts`'s own `adminGuideAnswer` row is the job this
 * call is billed as (no new Cost Book row: the catalogue stays at the count PR 333 left it). */
const GUIDE_QA_AGENT_KEY = 'prohori' as const;
const GUIDE_QA_JOB_KEY = 'adminGuideAnswer';
/** Prompt-side ceilings, not store settings — never a business/charge limit. */
const MAX_ANSWER_CHARS = 400; // hardcode-ok: one short, plain answer, never a full re-write of the guide
const MAX_GUIDE_TEXT_CHARS = 4000; // hardcode-ok: a page guide's own longest sections already fit well inside this
const MAX_QUESTION_CHARS = 300; // hardcode-ok: one question, never a paragraph

export interface GuideQaAiDeps {
  db: PrismaClient;
  resolver: Pick<AppResolver, 'value'>;
  vault: Pick<Vault, 'get'> | null;
  now?: () => Date;
}

/** One page guide's own flattened text, in the order it is written, for the one function below to ground an answer
 * on. Struck-through inline text (`{ t: 's' }`, CN-026's own "superseded, no longer true" mark) is dropped — never
 * grounds an answer in words the guide itself says are no longer true. */
function textOf(c: Inline[]): string {
  return c
    .map((x) => {
      switch (x.t) {
        case 'text':
        case 'code':
          return x.v;
        case 's':
          return '';
        default:
          return textOf(x.c);
      }
    })
    .join('');
}

/** The page guide's own body, flattened to plain text: headings and paragraphs as lines, list items as "- …",
 * table cells joined with " | ", code blocks kept verbatim, boxes (Tip/Careful/Example) kept with their own kind
 * named so the model can tell a caution from a tip. Never anything beyond what the guide file itself already says. */
export function plainTextOfGuide(blocks: Block[]): string {
  const out: string[] = [];
  const walk = (bs: Block[]) => {
    for (const b of bs) {
      switch (b.t) {
        case 'h':
        case 'p': {
          const line = textOf(b.c).trim();
          if (line) out.push(line);
          break;
        }
        case 'pre':
          if (b.v.trim()) out.push(b.v.trim());
          break;
        case 'hr':
          break;
        case 'box': {
          out.push(`[${b.kind}]`);
          walk(b.blocks);
          break;
        }
        case 'table': {
          const head = b.head.map((c) => textOf(c).trim()).join(' | ');
          if (head) out.push(head);
          for (const r of b.rows) {
            const row = r.map((c) => textOf(c).trim()).join(' | ');
            if (row) out.push(row);
          }
          break;
        }
        default: {
          for (const it of b.items) {
            const line = textOf(it.c).trim();
            if (line) out.push(`- ${line}`);
            if (it.sub.length) walk(it.sub);
          }
        }
      }
    }
  };
  walk(blocks);
  return out.join('\n');
}

/** The model catalogue entry for `providerKey`, at the job's own recommended tier where one exists, else the
 * cheapest text model that provider has — the same helper PR 325-333's own dispatchers already use. */
function modelForProvider(providerKey: string, tier: ModelCatalogEntry['tier']): ModelCatalogEntry | null {
  const sameTier = MODEL_CATALOG.find((m) => m.providerKey === providerKey && m.kind === 'text' && m.tier === tier);
  if (sameTier) return sameTier;
  return MODEL_CATALOG.filter((m) => m.providerKey === providerKey && m.kind === 'text').sort((a, b) => (a.inputPerMillionMicros ?? 0) - (b.inputPerMillionMicros ?? 0))[0] ?? null;
}

/**
 * One plain answer, in `locale`, to a question the owner typed about the admin page they are on — grounded only in
 * that page's own already-written Bengali guide (`guide.blocks`, never recomputed or second-guessed here). `null`
 * on any honest
 * "no" (AI off/paused, no ready connection for the routed data class, the monthly cap would be exceeded, the page
 * has no guide text at all, the question is empty, or the model answered with nothing usable) or on any failure —
 * this function never throws; a caller that gets `null` falls back to showing the guide's own text, exactly as the
 * guide panel already did before this PR.
 */
export async function guideQaAnswer(deps: GuideQaAiDeps, storeId: number, pageId: string, locale: 'en' | 'bn', question: string, guide: { title: string; blocks: Block[] }): Promise<string | null> {
  const q = question.trim();
  if (!q) return null;
  const guideText = plainTextOfGuide(guide.blocks).trim();
  if (!guideText) return null; // nothing written to ground an answer on
  try {
    const agent = await deps.db.aiAgent.findUnique({ where: { key: GUIDE_QA_AGENT_KEY } });
    if (!agent || agent.archivedAt) return null;
    const masterOn = await deps.resolver.value('ai.enabled', { storeId });
    const workingNow = (masterOn || agent.keepOnWhenMasterOff) && agent.enabled;
    if (!workingNow) return null;

    const selectedProvider = agent.selectedProvider && isWriterProvider(agent.selectedProvider) ? agent.selectedProvider : null;
    const options = await listWriterOptions(deps.db);
    const selectedOpt = options.find((o) => o.provider === selectedProvider);
    const selectedReady = selectedProvider === null || Boolean(selectedOpt?.ready);
    const routing = routeProvider(agentDataClass(GUIDE_QA_AGENT_KEY), selectedProvider, selectedReady, options);
    if (!routing.effectiveProvider) return null;

    const job = jobOf(GUIDE_QA_JOB_KEY);
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

    const cutGuideText = cutTo(guideText, MAX_GUIDE_TEXT_CHARS);
    const cutQuestion = cutTo(q, MAX_QUESTION_CHARS);
    const draft = await link.api.draftGuideQaAnswer({ locale, facts: { pageTitle: guide.title, guideText: cutGuideText, question: cutQuestion }, max: { body: MAX_ANSWER_CHARS } });
    if (!draft.body.trim()) return null;

    // Idempotent per page + the exact guide text and question asked: the same still-unchanged guide answering the
    // same question again (a repeat press, a second tab) reuses the same ledger row rather than charging it again;
    // a different question, or a guide the owner later rewrote, naturally hashes differently and earns its own,
    // fresh answer and charge.
    const idempotencyKey = `guide-qa:${pageId}:${createHash('sha1').update(`${locale}\u0000${cutGuideText}\u0000${cutQuestion}`).digest('hex')}`;
    const usage: typeof job.usage = draft.usage ? { kind: 'text', ...draft.usage } : job.usage;
    const recorded = await recordAiUsage({ db: deps.db, resolver: deps.resolver }, { idempotencyKey, storeId, agentKey: GUIDE_QA_AGENT_KEY, jobTypeKey: GUIDE_QA_JOB_KEY, modelKey: model.modelKey, usage, refType: 'AdminGuidePage', refId: pageId });
    if (recorded.ok && !recorded.idempotent) {
      await recordDiaryEntry({ db: deps.db, resolver: deps.resolver, now: deps.now }, { storeId, agentKey: GUIDE_QA_AGENT_KEY, summaryBn: 'অ্যাডমিনের একটা পাতার গাইড নিয়ে মালিকের একটা প্রশ্নের জবাব দিয়েছে, গাইডের নিজের লেখা থেকে।', refType: 'AdminGuidePage', refId: pageId });
    }
    return draft.body;
  } catch {
    // Additive like every job this chain has wired so far (C1.4): any failure at all leaves the guide panel exactly
    // as it was — the owner still has the guide's own written text to read.
    return null;
  }
}
