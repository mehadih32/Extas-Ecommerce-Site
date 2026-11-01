// S11 · PR 221 — the AI writer: drafts a page's search title and meta description from the page's own facts. AI helpers
// stay off until the owner turns them on (CN-026: `ai.enabled`, and `seo.aiDrafts.enabled` for this one), and no AI
// provider is connected yet, so every draft comes from the mock: it writes nothing it was not given — the facts joined
// in order and cut to the limits — and it says it is practice text. A draft is never used on a page until a person
// accepts it in Website › SEO.
//
// The real provider (S15 · PR 306, the AI 360 control room) adds a LIVE adapter here, its row in Keys & connections
// and `allAdapters`, with the usage ledger and the spend cap. Until then this adapter is not listed there (a row would
// offer the owner a key field for a provider that does not exist yet); the app reaches it through
// `createConnections({ adapters: aiWriterAdapters })`, which falls back to the mock when no AI connection is switched on.
//
// S14 · PR 293 — the AI campaign writer: 2–3 versions of an offer SMS or e-mail in the owner's own voice (his greeting,
// his sign-off, how he talks), from what the owner says the message is about. The practice writer joins only what it was
// given — the greeting, the brief, the link word, the sign-off — in a different order and length per version; a live
// provider (PR 306) gets the same input. A person picks one version and still saves and schedules it himself.
import { z } from 'zod';
import { AdapterError, defineAdapter } from '../define';

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

export interface AiWriter {
  draftSeo(input: AiSeoInput): Promise<AiSeoDraft>;
  /** PR 293 — the campaign writer. */
  draftCampaign(input: AiCampaignInput): Promise<AiCampaignDraft>;
}

/** Cuts `text` to `max` characters (by code point) at a word boundary where one is near. */
export function cutTo(text: string, max: number): string {
  const chars = [...text.trim()];
  if (chars.length <= max) return chars.join('');
  const head = chars.slice(0, max).join('');
  const space = head.lastIndexOf(' ');
  return (space > max * 0.6 ? head.slice(0, space) : head).replace(/[\s,.;:·|—-]+$/u, '');
}

/** The mock's draft: only the facts it was given, in order. */
export function practiceDraft(input: AiSeoInput): AiSeoDraft {
  const f = input.facts;
  const list = (xs: (string | undefined)[], sep: string) => xs.map((x) => x?.trim()).filter((x): x is string => Boolean(x)).join(sep);
  const title = list([f.name, f.brand && !f.name.toLowerCase().includes(f.brand.toLowerCase()) ? f.brand : undefined, f.shop], ' | ');
  const description = list([list([f.name, f.category], ' · '), list(f.colours ?? [], ', '), f.fit, f.fabric, f.shop], '. ');
  return { title: cutTo(title, input.max.title), description: cutTo(description, input.max.description), practice: true };
}

/** The first sentence (or line) of a brief. */
const firstSentence = (text: string) => (text.trim().split(/(?<=[.!?।])\s+|\n+/u)[0] ?? '').trim();

/** PR 293 — the mock's versions: only the owner's own words, joined in a different order and length per version. */
export function practiceCampaign(input: AiCampaignInput): AiCampaignDraft {
  const has = (w: string) => input.words.includes(w);
  const brief = input.brief.trim().replace(/\s+/gu, ' ');
  const head = firstSentence(input.brief);
  const greet = input.voice.greeting.trim();
  const sign = input.voice.signOff.trim();
  const name = has('customerName') ? '{customerName}' : '';
  const link = has('link') ? '{link}' : '';
  const shop = has('storeName') ? '{storeName}' : '';
  const sms = input.channel === 'sms';
  const join = (parts: string[], sep: string) => parts.map((x) => x.trim()).filter(Boolean).join(sep);
  const hello = join([greet, name], ' ');
  const sep = sms ? ' ' : '\n\n';
  const shapes: ((b: string) => string)[] = [
    (b) => join([hello ? `${hello},` : '', b, link, sign], sep),
    (b) => join([b, link], sep),
    (b) => join([hello ? `${hello},` : '', b, link, join([sign, shop], sms ? ' ' : '\n')], sep),
  ];
  const texts = [brief, brief, head];
  // too long: the brief is cut (at a word) so the greeting, the link word and the sign-off stay whole
  const fit = (shape: (b: string) => string, b: string) => {
    const full = shape(b);
    if ([...full].length <= input.max.body) return full;
    const room = input.max.body - [...shape('')].length - sep.length;
    return room > 0 ? shape(cutTo(b, room)) : cutTo(full.replace(/\{[^}]*$/u, ''), input.max.body).replace(/\{[^}]*$/u, '').trim();
  };
  const subjects = [head, join([shop, head], ': '), join([name, head], ', ')];
  const n = Math.min(3, Math.max(2, input.versions));
  const versions = shapes.slice(0, n).map((shape, i) => ({
    ...(sms ? {} : { subject: cutTo(subjects[i] || head, input.max.subject).replace(/\{[^}]*$/u, '').trim() }),
    body: fit(shape, texts[i]!),
  }));
  // without a greeting or a sign-off two shapes can come out the same: each version once
  return { versions: versions.filter((v, i) => versions.findIndex((w) => w.body === v.body && w.subject === v.subject) === i), practice: true };
}

export const mockAiWriterAdapter = defineAdapter<AiWriter, Record<string, never>>({
  kind: 'AI_PROVIDER',
  provider: 'mockAiWriter',
  modes: [],
  secrets: [],
  configSchema: z.object({}).strict() as unknown as z.ZodType<Record<string, never>>,
  async create() {
    throw new AdapterError('no AI provider is connected yet; the practice writer serves until its key is entered');
  },
  async mock() {
    return {
      async draftSeo(input) {
        if (!input.facts.name.trim()) throw new AdapterError('a draft needs the page name');
        return practiceDraft(input);
      },
      async draftCampaign(input) {
        if (!input.brief.trim()) throw new AdapterError('a campaign draft needs what the message is about');
        return practiceCampaign(input);
      },
    };
  },
  async test() {
    return { ok: true, message: 'practice AI writer: nothing leaves the server' };
  },
});

export const aiWriterAdapters = [mockAiWriterAdapter] as const;
