// PR 75 — the help pages as data (Blueprint D3.17, C12 `/help/<slug>`; demo 71-pages.js): questions and answers,
// delivery, exchange and returns, privacy, terms, our story and contact. A page says only what is true today: the
// live Smart Rules' own texts (the owner's policy — never a charge, a window or a promise written here), the owner's
// own words (`pages.text`, owner data, empty by default) and the store's details from settings (each only when filled
// in). A page with none of these says "Coming soon" (CN-010, CN-017). Plain functions, unit-tested; HelpPage draws.
import type { HelpSlug, PagesHelpSettings, PagesTextSettings, ShopIcon } from '@extas/settings';
import type { ShopT } from './dict';
import { hrefIn, type ShopLang } from './lang';
import { telHref, waHref } from './links';
import { ROUTES } from './routes';

/** The pages this route draws, in the demo's order (PG_ORDER without "Ways to pay" and "Careers", still to come). */
export const HELP_SLUGS = ['faq', 'delivery', 'exchange', 'privacy', 'terms', 'story', 'contact'] as const satisfies readonly HelpSlug[];

export const isHelpSlug = (s: string): s is HelpSlug => (HELP_SLUGS as readonly string[]).includes(s);

/** Each page's title (the shop dictionary's, the same words as the menus and the footer) and its topic icon. */
const TITLE: Record<HelpSlug, string> = {
  faq: 'help.questions',
  delivery: 'help.delivery',
  exchange: 'help.exchange',
  privacy: 'help.privacy',
  terms: 'help.terms',
  story: 'help.story',
  contact: 'help.contact',
};
export const HELP_ICON: Record<HelpSlug, ShopIcon> = { faq: 'info', delivery: 'box', exchange: 'swap', privacy: 'lock', terms: 'doc', story: 'spark', contact: 'phone' };
/** The shop's own line under the title, only where it describes what the page reads (rules, contact details). */
const LEDE: Partial<Record<HelpSlug, string>> = { faq: 'helpPage.lede.faq', delivery: 'helpPage.lede.delivery', exchange: 'helpPage.lede.exchange', contact: 'helpPage.lede.contact' };

export type TextBlock = { kind: 'h'; text: string } | { kind: 'p'; text: string } | { kind: 'ul'; items: string[] };

/**
 * The owner's text as blocks: an empty line ends a paragraph, "## " starts a heading, "- " (or "• ") a list line;
 * the lines of one paragraph join with a space. Nothing in it is markup: it is drawn as text.
 */
