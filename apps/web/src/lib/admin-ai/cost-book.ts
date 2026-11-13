// S15 · PR 312 (Blueprint C2.1, C2.2; AIC-0x "AI Cost Book" — demo 89b-admin-agents.js #/admin/ai?tab=models) — the
// AI Cost Book: one searchable table of every AI job EXTAS could run, grouped by section (Support, Orders,
// Marketing, Social, SEO & blog, Site audit, Reports, Admin helpers, Studio), each row with what it does, Claude's
// own recommended model and why, an estimated cost per run and per month, the same job on other companies' models
// (Alternatives), and a model selector that changes the row's own model immediately (no settings page to hunt
// through). The job catalogue, the model price catalogue and every token/image/second assumption are structural
// reference data — like `AI_AGENTS` (agents.ts) or the permission catalogue — never the owner's own number, so they
// ship the same on every installation (CLAUDE.md rule 4); only the owner's own *pick* per job (`selectedModelId`)
// is his.
//
// Honest and inert like every AI 360 screen before an AI key exists: no job has run yet, so every number here is an
// *estimate* (C2.4's ±10–15% band note) until real usage exists. Cost is priced in USD (how every AI vendor bills)
// and shown in the store's own currency through the owner's own USD rate (`ExchangeRate`, PR 345/266, `pricerFor`) —
// with no rate typed yet, the page honestly shows the USD figure with a note, never an invented taka amount.
//
// PR 313 (Blueprint C2.3 "what makes it self-correcting"): a second, independent "Actual" figure sits beside every
// estimate — each job's own real cost over the last `ACTUAL_WINDOW_DAYS`, read from `AiUsageLedger.jobTypeKey`
// (PR 315's ledger; its writer is still no job dispatcher — honestly null until one exists, exactly as
// `spend-cap.ts` already says of the same table) and persisted into `AiJobType.actualPerRunMicros` (already in the
// S00 schema, tagged for this PR, additive, unused until now) so a report elsewhere can read it without recomputing.
// It never overwrites the estimate or the owner's own model pick — the owner reads both and decides; nothing here
// changes a model automatically. Shown only once `MIN_ACTUAL_SAMPLES` real runs exist, so a single stray run never
// reads as "the real cost" — the ±10–15% band narrows only once enough of them do.
//
// PR 314 (Blueprint C2.3's "what if" slider and one-click presets): `PRESET_KEYS`/`presetModelFor` pick Economy
// (the cheapest same-kind model for each job), Balanced (Claude's own recommendation — unchanged) and Premium (the
// costliest same-kind model), so Economy ≤ Balanced ≤ Premium for every job by construction. `costBookView` shows
// each preset's own hypothetical monthly total and how many jobs would change (and in which direction — a tier
// shift, since no quality score exists yet; that is PR 580) before the owner applies one; `applyPreset` then
// writes every changed job's `selectedModelId` in one transaction, one combined audit entry. The slider itself
// ("if I post 3 times a day instead of 1") is pure per-section arithmetic on numbers the page already has, so it
// lives client-side only (`cost-book-whatif.ts`) — never a server round trip while it is being dragged.
//
// Out of this PR's scope, its own register PR: the free-form cost calculator reachable from Telegram (316).
import { audit, type Actor, type RequestContext } from '@extas/auth';
import type { PrismaClient } from '@extas/db/client';
import { ymdIn } from '@extas/metrics';
import type { AppResolver } from '../settings';
import { pricerFor, type Pricer } from '../exchange-rate';
import { isAiAgentKey, type AiAgentKey } from './agents';
import { AiError, isAiError } from './errors';

// ---------------------------------------------------------------------------------------------------------------
// The model price catalogue (C2.2's "Recommended model and why" / "Alternatives" / "Model selector" columns).
// ---------------------------------------------------------------------------------------------------------------

export type ModelKind = 'text' | 'image' | 'video';

export interface ModelCatalogEntry {
  providerKey: string;
  providerName: string;
  modelKey: string;
  displayName: string;
  kind: ModelKind;
  /** Small/cheap, mid or large — the point of the recommendation (Blueprint C2.2). */
  tier: 'small' | 'mid' | 'large';
  priceCurrency: 'USD';
  /** Millionths of a USD per million input tokens (text only). */
  inputPerMillionMicros?: number;
  /** Millionths of a USD per million output tokens (text only). */
  outputPerMillionMicros?: number;
  /** Millionths of a USD per image (image only). */
  perImageMicros?: number;
  /** Millionths of a USD per second of video (video only). */
  perVideoSecondMicros?: number;
  /** Genuinely free to run (no per-token/per-image charge) — PR 580's own qualification pool, never a "free
   * trial"/"free credits" model that turns paid later. Defaults to false (every model above is paid). */
  isFree?: boolean;
}

/** Reference prices only (editable/refreshable in a later PR, C2.3) — approximate public per-million/per-unit
 * figures, not a live feed. `tier` drives which model the Cost Book recommends for which kind of job.
 * PR 580 adds the last two rows: real zero-cost OpenRouter community models (`isFree: true`), the same free
 * tier the demo's own pool names (Blueprint C2.4 "free models are qualified like paid ones") — small-tier only,
 * because that is genuinely what ships free; qualification (below) decides which job they are good enough for,
 * never by widening the free pool itself. */
