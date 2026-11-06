// S12 · PR 528 (S12 answer 11; BLOG-CONTENT-PLAN §5.1 "Brief: target query, intent, outline, evidence needed, links,
// photo shot list") — the blog brief, pure: what a brief holds and how a typed brief is checked.
//
// - Four things are chosen before a single word is written: the topic (one of the plan's topics, or a new one typed
//   here), the language, how many words (`blog.brief` wordsMin…wordsMax) and at least one keyword.
// - The rest helps the writer and is optional: the search phrase, what the reader wants (info · buy · compare · how-to),
//   the outline (one heading a line), the facts the article must carry, the shop links it must make, the photos it needs
//   (own photos first; AI pictures ask every time) and a note.
import { z } from 'zod';
import { KEYWORDS_MAX, PATH_MAX, QUERY_MAX, normPath } from './clusters-model';
import { TITLE_MAX } from './model';

export const INTENTS = ['info', 'buy', 'compare', 'howto'] as const;
export type Intent = (typeof INTENTS)[number];
/** Where the photos come from: our own first; the library; an AI picture only when a person says yes each time. */
export const IMAGE_POLICIES = ['own', 'library', 'aiAsk'] as const;
export type ImagePolicy = (typeof IMAGE_POLICIES)[number];

export const LINES_MAX = 20; // hardcode-ok: a list length
export const LINE_MAX = 200; // hardcode-ok: a field length
export const NOTE_MAX = 2000; // hardcode-ok: a field length

/** Lines typed one a line (or a list): trimmed, empty ones and repeats left out. */
export const linesOf = (v: unknown): string[] => {
  const raw = Array.isArray(v) ? v.map(String) : typeof v === 'string' ? v.split(/\r?\n/u) : [];
  return [...new Set(raw.map((x) => x.trim()).filter(Boolean))];
};
/** Keywords typed with commas (or a list): trimmed, empty ones and repeats (any case) left out. */
export const keywordsOf = (v: unknown): string[] => {
  const raw = Array.isArray(v) ? v.map(String) : typeof v === 'string' ? v.split(/[,،\n]/u) : [];
  const seen = new Set<string>();
  return raw
    .map((x) => x.trim().replace(/\s+/gu, ' '))
    .filter((x) => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase()));
};

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
const lines = (max: number) =>
  z
    .unknown()
    .transform(linesOf)
    .pipe(z.array(z.string().max(max)).max(LINES_MAX))
    .optional()
    .transform((v) => v ?? []);

/** The brief as the form sends it; the word limits come from `blog.brief`. */
export function briefInputSchema(limits: { wordsMin: number; wordsMax: number }) {
  return z
    .object({
      version: z.string().optional(),
      /** One of the plan's topics, or (no topicId) a new topic's title. */
      topicId: z.uuid().nullish().transform((v) => v ?? null),
      title: optText(TITLE_MAX),
      language: z.enum(['en', 'bn']),
      wordCount: z.coerce.number().int().min(limits.wordsMin).max(limits.wordsMax),
      keywords: z
        .unknown()
        .transform(keywordsOf)
        .pipe(z.array(z.string().max(QUERY_MAX)).min(1).max(KEYWORDS_MAX)),
      query: optText(QUERY_MAX),
      intent: z.enum(INTENTS).default('info'),
      outline: lines(LINE_MAX),
      mustInclude: optText(NOTE_MAX),
      links: lines(PATH_MAX).refine((xs) => xs.every((x) => normPath(x) !== null)),
      shotList: lines(LINE_MAX),
      imagePolicy: z.enum(IMAGE_POLICIES).default('own'),
      notes: optText(NOTE_MAX),
      /** Add the new topic although a very close article or topic exists (the second press). */
      force: z.boolean().optional(),
    })
    .strict()
    .refine((v) => v.topicId || (v.title && v.title.length >= 3), { path: ['title'] });
}
export type BriefInput = z.output<ReturnType<typeof briefInputSchema>>;

/** What is still missing before a brief can be used for writing (an AI draft needs none missing). */
export function briefGaps(b: { wordCount: number; keywords: string[]; language: string; topicId: string | null }): ('topic' | 'language' | 'words' | 'keywords')[] {
  const out: ('topic' | 'language' | 'words' | 'keywords')[] = [];
  if (!b.topicId) out.push('topic');
  if (b.language !== 'en' && b.language !== 'bn') out.push('language');
  if (!(b.wordCount > 0)) out.push('words');
  if (!b.keywords.length) out.push('keywords');
  return out;
}
