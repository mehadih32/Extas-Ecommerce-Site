// S11 · PR 221, S14 · PR 293, S12 · PR 243 (moved out unchanged by S15 · PR 306 so the live providers — anthropic.ts,
// openai.ts, google.ts, openrouter.ts — and the mock (mock.ts) can both depend on these shapes with no import cycle).
// What a draft is about, what it is drafted from, and what comes back: the practice writer (mock.ts) and every live
// provider (live.ts) answer exactly this contract, so nothing that calls `AiWriter` ever has to know which company
// wrote the words.

/** What a draft is about: a product or a category page. */
export type AiDraftSubject = 'product' | 'category';

export interface AiSeoInput {
  subject: AiDraftSubject;
  /** The page's language. */
  locale: 'en' | 'bn';
  /** The page's own facts, in the page's language, most important first; empty ones are left out. */
  facts: { name: string; brand?: string; category?: string; colours?: string[]; fit?: string; fabric?: string; shop?: string };
  /** The store's limits (`naming.seoTitleMaxChars`, `naming.metaDescriptionMaxChars`). */
  max: { title: number; description: number };
}

export interface AiSeoDraft {
  title: string;
  description: string;
  /** True for the mock's practice text. */
  practice: boolean;
  /** S15 · PR 327 — real token counts from the provider's own answer, when it reported them (the same convention
   * PR 325's `AiSupportReplyDraft` and PR 326's `AiProductDescriptionDraft` already use) — absent for the mock, and
   * for a provider whose response carried none. */
  usage?: { inputTokens: number; outputTokens: number };
}

/** PR 293 — the channel of an offer message. */
export type AiCampaignChannel = 'sms' | 'email';

export interface AiCampaignInput {
  channel: AiCampaignChannel;
  locale: 'en' | 'bn';
  /** What the message is about, in the owner's words (the offer, the occasion, the products). */
  brief: string;
  /** The owner's voice (Customers › Customer settings › AI campaign writer); empty parts are left out. */
  voice: { greeting: string; signOff: string; style: string };
  /** How many versions (2 or 3). */
  versions: number;
  /** The {words} the message may use, e.g. ['customerName', 'storeName', 'link']; nothing else in braces. */
  words: readonly string[];
  /** The longest subject (e-mail only) and body. */
  max: { subject: number; body: number };
}

export interface AiCampaignVersion {
  /** E-mail only. */
  subject?: string;
  body: string;
}

export interface AiCampaignDraft {
  versions: AiCampaignVersion[];
  /** True for the mock's practice text. */
  practice: boolean;
}

/** PR 243 — what an article draft is written from: its brief (PR 528). */
export interface AiArticleInput {
  /** The language to write in (the brief's). */
  locale: 'en' | 'bn';
  /** The topic's title. */
  title: string;
  /** What people type into a search engine. */
  query: string | null;
  /** The keywords, the first one leading. */
  keywords: string[];
  /** What the reader wants: info · buy · compare · howto. */
  intent: string;
  /** About how many words. */
  wordCount: number;
  /** The headings, in order. */
  outline: string[];
  /** The facts it must carry (only these are claims). */
  mustInclude: string | null;
  /** The shop paths it must link to. */
  links: string[];
  /** A note for the writer. */
  notes: string | null;
}

export interface AiArticleDraft {
  /** A short summary under the title. */
  excerpt: string;
  /** The words in the editor's writing format (`## ` headings, `- ` bullets, `[words](/path)` links). */
  body: string;
  /** True for the mock's practice text. */
  practice: boolean;
}

/**
 * S15 · PR 325 — the support agent's own job: a warmer rephrasing of a draft reply that `@extas/support`'s own
 * rule-based engine (`drafts.ts`, PR 432) already decided and filled from real facts. The model may only rewrite
 * `ruleBasedBody`'s words, never add, drop or change a fact — `facts` is given so it can check its own rewrite, not
 * so it can invent from them. The caller has already masked any customer PII out of `question` before this reaches
 * an adapter (Blueprint A5.1–A5.4).
 */
export interface AiSupportReplyInput {
  locale: 'en' | 'bn';
  /** The customer's own latest words, masked of e-mail/phone by the caller. */
  question: string;
  /** What the rule-based draft already decided, for the model to stay inside — never a fact to add from. */
  facts: {
    intent: string;
    complaint?: string | null;
    orderNumber?: string | null;
    orderStatus?: string | null;
    courier?: string | null;
    tracking?: string | null;
    late?: boolean;
    size?: string | null;
    customerName?: string | null;
  };
  /** The store's own rule-based words for this question — already correct and complete; the model's floor and its
   * only source of fact. */
  ruleBasedBody: string;
  max: { body: number };
}