export const MODEL_CATALOG: readonly ModelCatalogEntry[] = [
  { providerKey: 'anthropic', providerName: 'Anthropic', modelKey: 'claude-haiku', displayName: 'Claude Haiku', kind: 'text', tier: 'small', priceCurrency: 'USD', inputPerMillionMicros: 800_000, outputPerMillionMicros: 4_000_000 },
  { providerKey: 'anthropic', providerName: 'Anthropic', modelKey: 'claude-sonnet', displayName: 'Claude Sonnet', kind: 'text', tier: 'mid', priceCurrency: 'USD', inputPerMillionMicros: 3_000_000, outputPerMillionMicros: 15_000_000 },
  { providerKey: 'anthropic', providerName: 'Anthropic', modelKey: 'claude-opus', displayName: 'Claude Opus', kind: 'text', tier: 'large', priceCurrency: 'USD', inputPerMillionMicros: 15_000_000, outputPerMillionMicros: 75_000_000 },
  { providerKey: 'openAi', providerName: 'OpenAI', modelKey: 'gpt-4o-mini', displayName: 'GPT-4o mini', kind: 'text', tier: 'small', priceCurrency: 'USD', inputPerMillionMicros: 150_000, outputPerMillionMicros: 600_000 },
  { providerKey: 'openAi', providerName: 'OpenAI', modelKey: 'gpt-4o', displayName: 'GPT-4o', kind: 'text', tier: 'mid', priceCurrency: 'USD', inputPerMillionMicros: 2_500_000, outputPerMillionMicros: 10_000_000 },
  { providerKey: 'openAi', providerName: 'OpenAI', modelKey: 'o1', displayName: 'OpenAI o1', kind: 'text', tier: 'large', priceCurrency: 'USD', inputPerMillionMicros: 15_000_000, outputPerMillionMicros: 60_000_000 },
  { providerKey: 'googleAi', providerName: 'Google', modelKey: 'gemini-flash', displayName: 'Gemini Flash', kind: 'text', tier: 'small', priceCurrency: 'USD', inputPerMillionMicros: 75_000, outputPerMillionMicros: 300_000 },
  { providerKey: 'googleAi', providerName: 'Google', modelKey: 'gemini-pro', displayName: 'Gemini Pro', kind: 'text', tier: 'mid', priceCurrency: 'USD', inputPerMillionMicros: 1_250_000, outputPerMillionMicros: 5_000_000 },
  { providerKey: 'openRouter', providerName: 'OpenRouter', modelKey: 'llama-3-70b', displayName: 'Llama 3 70B', kind: 'text', tier: 'mid', priceCurrency: 'USD', inputPerMillionMicros: 350_000, outputPerMillionMicros: 400_000 },
  { providerKey: 'openRouter', providerName: 'OpenRouter', modelKey: 'mixtral-8x7b', displayName: 'Mixtral 8x7B', kind: 'text', tier: 'small', priceCurrency: 'USD', inputPerMillionMicros: 240_000, outputPerMillionMicros: 240_000 },
  { providerKey: 'fashn', providerName: 'FASHN', modelKey: 'fashn-core', displayName: 'FASHN Core', kind: 'image', tier: 'mid', priceCurrency: 'USD', perImageMicros: 80_000 },
  { providerKey: 'fashn', providerName: 'FASHN', modelKey: 'fashn-upscale', displayName: 'FASHN Upscale', kind: 'image', tier: 'small', priceCurrency: 'USD', perImageMicros: 30_000 },
  { providerKey: 'stability', providerName: 'Stability AI', modelKey: 'sdxl-finish', displayName: 'Stable Diffusion XL', kind: 'image', tier: 'small', priceCurrency: 'USD', perImageMicros: 40_000 },
  { providerKey: 'videoGen', providerName: 'Runway', modelKey: 'runway-gen', displayName: 'Runway Gen', kind: 'video', tier: 'mid', priceCurrency: 'USD', perVideoSecondMicros: 500_000 },
  { providerKey: 'pika', providerName: 'Pika', modelKey: 'pika-gen', displayName: 'Pika Gen', kind: 'video', tier: 'mid', priceCurrency: 'USD', perVideoSecondMicros: 400_000 },
  { providerKey: 'serverRender', providerName: 'Server render', modelKey: 'ffmpeg-assemble', displayName: 'Server assembly', kind: 'video', tier: 'small', priceCurrency: 'USD', perVideoSecondMicros: 10_000 },
  // PR 580 — the free-model pool: genuinely zero-cost community models on OpenRouter, qualified against every
  // job's own quality bar exactly like a paid model (never assumed good enough, never excluded on sight either).
  { providerKey: 'openRouter', providerName: 'OpenRouter', modelKey: 'llama-3.1-8b-free', displayName: 'Llama 3.1 8B (free)', kind: 'text', tier: 'small', priceCurrency: 'USD', inputPerMillionMicros: 0, outputPerMillionMicros: 0, isFree: true },
  { providerKey: 'openRouter', providerName: 'OpenRouter', modelKey: 'gemma-2-9b-free', displayName: 'Gemma 2 9B (free)', kind: 'text', tier: 'small', priceCurrency: 'USD', inputPerMillionMicros: 0, outputPerMillionMicros: 0, isFree: true },
] as const;

export function modelOf(modelKey: string): ModelCatalogEntry {
  const found = MODEL_CATALOG.find((m) => m.modelKey === modelKey);
  if (!found) throw new AiError(404, 'UNKNOWN_MODEL', ['modelKey']);
  return found;
}

export function isModelKey(value: string): boolean {
  return MODEL_CATALOG.some((m) => m.modelKey === value);
}

// ---------------------------------------------------------------------------------------------------------------
// The job catalogue (C2.2's "Job" / "What it does" rows) — the 60–90 job types, grouped by section, plus every
// photoshoot/video sub-job under "studio".
// ---------------------------------------------------------------------------------------------------------------

export const COST_BOOK_SECTIONS = ['support', 'orders', 'marketing', 'social', 'seo', 'audit', 'reports', 'admin', 'studio'] as const;
export type CostBookSection = (typeof COST_BOOK_SECTIONS)[number];

export const SECTION_NAMES: Record<CostBookSection, { en: string; bn: string }> = {
  support: { en: 'Support', bn: 'সাপোর্ট' },
  orders: { en: 'Orders', bn: 'অর্ডার' },
  marketing: { en: 'Marketing', bn: 'মার্কেটিং' },
  social: { en: 'Social', bn: 'সোশ্যাল' },
  seo: { en: 'SEO & blog', bn: 'SEO ও ব্লগ' },
  audit: { en: 'Site audit', bn: 'সাইট অডিট' },
  reports: { en: 'Reports', bn: 'রিপোর্ট' },
  admin: { en: 'Admin helpers', bn: 'অ্যাডমিন সহায়ক' },
  studio: { en: 'Photoshoot & video', bn: 'ফটোশুট ও ভিডিও' },
};

export type JobUsage = { kind: 'text'; inputTokens: number; outputTokens: number } | { kind: 'image'; images: number } | { kind: 'video'; seconds: number };

export interface JobCatalogEntry {
  key: string;
  section: CostBookSection;
  nameEn: string;
  nameBn: string;
  description: string;
  agentKey: AiAgentKey | null;
  usage: JobUsage;
  recommendedModelKey: string;
  recommendationNote: string;
  /** A believable baseline for the monthly estimate preview (C2.2) — not real usage (no job runner reads this yet). */
  typicalRunsPerDay: number;
}

const TEXT_SMALL = 'gemini-flash';
const TEXT_MID = 'claude-sonnet';
const TEXT_LARGE = 'claude-opus';
const SMALL_NOTE = 'A small, cheap model — this job is simple classification or parsing, not real reasoning.';
const MID_NOTE = 'A mid model — this job is real writing; the practice/small model reads too plainly here.';
const LARGE_NOTE = 'The large model — this job needs real judgement, not just fluent writing.';

function textJob(key: string, section: CostBookSection, nameEn: string, nameBn: string, description: string, agentKey: AiAgentKey | null, inputTokens: number, outputTokens: number, model: string, note: string, runsPerDay: number): JobCatalogEntry {
  return { key, section, nameEn, nameBn, description, agentKey, usage: { kind: 'text', inputTokens, outputTokens }, recommendedModelKey: model, recommendationNote: note, typicalRunsPerDay: runsPerDay };
}
function imageJob(key: string, section: CostBookSection, nameEn: string, nameBn: string, description: string, agentKey: AiAgentKey | null, images: number, model: string, note: string, runsPerDay: number): JobCatalogEntry {
  return { key, section, nameEn, nameBn, description, agentKey, usage: { kind: 'image', images }, recommendedModelKey: model, recommendationNote: note, typicalRunsPerDay: runsPerDay };
}
function videoJob(key: string, section: CostBookSection, nameEn: string, nameBn: string, description: string, agentKey: AiAgentKey | null, seconds: number, model: string, note: string, runsPerDay: number): JobCatalogEntry {
  return { key, section, nameEn, nameBn, description, agentKey, usage: { kind: 'video', seconds }, recommendedModelKey: model, recommendationNote: note, typicalRunsPerDay: runsPerDay };
}

