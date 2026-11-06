// S02 · PR 83 (register "A/B test module for the storefront"; BACKEND-ARCHITECTURE REP-08 Experiments) — the A/B test's
// pure rules, with no database and no React: what version B may change, how a test is written, which version a visitor
// sees, how version B is laid over the shop's settings, and how sure a result is.
//
// Version A is always the shop as it is. Version B changes only
//  - words of the shop (the dictionary keys of Website › Words & language, PR 78), in English and/or Bengali, and
//  - parts of a page shown or hidden (the eye-toggles of PR 80/81).
// Never a price, a discount, COD or a delivery charge (CLAUDE.md rule 6: those need the owner's written OK): an
// eye-toggle about prices, offers, payment or delivery cannot be tested, and a word cannot be tested when the shop's own
// word or the new one speaks of money, a number, an offer, payment or delivery (`moneyText`).
import { createHash } from 'node:crypto';
import { EYE_TOGGLES, eyeToggle, readEye, writeEye } from '@extas/settings';
import type { LabelOverrides } from '../shop/dict';
import { defaultWord, isWordKey, WORD_LANGS, WORD_MAX, type WordLang } from '../website/words';

/** What a test counts as a success: the visitor put something in the bag, or placed an order. */
export const GOALS = ['addToBag', 'order'] as const;
export type Goal = (typeof GOALS)[number];
export const isGoal = (v: unknown): v is Goal => typeof v === 'string' && (GOALS as readonly string[]).includes(v);

export type Version = 'a' | 'b';

/** The longest test name, the most changes of each kind in one version B. */
export const NAME_MAX = 80;
export const NOTE_MAX = 300;
export const CHANGES_MAX = 20;
/** A test's short key: lower case letters, digits and dashes (it names the test in the audit log). */
export const TEST_KEY = /^[a-z0-9][a-z0-9-]{1,39}$/;

/** Version B: parts shown (true) or hidden (false), and words. */
export interface BChanges {
  eye: Record<string, boolean>;
  words: Record<string, Partial<Record<WordLang, string>>>;
}

export const NO_CHANGES: BChanges = { eye: {}, words: {} };

// ---- never money --------------------------------------------------------------------------------------------------

/** An eye-toggle about prices, offers, payment or delivery: never tested. */
const MONEY_EYE = /price|discount|free|coupon|offer|pay|sale|charge|deliver|\bcod\b|wallet|cashback|refund/i;

/** Words that speak of money, a number, an offer, payment or delivery (English, Bengali). */
const MONEY_WORDS: readonly RegExp[] = [
  /[0-9০-৯]/,
  /৳|%|\$/,
  /\b(tk|taka|bdt|free|discount|discounts|off|sale|save|saving|savings|cod|cash|price|prices|priced|cost|costs|charge|charges|fee|fees|coupon|coupons|voucher|offer|offers|deal|deals|refund|refunds|cashback|deliver|delivery|delivered|shipping|ship|pay|paid|payment|wallet|advance|bkash|nagad)\b/i,
  /টাকা|ফ্রি|বিনামূল্য|ছাড়|ছাড|ডিসকাউন্ট|ক্যাশ|দাম|মূল্য|খরচ|চার্জ|ফি(?=[\s,.।]|$)|কুপন|ভাউচার|অফার|সেল|রিফান্ড|ডেলিভারি|ডেলিভার|পৌঁছে|শিপিং|পেমেন্ট|পরিশোধ|অগ্রিম|বিকাশ|নগদ|সাশ্রয়|বাঁচ/,
];
/** A {slot} that fills in an amount, a share or a number of days. */
const MONEY_SLOT = /\{(?:[^}]*(?:price|amount|total|minor|discount|charge|free|cod|save|fee|pct|percent|days|hours)[^}]*|n|count|over)\}/i;

/** Text that may not be tested (or changed by a test) because it speaks of money, numbers, offers, payment or delivery. */
export function moneyText(s: string): boolean {
  return MONEY_WORDS.some((r) => r.test(s)) || MONEY_SLOT.test(s);
}

/** Whether an eye-toggle may be part of a test. */
export const testableEye = (id: string): boolean => !!eyeToggle(id) && !MONEY_EYE.test(id);

/** The eye-toggles a test may change, in the list's order. */
export const TESTABLE_EYE = EYE_TOGGLES.filter((t) => testableEye(t.id));

