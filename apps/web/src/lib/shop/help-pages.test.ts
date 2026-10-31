// PR 75 — the help pages say only what is true: the live rules' texts, the owner's own words, the store's details;
// nothing else is "Coming soon" (CN-017).
import { shopMoreSettings, type PagesTextSettings } from '@extas/settings';
import { describe, expect, it } from 'vitest';
import { shopT } from './dict';
import { fillPagesText, HELP_SLUGS, helpModel, helpTopics, isHelpSlug, textBlocks, type HelpFacts, type RuleWords } from './help-pages';
import { BUILT_INSIDE, comingSoon } from './routes';

const set = shopMoreSettings['pages.help'].default;
const none: HelpFacts = { whatsapp: null, phone: null, email: null, address: null, hours: null, registeredName: null, tradeLicence: null, dbid: null, waText: 'Hi' };
const exchange: RuleWords = { key: 'exchange', short: 'Exchange within 72 hours for size or fault', full: 'You can exchange for a different SIZE.\nItems must be unworn.' };
const model = (slug: (typeof HELP_SLUGS)[number], o: { rules?: RuleWords[]; text?: PagesTextSettings; facts?: Partial<HelpFacts>; lang?: 'en' | 'bn'; s?: typeof set } = {}) =>
  helpModel({ slug, set: o.s ?? set, text: o.text ?? null, lang: o.lang ?? 'en', t: shopT(o.lang ?? 'en'), rules: o.rules ?? [], facts: { ...none, ...o.facts } });

describe('the owner`s words as blocks', () => {
  it('paragraphs, headings and lists, never markup', () => {
    expect(textBlocks('## What we keep\nYour name\nand phone.\n\n- one\n- two\nAfter <b>x</b>')).toEqual([
      { kind: 'h', text: 'What we keep' },
      { kind: 'p', text: 'Your name and phone.' },
      { kind: 'ul', items: ['one', 'two'] },
      { kind: 'p', text: 'After <b>x</b>' },
    ]);
    expect(textBlocks(null)).toEqual([]);
    expect(textBlocks('a\r\n\r\nb')).toEqual([
      { kind: 'p', text: 'a' },
      { kind: 'p', text: 'b' },
    ]);
  });
});