export function textBlocks(body: string | null | undefined): TextBlock[] {
  const out: TextBlock[] = [];
  let para: string[] = [];
  let list: string[] | null = null;
  const flush = () => {
    if (para.length) out.push({ kind: 'p', text: para.join(' ') });
    para = [];
    if (list?.length) out.push({ kind: 'ul', items: list });
    list = null;
  };
  for (const raw of (body ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) flush();
    else if (/^#{1,3}\s+/.test(line)) {
      flush();
      out.push({ kind: 'h', text: line.replace(/^#{1,3}\s+/, '') });
    } else if (/^[-•]\s+/.test(line)) {
      if (para.length) {
        out.push({ kind: 'p', text: para.join(' ') });
        para = [];
      }
      (list ??= []).push(line.replace(/^[-•]\s+/, ''));
    } else {
      if (list?.length) {
        out.push({ kind: 'ul', items: list });
        list = null;
      }
      para.push(line);
    }
  }
  flush();
  return out;
}

/** A rule's full text, as the rules write it: one line, one paragraph. */
export function ruleBlocks(full: string | null | undefined): TextBlock[] {
  return (full ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((text) => ({ kind: 'p' as const, text }));
}

/** A live rule's words for a page (lib/rules-public): the one-line text and the full text. */
export interface RuleWords {
  key: string;
  short: string | null;
  full: string | null;
}

export interface HelpFacts {
  whatsapp: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  hours: string | null;
  registeredName: string | null;
  tradeLicence: string | null;
  dbid: string | null;
  /** The words a WhatsApp message starts with ("Hi {store}"). */
  waText: string;
}

export interface HelpChannel {
  id: 'whatsapp' | 'phone' | 'email' | 'address';
  icon: ShopIcon;
  title: string;
  sub: string;
  href: string | null;
  external: boolean;
}

export interface HelpModel {
  slug: HelpSlug;
  title: string;
  lede: string | null;
  /** FAQ: the owner's questions first, then each live rule placed on "FAQ" (its line as the question). */
  qa: Array<{ id: string; q: string; a: TextBlock[] }>;
  /** The page's rules (a heading each) and the owner's own text. */
  sections: Array<{ id: string; title: string | null; blocks: TextBlock[] }>;
  /** The store's details under the page (privacy: e-mail and hotline; terms: who the shop is). */
  details: { title: string; lines: string[] } | null;
  /** Contact: the ways to reach the shop that are filled in. */
  channels: HelpChannel[];
  /** Nothing true to say yet (or switched off): the page says "Coming soon". */
  soon: boolean;
}

const own = (l: { en: string; bn: string } | null | undefined, lang: ShopLang) => (l ? (lang === 'bn' ? l.bn : l.en) || null : null);

/**
 * PR 384 (SET-03) — the owner's words with every text run through `fill` (lib/rules-public `policyFiller`): his
 * `{rule-key.param}` tokens become the live rules' values, and a line that cannot be filled is left out. A text left
 * empty counts as not written, so the page falls back to its own title or says "Coming soon".
 */
export function fillPagesText(text: PagesTextSettings, fill: (s: string) => string): PagesTextSettings {
  if (!text) return text;
  const pair = (p: { en: string; bn: string } | null | undefined) => (p ? { en: fill(p.en).trim(), bn: fill(p.bn).trim() } : null);
  const pages: NonNullable<PagesTextSettings>['pages'] = {};
  for (const slug of HELP_SLUGS) {
    const w = text.pages[slug];
    if (w) pages[slug] = { title: pair(w.title), lede: pair(w.lede), body: pair(w.body) };
  }
  return { pages, faq: text.faq.map((x) => ({ ...x, q: pair(x.q)!, a: pair(x.a)! })) };
}

export function helpModel(input: { slug: HelpSlug; set: PagesHelpSettings; text: PagesTextSettings; lang: ShopLang; t: ShopT; rules: readonly RuleWords[]; facts: HelpFacts }): HelpModel {
  const { slug, set, lang, t, facts } = input;
  const page = set.pages[slug];
  const words = input.text?.pages[slug];
  const title = own(words?.title, lang) ?? t(TITLE[slug]);
  const ledeKey = LEDE[slug];
  const lede = own(words?.lede, lang) ?? (ledeKey ? t(ledeKey) : null);

  const qa: HelpModel['qa'] = [];
  const sections: HelpModel['sections'] = [];
  const live = input.rules.filter((r) => r.short || r.full);
  if (slug === 'faq') {
    for (const x of input.text?.faq ?? []) {
      const q = own(x.q, lang);
      if (x.on && q) qa.push({ id: `own-${x.id}`, q, a: textBlocks(own(x.a, lang)) });
    }
    for (const r of live) if (r.short) qa.push({ id: `rule-${r.key}`, q: r.short, a: ruleBlocks(r.full ?? r.short) });
  } else for (const r of live) sections.push({ id: `rule-${r.key}`, title: r.short, blocks: ruleBlocks(r.full) });
  const body = textBlocks(own(words?.body, lang));
  if (body.length) sections.push({ id: 'own', title: null, blocks: body });

  const channels: HelpChannel[] = [];
  if (slug === 'contact') {
    const hours = facts.hours ?? '';
    const wa = waHref(facts.whatsapp, facts.waText);
    if (wa) channels.push({ id: 'whatsapp', icon: 'chat', title: t('helpPage.ch.whatsapp'), sub: hours || t('helpPage.ch.whatsappSub'), href: wa, external: true });
    const tel = telHref(facts.phone);
    if (tel && facts.phone) channels.push({ id: 'phone', icon: 'phone', title: facts.phone, sub: hours ? t('helpPage.ch.phoneHours', { hours }) : t('helpPage.ch.phoneSub'), href: tel, external: false });
    if (facts.email) channels.push({ id: 'email', icon: 'mail', title: facts.email, sub: t('helpPage.ch.emailSub'), href: `mailto:${facts.email}`, external: false });
    if (facts.address) channels.push({ id: 'address', icon: 'home', title: facts.address, sub: t('helpPage.ch.addressSub'), href: null, external: false });
  }

  let details: HelpModel['details'] = null;
  if (page.details === 'contact') {
    const lines = [facts.email, facts.phone].filter((x): x is string => Boolean(x));
    if (lines.length) details = { title: t('helpPage.details.contact'), lines: [lines.join(' · ')] };
  } else if (page.details === 'legal') {
    const lines = [
      facts.registeredName,
      facts.address,
      facts.tradeLicence ? t('footer.tradeLicence', { id: facts.tradeLicence }) : null,
      facts.dbid ? t('footer.dbid', { id: facts.dbid }) : null,
    ].filter((x): x is string => Boolean(x));
    if (lines.length) details = { title: t('helpPage.details.legal'), lines: [lines.join(' · ')] };
  }

  // the store's details alone are no page: something of the page's own must be there
  const said = qa.length > 0 || sections.length > 0 || channels.length > 0;
  return { slug, title, lede, qa, sections, details, channels, soon: !page.on || !said };
}

/** The help centre's topic list (computer): the chosen pages that have something to say, in the chosen order. */
export function helpTopics(set: PagesHelpSettings, shown: ReadonlySet<HelpSlug>, current: HelpSlug, lang: ShopLang, titles: Record<HelpSlug, string>) {
  return set.topics
    .filter((s) => shown.has(s))
    .map((s) => ({ slug: s, href: hrefIn(lang, ROUTES.help(s)), label: titles[s], icon: HELP_ICON[s], current: s === current }));
}