/** Whether a shop word may be part of a test: a dictionary word whose own words (both languages) are not about money. */
export function testableWord(key: string): boolean {
  if (!isWordKey(key)) return false;
  return WORD_LANGS.every((l) => !moneyText(defaultWord(l, key)));
}

const slots = (s: string) => new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!));

// ---- writing a test -----------------------------------------------------------------------------------------------

/** A test as the editor sends it. */
export interface TestInput {
  name: string;
  goal: Goal;
  /** Share of visitors who see B, in % (1–99). */
  shareB: number;
  /** The last day it runs (YYYY-MM-DD, the shop's time zone), or null: until it is ended. */
  endsOn: string | null;
  note: string;
  b: BChanges;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Version B from the editor: every bad change is named (`eye.<id>`, `words.<key>`, `words.<key>.<lang>`, `b`). */
export function checkB(raw: unknown): { b: BChanges; bad: string[] } {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const bad: string[] = [];
  const b: BChanges = { eye: {}, words: {} };
  const eye = o.eye && typeof o.eye === 'object' && !Array.isArray(o.eye) ? (o.eye as Record<string, unknown>) : {};
  const words = o.words && typeof o.words === 'object' && !Array.isArray(o.words) ? (o.words as Record<string, unknown>) : {};
  if (Object.keys(eye).length > CHANGES_MAX) bad.push('eye');
  if (Object.keys(words).length > CHANGES_MAX) bad.push('words');
  for (const [id, v] of Object.entries(eye)) {
    if (!testableEye(id) || typeof v !== 'boolean') bad.push(`eye.${id}`);
    else b.eye[id] = v;
  }
  for (const [key, raw2] of Object.entries(words)) {
    if (!testableWord(key) || !raw2 || typeof raw2 !== 'object') {
      bad.push(`words.${key}`);
      continue;
    }
    const own: Partial<Record<WordLang, string>> = {};
    for (const lang of WORD_LANGS) {
      const v = (raw2 as Record<string, unknown>)[lang];
      if (v === undefined || v === null || v === '') continue;
      const text = typeof v === 'string' ? v.trim() : '';
      const shop = defaultWord(lang, key);
      const allowed = slots(shop);
      if (!text || text.length > WORD_MAX || moneyText(text) || [...slots(text)].some((x) => !allowed.has(x))) {
        bad.push(`words.${key}.${lang}`);
        continue;
      }
      if (text !== shop) own[lang] = text;
    }
    if (own.en || own.bn) b.words[key] = own;
    else if (!bad.some((x) => x.startsWith(`words.${key}.`))) bad.push(`words.${key}`);
  }
  if (!bad.length && !Object.keys(b.eye).length && !Object.keys(b.words).length) bad.push('b');
  return { b, bad };
}

/** A test from the editor; `bad` names every wrong field (nothing is written while one is wrong). */
export function parseTest(raw: unknown): { input: TestInput; bad: string[] } {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const bad: string[] = [];
  const name = typeof o.name === 'string' ? o.name.trim() : '';
  if (!name || name.length > NAME_MAX) bad.push('name');
  const goal = isGoal(o.goal) ? o.goal : 'addToBag';
  if (!isGoal(o.goal)) bad.push('goal');
  const shareB = typeof o.shareB === 'number' && Number.isInteger(o.shareB) && o.shareB >= 1 && o.shareB <= 99 ? o.shareB : 50;
  if (shareB !== o.shareB) bad.push('shareB');
  const endsOn = typeof o.endsOn === 'string' && o.endsOn ? o.endsOn : null;
  if (endsOn !== null && (!DAY.test(endsOn) || Number.isNaN(Date.parse(`${endsOn}T00:00:00Z`)))) bad.push('endsOn');
  const note = typeof o.note === 'string' ? o.note.trim() : '';
  if (note.length > NOTE_MAX) bad.push('note');
  const { b, bad: bBad } = checkB(o.b);
  return { input: { name, goal, shareB, endsOn, note, b }, bad: [...bad, ...bBad] };
}

/** Version B as stored (`AbTest.variants`), read back safely: anything no longer testable is left out. */
export function storedB(variants: unknown): BChanges {
  const o = variants && typeof variants === 'object' ? (variants as Record<string, unknown>) : {};
  return checkB(o.b).b;
}

/** The note stored with a test. */
export function storedNote(variants: unknown): string {
  const o = variants && typeof variants === 'object' ? (variants as Record<string, unknown>) : {};
  return typeof o.note === 'string' ? o.note : '';
}

/** B's share of visitors as stored (`AbTest.split`). */
export function storedShare(split: unknown): number {
  const v = split && typeof split === 'object' ? (split as Record<string, unknown>).b : undefined;
  return typeof v === 'number' && v >= 1 && v <= 99 ? v : 50;
}

/** Changes two tests make to the same thing (one running test per eye-toggle and per word). */
export function clash(x: BChanges, y: BChanges): string[] {
  return [...Object.keys(x.eye).filter((id) => id in y.eye), ...Object.keys(x.words).filter((k) => k in y.words)];
}

/** The settings version B touches. */
export function keysOf(b: BChanges): string[] {
  const keys = new Set(Object.keys(b.eye).map((id) => eyeToggle(id)!.key));
  if (Object.keys(b.words).length) keys.add('language.labels');
  return [...keys];
}

// ---- which version a visitor sees ---------------------------------------------------------------------------------

/** The version a visitor sees: the same for him every time (a hash of the test and his random id), B for `shareB` %. */
export function bucket(testId: string, visitor: string, shareB: number): Version {
  const h = createHash('sha256').update(`${testId}:${visitor}`).digest();
  return (h.readUInt32BE(0) / 0x1_0000_0000) * 100 < shareB ? 'b' : 'a';
}

/** Laid over one setting's value: version B's shown/hidden parts in it, or its words over `language.labels`. */
export function overlay(b: BChanges, key: string, value: unknown): unknown {
  let out = value;
  if (key === 'language.labels') {
    const entries = Object.entries(b.words);
    if (!entries.length) return value;
    const next: LabelOverrides = { ...((value as LabelOverrides | null) ?? {}) };
    for (const [k, w] of entries) next[k] = { ...(next[k] ?? {}), ...w };
    return next;
  }
  for (const [id, shown] of Object.entries(b.eye)) {
    const t = eyeToggle(id);
    if (!t || t.key !== key || readEye(out, t.path) === undefined) continue;
    out = writeEye(out, t.path, shown);
  }
  return out;
}

/** Version B of several tests at once (they never touch the same thing: `clash`). */
export function merged(list: readonly BChanges[]): BChanges {
  const out: BChanges = { eye: {}, words: {} };
  for (const b of list) {
    Object.assign(out.eye, b.eye);
    Object.assign(out.words, b.words);
  }
  return out;
}

// ---- how sure ------------------------------------------------------------------------------------------------------

export interface Tally {
  /** Visitors who saw the version. */
  n: number;
  /** Of them, who reached the goal. */
  c: number;
}

export interface Verdict {
  rateA: number | null;
  rateB: number | null;
  /** B against A ((rateB − rateA) / rateA), or null without a rate for A. */
  lift: number | null;
  /** How sure the difference is not chance (0–1, two-sided), or null before each version has enough visitors. */
  confidence: number | null;
  /** Each version has at least `minVisitors`. */
  enough: boolean;
  /** The better version once the confidence reaches the owner's number, else null. */
  winner: Version | null;
}

/** The normal distribution's cumulative value (Abramowitz–Stegun 26.2.17, error below 7.5e-8). */
function phi(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - p : p;
}

/** The two versions compared (a two-proportion z-test), with the owner's confidence (in %) and visitors per version. */
export function verdict(a: Tally, b: Tally, needPct: number, minVisitors: number): Verdict {
  const rateA = a.n ? a.c / a.n : null;
  const rateB = b.n ? b.c / b.n : null;
  const lift = rateA && rateB !== null ? (rateB - rateA) / rateA : null;
  const enough = a.n >= minVisitors && b.n >= minVisitors;
  if (!enough || rateA === null || rateB === null) return { rateA, rateB, lift, confidence: null, enough, winner: null };
  const p = (a.c + b.c) / (a.n + b.n);
  const se = Math.sqrt(p * (1 - p) * (1 / a.n + 1 / b.n));
  const z = se ? (rateB - rateA) / se : 0;
  const confidence = se ? Math.max(0, 2 * phi(Math.abs(z)) - 1) : 0;
  const winner = confidence * 100 >= needPct && rateA !== rateB ? (rateB > rateA ? 'b' : 'a') : null;
  return { rateA, rateB, lift, confidence, enough, winner };
}
