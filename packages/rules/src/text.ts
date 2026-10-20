// PR 215 — rule text everywhere reads from the rule, never from a hard-coded string. A customer text names its numbers
// as tokens: `{windowHours}` is the rule's own value, `{exchange.windowHours}` is another rule's (so a notice, the FAQ
// rule or the footer can quote the exchange window without writing "72" a second time), and a slot may have its own
// runtime tokens (`{remaining}` in the free-delivery progress line). Values are written in the customer's language
// with the store's currency and time zone: money as currency, hours and counts as numbers, dates in the store's zone.
//
// A token without a value is never shown to a customer: the public layer drops a text that is missing a value, and the
// admin refuses to switch such a rule on (check.ts). `literalsIn` finds numbers written into a text by hand (the stale
// "7 days" of the demo's conflict banner, PR 217).
//
// Pure module.
import type { Localized, ParamType, Rule, RuleText, TextSlot } from './model';

export interface TextContext {
  /** BCP 47, e.g. bn-BD. The language part picks the text (bn → Bengali when written, else English). */
  locale: string;
  /** ISO 4217, e.g. BDT. */
  currency: string;
  /** IANA zone for dates. */
  timeZone: string;
}

export type Lang = 'en' | 'bn';

export const langOf = (locale: string): Lang => (locale.toLowerCase().startsWith('bn') ? 'bn' : 'en');

/** The text in the customer's language; English when the Bengali is not written. */
export function pick(t: Localized | undefined, lang: Lang): { text: string; lang: Lang } | null {
  if (!t) return null;
  if (lang === 'bn' && t.bn && t.bn.trim()) return { text: t.bn, lang: 'bn' };
  return t.en && t.en.trim() ? { text: t.en, lang: 'en' } : null;
}

export interface TokenRef {
  /** As written, with the braces. */
  raw: string;
  /** Another rule's key, for `{rule-key.param}`; null = this rule (or a runtime token). */
  rule: string | null;
  key: string;
}

const TOKEN = /\{(?:([a-z0-9]+(?:-[a-z0-9]+)*)\.)?([a-zA-Z][a-zA-Z0-9]*)\}/g;

export function tokensIn(s: string): TokenRef[] {
  return [...s.matchAll(TOKEN)].map((m) => ({ raw: m[0], rule: m[1] ?? null, key: m[2]! }));
}

/** How many minor units one major unit of the currency has (100 for BDT). */
export function minorPerMajor(currency: string): number {
  try {
    return 10 ** new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits!;
  } catch {
    return 1;
  }
}

