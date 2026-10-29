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

export interface AiWriter {
  draftSeo(input: AiSeoInput): Promise<AiSeoDraft>;
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
    };
  },
  async test() {
    return { ok: true, message: 'practice AI writer: nothing leaves the server' };
  },
});

export const aiWriterAdapters = [mockAiWriterAdapter] as const;
