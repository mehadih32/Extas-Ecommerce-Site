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

export interface AiWriter {
  draftSeo(input: AiSeoInput): Promise<AiSeoDraft>;
  /** PR 293 — the campaign writer. */
  draftCampaign(input: AiCampaignInput): Promise<AiCampaignDraft>;
  /** PR 243 — a journal article's first draft from its brief. */
  draftArticle(input: AiArticleInput): Promise<AiArticleDraft>;
}

/** Cuts `text` to `max` characters (by code point) at a word boundary where one is near. */
export function cutTo(text: string, max: number): string {
  const chars = [...text.trim()];
  if (chars.length <= max) return chars.join('');
  const head = chars.slice(0, max).join('');
  const space = head.lastIndexOf(' ');
  return (space > max * 0.6 ? head.slice(0, space) : head).replace(/[\s,.;:·|—-]+$/u, '');
}
