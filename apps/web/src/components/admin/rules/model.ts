// S10 · PR 209, 215–219 — the Smart Rules screens' pure part (no React, no database), shared by the server pages and
// the browser components and tested on its own (model.test.ts):
// - values: money typed in whole units (৳) and kept in minor units; dates typed in the store's time zone;
// - the live "Customers see:" line, its length and the {token} lines, from @extas/rules/pure (the same code the
//   storefront uses, so the preview is never a guess);
// - issues and history changes as text from the messages file (codes in, words out);
// - a rule key from a title.
import { checkRule, formatValue, minorPerMajor, ruleText, RUNTIME_TOKENS, textTokens, tokensIn, ruleLookup, type CheckLimits, type Issue, type Param, type RuleContent, type TextContext, type WindowedParams } from '@extas/rules/pure';
import type { Change } from '@extas/rules/pure';
import { t, type Dict } from '@/lib/i18n';

export type Lang = 'bn' | 'en';

export interface ScopeOption {
  type: 'all' | 'category' | 'collection' | 'product';
  id: string | null;
  nameEn: string;
  nameBn: string | null;
}

export interface PlaceOption {
  key: string;
  en: string;
  bn: string;
}

/** What the browser needs to fill texts and check a rule exactly like the server. */
export interface RulesEnv {
  ctx: TextContext;
  limits: CheckLimits;
  /** The store's other rules by key (their live values and window), for `{rule-key.param}` tokens. */
  others: Record<string, WindowedParams>;
}

export const othersMap = (env: RulesEnv, self?: RuleContent): Map<string, WindowedParams> => {
  const m = new Map(Object.entries(env.others));
  if (self) m.set(self.key, self);
  return m;
};

export const langCtx = (ctx: TextContext, lang: Lang): TextContext => {
  const region = ctx.locale.split('-')[1];
  return { ...ctx, locale: region ? `${lang}-${region}` : lang };
};

// ------------------------------------------------------------------------------------------------ values

/** A money value (minor units) as the number typed in (whole units). */
export function moneyToInput(minor: unknown, currency: string): string {
  if (typeof minor !== 'number') return '';
  return String(minor / minorPerMajor(currency));
}

/** The typed money back in minor units; null when empty; NaN when not a number. */
export function moneyFromInput(s: string, currency: string): number | null {
  const v = s.trim().replace(/,/g, '');
  if (v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * minorPerMajor(currency)) : NaN;
}