/** A value written for a customer. Unknown or empty → null. */
export function formatValue(type: ParamType, value: unknown, ctx: TextContext): string | null {
  if (value === null || value === undefined) return null;
  const lang = langOf(ctx.locale);
  switch (type) {
    case 'money': {
      if (typeof value !== 'number') return null;
      const major = value / minorPerMajor(ctx.currency);
      const whole = Number.isInteger(major);
      return new Intl.NumberFormat(ctx.locale, { style: 'currency', currency: ctx.currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(major);
    }
    case 'percent':
      return typeof value === 'number' ? new Intl.NumberFormat(ctx.locale, { style: 'percent', maximumFractionDigits: 2 }).format(value / 100) : null;
    case 'int':
    case 'hours':
      return typeof value === 'number' ? new Intl.NumberFormat(ctx.locale, { maximumFractionDigits: 0 }).format(value) : null;
    case 'datetime': {
      if (typeof value !== 'string') return null;
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return null;
      return new Intl.DateTimeFormat(ctx.locale, { timeZone: ctx.timeZone, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(d);
    }
    case 'bool':
      return null;
    case 'text': {
      const p = pick(value as Localized, lang);
      return p ? p.text : null;
    }
  }
}

export interface Resolved {
  type: ParamType;
  value: unknown;
}

/** Looks a token up: this rule's param, another rule's, or a runtime value. undefined = unknown token. */
export type Lookup = (ref: TokenRef) => Resolved | undefined;

export interface Rendered {
  text: string;
  /** Tokens that name a value which is not set yet. */
  missing: string[];
  /** Tokens that name nothing. */
  unknown: string[];
}

/** Fills the tokens of one template. Tokens that cannot be filled stay as written and are listed. */
export function render(template: string, lookup: Lookup, ctx: TextContext): Rendered {
  const missing: string[] = [];
  const unknown: string[] = [];
  const text = template.replace(TOKEN, (raw, rule: string | undefined, key: string) => {
    const r = lookup({ raw, rule: rule ?? null, key });
    if (!r) {
      unknown.push(raw);
      return raw;
    }
    const v = formatValue(r.type, r.value, ctx);
    if (v === null) {
      missing.push(raw);
      return raw;
    }
    return v;
  });
  return { text, missing, unknown };
}

export interface RuleTextOptions {
  /** Other rules by key, for `{rule-key.param}` tokens. */
  others?: ReadonlyMap<string, WindowedParams>;
  /** Runtime tokens of this moment (e.g. `remaining`). */
  runtime?: Record<string, Resolved>;
}

/** What a token can read from a rule: its values and its active window. */
export type WindowedParams = Pick<Rule, 'params'> & Partial<Pick<Rule, 'startsAt' | 'endsAt'>>;

/**
 * Built-in tokens every rule has: its own start and end (`{endsAt}` in "20% off until {endsAt}"). A param of the same
 * name wins. An open window gives a value that is not set, so a text quoting it cannot go live.
 */
export const WINDOW_TOKENS = ['startsAt', 'endsAt'] as const;

function windowValue(rule: WindowedParams, key: string): Resolved | undefined {
  if (!(WINDOW_TOKENS as readonly string[]).includes(key)) return undefined;
  return { type: 'datetime', value: (rule as Record<string, unknown>)[key] ?? null };
}

/** A lookup over one rule's params, the other rules' and the runtime values. */
export function ruleLookup(rule: WindowedParams, opts: RuleTextOptions = {}): Lookup {
  return (ref) => {
    if (ref.rule) {
      const other = opts.others?.get(ref.rule);
      if (!other) return undefined;
      const p = other.params.find((x) => x.key === ref.key);
      return p ? { type: p.type, value: p.value } : windowValue(other, ref.key);
    }
    const rt = opts.runtime?.[ref.key];
    if (rt) return rt;
    const p = rule.params.find((x) => x.key === ref.key);
    return p ? { type: p.type, value: p.value } : windowValue(rule, ref.key);
  };
}

export interface RuleTextResult extends Rendered {
  lang: Lang;
  /** Ready for a customer: something written, every token filled. */
  ok: boolean;
}

/** One slot of a rule in the customer's language. null = the slot is not written. */
export function ruleText(rule: WindowedParams & Pick<Rule, 'text'>, slot: TextSlot, ctx: TextContext, opts: RuleTextOptions = {}): RuleTextResult | null {
  const t = pick((rule.text as RuleText)[slot], langOf(ctx.locale));
  if (!t) return null;
  const r = render(t.text, ruleLookup(rule, opts), ctx);
  return { ...r, lang: t.lang, ok: r.missing.length === 0 && r.unknown.length === 0 && r.text.trim().length > 0 };
}

// ---------------------------------------------------------------------------------------------------------------
// Numbers written by hand (PR 215 lint, PR 217 TEXT_DRIFT)
// ---------------------------------------------------------------------------------------------------------------

export type LiteralUnit = 'hours' | 'money';

export interface Literal {
  raw: string;
  unit: LiteralUnit;
  /** Hours for a duration (days × 24); minor units for money. */
  value: number;
  index: number;
}

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
const toAscii = (s: string) => s.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d))).replace(/[,\s]/g, '');
const NUM = '([0-9০-৯][0-9০-৯,]*(?:\\.[0-9০-৯]+)?)';
const PATTERNS: { re: RegExp; unit: LiteralUnit; factor: number; money?: boolean }[] = [
  { re: new RegExp(`${NUM}\\s*(?:hours?|hrs?|ঘণ্টা|ঘন্টা)`, 'giu'), unit: 'hours', factor: 1 },
  { re: new RegExp(`${NUM}\\s*(?:days?|দিন)`, 'giu'), unit: 'hours', factor: 24 },
  { re: new RegExp(`(?:৳|Tk\\.?|BDT)\\s*${NUM}`, 'giu'), unit: 'money', factor: 1, money: true },
  { re: new RegExp(`${NUM}\\s*(?:৳|taka|টাকা)`, 'giu'), unit: 'money', factor: 1, money: true },
];

/** Durations and amounts written as plain numbers in a text (tokens are skipped: they are not literals). */
export function literalsIn(text: string, currency: string): Literal[] {
  const out: Literal[] = [];
  const seen = new Set<number>();
  const perMajor = minorPerMajor(currency);
  for (const p of PATTERNS) {
    p.re.lastIndex = 0;
    for (const m of text.matchAll(p.re)) {
      if (seen.has(m.index!)) continue;
      const n = Number(toAscii(m[1]!));
      if (!Number.isFinite(n)) continue;
      seen.add(m.index!);
      out.push({ raw: m[0], unit: p.unit, value: Math.round(n * (p.money ? perMajor : p.factor)), index: m.index! });
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

/** The unit family of a param type, for comparing with literals. */
export const unitOf = (t: ParamType): LiteralUnit | null => (t === 'hours' ? 'hours' : t === 'money' ? 'money' : null);