export const JOB_CATALOG: readonly JobCatalogEntry[] = [
  // Support — gyani's own remit ("fraud, ... finance, support, studio, video").
  textJob('supportClassify', 'support', 'Classify one support message', 'একটা সাপোর্ট বার্তা চিহ্নিত করা', 'Sorts an incoming message into its topic (order, return, payment, other).', 'gyani', 250, 30, TEXT_SMALL, SMALL_NOTE, 40),
  textJob('supportReply', 'support', 'Reply to one support message', 'একটা সাপোর্ট বার্তার জবাব লেখা', "Drafts a reply for the owner or a staff member to send, in the customer's own language.", 'gyani', 500, 300, TEXT_MID, MID_NOTE, 30),
  textJob('supportSummarize', 'support', 'Summarize one support conversation', 'একটা সাপোর্ট কথোপকথনের সারাংশ', 'Turns a long back-and-forth into a few lines for a handover.', 'gyani', 1200, 150, TEXT_SMALL, SMALL_NOTE, 15),
  textJob('supportSentiment', 'support', "Score one message's tone", 'একটা বার্তার মেজাজ মাপা', 'Flags an angry or urgent message for a human to see first.', 'gyani', 200, 20, TEXT_SMALL, SMALL_NOTE, 40),
  textJob('supportTranscribeVoice', 'support', 'Transcribe one voice note', 'একটা ভয়েস নোট লেখায় রূপান্তর', 'Turns a customer voice message into text (vendor bills per audio minute; approximated here as text tokens until a per-minute price field exists).', 'gyani', 600, 600, TEXT_SMALL, 'Voice transcription is cheap — the smallest model is enough.', 10),
  textJob('supportTranslate', 'support', 'Translate one support message', 'একটা সাপোর্ট বার্তা অনুবাদ', 'Bengali ↔ English, so no message goes unanswered for want of a language.', 'gyani', 300, 300, TEXT_SMALL, SMALL_NOTE, 10),
  textJob('supportEscalationNote', 'support', 'Write one escalation note', 'মানুষ কর্মীর জন্য একটা হস্তান্তর নোট', 'A short brief for the human agent taking over a hard case.', 'gyani', 400, 250, TEXT_MID, MID_NOTE, 5),
  // PR 328 — Find My Size's own rule engine (PR 58) already decides the size; this job only explains why, in a
  // chat reply, from that engine's own measurements — never a second, independent guess at a size.
  textJob('supportSizeAdvice', 'support', 'Explain one size recommendation', 'একটা সাইজ সাজেশনের কারণ ব্যাখ্যা', "Turns Find My Size's own rule-based reasoning into one warm sentence for a support chat reply — the size itself is always the rule engine's, never this job's.", 'gyani', 300, 150, TEXT_SMALL, 'A small, cheap model — one short sentence from a handful of numbers the rule engine already decided, not real reasoning.', 15),

  // Orders — sawdagor's storefront/order logic, except fraud (gyani's own remit).
  textJob('orderAddressParse', 'orders', 'Parse one address', 'একটা ঠিকানা আলাদা করা', 'Splits a free-text address into district, upazila/thana and street.', 'sawdagor', 100, 60, TEXT_SMALL, SMALL_NOTE, 50),
  textJob('orderFraudJudge', 'orders', 'Judge one order for fraud risk', 'একটা অর্ডারের প্রতারণার ঝুঁকি বিচার', 'Weighs an order\'s own signals (address, history, amount) and gives a risk note, never an automatic block.', 'gyani', 1200, 400, TEXT_LARGE, LARGE_NOTE, 30),
  textJob('orderConfirmCall', 'orders', 'Write one order-confirmation script', 'একটা অর্ডার-নিশ্চিতকরণ কল স্ক্রিপ্ট', 'A short script for the confirmation call or message.', 'sawdagor', 200, 150, TEXT_SMALL, SMALL_NOTE, 25),
  textJob('orderReturnTriage', 'orders', 'Triage one return request', 'একটা রিটার্নের আবেদন বাছাই', 'Sorts a return into "approve", "ask a photo" or "needs the owner".', 'sawdagor', 400, 250, TEXT_MID, MID_NOTE, 10),
  textJob('orderRefundNote', 'orders', 'Draft one refund explanation', 'একটা রিফান্ডের ব্যাখ্যা লেখা', 'A plain line explaining why a refund is this amount — never moves money itself.', 'sawdagor', 300, 250, TEXT_MID, MID_NOTE, 5),
  textJob('orderInvoiceCheck', 'orders', 'Check one invoice for mismatches', 'একটা চালান মিলিয়ে দেখা', 'Compares an invoice against the order for a quantity or price mismatch.', 'sawdagor', 500, 200, TEXT_MID, MID_NOTE, 10),
  textJob('orderCancelReason', 'orders', 'Classify one cancellation reason', 'একটা বাতিলের কারণ চিহ্নিত করা', 'Buckets a free-text cancel reason for the weekly report.', 'sawdagor', 150, 30, TEXT_SMALL, SMALL_NOTE, 15),

  // Marketing — doot (non-paid) and tirondaj (ads only).
  textJob('mktProductDescription', 'marketing', 'Generate one product description', 'একটা প্রোডাক্টের বর্ণনা লেখা', "A new SKU's shop-facing description from its attributes.", 'doot', 300, 250, TEXT_MID, MID_NOTE, 15),
  textJob('mktEmailSubject', 'marketing', 'Write one email subject line', 'একটা ইমেইলের বিষয় লেখা', 'A short subject line for one campaign email.', 'doot', 100, 20, TEXT_SMALL, SMALL_NOTE, 5),
  textJob('mktEmailBody', 'marketing', 'Write one marketing email', 'একটা মার্কেটিং ইমেইল লেখা', 'The body of one campaign email, on brief.', 'doot', 300, 400, TEXT_MID, MID_NOTE, 3),
  textJob('mktAdCopy', 'marketing', 'Write one ad headline and body', 'একটা বিজ্ঞাপনের হেডলাইন ও লেখা', "Ad copy for one paid campaign, inside the owner's own guardrails.", 'tirondaj', 200, 150, TEXT_MID, MID_NOTE, 5),
  textJob('mktOfferIdea', 'marketing', 'Suggest one promotion idea', 'একটা প্রোমোশনের ধারণা দেওয়া', 'A promotion idea from current stock and the calendar — a suggestion only.', 'doot', 400, 300, TEXT_MID, MID_NOTE, 2),
  textJob('mktAudienceSummary', 'marketing', 'Summarize one audience segment', 'একটা দর্শক-অংশের সারাংশ', 'A plain summary of who is in one CRM segment.', 'doot', 500, 150, TEXT_SMALL, SMALL_NOTE, 3),
  textJob('mktCampaignBrief', 'marketing', 'Write one campaign brief', 'একটা ক্যাম্পেইনের ব্রিফ লেখা', 'A one-page brief for one paid campaign before it is built.', 'tirondaj', 400, 500, TEXT_MID, MID_NOTE, 2),

  // Social — doot.
  textJob('socialReelCaption', 'social', 'Write one reel caption', 'একটা রিলের ক্যাপশন লেখা', 'A caption with a hook for one short video.', 'doot', 150, 60, TEXT_SMALL, SMALL_NOTE, 5),
  videoJob('socialReelBuild', 'social', 'Build one reel', 'একটা রিল বানানো', 'Stitches finished clips, captions and music into one posted reel.', 'doot', 20, 'ffmpeg-assemble', 'Reel assembly is mostly server time, not model tokens — the cheapest option is also the right one.', 3),
  textJob('socialPostIdea', 'social', 'Suggest one post idea', 'একটা পোস্টের ধারণা দেওয়া', 'One post idea from recent stock, trends or the calendar.', 'doot', 150, 80, TEXT_SMALL, SMALL_NOTE, 5),
  textJob('socialCommentReply', 'social', 'Reply to one social comment', 'একটা সোশ্যাল মন্তব্যের জবাব', 'A draft reply for a public comment, for the owner or staff to send.', 'doot', 100, 60, TEXT_SMALL, SMALL_NOTE, 15),
  textJob('socialHashtagSet', 'social', 'Suggest one hashtag set', 'একটা হ্যাশট্যাগ সেট দেওয়া', 'A small set of relevant hashtags for one post.', 'doot', 100, 40, TEXT_SMALL, SMALL_NOTE, 5),
  textJob('socialStoryCaption', 'social', 'Write one story caption', 'একটা স্টোরির ক্যাপশন লেখা', 'A short caption for one story post.', 'doot', 100, 40, TEXT_SMALL, SMALL_NOTE, 8),
  textJob('socialTrendScan', 'social', 'Scan one trend for relevance', 'একটা ট্রেন্ড প্রাসঙ্গিক কিনা দেখা', 'Checks whether a trending topic or sound fits the shop before suggesting it.', 'doot', 800, 200, TEXT_MID, MID_NOTE, 2),

  // SEO & blog — doot.
  textJob('seoBlogArticle', 'seo', 'Write one blog article', 'একটা ব্লগ লেখা', 'A full ~1,200-word article on brief, with headings.', 'doot', 600, 1800, TEXT_MID, MID_NOTE, 1),
  textJob('seoMetaTags', 'seo', "Write one page's meta title and description", 'একটা পাতার মেটা টাইটেল ও বর্ণনা', 'The title and description shown in search results.', 'doot', 300, 80, TEXT_SMALL, SMALL_NOTE, 3),
  textJob('seoKeywordCluster', 'seo', 'Cluster one keyword set', 'একটা কীওয়ার্ড গুচ্ছ সাজানো', 'Groups related search terms under one content idea.', 'doot', 600, 400, TEXT_MID, MID_NOTE, 1),
  textJob('seoAltText', 'seo', "Write one image's alt text", 'একটা ছবির Alt টেক্সট', 'A plain description for one product image, for search and accessibility.', 'doot', 100, 40, TEXT_SMALL, SMALL_NOTE, 10),
  textJob('seoInternalLinks', 'seo', "Suggest one page's internal links", 'একটা পাতার ভেতরের লিংক সাজেস্ট', 'Finds 2–3 related pages worth linking from one article.', 'doot', 500, 150, TEXT_SMALL, SMALL_NOTE, 2),
  textJob('seoSchemaCheck', 'seo', "Check one page's structured data", 'একটা পাতার স্ট্রাকচার্ড ডেটা চেক', 'Flags a missing or wrong schema field.', 'doot', 400, 100, TEXT_SMALL, SMALL_NOTE, 2),
  textJob('seoRewriteOld', 'seo', 'Rewrite one outdated article', 'একটা পুরোনো লেখা নতুন করে লেখা', "Refreshes an old article's facts and wording.", 'doot', 1500, 1500, TEXT_MID, MID_NOTE, 1),

  // Site audit — prohori ("site health & audit").
  textJob('auditPageCheck', 'audit', 'Judge one checklist point without a script', 'স্ক্রিপ্ট নেই এমন একটা চেকপয়েন্ট বিচার', 'The "agent-judged" checklist points the audit runner itself cannot script (PR 570).', 'prohori', 600, 300, TEXT_MID, MID_NOTE, 6),
  textJob('auditScreenshotReview', 'audit', "Review one page's screenshot for a visual bug", 'একটা স্ক্রিনশট দেখে ভিজ্যুয়াল সমস্যা খোঁজা', 'Looks for a layout or overlap problem a script would miss.', 'prohori', 800, 300, TEXT_MID, MID_NOTE, 6),
  textJob('auditConsoleTriage', 'audit', 'Triage one console error', 'একটা কনসোল এরর বাছাই', 'Sorts a browser console error by how serious it is.', 'prohori', 300, 150, TEXT_SMALL, SMALL_NOTE, 10),
  textJob('auditA11yScan', 'audit', 'Scan one page for an accessibility issue', 'একটা পাতায় অ্যাক্সেসিবিলিটি সমস্যা খোঁজা', 'Checks contrast, labels and focus order on one page.', 'prohori', 600, 300, TEXT_MID, MID_NOTE, 4),
  textJob('auditBrokenLink', 'audit', 'Check one link for a dead page', 'একটা লিংক মরা পাতায় যায় কিনা দেখা', 'Confirms whether a flagged link actually leads nowhere.', 'prohori', 100, 40, TEXT_SMALL, SMALL_NOTE, 10),
  textJob('auditCopyReview', 'audit', "Review one page's Bengali wording", 'একটা পাতার বাংলা লেখা পর্যালোচনা', "Checks one page's Bengali for plainness and tone.", 'prohori', 800, 400, TEXT_MID, MID_NOTE, 3),
  textJob('auditRegressionNote', 'audit', 'Write one regression note', 'একটা রিগ্রেশন নোট লেখা', 'A short note on what broke again and since when.', 'prohori', 300, 150, TEXT_SMALL, SMALL_NOTE, 2),

  // Reports — gyani (finance/reporting sits in the chief's own remit).
  textJob('reportsDaily', 'reports', 'Write one daily report', 'একটা দৈনিক রিপোর্ট লেখা', "The owner's own daily Telegram summary in plain Bengali.", 'gyani', 1000, 600, TEXT_MID, MID_NOTE, 1),
  textJob('reportsWeekly', 'reports', 'Write one weekly report', 'একটা সাপ্তাহিক রিপোর্ট লেখা', "The week's numbers turned into a plain summary.", 'gyani', 2000, 1000, TEXT_MID, MID_NOTE, 1),
  textJob('reportsAnomalyFlag', 'reports', 'Flag one unusual number', 'একটা অস্বাভাবিক সংখ্যা চিহ্নিত করা', 'Explains in one line why a number looks off versus the usual pattern.', 'gyani', 500, 200, TEXT_MID, MID_NOTE, 3),
  textJob('reportsForecastNote', 'reports', 'Write one short forecast note', 'একটা সংক্ষিপ্ত পূর্বাভাস নোট', 'A short, caveated forecast line — real reasoning, not just fluent text.', 'gyani', 1500, 800, TEXT_LARGE, LARGE_NOTE, 1),
  textJob('reportsCompetitorScan', 'reports', 'Scan one competitor price', 'একটা প্রতিদ্বন্দ্বীর দাম দেখা', "Reads one competitor's public price for the same or similar item.", 'gyani', 400, 150, TEXT_SMALL, SMALL_NOTE, 5),
  textJob('reportsCompetitorJourneyStep', 'reports', "Observe one step of a competitor's journey", 'প্রতিদ্বন্দ্বীর পাতার একটা ধাপ দেখা', "Describes what one already-read page of a competitor's own journey (category, product, cart or checkout) shows — layout, trust signals, offers, checkout fields — never a price or a decision, never the page's own wording copied.", 'gyani', 1800, 350, TEXT_MID, MID_NOTE, 3),
  textJob('reportsCompetitorComparison', 'reports', 'Judge one competitor walk against our own', 'প্রতিদ্বন্দ্বীর হাঁটা আমাদেরটার সঙ্গে বিচার করা', "Takes one already-walked competitor journey side by side with our own matching pages and judges each step — they're better / we're better / neither matters — with a Pick / Pick with changes / Skip recommendation and why; never invents a step that was not walked.", 'gyani', 3000, 1200, TEXT_LARGE, LARGE_NOTE, 2),
  textJob('reportsStockAlert', 'reports', 'Write one low-stock alert line', 'একটা কম-স্টকের সতর্কতা লেখা', 'A plain Bengali line for one SKU running low.', 'gyani', 200, 80, TEXT_SMALL, SMALL_NOTE, 5),
  textJob('reportsExecSummary', 'reports', 'Summarize one month for the owner', 'এক মাসের সারাংশ মালিকের জন্য', 'The month in a page — needs real judgement about what mattered.', 'gyani', 2500, 1200, TEXT_LARGE, LARGE_NOTE, 1),

  // Admin helpers — prohori (settings/admin/security is prohori's own remit).
  textJob('adminGuideAnswer', 'admin', 'Answer one admin guide question', 'অ্যাডমিন গাইডের একটা প্রশ্নের জবাব', 'The page-aware AI helper (CN-026) answering one question about the page the owner is on.', 'prohori', 500, 400, TEXT_MID, MID_NOTE, 10),
  textJob('adminGuideWalkthrough', 'admin', 'Walk through one admin page', 'একটা অ্যাডমিন পাতা ধাপে ধাপে দেখানো', '"Show me" — a step-by-step walkthrough of one page\'s own controls.', 'prohori', 600, 500, TEXT_MID, MID_NOTE, 3),
  textJob('adminApprovalExplain', 'admin', 'Explain one pending approval', 'অনুমতির অপেক্ষায় থাকা একটা কাজ ব্যাখ্যা', 'A plain-language explanation of one item in the approval queue (PR 317).', 'gyani', 300, 150, TEXT_SMALL, SMALL_NOTE, 10),
  textJob('adminSettingSuggest', 'admin', 'Suggest one setting to review', 'একটা সেটিং পর্যালোচনার সাজেশন', "Flags one setting that looks unusual next to the shop's own data.", 'prohori', 300, 150, TEXT_SMALL, SMALL_NOTE, 2),
  textJob('adminBugTriage', 'admin', 'Triage one bug-box report', 'বাগ-বক্সের একটা রিপোর্ট বাছাই', 'Sorts an owner-submitted bug report by area and severity (PR 320).', 'prohori', 500, 300, TEXT_MID, MID_NOTE, 3),
  textJob('adminAuditSummary', 'admin', "Summarize one audit run's problems", 'একটা অডিট চালানোর সমস্যার সারাংশ', "Turns the checklist audit's problem list (PR 570) into one plain paragraph.", 'prohori', 700, 400, TEXT_MID, MID_NOTE, 1),
  textJob('adminSearchAnswer', 'admin', 'Answer one admin search question', 'অ্যাডমিন সার্চের একটা প্রশ্নের জবাব', 'The one shared admin search box answering "where do I...".', 'prohori', 200, 150, TEXT_SMALL, SMALL_NOTE, 15),

  // Studio: every photoshoot and video sub-job (Blueprint C2.2) — gyani's own remit ("studio, video").
  imageJob('studioGhostMannequin', 'studio', 'Ghost-mannequin one photo', 'একটা ছবি ঘোস্ট-ম্যানিকিন করা', "Removes the mannequin/model, leaving the garment's own shape.", 'gyani', 1, 'fashn-core', 'The garment-specific model, not a general image generator.', 10),
  imageJob('studioTryOn', 'studio', 'Virtual try-on one photo', 'একটা ছবিতে ভার্চুয়াল ট্রাই-অন', 'Places the garment on a model photo.', 'gyani', 1, 'fashn-core', 'The garment-specific model, not a general image generator.', 10),
  imageJob('studioDetailReprojection', 'studio', 'Re-project one garment detail', 'একটা পোশাকের বিবরণ পুনরায় বসানো', 'Keeps a real stitch/print/logo detail accurate after a generated change.', 'gyani', 1, 'fashn-core', 'The garment-specific model, not a general image generator.', 8),
  imageJob('studioUpscale', 'studio', 'Upscale one image', 'একটা ছবি আপস্কেল করা', 'Raises one image\'s resolution for the product page or print.', 'gyani', 1, 'fashn-upscale', 'Upscaling is a cheaper, narrower job than generation.', 15),
  imageJob('studioFinishing', 'studio', 'Finish one image (light/colour/retouch)', 'একটা ছবির ফিনিশিং (আলো/রং/রিটাচ)', 'The last light, colour and retouch pass before publishing.', 'gyani', 1, 'fashn-core', 'The garment-specific model, not a general image generator.', 10),
  textJob('studioDetailFinder', 'studio', "Find one garment's key details", 'একটা পোশাকের মূল বিবরণ খুঁজে বের করা', 'Points out which details (stitch, print, logo) must stay accurate before generation.', 'gyani', 500, 100, TEXT_SMALL, SMALL_NOTE, 10),
  textJob('studioQualityScoring', 'studio', "Score one generated image's quality", 'একটা তৈরি ছবির মান যাচাই', 'A best-of-N quality score, so the weakest generation never ships.', 'gyani', 500, 80, TEXT_SMALL, SMALL_NOTE, 20),
  videoJob('studioImageToVideo', 'studio', 'Turn one image into a video clip', 'একটা ছবি থেকে ভিডিও ক্লিপ বানানো', 'One short motion clip from a still product photo.', 'gyani', 4, 'runway-gen', 'Video generation is priced per second and costs far more than a text job.', 5),
  videoJob('studioReelAssembly', 'studio', 'Assemble one reel from clips', 'ক্লিপ দিয়ে একটা রিল জোড়া লাগানো', 'Stitches generated clips, captions and music into one reel file.', 'gyani', 20, 'ffmpeg-assemble', 'Assembly is mostly server time, not model tokens — the cheapest option is also the right one.', 3),
] as const;

