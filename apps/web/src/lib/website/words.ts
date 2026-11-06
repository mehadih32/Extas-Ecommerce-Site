// S02 · PR 78 (register "Label dictionary — every visible word editable by the owner, in both languages"; Blueprint PR
// 503 dictionary; BACKEND-ARCHITECTURE WEB-05 Words & language) — the pure part of Website › Words & language: every
// word of the shop dictionary (messages/shop*.<lang>.json, lib/shop/dict.ts) with the owner's own text from
// `language.labels` (his words win over ours), searched, filtered and paged; a change applied to the saved words; and
// the CSV the owner exports and imports. No database here (lib/website/words-admin.ts reads and saves).
//   - A word the owner leaves empty (or sets to the shop's own text) goes back to the dictionary: nothing is lost.
//   - A {slot} the dictionary's word does not have is refused (it would show as is in the shop).
//   - Owner words at keys that are not in the dictionary are kept as they are, never touched.
// PR 78 follow-up (678, 6 Nov): the copy-claims rule as a soft check — an owner's word with a number or a time claim
// ("this week", "today" …) the shop's own word does not have is marked `claim` (a warning to look at, never a refusal:
// it saves all the same); the list can show only those (`show=claims`).
import { labelOverridesSchema } from '@extas/settings';
import { keysOf, SHOP_DICTS, shopT, type LabelOverrides } from '../shop/dict';

export type WordLang = 'en' | 'bn';
export const WORD_LANGS: readonly WordLang[] = ['en', 'bn'];
/** Which words the list shows: all, the ones the owner changed, or the ones whose Bengali is still the English text. */
export const WORD_SHOWS = ['all', 'changed', 'untranslated', 'claims'] as const;
export type WordShow = (typeof WORD_SHOWS)[number];
/** The longest word the owner may set (the setting's own limit). */
export const WORD_MAX = 300;

const KEY_OK = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9_]+)*$/;
/** Every word the owner can change, in dictionary order. */
export const WORD_KEYS: readonly string[] = keysOf(SHOP_DICTS.en).filter((k) => KEY_OK.test(k));
const KNOWN = new Set(WORD_KEYS);
export const isWordKey = (k: unknown): k is string => typeof k === 'string' && KNOWN.has(k);
/** Where a word is used: the first part of its key (`checkout`, `pdp`, `account` …). */
export const groupOf = (key: string): string => key.split('.')[0]!;
/** Every place, in dictionary order. */
export const WORD_GROUPS: readonly string[] = [...new Set(WORD_KEYS.map(groupOf))];

const DICT = { en: shopT('en'), bn: shopT('bn') };
/** The shop's own word (its {slots} left as they are). */
export const defaultWord = (lang: WordLang, key: string): string => DICT[lang](key);
const slots = (s: string) => new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!));

export interface WordRow {
  key: string;
  group: string;
  byDefault: Record<WordLang, string>;
  /** The owner's own word, or '' for none. */
  own: Record<WordLang, string>;
  changed: boolean;
  untranslated: boolean;
  /** PR 78 follow-up (678): the owner's word has a number or a time claim the shop's word lacks (a warning only). */
  claim: boolean;
}

/** Bengali still in English: the Bengali the shop shows is the English text, and it has Latin letters outside {slots}. */
export function untranslated(en: string, bn: string): boolean {
  return en === bn && /[A-Za-z]/.test(en.replace(/\{\w+\}/g, ''));
}

/**
 * PR 78 follow-up (678) — the claims a shop word should not make for long: a number (a count, a price, a date, in
 * Latin or Bengali digits, outside {slots}) or a time word. Detection only: these patterns never show to anyone.
 */
const CLAIM_TIME_EN = /\b(this|next) (week|weekend|month)\b|\b(today|tonight|tomorrow|yesterday)\b|\blast (day|chance)\b|\bends? soon\b/i;
const CLAIM_TIME_BN = ['এই সপ্তাহ', 'এ সপ্তাহ', 'এই মাস', 'আজ', 'আগামীকাল', 'গতকাল', 'শেষ দিন', 'শেষ সুযোগ'];

/** The claims in one text: 'number' and/or 'time' (its {slots} are the shop's to fill, never a claim). */
export function claimsOf(text: string): Set<'number' | 'time'> {
  const bare = text.replace(/\{\w+\}/g, ' ');
  const out = new Set<'number' | 'time'>();
  if (/[0-9০-৯]/.test(bare)) out.add('number');
  if (CLAIM_TIME_EN.test(bare) || CLAIM_TIME_BN.some((w) => bare.includes(w))) out.add('time');
  return out;
}

/** Whether the owner's word makes a claim (a number, a time) the shop's own word does not make. */
export function ownClaim(own: string, shop: string): boolean {
  if (!own) return false;
  const was = claimsOf(shop);
  return [...claimsOf(own)].some((c) => !was.has(c));
}

export function wordRow(key: string, labels: LabelOverrides | null): WordRow {
  const byDefault = { en: defaultWord('en', key), bn: defaultWord('bn', key) };
  const own = { en: labels?.[key]?.en ?? '', bn: labels?.[key]?.bn ?? '' };
  const claim = ownClaim(own.en, byDefault.en) || ownClaim(own.bn, byDefault.bn);
  return { key, group: groupOf(key), byDefault, own, changed: !!(own.en || own.bn), untranslated: untranslated(own.en || byDefault.en, own.bn || byDefault.bn), claim };
}

export interface WordQuery {
  q?: string;
  group?: string;
  show?: WordShow;
  /** 1-based page. */
  p?: number;
}