export interface AiSupportReplyDraft {
  body: string;
  /** True for the mock's practice text (the rule-based body, unchanged). */
  practice: boolean;
  /** Real token counts from the provider's own answer, when it reported them (PR 325's usage-ledger wiring) — absent
   * for the mock, and for a provider whose response carried none. */
  usage?: { inputTokens: number; outputTokens: number };
}

/**
 * S15 · PR 326 — the product content agent's own job (Doot, `mktProductDescription`): a shop-facing description
 * written only from a product's own already-saved attributes — never a spec, size, material, fit, price or claim
 * that is not in `facts`. The same `facts` shape `AiSeoInput` already uses (name/brand/category/colours/fabric/shop),
 * plus the sizes a product actually comes in and its own care text, since a description job writes more than a
 * title and a meta line.
 */
export interface AiProductDescriptionInput {
  locale: 'en' | 'bn';
  facts: { name: string; brand?: string; category?: string; colours?: string[]; sizes?: string[]; fabric?: string; care?: string; shop?: string };
  max: { body: number };
}

export interface AiProductDescriptionDraft {
  body: string;
  /** True for the mock's practice text. */
  practice: boolean;
  /** Real token counts from the provider's own answer, when it reported them — absent for the mock, and for a
   * provider whose response carried none (same convention PR 325's `AiSupportReplyDraft` already uses). */
  usage?: { inputTokens: number; outputTokens: number };
}

/**
 * S15 · PR 328 — the size advice agent's own job (Gyani, `supportSizeAdvice`): one warm sentence explaining why
 * Find My Size (`@extas/catalogue/size-finder`'s own rule engine, PR 58) gave the size it gave — never asked for,
 * and never able to change, the size itself. `facts` is exactly that engine's own already-decided `Recommendation`
 * (the measure it needed, the room the chart gives, whether the chosen size actually covers the need), carried
 * through unchanged by the caller; nothing here is a customer's own words or any personal data.
 */
export interface AiSizeAdviceInput {
  locale: 'en' | 'bn';
  facts: {
    sizeLabel: string;
    nextSizeLabel?: string;
    /** The chart's own measure that decided it, in plain words (e.g. "chest", "waist"). */
    fieldLabel: string;
    valueInch: number;
    needInch: number;
    bodyInch: number;
    easeInch: number;
    covered: boolean;
    garment?: string;
    heightIn: number;
    weightKg: number;
  };
  max: { body: number };
}

export interface AiSizeAdviceDraft {
  body: string;
  /** True for the mock's practice text. */
  practice: boolean;
  /** Real token counts from the provider's own answer, when it reported them — absent for the mock, and for a
   * provider whose response carried none (same convention PR 325's `AiSupportReplyDraft` already uses). */
  usage?: { inputTokens: number; outputTokens: number };
}

/**
 * S15 · PR 329 — the fraud review agent's own job (Gyani, the existing `orderFraudJudge` Cost Book row, PR 312):
 * one plain paragraph explaining why a duplicate/risk review alert fired, for the staff member who must decide —
 * never a decision itself. `facts` is always the admin order page's own already-built, already-localized
 * `AlertExplainView` words (`packages/orders`'s `alertSummary`/PR 521's own `alertExplainView`, the identical rules,
 * signals, matched orders and history text the review card already shows) — never a new score, never the order's
 * own raw PII beyond what the card already names, and never the decision options or the proposed action (so the
 * model is never even handed anything resembling "cancel/hold/approve" to echo back as its own call).
 */
export interface AiFraudReviewInput {
  locale: 'en' | 'bn';
  facts: {
    /** "duplicate" or "risk" — which kind of review this is, same two kinds the card itself shows. */
    kind: 'duplicate' | 'risk';
    /** The card's own severity word (e.g. "High"), already localized; absent when the card shows none. */
    severity?: string;
    /** Each already-localized reason line the card's own "why this fired" list shows (fired rules, risk signals). */
    why: string[];
    /** Each already-localized matched-order summary line the card's own "what matched" list shows. */
    matches: string[];
    /** Each already-localized history line the card's own "history" section shows. */
    history: string[];
  };
  max: { body: number };
}