export function jobOf(key: string): JobCatalogEntry {
  const found = JOB_CATALOG.find((j) => j.key === key);
  if (!found) throw new AiError(404, 'UNKNOWN_JOB', ['key']);
  return found;
}

// ---------------------------------------------------------------------------------------------------------------
// Pure cost math (no DB, no money formatting — the page/API own that).
// ---------------------------------------------------------------------------------------------------------------

const DAYS_PER_MONTH = 30;
/** How many alternative models the "Alternatives" column and the row's own selector show (Blueprint C2.2 does not
 * fix a count — this keeps the row readable; it is a display limit, never a business/cost figure). */
const MAX_ALTERNATIVES = 4; // hardcode-ok: a display row count, not a charge, limit or threshold

/** One run's cost in micros of USD, for a job's own usage shape against one model (never mixes kinds). */
export function estimateMicrosFor(usage: JobUsage, model: ModelCatalogEntry): number {
  if (usage.kind === 'text') {
    if (model.kind !== 'text') return 0;
    const input = (usage.inputTokens / 1_000_000) * (model.inputPerMillionMicros ?? 0);
    const output = (usage.outputTokens / 1_000_000) * (model.outputPerMillionMicros ?? 0);
    return Math.round(input + output);
  }
  if (usage.kind === 'image') {
    if (model.kind !== 'image') return 0;
    return Math.round(usage.images * (model.perImageMicros ?? 0));
  }
  if (model.kind !== 'video') return 0;
  return Math.round(usage.seconds * (model.perVideoSecondMicros ?? 0));
}

