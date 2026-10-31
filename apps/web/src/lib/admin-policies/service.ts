// S18 · PR 384 — SET-03 Settings › Policies & texts (docs/BACKEND-ARCHITECTURE.md §5.13): the help pages that carry
// the shop's policies — terms, exchange, delivery, privacy, the FAQ, the story and contact — each with its switch,
// the Smart Rules it reads (their texts are the policy: a window or a charge is never written twice), which store
// details follow it, and the owner's own words (`pages.text`, owner data, empty by default). His words may quote a
// rule's number as `{rule-key.param}` ("Exchange within {exchange.windowHours} hours"): the shop fills it from the live
// rule and leaves a line out while it cannot (packages/rules text.ts `fillPolicyText`). A token that names no rule or
// value, or a stand-in like "[your email]", is refused on save. Seeing needs `settings.read`, saving
// `settings.write` (checked here again). The audit row names the fields that changed, never the owner's words.
import { createHash } from 'node:crypto';
import { audit, requirePermission, type Actor, type RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { formatValue, isLive, langContext, langOf, loadRules, policyTokenState, textContext, tokensIn, WINDOW_TOKENS, type PolicyTokenState, type Rule, type WindowedParams } from '@extas/rules';
import { hasStandIn, HELP_PAGES, pagesHelpSchema, pagesTextSchema, pageWordsSchema, storeTarget, type HelpSlug, type PagesHelpSettings, type PagesTextSettings } from '@extas/settings';
import type { AppResolver } from '../settings';

export interface PoliciesDeps {
  db: PrismaClient;
  resolver: AppResolver;
  now?: () => Date;
}
export interface PoliciesWho {
  actor: Actor;
  ctx: RequestContext;
}

export const POLICY_PAGES = HELP_PAGES;
export const isPolicyPage = (s: unknown): s is HelpSlug => typeof s === 'string' && (POLICY_PAGES as readonly string[]).includes(s);

/** The owner's three texts of a page, each in both languages. */
export const WORD_FIELDS = ['title', 'lede', 'body'] as const;
export type WordField = (typeof WORD_FIELDS)[number];

/** The longest text a field takes, from the setting's own schema. */
export function wordMax(f: WordField): number {
  return pageWordsSchema.shape[f].unwrap().shape.en.maxLength ?? Number.MAX_SAFE_INTEGER;
}

export const DETAILS = ['none', 'contact', 'legal'] as const;

type Pair = { en: string; bn: string };

/** One page as its settings card: switch, rules (ticked), details, and the owner's words. */
export interface PolicyCard {
  key: HelpSlug;
  value: { on: boolean; rules: Record<string, boolean>; details: (typeof DETAILS)[number]; title: Pair | null; lede: Pair | null; body: Pair | null };
  version: string;
}

export interface PolicyToken {
  raw: string;
  state: PolicyTokenState;
}

export interface PolicyPage {
  slug: HelpSlug;
  on: boolean;
  /** Any of his own words written. */
  own: boolean;
  /** The rules the page reads, in order: their name and whether they are live now. */
  rules: { key: string; name: string; live: boolean; known: boolean }[];
  details: (typeof DETAILS)[number];
  /** The `{rule-key.param}` tokens in his words and where each stands. */
  tokens: PolicyToken[];
  /** Has something to say on the shop now (else "Coming soon"). */
  shows: boolean;
}

/** A rule's value the owner may quote. */
export interface QuotableValue {
  token: string;
  rule: string;
  label: string;
  now: string | null;
  live: boolean;
}

export interface PoliciesView {
  pages: PolicyPage[];
  cards: Record<HelpSlug, PolicyCard>;
  /** The rules a page may read (every rule not archived), for the ticks. */
  ruleChoices: { value: string; label: string }[];
  values: QuotableValue[];
}

export class PoliciesError extends Error {
  constructor(
    readonly code: 'INVALID_INPUT' | 'STALE' | 'PLACEHOLDER' | 'UNKNOWN_TOKEN',
    readonly status: number,
    readonly details: string[] = [],
    readonly data: Record<string, unknown> = {},
  ) {
    super(code);
  }
}
export const isPoliciesError = (e: unknown): e is PoliciesError => e instanceof PoliciesError;

const S = MOTHER_STORE_ID;
const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const nameOf = (r: Rule, lang: string) => (lang === 'bn' && r.nameBn ? r.nameBn : r.nameEn);

interface Loaded {
  help: PagesHelpSettings;
  text: PagesTextSettings;
  rules: Rule[];
  all: Map<string, WindowedParams>;
  live: Set<string>;
}

async function load(deps: PoliciesDeps): Promise<Loaded> {
  const [help, text, store] = await Promise.all([deps.resolver.value('pages.help', { storeId: S }), deps.resolver.value('pages.text', { storeId: S }), loadRules(deps.db, S)]);
  const now = deps.now?.() ?? new Date();
  const rules = store.rules.filter((r) => !r.archived);
  return { help, text, rules, all: new Map(rules.map((r) => [r.key, r])), live: new Set(rules.filter((r) => isLive(r, now)).map((r) => r.key)) };
}

function cardOf(l: Loaded, slug: HelpSlug): PolicyCard {
  const p = l.help.pages[slug];
  const w = l.text?.pages[slug];
  const value: PolicyCard['value'] = {
    on: p.on,
    rules: Object.fromEntries(p.rules.map((k) => [k, true])),
    details: p.details,
    title: w?.title ?? null,
    lede: w?.lede ?? null,
    body: w?.body ?? null,
  };
  return { key: slug, value, version: versionOf(value) };
}

const wordsOf = (v: Pick<PolicyCard['value'], WordField>) => WORD_FIELDS.flatMap((f) => (v[f] ? [v[f].en, v[f].bn] : []));

function tokensOf(texts: string[], l: Loaded): PolicyToken[] {
  const seen = new Map<string, PolicyToken>();
  for (const t of texts) for (const ref of tokensIn(t)) if (!seen.has(ref.raw)) seen.set(ref.raw, { raw: ref.raw, state: policyTokenState(ref, l.all, l.live) });
  return [...seen.values()];
}

async function contactSet(deps: PoliciesDeps): Promise<boolean> {
  const v = await Promise.all([deps.resolver.value('contact.whatsapp', { storeId: S }), deps.resolver.value('contact.phone', { storeId: S }), deps.resolver.value('contact.email', { storeId: S })]);
  return v.some(Boolean);
}

function pageOf(l: Loaded, slug: HelpSlug, lang: string, reach: { contact: boolean }): PolicyPage {
  const c = cardOf(l, slug).value;
  const rules = l.help.pages[slug].rules.map((key) => {
    const r = l.rules.find((x) => x.key === key);
    return { key, name: r ? nameOf(r, lang) : key, live: l.live.has(key), known: !!r };
  });
  const tokens = tokensOf(wordsOf(c), l);
  const own = WORD_FIELDS.some((f) => c[f] !== null);
  const ownFaq = slug === 'faq' && (l.text?.faq ?? []).some((x) => x.on);
  const faqRules = slug === 'faq' && l.rules.some((r) => l.live.has(r.key) && r.placements.includes('faq'));
  const contact = slug === 'contact' && reach.contact;
  // the same test as the shop's (lib/shop/help-pages): rules, his body or questions, or ways to reach the shop
  const said = rules.some((r) => r.live) || c.body !== null || ownFaq || faqRules || contact;
  return { slug, on: c.on, own, rules, details: c.details, tokens, shows: c.on && said };
}

/** The page's data (`settings.read`). */
export async function policiesView(deps: PoliciesDeps, who: PoliciesWho, lang: string): Promise<PoliciesView> {
  await requirePermission(deps.db, who.actor, 'settings.read', { storeId: S });
  const l = await load(deps);
  const reach = { contact: await contactSet(deps) };
  const ctx = langContext(await textContext({ settings: deps.resolver }, S), langOf(lang));
  const listed = new Set(POLICY_PAGES.flatMap((s) => l.help.pages[s].rules));
  const ruleChoices = [...l.rules.map((r) => ({ value: r.key, label: `${nameOf(r, lang)} (${r.key})` })), ...[...listed].filter((k) => !l.all.has(k)).map((k) => ({ value: k, label: k }))];
  const values: QuotableValue[] = l.rules.flatMap((r) => [
    ...r.params.map((p) => ({ token: `{${r.key}.${p.key}}`, rule: nameOf(r, lang), label: (lang === 'bn' && p.labelBn) || p.labelEn, now: formatValue(p.type, p.value, ctx), live: l.live.has(r.key) })),
    ...WINDOW_TOKENS.filter((k) => r[k]).map((k) => ({ token: `{${r.key}.${k}}`, rule: nameOf(r, lang), label: k, now: formatValue('datetime', r[k], ctx), live: l.live.has(r.key) })),
  ]);
  return {
    pages: POLICY_PAGES.map((s) => pageOf(l, s, lang, reach)),
    cards: Object.fromEntries(POLICY_PAGES.map((s) => [s, cardOf(l, s)])) as Record<HelpSlug, PolicyCard>,
    ruleChoices,
    values,
  };
}

function pairIn(v: unknown, field: string): Pair | null {
  if (v === null || v === undefined) return null;
  if (!isObj(v) || typeof v.en !== 'string' || typeof v.bn !== 'string') throw new PoliciesError('INVALID_INPUT', 400, [field]);
  const p = { en: v.en.replace(/\r\n?/g, '\n').trim(), bn: v.bn.replace(/\r\n?/g, '\n').trim() };
  if (!p.en && !p.bn) return null;
  if (!p.en || !p.bn) throw new PoliciesError('INVALID_INPUT', 400, [field]);
  return p;
}

/** Saves one page's card (`settings.write`): switch, rules, details and his words. */
export async function savePolicyPage(deps: PoliciesDeps, who: PoliciesWho, input: unknown, lang: string): Promise<PoliciesView> {
  await requirePermission(deps.db, who.actor, 'settings.write', { storeId: S });
  if (!isObj(input) || !isPolicyPage(input.key) || !isObj(input.value)) throw new PoliciesError('INVALID_INPUT', 400, ['key', 'value']);
  const slug = input.key;
  const v = input.value;
  const l = await load(deps);
  const before = cardOf(l, slug);
  if (input.version !== undefined && input.version !== before.version) throw new PoliciesError('STALE', 409, ['version'], { version: before.version });

  if (typeof v.on !== 'boolean') throw new PoliciesError('INVALID_INPUT', 400, ['on']);
  if (!(DETAILS as readonly string[]).includes(String(v.details))) throw new PoliciesError('INVALID_INPUT', 400, ['details']);
  if (!isObj(v.rules) || Object.values(v.rules).some((x) => typeof x !== 'boolean')) throw new PoliciesError('INVALID_INPUT', 400, ['rules']);
  const ticked = Object.entries(v.rules)
    .filter(([, on]) => on)
    .map(([k]) => k);
  const was = l.help.pages[slug].rules;
  const strange = ticked.filter((k) => !l.all.has(k) && !was.includes(k));
  if (strange.length) throw new PoliciesError('INVALID_INPUT', 400, ['rules', ...strange]);
  // the order the page reads them in: the ones it read before, then the newly ticked in the list's order
  const rules = [...was.filter((k) => ticked.includes(k)), ...l.rules.map((r) => r.key).filter((k) => ticked.includes(k) && !was.includes(k))];
  const words = { title: pairIn(v.title, 'title'), lede: pairIn(v.lede, 'lede'), body: pairIn(v.body, 'body') };

  const stand = WORD_FIELDS.filter((f) => words[f] && (hasStandIn(words[f].en) || hasStandIn(words[f].bn)));
  if (stand.length) throw new PoliciesError('PLACEHOLDER', 400, stand);
  const bad = tokensOf(wordsOf(words), l).filter((t) => t.state === 'unknown');
  if (bad.length) throw new PoliciesError('UNKNOWN_TOKEN', 400, bad.map((t) => t.raw));

  const help: PagesHelpSettings = { ...l.help, pages: { ...l.help.pages, [slug]: { on: v.on, rules, details: v.details as (typeof DETAILS)[number] } } };
  const pages = { ...(l.text?.pages ?? {}) };
  if (WORD_FIELDS.some((f) => words[f])) pages[slug] = words;
  else delete pages[slug];
  const faq = l.text?.faq ?? [];
  const text: PagesTextSettings = Object.keys(pages).length || faq.length ? { pages, faq } : null;
  const okHelp = pagesHelpSchema.safeParse(help);
  if (!okHelp.success) throw new PoliciesError('INVALID_INPUT', 400, okHelp.error.issues.map((i) => i.path.join('.')));
  const okText = text === null ? null : pagesTextSchema.safeParse(text);
  if (okText && !okText.success) throw new PoliciesError('INVALID_INPUT', 400, okText.error.issues.map((i) => i.path.slice(2).join('.') || 'words'));

  const after = cardOf({ ...l, help, text }, slug);
  if (after.version === before.version) return policiesView(deps, who, lang);
  const meta = { actorId: who.actor.staffUserId ?? null, reason: 'Settings › Policies & texts' };
  const changed = (['on', 'rules', 'details', ...WORD_FIELDS] as const).filter((f) => JSON.stringify(after.value[f]) !== JSON.stringify(before.value[f]));
  if (changed.some((f) => f === 'on' || f === 'rules' || f === 'details')) await deps.resolver.set('pages.help', help, storeTarget(S), meta);
  if (changed.some((f) => (WORD_FIELDS as readonly string[]).includes(f))) await deps.resolver.set('pages.text', text, storeTarget(S), meta);
  // his words are owner data: the audit row names the page and the fields, never the words
  await audit(deps.db, who.actor, { storeId: S, action: 'policies.page.save', entityType: 'Setting', entityId: slug, after: { page: slug, changed } }, who.ctx);
  return policiesView(deps, who, lang);
}
