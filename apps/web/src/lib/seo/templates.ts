// S11 · PR 221 — a shop page's search title and meta description (Blueprint C12.1: the server's first answer carries
// both). The order, for every kind of page:
//   1. the page's own text — what the owner typed for it (a category's SEO fields, a product's in Names & links, a
//      featured set's description), or an AI draft a person accepted (SeoMeta);
//   2. the kind's template (`seo.titles`; products: `naming.seoTitleTemplate` / `naming.metaDescriptionTemplate`), its
//      `{tokens}` filled from the page itself;
//   3. for a description only: the page's own body words (a product's description), cut to the limit; else none.
// Own text is never cut (the admin notes a long one, search engines cut it); what a template or body gives is cut to
// `naming.seoTitleMaxChars` / `naming.metaDescriptionMaxChars` at a word. Pure: the pages pass what they read.
import { cutTo } from '@extas/adapters';
import { fillTemplate } from '@extas/catalogue';
import type { SeoTemplatePage, SeoTitles } from '@extas/settings';

export type SeoLang = 'en' | 'bn';

export interface SeoLimits {
  title: number;
  description: number;
}

export interface PageTextsInput {
  /** The page's own title and description in this language (null/empty: none). */
  own?: { title?: string | null; description?: string | null };
  /** The template pair for this language. */
  template: { title: string; description: string };
  tokens: Record<string, string>;
  max: SeoLimits;
  /** The page's body words, used for the description when nothing above gives one. */
  body?: string | null;
}

export interface PageTexts {
  /** The whole title (null: the template gave nothing; the page keeps its plain title). */
  title: string | null;
  description: string | null;
}

const text = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

/** One page's title and description, by the order above. */
export function pageTexts(i: PageTextsInput): PageTexts {
  const title = text(i.own?.title) ?? text(cutTo(fillTemplate(i.template.title, i.tokens), i.max.title));
  const fromTemplate = i.template.description.trim() ? text(cutTo(fillTemplate(i.template.description, i.tokens), i.max.description)) : null;
  const body = text(i.body);
  const description = text(i.own?.description) ?? fromTemplate ?? (body ? cutBody(body, i.max.description) : null);
  return { title, description };
}

/** A body text as a description: one line, cut at a word with an ellipsis when it is longer than the limit. */
export function cutBody(body: string, max: number): string {
  const one = body.replace(/\s+/g, ' ').trim();
  if ([...one].length <= max) return one;
  return `${cutTo(one, Math.max(1, max - 1))}…`;
}

/** The template pair of one kind of page in one language. */
export function templateOf(titles: SeoTitles, kind: SeoTemplatePage, lang: SeoLang): { title: string; description: string } {
  return { title: titles[kind].title[lang], description: titles[kind].description[lang] };
}