/** A month's cost in micros at a believable daily rate (C2.2's "typical runs per day/month"). */
export function monthlyMicrosFor(perRunMicros: number, runsPerDay: number): number {
  return Math.round(perRunMicros * runsPerDay * DAYS_PER_MONTH);
}

/** Micros of USD (millionths of a dollar) as whole US cents (the money helpers' own "minor" unit for USD). */
export function microsToUsdMinor(micros: number): number {
  return Math.round(micros / 10_000);
}

/** Every other catalogue model of the same kind, cheapest first (Blueprint C2.2's "Alternatives" — "the same job
 * on other companies' models, with their costs"), excluding the one given. */
export function alternativesFor(usage: JobUsage, excludeModelKey: string, limit: number = MAX_ALTERNATIVES): ModelCatalogEntry[] {
  return MODEL_CATALOG.filter((m) => m.kind === usage.kind && m.modelKey !== excludeModelKey)
    .sort((a, b) => estimateMicrosFor(usage, a) - estimateMicrosFor(usage, b))
    .slice(0, limit);
}

/** A plain substring search over a job's own name, section and description — English or Bengali, case-insensitive
 * (C2.1 — "look up 'image generation' or 'support reply' whenever he wonders"). */
export function searchJobs(jobs: readonly JobCatalogEntry[], query: string): JobCatalogEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...jobs];
  return jobs.filter((j) => [j.nameEn, j.nameBn, j.description, SECTION_NAMES[j.section].en, SECTION_NAMES[j.section].bn].some((s) => s.toLowerCase().includes(q)));
}

