// PR 41 follow-up (CN-017: every promise in copy is tested or removed) — the shop's own words make no claim that can
// go stale: no number ("39 new styles"), no year ("Winter 2026") and no "this week" / "today" in the shop dictionary
// or in any setting's default words. A shop fills those in from its data ({n}, {freeOver}, {windowHours}) or the owner
// writes a campaign's own words in the setting (home.hero) while they are true. The few numbers that are not claims
// are listed below, each with why.
import { registry } from '@extas/settings';
import { describe, expect, it } from 'vitest';
import { SHOP_DICTS, keysOf } from './dict';
import type { Dict } from '../i18n';

/** Numbers that are no claim about the shop, by dictionary key. */
const NOT_A_CLAIM: Record<string, string> = {
  'nav.style': 'the one-form of a counted {n} (plural rule)',
  'cat.style': 'the one-form of a counted {n} (plural rule)',
  'cat.product': 'the one-form of a counted {n} (plural rule)',
  'cat.filterOn': 'the one-form of a counted {n} (plural rule)',
  'cat.showOne': 'the one-form of a counted {n} (plural rule)',
  'search.helpOne': 'the one-form of a counted {n} (plural rule, PR 73)',
  'home.reviews.one': 'the one-form of a counted {n} (plural rule)',
  'home.reviews.stars': 'the rating scale ("out of 5"), not a count',
  'footer.join.empty': 'the mobile number format (01XXXXXXXXX)',
  'footer.join.short': 'the mobile number format (11 digits)',
  'footer.join.prefix': 'the mobile number format (013 to 019, 11 digits)',
  'footer.promise.original': "the brand's standing promise in the approved demo; a switch in footer.promise",
  'checkout.form.phonePh': 'the mobile number format (01XXXXXXXXX)',
  'checkout.form.phoneCount': 'the mobile number format (11 digits)',
  'checkout.form.phonePrefix': 'the mobile number format (013 to 019)',
  'checkout.form.phoneLength': 'the mobile number format (11 digits, 01XXXXXXXXX)',
  'checkout.ask.phoneBad': 'the mobile number format (11 digits, 01XXXXXXXXX)',
  'checkout.askBn.phoneBad': 'the mobile number format (11 digits, 01XXXXXXXXX)',
  'bag.ups.origTitle': "the same standing promise on the bag's why-card (PR 114); off by default, switch bag.upsell.originalLine",
  'pdp.trust.original': 'the same standing promise in the product page promise row (PR 62); off by default, pdp.trust items (CN-009)',
  'pdp.notify.empty': 'the mobile number format (01XXXXXXXXX), the same words as footer.join (PR 56 back-in-stock box)',
  'pdp.notify.short': 'the mobile number format (11 digits), the same words as footer.join',
  'pdp.notify.prefix': 'the mobile number format (013 to 019, 11 digits), the same words as footer.join',
  'pdp.stock.ships': "\"ships today\" (PR 60): said only before the owner's own dispatch time (pdp.stock.dispatchCutoff, empty by default), checked on the store clock at each page view",
};

const DIGIT = /[0-9০-৯]/;
const BN = '\\u0980-\\u09FF';
/** Words that tie a line to a moment that passes. */
const WHEN = [
  /\bthis (week|weekend|month|season|year)\b/i,
  /\b(today|tonight|tomorrow)\b/i,
  /\bevery (week|month)\b/i,
  new RegExp(`(^|[^${BN}])এই (সপ্তাহ|মাস|মৌসুম|বছর|সিজন)`),
  new RegExp(`(^|[^${BN}])(আজ|আজকে|আজকের|আগামীকাল)($|[^${BN}])`),
  new RegExp(`(^|[^${BN}])প্রতি (সপ্তাহ|মাস)`),
];

/** What in a line could go stale: a number or a "this week", slots ({n}) taken out. */
function staleClaims(text: string): string[] {
  const bare = text.replace(/\{[^}]+\}/g, '');
  const out: string[] = [];
  if (DIGIT.test(bare)) out.push('number');
  for (const re of WHEN) {
    const m = bare.match(re);
    if (m) out.push(m[0].trim());
  }
  return out;
}

function lookup(dict: Dict, key: string): string {
  let node: string | Dict | undefined = dict;
  for (const part of key.split('.')) node = typeof node === 'object' ? node[part] : undefined;
  return typeof node === 'string' ? node : '';
}

/** Every {en, bn} text inside a setting's default, with where it sits. */
function ownWords(value: unknown, at: string, out: [string, string][] = []): [string, string][] {
  if (Array.isArray(value)) value.forEach((v, i) => ownWords(v, `${at}[${i}]`, out));
  else if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    for (const lang of ['en', 'bn'])
      if (typeof o[lang] === 'string' && Object.keys(o).every((k) => ['en', 'bn', 'key'].includes(k))) out.push([`${at}.${lang}`, o[lang] as string]);
    for (const [k, v] of Object.entries(o)) if (typeof v === 'object') ownWords(v, `${at}.${k}`, out);
  }
  return out;
}

describe('PR 41 · no stale promise in the shop words (CN-017)', () => {
  it('the shop dictionary, in both languages, holds no number, year or "this week" outside the listed ones', () => {
    const found = (['en', 'bn'] as const).flatMap((lang) =>
      keysOf(SHOP_DICTS[lang])
        .filter((k) => !(k in NOT_A_CLAIM))
        .flatMap((k) => staleClaims(lookup(SHOP_DICTS[lang], k)).map((c) => `${lang} ${k}: ${c}`)),
    );
    expect(found).toEqual([]);
  });

  it('no setting carries such words in its default', () => {
    const found = Object.entries(registry).flatMap(([key, def]) =>
      ownWords((def as { default: unknown }).default, key).flatMap(([where, text]) => staleClaims(text).map((c) => `${where}: ${c}`)),
    );
    expect(found).toEqual([]);
  });

  it('the home hero says nothing about a count, a season or a year by default', () => {
    for (const lang of ['en', 'bn'] as const) {
      const hero = ['eyebrow', 'title', 'sub'].map((p) => lookup(SHOP_DICTS[lang], `home.hero.${p}`));
      expect(hero.every(Boolean)).toBe(true);
      expect(hero.join(' ')).not.toMatch(/winter|summer|eid|শীত|গ্রীষ্ম|ঈদ/i);
    }
  });

  it('every listed exception is still in the dictionary and still needs to be listed', () => {
    for (const k of Object.keys(NOT_A_CLAIM)) {
      const both = (['en', 'bn'] as const).map((lang) => lookup(SHOP_DICTS[lang], k));
      expect(both.every(Boolean), k).toBe(true);
      expect(both.some((t) => staleClaims(t).length > 0), k).toBe(true);
    }
  });

  it('the check itself catches the old hero and the "this week" line, and lets slots through', () => {
    expect(staleClaims('Winter 2026')).toEqual(['number']);
    expect(staleClaims('Hoodies, sweatshirts and jackets. 39 new styles')).toEqual(['number']);
    expect(staleClaims('শীত ২০২৬')).toEqual(['number']);
    expect(staleClaims('Fresh styles this week')).toEqual(['this week']);
    expect(staleClaims('এই সপ্তাহের নতুন স্টাইল')).toEqual(['এই সপ্তাহ']);
    expect(staleClaims('আজকের অফার')).toEqual(['আজকের']);
    expect(staleClaims('Free delivery over {freeOver}')).toEqual([]);
    expect(staleClaims('{n}টি স্টাইল')).toEqual([]);
    expect(staleClaims('যত্ন করে বাছাই করা প্রতিদিনের পোশাক।')).toEqual([]);
  });
});