describe('a help page', () => {
  it('with no live rule, no words of the owner and no details: "Coming soon" (every page in the sample shop with nothing set)', () => {
    for (const slug of HELP_SLUGS) expect(model(slug).soon, slug).toBe(true);
  });

  it('exchange: each live rule its own section, its line as the heading, one paragraph per line of its text', () => {
    const m = model('exchange', { rules: [exchange, { key: 'no-return', short: null, full: null }] });
    expect(m.soon).toBe(false);
    expect(m.title).toBe('Exchange & returns');
    expect(m.sections).toEqual([
      {
        id: 'rule-exchange',
        title: exchange.short,
        blocks: [
          { kind: 'p', text: 'You can exchange for a different SIZE.' },
          { kind: 'p', text: 'Items must be unworn.' },
        ],
      },
    ]);
  });

  it('FAQ: the owner`s questions first (only the ones switched on), then the rules placed on it', () => {
    const text: PagesTextSettings = {
      pages: {},
      faq: [
        { id: 'shop', on: true, q: { en: 'Do you have a shop?', bn: 'দোকান আছে?' }, a: { en: 'Online only.', bn: 'শুধু অনলাইনে।' } },
        { id: 'off', on: false, q: { en: 'Hidden?', bn: 'লুকানো?' }, a: { en: 'Yes.', bn: 'হ্যাঁ।' } },
      ],
    };
    const m = model('faq', { rules: [exchange], text, lang: 'bn' });
    expect(m.qa.map((q) => q.q)).toEqual(['দোকান আছে?', exchange.short]);
    expect(m.title).toBe('প্রশ্ন ও উত্তর');
  });

  it('privacy, terms and our story are the owner`s alone: his text shows them, the store`s details follow', () => {
    expect(model('privacy', { facts: { email: 'shop@example.test' } }).soon).toBe(true);
    const text: PagesTextSettings = { pages: { terms: { title: { en: 'Terms of sale', bn: 'বিক্রির শর্ত' }, lede: null, body: { en: 'Orders are confirmed by us.', bn: 'অর্ডার আমরা নিশ্চিত করি।' } } }, faq: [] };
    const m = model('terms', { text, facts: { registeredName: 'Sample Ltd', tradeLicence: 'TL-1', dbid: null } });
    expect(m.soon).toBe(false);
    expect(m.title).toBe('Terms of sale');
    expect(m.lede).toBeNull();
    expect(m.details).toEqual({ title: 'Who we are', lines: ['Sample Ltd · Trade licence: TL-1'] });
  });

  it('contact: only the ways that are filled in, WhatsApp with the store`s greeting; nothing filled in is "Coming soon"', () => {
    const m = model('contact', { facts: { whatsapp: '+8801000000001', email: 'shop@example.test', hours: '10 am – 10 pm' } });
    expect(m.soon).toBe(false);
    expect(m.channels.map((x) => [x.id, x.href, x.sub])).toEqual([
      ['whatsapp', 'https://wa.me/8801000000001?text=Hi', '10 am – 10 pm'],
      ['email', 'mailto:shop@example.test', 'E-mail'],
    ]);
  });

  it('a page switched off says "Coming soon" whatever it has', () => {
    const off = { ...set, pages: { ...set.pages, exchange: { ...set.pages.exchange, on: false } } };
    expect(model('exchange', { rules: [exchange], s: off }).soon).toBe(true);
  });

  it('the help centre lists the chosen topics that have something to say, in order', () => {
    const titles = Object.fromEntries(HELP_SLUGS.map((s) => [s, s])) as Record<(typeof HELP_SLUGS)[number], string>;
    const l = helpTopics(set, new Set(['faq', 'exchange', 'story'] as const), 'faq', 'bn', titles);
    expect(l.map((x) => [x.slug, x.href, x.current])).toEqual([
      ['exchange', '/bn/help/exchange', false],
      ['faq', '/bn/help/faq', true],
    ]);
  });

  it('the seven pages have their route; Ways to pay, Careers and the size guide are still coming', () => {
    for (const s of HELP_SLUGS) {
      expect(isHelpSlug(s)).toBe(true);
      expect(BUILT_INSIDE).toContain(`/help/${s}`);
      expect(comingSoon(`/help/${s}`, '/p/')).toBeNull();
    }
    for (const s of ['payment', 'careers', 'size-guide']) {
      expect(isHelpSlug(s)).toBe(false);
      expect(comingSoon(`/help/${s}`, '/p/')).toBe('help');
    }
  });
});

describe('the owner`s policy words filled from the rules (PR 384)', () => {
  // a stand-in filler: `{exchange.windowHours}` is live at 72, any other token line is left out
  const fill = (t: string) =>
    t
      .split('\n')
      .map((l) => l.replace('{exchange.windowHours}', '72'))
      .filter((l) => !/\{[^}]*\}/.test(l))
      .join('\n');
  const text: PagesTextSettings = {
    pages: {
      exchange: { title: { en: '{gone.title}', bn: '{gone.title}' }, lede: null, body: { en: 'Within {exchange.windowHours} hours.\nCharge {delivery.charge}.', bn: '{exchange.windowHours} ঘণ্টার মধ্যে।' } },
    },
    faq: [{ id: 'q1', on: true, q: { en: '{gone.q}', bn: '{gone.q}' }, a: { en: 'A', bn: 'উ' } }],
  };

  it('fills the tokens, leaves out a line that cannot be filled, and falls back to the page title', () => {
    const filled = fillPagesText(text, fill);
    const m = model('exchange', { text: filled });
    expect(m.title).toBe(shopT('en')('help.exchange'));
    expect(m.sections).toEqual([{ id: 'own', title: null, blocks: [{ kind: 'p', text: 'Within 72 hours.' }] }]);
    expect(model('exchange', { text: filled, lang: 'bn' }).sections[0]!.blocks).toEqual([{ kind: 'p', text: '72 ঘণ্টার মধ্যে।' }]);
    expect(model('faq', { text: filled }).qa).toEqual([]);
    expect(fillPagesText(null, fill)).toBeNull();
  });
});