export interface AiFraudReviewDraft {
  body: string;
  /** True for the mock's practice text. */
  practice: boolean;
  /** Real token counts from the provider's own answer, when it reported them — absent for the mock, and for a
   * provider whose response carried none (same convention PR 325's `AiSupportReplyDraft` already uses). */
  usage?: { inputTokens: number; outputTokens: number };
}

/**
 * S15 · PR 330 — the growth marketing agent's own job (Gyani, the existing `adminApprovalExplain` Cost Book row,
 * PR 312): one plain paragraph turning an already-decided, already-localized approval-queue item — today, one of
 * Tirondaj's own growth-agent proposals (PR 269) waiting on Marketing › Ad platforms › Growth agent — into a fuller
 * explanation for the owner about to decide. `facts` is always the page's own already-built `what`/`why` words
 * (growth-agent.ts's own localized sentence, never a new figure or a second read of the ad spend) and never the
 * item's own decision (approve/reject, pause, raise or lower a budget): the model is never handed anything to echo
 * back as its own recommendation.
 */
export interface AiApprovalExplainInput {
  locale: 'en' | 'bn';
  facts: {
    /** The item's own already-built, already-localized one-line title (growth-agent.ts's own `what(p)`). */
    title: string;
    /** Each already-localized reason line the item's own card already shows (growth-agent.ts's own `why(p)`). */
    why: string[];
  };
  max: { body: number };
}

export interface AiApprovalExplainDraft {
  body: string;
  /** True for the mock's practice text. */
  practice: boolean;
  /** Real token counts from the provider's own answer, when it reported them — absent for the mock, and for a
   * provider whose response carried none (same convention PR 325's `AiSupportReplyDraft` already uses). */
  usage?: { inputTokens: number; outputTokens: number };
}

/**
 * S15 · PR 331 — the social content agent's own job (Doot, the existing `socialReelCaption` Cost Book job, PR 312):
 * one short caption with a hook for one reel/short render queued in Marketing › Studio (S23's own render-queue
 * form, PR 439) — the exact spot that form's own placeholder text already named ("nothing here writes this for
 * you yet"). Gated by its own feature switch (`studio.ai.captions`, off as it ships) on top of the usual
 * master/agent switches, since `registry-studio.ts`'s own comment and `catalogue.ts`'s own permission note both
 * name this exact job as the one `studio.ai.captions`/`studio.generate` turn on. `facts` is always the real
 * template's own already-saved name and notes (never a product, a price, an offer or a size the staff has not
 * typed into the template itself) plus the store's own already-saved brand voice tone line (`studio.voice`'s
 * `toneEn`) — never invented.
 */
export interface AiSocialCaptionInput {
  locale: 'en' | 'bn';
  facts: { templateName: string; notes?: string; toneEn?: string };
  max: { body: number };
}

export interface AiSocialCaptionDraft {
  body: string;
  /** True for the mock's practice text. */
  practice: boolean;
  /** Real token counts from the provider's own answer, when it reported them — absent for the mock, and for a
   * provider whose response carried none (same convention PR 325's `AiSupportReplyDraft` already uses). */
  usage?: { inputTokens: number; outputTokens: number };
}

/**
 * S15 · PR 332 — the photoshoot studio's own job (Gyani, the existing `studioDetailFinder` Cost Book job, PR 312):
 * one short, plain note on which of a garment's own already-saved attributes a generated photo must keep accurate
 * before the Photoshoot Studio (S24) runs a ghost-mannequin, try-on or detail-reprojection job on it. `facts` is
 * always a product's own already-saved catalogue attributes — the identical shape PR 326's own product-description
 * job already reuses (`ProductDescriptionFacts`) — never a stitch, print or logo guessed from nothing: the model
 * may only point at what is actually on the row (its fabric, its colours, its care text), never invent a detail
 * that is not already named there, and it is never handed, and never asked for, any decision about the shoot
 * itself (which photo to keep, whether to regenerate).
 */
export interface AiStudioDetailInput {
  locale: 'en' | 'bn';
  facts: { name: string; brand?: string; category?: string; colours?: string[]; sizes?: string[]; fabric?: string; care?: string };
  max: { body: number };
}

export interface AiStudioDetailDraft {
  body: string;
  /** True for the mock's practice text. */
  practice: boolean;
  /** Real token counts from the provider's own answer, when it reported them — absent for the mock, and for a
   * provider whose response carried none (same convention PR 325's `AiSupportReplyDraft` already uses). */
  usage?: { inputTokens: number; outputTokens: number };
}

