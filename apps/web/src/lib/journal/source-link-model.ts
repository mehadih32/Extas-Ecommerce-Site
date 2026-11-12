// S12 · PR 529 (answer 12, 18 Oct; Blueprint §59 answers 11–14) — the source-link research writer, pure: what a page
// says, read for an article, and the input a staff member types to ask for one.
//
// - Give it a link to an article anywhere in the world; it reads the page (no network here — the caller fetches the
//   HTML through the page reader connection, PR 33, shared with "Import from a link") and this file turns that HTML
//   into plain facts: a title, a short description, its own headings (an honest outline to write from) and the
//   readable body text (the "research" — never copied into the new article, only read for its facts and angle).
// - Nothing here writes a word: `source-link.ts` turns these facts into the same `AiArticleInput` PR 243's "AI first
//   draft" already uses, with a note that tells the writer to write an ORIGINAL piece, never the source's own words.
import { decodeEntities, plainText } from '@extas/catalogue';
import { z } from 'zod';

export const URL_MAX = 2000; // hardcode-ok: a field length, not a business number
export const HEADINGS_MAX = 8; // hardcode-ok: an outline this long is already plenty
export const BODY_TEXT_MAX = 6000; // hardcode-ok: enough research material for a few-hundred-word article

export const sourceLinkInput = z
  .object({
    url: z.string().trim().min(1).max(URL_MAX),
    locale: z.enum(['en', 'bn']),
    /** About how many words; empty uses `blog.brief.wordsDefault`. */
    wordCount: z.int().min(100).max(10_000).optional(),
  })
  .strict();
export type SourceLinkInput = z.output<typeof sourceLinkInput>;

export interface SourceFacts {
  /** The page's own address after forwarding. */
  url: string;
  title: string | null;
  description: string | null;
  /** The page's own `<h2>`/`<h3>` headings, in order, deduplicated — read as the source's shape, never copied verbatim into the outline's words. */
  headings: string[];
  /** The readable body, tags stripped — research material only, cut to `BODY_TEXT_MAX`. */
  bodyText: string;
}

const oneLine = (s: string, max = 300): string => decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/gu, ' ').trim().slice(0, max);

function metaMap(html: string): Map<string, string> {
  const meta = new Map<string, string>();
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const nameM = m[0].match(/\b(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i);
    const contentM = m[0].match(/\bcontent\s*=\s*["']([^"']*)["']/i);
    const key = nameM?.[1]?.toLowerCase();
    if (key && contentM && !meta.has(key)) meta.set(key, contentM[1]!);
  }
  return meta;
}

/**
 * Reads an article page's own facts: no network, no database — `html` is what the page reader connection already
 * fetched. A page with no readable text at all (an empty title and an empty body) answers an empty `bodyText`; the
 * caller decides that is `PAGE_UNREADABLE`.
 */
export function parseSourcePage(html: string, pageUrl: string): SourceFacts {
  const meta = metaMap(html);
  const titleTag = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const title = oneLine(meta.get('og:title') ?? titleTag ?? '', 200) || null;
  const description = plainText(decodeEntities(meta.get('og:description') ?? meta.get('description') ?? ''), 500) || null;

  const headings: string[] = [];
  for (const m of html.matchAll(/<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/gi)) {
    const h = oneLine(m[1]!, 150);
    if (h && !headings.includes(h)) headings.push(h);
    if (headings.length >= HEADINGS_MAX) break;
  }

  const bodyHtml = html.match(/<body\b[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html;
  const bodyText = plainText(bodyHtml, BODY_TEXT_MAX);

  return { url: pageUrl, title, description, headings, bodyText };
}