export function numberFromInput(s: string): number | null {
  const v = s.trim();
  if (v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/** The time zone's offset at a moment, in minutes (Asia/Dhaka → 360). */
export function zoneOffset(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(at);
  const get = (k: string) => Number(parts.find((p) => p.type === k)?.value ?? '0');
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** An ISO time as a datetime-local value in the store's zone ("2026-12-20T18:00"). */
export function isoToLocalInput(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const local = new Date(d.getTime() + zoneOffset(d, timeZone) * 60_000);
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
}

/** A datetime-local value in the store's zone back to an ISO time with its offset; null when empty. */
export function localInputToIso(v: string, timeZone: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const guess = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!);
  const off = zoneOffset(new Date(guess), timeZone);
  const sign = off >= 0 ? '+' : '-';
  const a = Math.abs(off);
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

/** A param's value as it reads in a sentence ("৳80", "72", "20%"), or null when not set. */
export const shownValue = (p: Param, ctx: TextContext) => formatValue(p.type, p.value, ctx);

// ------------------------------------------------------------------------------------------------ live text

export interface LiveText {
  text: string;
  /** Characters a customer reads (with the values filled in). */
  length: number;
  ok: boolean;
  missing: string[];
  unknown: string[];
}

/** One slot as customers would read it in a language (null = not written). */
export function liveText(rule: RuleContent, slot: keyof RuleContent['text'], lang: Lang, env: RulesEnv): LiveText | null {
  const r = ruleText(rule, slot, langCtx(env.ctx, lang), { others: othersMap(env, rule) });
  if (!r) return null;
  return { text: r.text, length: [...r.text].length, ok: r.ok, missing: r.missing, unknown: r.unknown };
}

export interface TokenLine {
  token: string;
  /** The param's label, or null when the token is not one of this rule's values. */
  label: string | null;
  /** What it reads as now, or null when not set. */
  value: string | null;
  kind: 'param' | 'other' | 'window' | 'runtime' | 'unknown';
}

const isRuntime = (key: string) => Object.values(RUNTIME_TOKENS).some((m) => !!m && key in m);

/** The editor's "{x} is replaced by …" lines. */
export function tokenLines(rule: RuleContent, lang: Lang, env: RulesEnv): TokenLine[] {
  const lookup = ruleLookup(rule, { others: othersMap(env, rule) });
  const ctx = langCtx(env.ctx, lang);
  return textTokens(rule).map((raw) => {
    const ref = tokensIn(raw)[0]!;
    const p = ref.rule ? undefined : rule.params.find((x) => x.key === ref.key);
    const r = lookup(ref);
    const value = r ? formatValue(r.type, r.value, ctx) : null;
    const label = p ? (lang === 'bn' && p.labelBn ? p.labelBn : p.labelEn) : null;
    const kind = !r ? (!ref.rule && isRuntime(ref.key) ? 'runtime' : 'unknown') : p ? 'param' : ref.rule ? 'other' : 'window';
    return { token: raw, label, value, kind };
  });
}

/** Every issue of the candidate, as the server would find it. */
export const issuesOf = (rule: RuleContent, env: RulesEnv) => checkRule(rule, { ...env.limits, others: othersMap(env, rule) }, env.ctx, rule.status === 'ACTIVE');

/** An issue as a line of text. */
export function issueText(d: Dict, i: Issue): string {
  const key = `rules.issues.${i.code}`;
  const s = t(d, key, { subject: i.subject ?? '', at: i.at });
  return s === key ? i.code : s;
}

// ------------------------------------------------------------------------------------------------ history

/** A change of the history as "Field: before → after". */
/** Each param's label in the admin's language (key → label), so a change reads "Exchange window: 72 → 48". */
export function paramLabels(params: readonly Param[], lang: Lang): Map<string, string> {
  return new Map(params.map((q) => [q.key, (lang === 'bn' && q.labelBn) || q.labelEn || q.key]));
}

export function changeText(d: Dict, c: Change, ctx: TextContext, labels?: ReadonlyMap<string, string>): string {
  const show = (v: unknown): string => {
    if (v === null || v === undefined || v === '') return t(d, 'rules.history.empty');
    if (c.paramType) {
      const f = formatValue(c.paramType, v, ctx);
      if (f !== null) return f;
      if (c.paramType === 'bool') return t(d, v ? 'rules.history.yes' : 'rules.history.no');
    }
    if (typeof v === 'string') return v.length > 80 ? `${v.slice(0, 77)}…` : v;
    if (Array.isArray(v)) return v.length ? v.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(', ') : t(d, 'rules.history.empty');
    return t(d, 'rules.history.changed');
  };
  const fieldKey = `rules.history.fields.${c.field}`;
  const field = t(d, fieldKey, { path: c.path.replace(/^params\./, '') });
  const own = c.field === 'param' ? labels?.get(c.path.replace(/^params\./, '')) : undefined;
  const label = own ?? (field === fieldKey ? c.path : field);
  if (c.field === 'conditions' || c.field === 'actions' || c.field === 'scope') return `${label}: ${t(d, 'rules.history.changed')}`;
  return `${label}: ${show(c.before)} → ${show(c.after)}`;
}

// ------------------------------------------------------------------------------------------------ keys

/** A rule key from a title: lower-case words joined by - (latin letters and digits only), or the fallback. */
export function keyFromTitle(title: string, fallback: string): string {
  const k = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/g, '');
  return k || fallback;
}

/** Is the candidate different from what was loaded? (for "Unsaved changes") */
export const sameContent = (a: RuleContent | null, b: RuleContent | null) => JSON.stringify(a) === JSON.stringify(b);

/** The status the "Draft" button sets: a rule that was live is paused, a new one stays a draft. */
export const offStatus = (live: RuleContent | null): RuleContent['status'] => (live && (live.status === 'ACTIVE' || live.status === 'PAUSED' || live.status === 'ENDED') ? 'PAUSED' : 'DRAFT');

// ------------------------------------------------------------------------------------------------ words

/** A refusal of the rules API as text: `rules.errors.<code>` first, then the admin's shared `errors.<code>`. */
export function rulesRefusal(d: Dict, code: string | undefined, details: string[] = []): string {
  const fields = details.join(', ');
  const key = `rules.errors.${code ?? ''}`;
  const own = t(d, key, { fields });
  if (own !== key) return own;
  const shared = `errors.${code ?? 'server-error'}`;
  const s = t(d, shared, { fields });
  return s === shared ? t(d, 'errors.server-error') : s;
}

/** A rule's or a notice's name in the admin's language (English when the Bengali is not written). */
export const nameIn = (x: { nameEn: string | null; nameBn?: string | null }, lang: Lang): string => (lang === 'bn' && x.nameBn ? x.nameBn : (x.nameEn ?? ''));

/** A moment as the admin reads it ("20 Oct 2026, 14:05"), in the store's time zone. */
export function when(iso: string | null | undefined, locale: string, timeZone: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(d);
}

/** Money in minor units as the admin reads it (৳1,500); with `signed`, a + or − in front. */
export function money(minor: number, env: RulesEnv, lang: Lang, signed = false): string {
  const s = formatValue('money', Math.abs(minor), langCtx(env.ctx, lang)) ?? String(Math.abs(minor));
  if (minor < 0) return `−${s}`;
  return signed && minor > 0 ? `+${s}` : s;
}

export const targetKey = (x: { type: string; id?: string | null }) => (x.type === 'all' ? 'all' : `${x.type}:${x.id ?? ''}`);

/** A scope target's name: from the store's categories and collections, a product's name, or "Everything". */
export function targetName(x: { type: string; id?: string | null }, options: readonly ScopeOption[], products: Record<string, { nameEn: string; nameBn: string | null }>, d: Dict, lang: Lang): string {
  if (x.type === 'all') return t(d, 'rules.scope.all');
  const o = options.find((s) => s.type === x.type && s.id === x.id);
  if (o) return nameIn(o, lang);
  const p = x.type === 'product' && x.id ? products[x.id] : undefined;
  return p ? nameIn(p, lang) : t(d, 'rules.scope.product');
}

export interface ConflictLike {
  kind: string;
  otherType: string;
  ruleA: { id: string; nameEn: string; nameBn: string | null } | null;
  ruleB: { id: string; nameEn: string; nameBn: string | null } | null;
  winnerRuleId: string | null;
  detail: Record<string, unknown>;
}

const plain = (v: unknown) => (typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? ''));

/**
 * A clash as one sentence (the demo's "FAQ text still says 7 days; your Exchange rule says 72 hours."). `notices` names
 * the store's notices by id, for a text that lives in a notice.
 */
export function conflictText(d: Dict, c: ConflictLike & { otherId?: string | null }, lang: Lang, env: RulesEnv, notices: Record<string, string> = {}): string {
  const a = c.ruleA ? nameIn(c.ruleA, lang) : '';
  const b = c.ruleB ? nameIn(c.ruleB, lang) : '';
  const winner = c.winnerRuleId && c.winnerRuleId === c.ruleB?.id ? b : a;
  const det = c.detail;
  let value = plain(det.ruleValue);
  if (typeof det.ruleValue === 'number') {
    const type = det.unit === 'money' ? 'money' : 'int';
    value = formatValue(type, det.ruleValue, langCtx(env.ctx, lang)) ?? value;
    if (det.unit === 'hours') value = `${value} ${t(d, 'rules.editor.inHours')}`;
  }
  let where = t(d, 'rules.conflicts.aText');
  const notice = c.otherType === 'notice' && c.otherId ? notices[c.otherId] : undefined;
  if (notice) where = t(d, 'rules.conflicts.notice', { name: notice });
  else if (c.otherType === 'rule' && c.ruleB && c.ruleB.id !== c.ruleA?.id) where = `“${b}”`;
  const key = `rules.conflicts.kinds.${c.kind}`;
  const s = t(d, key, {
    a,
    b,
    winner,
    slot: plain(det.slot),
    where,
    literal: `“${plain(det.literal)}”`,
    value,
    setting: plain(det.setting),
    settingValue: plain(det.settingValue),
    ruleValue: plain(det.ruleValue),
  });
  return s === key ? c.kind : s;
}

/** Open clashes per rule id (both sides counted once). */
export function clashCounts(list: readonly ConflictLike[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of list) for (const id of new Set([c.ruleA?.id, c.ruleB?.id].filter((x): x is string => !!x))) m.set(id, (m.get(id) ?? 0) + 1);
  return m;
}

/** The candidate with one param's value replaced. */
export const withParam = (r: RuleContent, key: string, value: unknown): RuleContent => ({ ...r, params: r.params.map((p) => (p.key === key ? { ...p, value } : p)) });

type Slot = keyof RuleContent['text'];

/** The candidate with one text slot's language replaced (an empty extra slot is dropped; short and full stay). */
export function withText(r: RuleContent, slot: Slot, lang: Lang, value: string): RuleContent {
  const cur = r.text[slot] ?? { en: '' };
  const next: { en: string; bn?: string } = lang === 'en' ? { ...cur, en: value } : { ...cur, bn: value };
  if (lang === 'bn' && !value) delete next.bn;
  const text = { ...r.text, [slot]: next };
  if (slot !== 'short' && slot !== 'full' && !next.en && !next.bn) delete text[slot];
  return { ...r, text };
}