// ---------------------------------------------------------------------------------------------------------------
// Estimate vs actual (PR 313, Blueprint C2.3) — pure math; the DB read/aggregate lives beside `costBookView` below.
// ---------------------------------------------------------------------------------------------------------------

/** The rolling window a job's "actual" figure is measured over — the same length as the book's own monthly
 * estimate, so the two numbers answer the same question ("what does a month of this job cost"). */
export const ACTUAL_WINDOW_DAYS = 30; // hardcode-ok: the measurement window, matched to the book's own month length — not a charge, limit or threshold
/** How many real runs make an average worth showing as "the actual cost" rather than one stray run's own price. */
export const MIN_ACTUAL_SAMPLES = 5; // hardcode-ok: a statistical-confidence read, not a charge, limit or threshold

export interface JobActualStat {
  runs: number;
  perRunUsdMinor: number;
  perMonthUsdMinor: number;
  perRunStoreMinor: number | null;
  perMonthStoreMinor: number | null;
  /** How far the actual average sits from the estimate, in whole percent (positive: actual cost more). */
  deviationPct: number | null;
}

/** `null` until `runs` reaches `MIN_ACTUAL_SAMPLES` (C2.4 — no claim of accuracy before enough real data exists). */
export function actualOf(runs: number, totalCostUsdMicros: bigint, estimatePerRunUsdMinor: number, pricer: Pricer, day: string): JobActualStat | null {
  if (runs < MIN_ACTUAL_SAMPLES) return null;
  const totalMicros = Number(totalCostUsdMicros);
  const perRunUsdMinor = microsToUsdMinor(totalMicros / runs);
  const perMonthUsdMinor = microsToUsdMinor(totalMicros); // the window IS the month (`ACTUAL_WINDOW_DAYS` = `DAYS_PER_MONTH`)
  const runPriced = pricer(perRunUsdMinor, 'USD', day);
  const monthPriced = pricer(perMonthUsdMinor, 'USD', day);
  const deviationPct = estimatePerRunUsdMinor > 0 ? Math.round(((perRunUsdMinor - estimatePerRunUsdMinor) / estimatePerRunUsdMinor) * 100) : null;
  return { runs, perRunUsdMinor, perMonthUsdMinor, perRunStoreMinor: runPriced?.storeMinor ?? null, perMonthStoreMinor: monthPriced?.storeMinor ?? null, deviationPct };
}

// ---------------------------------------------------------------------------------------------------------------
// One-click presets (PR 314, Blueprint C2.3) — pure math; `applyPreset` below is the only DB-writing part.
// ---------------------------------------------------------------------------------------------------------------

export const PRESET_KEYS = ['economy', 'balanced', 'premium'] as const;
export type PresetKey = (typeof PRESET_KEYS)[number];

export const PRESET_NAMES: Record<PresetKey, { en: string; bn: string }> = {
  economy: { en: 'Economy', bn: 'সাশ্রয়ী' },
  balanced: { en: 'Balanced', bn: 'ভারসাম্যপূর্ণ' },
  premium: { en: 'Premium', bn: 'প্রিমিয়াম' },
};

export function isPresetKey(value: string): value is PresetKey {
  return (PRESET_KEYS as readonly string[]).includes(value);
}

/** Which model one preset picks for one job. Balanced keeps Claude's own per-job recommendation (already the
 * tier-appropriate pick, C2.2); Economy is the cheapest model of the job's own kind; Premium is the costliest —
 * so Economy ≤ Balanced ≤ Premium for every job, by construction, never by lowering a job below its own kind. */
export function presetModelFor(job: JobCatalogEntry, preset: PresetKey): string {
  if (preset === 'balanced') return job.recommendedModelKey;
  const ranked = MODEL_CATALOG.filter((m) => m.kind === job.usage.kind)
    .map((m) => ({ modelKey: m.modelKey, tier: m.tier, cost: estimateMicrosFor(job.usage, m) }))
    .sort((a, b) => a.cost - b.cost);
  const pick = preset === 'economy' ? ranked[0]! : ranked[ranked.length - 1]!;
  return pick.modelKey;
}

const TIER_RANK: Record<ModelCatalogEntry['tier'], number> = { small: 0, mid: 1, large: 2 };

export interface PresetSummary {
  key: PresetKey;
  nameEn: string;
  nameBn: string;
  totalPerMonthUsdMinor: number;
  totalPerMonthStoreMinor: number | null;
  /** How many of the 65 jobs would change model if this preset were applied now. */
  changedJobs: number;
  /** Of those changes, how many move to a cheaper/smaller tier model, and how many to a pricier/larger one — the
   * honest stand-in for "what quality changes" (C2.3) until a measured quality score exists (PR 580). */
  movedToSmaller: number;
  movedToLarger: number;
}

// ---------------------------------------------------------------------------------------------------------------
// DB: seeding (idempotent, like `ensureAgentRows`) and the assembled screen.
// ---------------------------------------------------------------------------------------------------------------

export interface CostBookDeps {
  db: PrismaClient;
  resolver: Pick<AppResolver, 'value' | 'set'>;
  now?: () => Date;
}

type Db = Pick<PrismaClient, 'aiProvider' | 'aiModel' | 'aiJobType'>;

/** Keeps the provider/model/job-type catalogue rows in step with the code above — never touches a job's own
 * `selectedModelId` (the owner's pick) once it is set. */
export async function ensureCostBookSeeded(db: Db): Promise<void> {
  const providerIds = new Map<string, string>();
  const providerKeys = [...new Set(MODEL_CATALOG.map((m) => m.providerKey))];
  for (const key of providerKeys) {
    const name = MODEL_CATALOG.find((m) => m.providerKey === key)!.providerName;
    const kinds = [...new Set(MODEL_CATALOG.filter((m) => m.providerKey === key).map((m) => m.kind))];
    const row = await db.aiProvider.upsert({ where: { key }, create: { key, name, kinds, enabled: true }, update: { name, kinds } });
    providerIds.set(key, row.id);
  }

  const modelIds = new Map<string, string>();
  for (const m of MODEL_CATALOG) {
    const providerId = providerIds.get(m.providerKey)!;
    const row = await db.aiModel.upsert({
      where: { providerId_modelKey: { providerId, modelKey: m.modelKey } },
      create: {
        providerId,
        modelKey: m.modelKey,
        displayName: m.displayName,
        kind: m.kind,
        priceCurrency: m.priceCurrency,
        inputPerMillionMicros: m.inputPerMillionMicros != null ? BigInt(m.inputPerMillionMicros) : null,
        outputPerMillionMicros: m.outputPerMillionMicros != null ? BigInt(m.outputPerMillionMicros) : null,
        perImageMicros: m.perImageMicros != null ? BigInt(m.perImageMicros) : null,
        perVideoSecondMicros: m.perVideoSecondMicros != null ? BigInt(m.perVideoSecondMicros) : null,
        isFree: m.isFree ?? false,
        enabled: true,
      },
      update: {
        displayName: m.displayName,
        kind: m.kind,
        priceCurrency: m.priceCurrency,
        inputPerMillionMicros: m.inputPerMillionMicros != null ? BigInt(m.inputPerMillionMicros) : null,
        outputPerMillionMicros: m.outputPerMillionMicros != null ? BigInt(m.outputPerMillionMicros) : null,
        perImageMicros: m.perImageMicros != null ? BigInt(m.perImageMicros) : null,
        perVideoSecondMicros: m.perVideoSecondMicros != null ? BigInt(m.perVideoSecondMicros) : null,
        isFree: m.isFree ?? false,
      },
    });
    modelIds.set(m.modelKey, row.id);
  }

  for (const j of JOB_CATALOG) {
    const recommendedModelId = modelIds.get(j.recommendedModelKey)!;
    const perRunMicros = estimateMicrosFor(j.usage, modelOf(j.recommendedModelKey));
    await db.aiJobType.upsert({
      where: { key: j.key },
      // PR 580 — `qualityBar` is seeded once, on create only, at the default (95% of the best unblocked candidate's
      // own score — Blueprint C2.4's own default); like `selectedModelId`, the owner's own later choice (90/95/98%)
      // is never overwritten by a reseed.
      create: { key: j.key, section: j.section, nameEn: j.nameEn, nameBn: j.nameBn, description: j.description, agentKey: j.agentKey, recommendedModelId, recommendationNote: j.recommendationNote, estimatePerRunMicros: BigInt(perRunMicros), typicalRunsPerDay: j.typicalRunsPerDay, qualityBar: { barPercent: DEFAULT_QUALITY_BAR_PERCENT } },
      update: { section: j.section, nameEn: j.nameEn, nameBn: j.nameBn, description: j.description, agentKey: j.agentKey, recommendedModelId, recommendationNote: j.recommendationNote, estimatePerRunMicros: BigInt(perRunMicros), typicalRunsPerDay: j.typicalRunsPerDay },
    });
  }
}

