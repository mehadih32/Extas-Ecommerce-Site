// PR 718 — Website › Policies (admin prototype v5, GAP-MAP "Policies: 5 new pages … history"): the pure part. The nine
// policy pages the prototype lists, in its order; which of them the shop already had (their words live in the setting
// `pages.text` and are mirrored there when published) and which are new (their published words are read straight from
// the page's history by the shop); the words of one version; and the page's state. No database, no React: the screen,
// the service and the tests all read this. The wording is the owner's: nothing here writes a policy for him.
import { pageWordsSchema, type HelpSlug } from '@extas/settings';

/** The pages the shop already had (Settings › Policies & texts reads and writes the same words). */
export const EXISTING_POLICIES = ['terms', 'privacy', 'delivery', 'exchange', 'payment'] as const satisfies readonly HelpSlug[];
/** The pages this tab adds: Cancellation and Refund, Wallet and coupons, Reviews, Cookies. */
export const NEW_POLICIES = ['cancellation', 'wallet', 'reviews', 'cookies'] as const;
/** The prototype's order (m-website.js: Terms, Privacy, Delivery, Exchange, Payment and COD, then the four new ones). */
export const POLICY_SLUGS = ['terms', 'privacy', 'delivery', 'exchange', 'payment', ...NEW_POLICIES] as const;
export type PolicySlug = (typeof POLICY_SLUGS)[number];
export type NewPolicySlug = (typeof NEW_POLICIES)[number];
export type ExistingPolicySlug = (typeof EXISTING_POLICIES)[number];

export const isPolicySlug = (s: unknown): s is PolicySlug => typeof s === 'string' && (POLICY_SLUGS as readonly string[]).includes(s);
export const isNewPolicy = (s: unknown): s is NewPolicySlug => typeof s === 'string' && (NEW_POLICIES as readonly string[]).includes(s);
export const isExistingPolicy = (s: unknown): s is ExistingPolicySlug => typeof s === 'string' && (EXISTING_POLICIES as readonly string[]).includes(s);

/** The kind of record a page's versions are kept under (`ContentRevision.entityType`; the page's slug is its entityId). */
export const REVISION_TYPE = 'policy';

export type Pair = { en: string; bn: string };
/** The words of one version: a title, a line under it and the body, each in both languages (empty = not written). */
export interface PolicyWords {
  title: Pair | null;
  lede: Pair | null;
  body: Pair | null;
}
export const WORD_FIELDS = ['title', 'lede', 'body'] as const satisfies readonly (keyof PolicyWords)[];
export const EMPTY_WORDS: PolicyWords = { title: null, lede: null, body: null };

/** Where a version came from: written here, kept from Settings › Policies & texts (version 1), or a restore of an older one. */
export type VersionSource = 'edit' | 'settings' | 'restore';

export const hasWords = (w: PolicyWords): boolean => WORD_FIELDS.some((f) => w[f] !== null);
export const sameWords = (a: PolicyWords, b: PolicyWords): boolean => JSON.stringify(normalise(a)) === JSON.stringify(normalise(b));

function normalise(w: PolicyWords): PolicyWords {
  return { title: w.title ?? null, lede: w.lede ?? null, body: w.body ?? null };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * The words a stored version holds (a version's `payload.words`), read defensively: a shape that is not a page's words
 * reads as nothing written. Never throws.
 */
export function wordsOfPayload(payload: unknown): PolicyWords {
  const raw = isObj(payload) && isObj(payload.words) ? payload.words : null;
  if (!raw) return EMPTY_WORDS;
  const ok = pageWordsSchema.safeParse({ title: raw.title ?? null, lede: raw.lede ?? null, body: raw.body ?? null });
  return ok.success ? normalise(ok.data) : EMPTY_WORDS;
}

export const sourceOfPayload = (payload: unknown): VersionSource => {
  const s = isObj(payload) ? payload.source : null;
  return s === 'settings' || s === 'restore' ? s : 'edit';
};

/**
 * The state the screen and the sitemap show: "published" (the live version is the newest), "published-draft" (live, with
 * a newer draft waiting), "draft" (nothing is live yet).
 */
export type PolicyState = 'published' | 'published-draft' | 'draft';
export function stateOf(live: boolean, draft: boolean): PolicyState {
  return live ? (draft ? 'published-draft' : 'published') : 'draft';
}

/** The public address of a policy page on the shop (the shop adds the language). */
export const policyPath = (slug: PolicySlug): string => `/help/${slug}`;
