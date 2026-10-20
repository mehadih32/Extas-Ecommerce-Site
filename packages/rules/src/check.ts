// PR 208, 209, 215 — is a rule complete and safe? Run on every save (the draft may be incomplete: it gets the list of
// what is missing) and again before it goes live (then every value its text and actions use must be set, every text
// token must name something, the short version must fit its line). The admin shows each issue as a line of text from
// its messages file; the codes here are stable.
//
// Pure module.
import { actionParamNeeds, KIND_SPECS, RUNTIME_TOKENS, TEXT_SLOTS, paramOf, type RuleContent, type TextSlot } from './model';
import { literalsIn, render, ruleLookup, tokensIn, unitOf, type TextContext, type WindowedParams } from './text';

export type IssueCode =
  /** An action names a param the rule does not have. */
  | 'UNKNOWN_PARAM'
  /** An action needs another type of param (e.g. a charge must be money). */
  | 'WRONG_PARAM_TYPE'
  /** Two params share a key. */
  | 'DUPLICATE_PARAM'
  /** The kind does not use this action or this text slot. */
  | 'ACTION_NOT_ALLOWED'
  | 'SLOT_NOT_ALLOWED'
  /** A text token names nothing. */
  | 'UNKNOWN_TOKEN'
  /** A value the text or an action needs is not set yet. */
  | 'MISSING_VALUE'
  /** The short version (with the values filled in) is longer than its line allows; or the full text is too long. */
  | 'TOO_LONG'
  /** The short version is not written. */
  | 'NO_TEXT'
  /** A percentage above the store's limit (rules.discount.maxPercentOff). */
  | 'PERCENT_TOO_HIGH'
  /** The window ends before it starts. */
  | 'BAD_WINDOW'
  /** A placement key that is not in the store's list (rules.placements). */
  | 'UNKNOWN_PLACEMENT'
  /** A number is written into the text by hand where the rule has a value for it (use the {token}). */
  | 'HAND_WRITTEN_NUMBER';

export interface Issue {
  code: IssueCode;
  /** Where: `params.freeOver`, `text.short.en`, `actions.0` … */
  at: string;
  /** The token, param key or value concerned. */
  subject?: string;
  /** Blocks going live (warnings never do). */
  blocking: boolean;
}

export interface CheckLimits {
  shortMaxChars: number;
  fullMaxChars: number;
  maxPercentOff: number;
  placements: readonly string[];
  /** Keys of the store's other rules → their params, for `{rule-key.param}` tokens. */
  others?: ReadonlyMap<string, WindowedParams>;
}

const LANGS = ['en', 'bn'] as const;

/** Every issue of a rule. `forLive` makes missing values and empty texts blocking. */
export function checkRule(rule: RuleContent, limits: CheckLimits, ctx: TextContext, forLive: boolean): Issue[] {
  const out: Issue[] = [];
  const add = (code: IssueCode, at: string, subject: string | undefined, blocking: boolean) => out.push({ code, at, subject, blocking });
  const spec = KIND_SPECS[rule.kind];

  const keys = new Set<string>();
  for (const p of rule.params) {
    if (keys.has(p.key)) add('DUPLICATE_PARAM', `params.${p.key}`, p.key, true);
    keys.add(p.key);
  }

  rule.actions.forEach((a, i) => {
    if (!spec.actions.includes(a.type)) add('ACTION_NOT_ALLOWED', `actions.${i}`, a.type, true);
    for (const need of actionParamNeeds(a)) {
      const p = paramOf(rule, need.param);
      if (!p) add('UNKNOWN_PARAM', `actions.${i}.${need.where}`, need.param, true);
      else if (p.type !== need.type) add('WRONG_PARAM_TYPE', `actions.${i}.${need.where}`, need.param, true);
      else if (p.value === null || p.value === undefined) add('MISSING_VALUE', `params.${p.key}`, p.key, forLive);
    }
    if (a.type === 'discount' && a.mode === 'percent') {
      const v = paramOf(rule, a.param)?.value;
      if (typeof v === 'number' && v > limits.maxPercentOff) add('PERCENT_TOO_HIGH', `params.${a.param}`, a.param, true);
    }
  });

  for (const slot of TEXT_SLOTS) {
    const t = rule.text[slot];
    if (!t) continue;
    if (!spec.slots.includes(slot)) add('SLOT_NOT_ALLOWED', `text.${slot}`, slot, true);
    const runtime = Object.fromEntries(Object.entries(RUNTIME_TOKENS[slot as TextSlot] ?? {}).map(([k, type]) => [k, { type, value: 0 }]));
    for (const lang of LANGS) {
      const s = t[lang];
      if (!s) continue;
      const r = render(s, ruleLookup(rule, { others: limits.others, runtime }), ctx);
      for (const u of r.unknown) add('UNKNOWN_TOKEN', `text.${slot}.${lang}`, u, true);
      for (const m of r.missing) add('MISSING_VALUE', `text.${slot}.${lang}`, m, forLive);
      for (const lit of literalsIn(s, ctx.currency)) {
        if (rule.params.some((p) => unitOf(p.type) === lit.unit && p.value === lit.value)) add('HAND_WRITTEN_NUMBER', `text.${slot}.${lang}`, lit.raw, false);
      }
      if (!r.missing.length && !r.unknown.length) {
        const max = slot === 'full' ? limits.fullMaxChars : limits.shortMaxChars;
        if ([...r.text].length > max) add('TOO_LONG', `text.${slot}.${lang}`, String([...r.text].length), slot === 'short');
      }
    }
  }
  if (!rule.text.short?.en?.trim()) add('NO_TEXT', 'text.short.en', undefined, forLive);

  if (rule.startsAt && rule.endsAt && Date.parse(rule.endsAt) <= Date.parse(rule.startsAt)) add('BAD_WINDOW', 'endsAt', undefined, true);
  for (const pl of rule.placements) if (!limits.placements.includes(pl)) add('UNKNOWN_PLACEMENT', 'placements', pl, true);
  return dedupe(out);
}

function dedupe(list: Issue[]): Issue[] {
  const seen = new Set<string>();
  return list.filter((i) => {
    const k = `${i.code}|${i.at}|${i.subject ?? ''}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export const blocking = (issues: Issue[]) => issues.filter((i) => i.blocking);

/** Tokens a text uses, for the editor's "{x} is replaced by …" lines. */
export function textTokens(rule: Pick<RuleContent, 'text'>): string[] {
  const out: string[] = [];
  for (const slot of TEXT_SLOTS) for (const lang of LANGS) for (const t of tokensIn(rule.text[slot]?.[lang] ?? '')) if (!out.includes(t.raw)) out.push(t.raw);
  return out;
}