// ---------------------------------------------------------------------------------------------------------------
// PR 580 — the quality bar (Blueprint C2.4): "N% of the best unblocked candidate's own score", the owner's own
// per-job choice among three fixed options (never a free-typed number, CLAUDE.md rule 1). `model-qualification.ts`
// owns the scoring itself; these three live here because `ensureCostBookSeeded` (above) is this file's own job.
// ---------------------------------------------------------------------------------------------------------------
export const QUALITY_BAR_OPTIONS = [90, 95, 98] as const;
export type QualityBarPercent = (typeof QUALITY_BAR_OPTIONS)[number];
export const DEFAULT_QUALITY_BAR_PERCENT: QualityBarPercent = 95; // hardcode-ok: one of the three fixed bar options above, Blueprint C2.4's own default — never the owner's own number
export function isQualityBarPercent(value: number): value is QualityBarPercent {
  return (QUALITY_BAR_OPTIONS as readonly number[]).includes(value);
}

export interface CostBookModelChoice {
  modelKey: string;
  providerName: string;
  displayName: string;
  isRecommended: boolean;
  perRunUsdMinor: number;
  perMonthUsdMinor: number;
  /** `null` until the owner has typed a USD rate (Money › Costs & fees, PR 345) — honest, never invented. */
  perRunStoreMinor: number | null;
  perMonthStoreMinor: number | null;
}

export interface CostBookJobRow {
  key: string;
  section: CostBookSection;
  nameEn: string;
  nameBn: string;
  description: string;
  agentKey: AiAgentKey | null;
  recommendedModelKey: string;
  recommendationNote: string;
  selectedModelKey: string;
  typicalRunsPerDay: number;
  choices: CostBookModelChoice[];
  perRunUsdMinor: number;
  perMonthUsdMinor: number;
  perRunStoreMinor: number | null;
  perMonthStoreMinor: number | null;
  /** `null` until `MIN_ACTUAL_SAMPLES` real runs exist for this job (PR 313, C2.3). */
  actual: JobActualStat | null;
}

export interface CostBookView {
  at: string;
  currency: string;
  hasUsdRate: boolean;
  sections: { id: CostBookSection; nameEn: string; nameBn: string }[];
  jobs: CostBookJobRow[];
  totalPerMonthUsdMinor: number;
  totalPerMonthStoreMinor: number | null;
  /** The ten priciest jobs by their monthly estimate (C2.3 — "always visible, because that is where savings are"). */
  topExpensive: CostBookJobRow[];
  /** Economy / Balanced / Premium, each with its own hypothetical monthly total if applied now (PR 314, C2.3). */
  presets: PresetSummary[];
}

/** Every job's real spend over `ACTUAL_WINDOW_DAYS`, by `AiUsageLedger.jobTypeKey` — one query for the whole book,
 * not one per job. Honestly empty until a job dispatcher writes real ledger rows (none does yet). */
async function actualAggregatesSince(db: Pick<PrismaClient, 'aiUsageLedger'>, since: Date): Promise<Map<string, { runs: number; totalCostUsdMicros: bigint }>> {
  const rows = await db.aiUsageLedger.groupBy({ by: ['jobTypeKey'], where: { jobTypeKey: { not: null }, createdAt: { gte: since } }, _sum: { costUsdMicros: true }, _count: { _all: true } });
  const map = new Map<string, { runs: number; totalCostUsdMicros: bigint }>();
  for (const r of rows) {
    if (!r.jobTypeKey) continue;
    map.set(r.jobTypeKey, { runs: r._count._all, totalCostUsdMicros: r._sum.costUsdMicros ?? 0n });
  }
  return map;
}

function choiceOf(usage: JobUsage, model: ModelCatalogEntry, recommendedModelKey: string, runsPerDay: number, pricer: Pricer, day: string): CostBookModelChoice {
  const perRunMicros = estimateMicrosFor(usage, model);
  const perMonthMicros = monthlyMicrosFor(perRunMicros, runsPerDay);
  const perRunUsdMinor = microsToUsdMinor(perRunMicros);
  const perMonthUsdMinor = microsToUsdMinor(perMonthMicros);
  const runPriced = pricer(perRunUsdMinor, 'USD', day);
  const monthPriced = pricer(perMonthUsdMinor, 'USD', day);
  return { modelKey: model.modelKey, providerName: model.providerName, displayName: model.displayName, isRecommended: model.modelKey === recommendedModelKey, perRunUsdMinor, perMonthUsdMinor, perRunStoreMinor: runPriced?.storeMinor ?? null, perMonthStoreMinor: monthPriced?.storeMinor ?? null };
}

/** The assembled Cost Book screen: every job, its chosen model's own cost and every alternative's, searchable and
 * grouped by section, in the store's own currency where the owner has typed a USD rate (honest USD otherwise). */