/**
 * S15 · PR 333 — the reports agent's own job (Gyani, the existing `reportsStockAlert` Cost Book job, PR 312): one
 * short, plain line explaining why a single SKU's own already-open low-stock alert is worth a look, beside the raw
 * numbers the stock page (`/admin/stock`, S09's own PR 202/205) already shows. `facts` is always that page's own
 * already-computed `LowStockItem` fields (`packages/inventory`'s `listLowStock`, PR 202) — the identical available
 * count, threshold and how long it has sat low that the card already shows as plain numbers — never a reorder
 * quantity, a supplier name or a restock date invented from nothing, and the model is never handed, and never
 * asked for, any decision (what to reorder, how much, from whom): the fraud/approval queue's own "never a decision"
 * rule (PR 329/330) applies here the same way.
 */
export interface AiStockAlertInput {
  locale: 'en' | 'bn';
  facts: {
    /** The variant's own already-localized product name (the page's own `nameIn()`, never re-translated here). */
    productName: string;
    sku: string;
    colour?: string;
    size?: string;
    /** The shared sellable number right now — never clipped at zero upstream, so it may already read negative. */
    available: number;
    threshold: number;
    /** Whole days since the alert first opened (`LowStockItem.since`), already computed by the caller — the model
     * is never handed a raw timestamp to do its own date arithmetic on. */
    sinceDays: number;
  };
  max: { body: number };
}

export interface AiStockAlertDraft {
  body: string;
  /** True for the mock's practice text. */
  practice: boolean;
  /** Real token counts from the provider's own answer, when it reported them — absent for the mock, and for a
   * provider whose response carried none (same convention PR 325's `AiSupportReplyDraft` already uses). */
  usage?: { inputTokens: number; outputTokens: number };
}

export interface AiWriter {
  draftSeo(input: AiSeoInput): Promise<AiSeoDraft>;
  /** PR 293 — the campaign writer. */
  draftCampaign(input: AiCampaignInput): Promise<AiCampaignDraft>;
  /** PR 243 — a journal article's first draft from its brief. */
  draftArticle(input: AiArticleInput): Promise<AiArticleDraft>;
  /** PR 325 — the support agent's own job: a warmer rephrasing of an already-correct rule-based reply. */
  draftSupportReply(input: AiSupportReplyInput): Promise<AiSupportReplyDraft>;
  /** PR 326 — the product content agent's own job: a shop-facing description from a product's own attributes. */
  draftProductDescription(input: AiProductDescriptionInput): Promise<AiProductDescriptionDraft>;
  /** PR 328 — the size advice agent's own job: one grounded sentence on why Find My Size gave that size. */
  draftSizeAdvice(input: AiSizeAdviceInput): Promise<AiSizeAdviceDraft>;
  /** PR 329 — the fraud review agent's own job: one grounded paragraph on why a review alert fired, never a decision. */
  draftFraudReviewNote(input: AiFraudReviewInput): Promise<AiFraudReviewDraft>;
  /** PR 330 — the growth marketing agent's own job: one grounded paragraph explaining an approval-queue item, never a decision. */
  draftApprovalExplainNote(input: AiApprovalExplainInput): Promise<AiApprovalExplainDraft>;
  /** PR 331 — the social content agent's own job: one short caption with a hook for one reel/short render queue template. */
  draftSocialReelCaption(input: AiSocialCaptionInput): Promise<AiSocialCaptionDraft>;
  /** PR 332 — the photoshoot studio's own job: one grounded note on which already-saved attributes a generated photo must keep accurate. */
  draftStudioDetailNote(input: AiStudioDetailInput): Promise<AiStudioDetailDraft>;
  /** PR 333 — the reports agent's own job: one grounded line on why one low-stock alert is worth a look, never a reorder decision. */
  draftStockAlertNote(input: AiStockAlertInput): Promise<AiStockAlertDraft>;
}

/** Cuts `text` to `max` characters (by code point) at a word boundary where one is near. */
export function cutTo(text: string, max: number): string {
  const chars = [...text.trim()];
  if (chars.length <= max) return chars.join('');
  const head = chars.slice(0, max).join('');
  const space = head.lastIndexOf(' ');
  return (space > max * 0.6 ? head.slice(0, space) : head).replace(/[\s,.;:·|—-]+$/u, '');
}