export interface WordList {
  rows: WordRow[];
  total: number;
  p: number;
  pages: number;
  changed: number;
  untranslated: number;
  /** PR 78 follow-up (678): the owner's words with a number or a time claim to look at. */
  claims: number;
}

export function isWordShow(v: unknown): v is WordShow {
  return typeof v === 'string' && (WORD_SHOWS as readonly string[]).includes(v);
}

/** One page of the list: a search over the key and both languages (the shop's and the owner's), a place, a filter. */
export function wordList(labels: LabelOverrides | null, query: WordQuery, size: number): WordList {
  const all = WORD_KEYS.map((k) => wordRow(k, labels));
  const q = (query.q ?? '').trim().toLowerCase();
  const group = query.group && WORD_GROUPS.includes(query.group) ? query.group : '';
  const show: WordShow = query.show ?? 'all';
  const hit = all.filter(
    (r) =>
      (!group || r.group === group) &&
      (show === 'all' || (show === 'changed' ? r.changed : show === 'claims' ? r.claim : r.untranslated)) &&
      (!q || [r.key, r.byDefault.en, r.byDefault.bn, r.own.en, r.own.bn].some((s) => s.toLowerCase().includes(q))),
  );
  const pages = Math.max(1, Math.ceil(hit.length / size));
  const p = Math.min(Math.max(1, Math.trunc(query.p ?? 1) || 1), pages);
  return {
    rows: hit.slice((p - 1) * size, p * size),
    total: hit.length,
    p,
    pages,
    changed: all.filter((r) => r.changed).length,
    untranslated: all.filter((r) => r.untranslated).length,
    claims: all.filter((r) => r.claim).length,
  };
}

/** A change to one word: per language, a text (the owner's word), '' (back to the shop's word) or absent (as it is). */
export type WordPatch = Record<string, Partial<Record<WordLang, string>>>;

export interface Applied {
  next: LabelOverrides | null;
  /** The keys whose words changed. */
  changed: string[];
  /** `key` (unknown word) or `key.lang` (too long, or a {slot} the shop's word does not have). */
  bad: string[];
}

/** The saved words with a change applied (nothing written here). */
export function applyWords(before: LabelOverrides | null, patch: WordPatch): Applied {
  const next: LabelOverrides = { ...(before ?? {}) };
  const bad: string[] = [];
  const changed: string[] = [];
  for (const [key, raw] of Object.entries(patch)) {
    if (!isWordKey(key) || !raw || typeof raw !== 'object') {
      bad.push(key);
      continue;
    }
    const own: { en?: string; bn?: string } = { ...(before?.[key] ?? {}) };
    for (const lang of WORD_LANGS) {
      const v = (raw as Record<string, unknown>)[lang];
      if (v === undefined || v === null) continue;
      if (typeof v !== 'string' || v.length > WORD_MAX) {
        bad.push(`${key}.${lang}`);
        continue;
      }
      const text = v.trim();
      const shop = defaultWord(lang, key);
      if (!text || text === shop) {
        delete own[lang];
        continue;
      }
      const allowed = slots(shop);
      if ([...slots(text)].some((x) => !allowed.has(x))) {
        bad.push(`${key}.${lang}`);
        continue;
      }
      own[lang] = text;
    }
    const was = JSON.stringify(before?.[key] ?? {});
    if (own.en || own.bn) next[key] = { ...(own.en ? { en: own.en } : {}), ...(own.bn ? { bn: own.bn } : {}) };
    else delete next[key];
    if (JSON.stringify(next[key] ?? {}) !== was) changed.push(key);
  }
  const value = Object.keys(next).length ? next : null;
  if (!bad.length && value && !labelOverridesSchema.safeParse(value).success) bad.push('words');
  return { next: value, changed, bad };
}

// ---- CSV: one row per word; the import reads `key` and the owner's columns ----

export const WORD_CSV_HEADER = ['key', 'where', 'english_shop', 'bengali_shop', 'english', 'bengali'] as const;

/** The rows of the export: every word, the shop's and the owner's text in both languages. */
export function wordCsvRows(labels: LabelOverrides | null): string[][] {
  return WORD_KEYS.map((k) => {
    const r = wordRow(k, labels);
    return [k, r.group, r.byDefault.en, r.byDefault.bn, r.own.en, r.own.bn];
  });
}

/**
 * The change an imported file asks for: per row, the owner's English and Bengali. A column the file does not have is
 * left as it is; an empty cell gives the word back to the shop. `bad` lists the lines that name no known word.
 */
export function patchFromCsv(records: string[][], uncell: (s: string) => string): { patch: WordPatch; bad: number[]; missing: string[] } {
  const [head, ...rows] = records;
  const at = (name: string) => (head ?? []).findIndex((h) => h.trim().toLowerCase() === name);
  const iKey = at('key');
  const iEn = at('english');
  const iBn = at('bengali');
  const missing = [iKey < 0 ? 'key' : '', iEn < 0 && iBn < 0 ? 'english' : ''].filter(Boolean);
  const patch: WordPatch = {};
  const bad: number[] = [];
  if (missing.length) return { patch, bad, missing };
  rows.forEach((cells, i) => {
    if (cells.every((c) => !c.trim())) return;
    const key = (cells[iKey] ?? '').trim();
    if (!isWordKey(key) || key in patch) {
      bad.push(i + 2);
      return;
    }
    patch[key] = {
      ...(iEn >= 0 ? { en: uncell(cells[iEn] ?? '') } : {}),
      ...(iBn >= 0 ? { bn: uncell(cells[iBn] ?? '') } : {}),
    };
  });
  return { patch, bad, missing };
}