export async function costBookView(deps: CostBookDeps, storeId: number): Promise<CostBookView> {
  const now = deps.now?.() ?? new Date();
  await ensureCostBookSeeded(deps.db);
  const [currency, timeZone, rows, models] = await Promise.all([
    deps.resolver.value('store.currency', { storeId }),
    deps.resolver.value('store.timeZone', { storeId }),
    deps.db.aiJobType.findMany({ where: { archivedAt: null } }),
    deps.db.aiModel.findMany({ where: { archivedAt: null } }),
  ]);
  const pricer = await pricerFor(deps.db, deps.resolver, storeId);
  const day = ymdIn(now, timeZone);
  const modelById = new Map(models.map((m) => [m.id, m]));
  const rowByKey = new Map(rows.map((r) => [r.key, r]));
  const since = new Date(now.getTime() - ACTUAL_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const actualAgg = await actualAggregatesSince(deps.db, since);

  const toPersist: { key: string; actualPerRunMicros: number | null }[] = [];
  const jobs: CostBookJobRow[] = JOB_CATALOG.map((j) => {
    const row = rowByKey.get(j.key);
    const selectedModel = row?.selectedModelId ? modelById.get(row.selectedModelId) : null;
    const selectedModelKey = selectedModel ? selectedModel.modelKey : j.recommendedModelKey;
    const candidates = [modelOf(j.recommendedModelKey), ...alternativesFor(j.usage, j.recommendedModelKey, 6)];
    const choices = candidates.map((m) => choiceOf(j.usage, m, j.recommendedModelKey, j.typicalRunsPerDay, pricer, day));
    const selected = choices.find((c) => c.modelKey === selectedModelKey) ?? choices[0]!;
    const agg = actualAgg.get(j.key);
    const actual = agg ? actualOf(agg.runs, agg.totalCostUsdMicros, selected.perRunUsdMinor, pricer, day) : null;
    const actualPerRunMicros = actual ? Math.round(actual.perRunUsdMinor * 10_000) : null;
    const current = row?.actualPerRunMicros != null ? Number(row.actualPerRunMicros) : null;
    if (current !== actualPerRunMicros) toPersist.push({ key: j.key, actualPerRunMicros });
    return {
      key: j.key,
      section: j.section,
      nameEn: j.nameEn,
      nameBn: j.nameBn,
      description: j.description,
      agentKey: j.agentKey,
      recommendedModelKey: j.recommendedModelKey,
      recommendationNote: j.recommendationNote,
      selectedModelKey,
      typicalRunsPerDay: j.typicalRunsPerDay,
      choices,
      perRunUsdMinor: selected.perRunUsdMinor,
      perMonthUsdMinor: selected.perMonthUsdMinor,
      perRunStoreMinor: selected.perRunStoreMinor,
      perMonthStoreMinor: selected.perMonthStoreMinor,
      actual,
    };
  });
  if (toPersist.length > 0) {
    await Promise.all(toPersist.map((p) => deps.db.aiJobType.update({ where: { key: p.key }, data: { actualPerRunMicros: p.actualPerRunMicros == null ? null : BigInt(p.actualPerRunMicros) } })));
  }

  const hasUsdRate = jobs.length > 0 && jobs.every((j) => j.perMonthStoreMinor !== null);
  const totalPerMonthUsdMinor = jobs.reduce((s, j) => s + j.perMonthUsdMinor, 0);
  const totalPerMonthStoreMinor = hasUsdRate ? jobs.reduce((s, j) => s + (j.perMonthStoreMinor ?? 0), 0) : null;
  const topExpensive = [...jobs].sort((a, b) => b.perMonthUsdMinor - a.perMonthUsdMinor).slice(0, 10);

  const jobByKey = new Map(jobs.map((j) => [j.key, j]));
  const presets: PresetSummary[] = PRESET_KEYS.map((preset) => {
    let totalMicros = 0;
    let changedJobs = 0;
    let movedToSmaller = 0;
    let movedToLarger = 0;
    for (const j of JOB_CATALOG) {
      const targetKey = presetModelFor(j, preset);
      const target = modelOf(targetKey);
      totalMicros += monthlyMicrosFor(estimateMicrosFor(j.usage, target), j.typicalRunsPerDay);
      const currentKey = jobByKey.get(j.key)?.selectedModelKey ?? j.recommendedModelKey;
      if (currentKey === targetKey) continue;
      changedJobs += 1;
      const currentTier = TIER_RANK[modelOf(currentKey).tier];
      const targetTier = TIER_RANK[target.tier];
      if (targetTier < currentTier) movedToSmaller += 1;
      else if (targetTier > currentTier) movedToLarger += 1;
    }
    const totalPerMonthUsdMinor = microsToUsdMinor(totalMicros);
    const priced = pricer(totalPerMonthUsdMinor, 'USD', day);
    return { key: preset, nameEn: PRESET_NAMES[preset].en, nameBn: PRESET_NAMES[preset].bn, totalPerMonthUsdMinor, totalPerMonthStoreMinor: priced?.storeMinor ?? null, changedJobs, movedToSmaller, movedToLarger };
  });

  return {
    at: now.toISOString(),
    currency,
    hasUsdRate,
    sections: COST_BOOK_SECTIONS.map((id) => ({ id, nameEn: SECTION_NAMES[id].en, nameBn: SECTION_NAMES[id].bn })),
    jobs,
    totalPerMonthUsdMinor,
    totalPerMonthStoreMinor,
    topExpensive,
    presets,
  };
}

/** The owner's own model pick for one job (`null` resets to Claude's recommendation). A no-op when it already is
 * what was asked, so a double tap writes once. */
export async function setJobSelectedModel(deps: Pick<CostBookDeps, 'db'>, who: { actor: Actor; ctx?: RequestContext }, jobKey: string, modelKey: string | null): Promise<void> {
  const job = jobOf(jobKey);
  if (modelKey !== null) {
    if (!isModelKey(modelKey)) throw new AiError(422, 'UNKNOWN_MODEL', ['modelKey']);
    if (modelOf(modelKey).kind !== job.usage.kind) throw new AiError(422, 'WRONG_KIND', ['modelKey']);
  }
  await ensureCostBookSeeded(deps.db);
  await deps.db.$transaction(async (tx) => {
    const row = await tx.aiJobType.findUnique({ where: { key: jobKey } });
    if (!row || row.archivedAt) throw new AiError(404, 'NOT_FOUND', ['key']);
    const targetKey = modelKey ?? job.recommendedModelKey;
    const target = await tx.aiModel.findFirst({ where: { modelKey: targetKey, archivedAt: null } });
    if (!target) throw new AiError(404, 'UNKNOWN_MODEL', ['modelKey']);
    if (row.selectedModelId === target.id) return;
    await tx.aiJobType.update({ where: { key: jobKey }, data: { selectedModelId: modelKey === null ? null : target.id } });
    await audit(tx, who.actor, { action: 'ai.costBook.model', entityType: 'AiJobType', entityId: row.id, before: { selectedModelId: row.selectedModelId }, after: { selectedModelId: modelKey === null ? null : target.id } }, who.ctx ?? {});
  });
}

/** Applies one preset to every job at once (Blueprint C2.3's one-click presets): writes each job whose target
 * model differs from its current one, in a single transaction, and records one combined audit entry (never one
 * per job) — a no-op audit-wise when nothing actually changes. */
export async function applyPreset(deps: Pick<CostBookDeps, 'db'>, who: { actor: Actor; ctx?: RequestContext }, preset: PresetKey): Promise<{ changed: number }> {
  if (!isPresetKey(preset)) throw new AiError(422, 'UNKNOWN_PRESET', ['preset']);
  await ensureCostBookSeeded(deps.db);
  return deps.db.$transaction(async (tx) => {
    const models = await tx.aiModel.findMany({ where: { archivedAt: null } });
    const modelIdByKey = new Map(models.map((m) => [m.modelKey, m.id]));
    const rows = await tx.aiJobType.findMany({ where: { archivedAt: null } });
    const rowByKey = new Map(rows.map((r) => [r.key, r]));
    const before: Record<string, string | null> = {};
    const after: Record<string, string | null> = {};
    let changed = 0;
    for (const j of JOB_CATALOG) {
      const row = rowByKey.get(j.key);
      if (!row) continue;
      const targetId = modelIdByKey.get(presetModelFor(j, preset));
      if (!targetId || row.selectedModelId === targetId) continue;
      before[j.key] = row.selectedModelId;
      after[j.key] = targetId;
      await tx.aiJobType.update({ where: { key: j.key }, data: { selectedModelId: targetId } });
      changed += 1;
    }
    if (changed > 0) await audit(tx, who.actor, { action: 'ai.costBook.presetApplied', entityType: 'AiModelPreset', entityId: preset, before, after }, who.ctx ?? {});
    return { changed };
  });
}

export { isAiAgentKey, isAiError };
