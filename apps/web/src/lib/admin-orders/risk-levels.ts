// S06 · PR 161 — the Levels screen of Orders › Risk rules (ORD-06 "Levels"; demo V12.3 #/admin/orders/risk-rules), as
// plain data and pure functions the page and its browser part share: the words in the admin's language, the draft with a
// level for every band the owner has (an older value's band that no longer exists is left out, so a save is never
// refused for it), "Use the suggested set" and "Reset to default" as drafts (nothing is saved until Save), and the check
// a partial ask needs (its percent). No React, no database; types only from the order service.
import type { RiskLevelsView } from '@extas/orders';
import type { RiskLevelActions, RiskLevelAsk, RiskLevels } from '@extas/settings';
import type { AdminView } from '../admin-page';
import { t } from '../i18n';

/** The asks in the order the select lists them. */
export const LEVEL_ASKS: readonly RiskLevelAsk[] = ['none', 'delivery', 'partial', 'full', 'codOff'];

/** A band that does nothing (the same as the settings' NO_RISK_ACTIONS; kept here so the browser never loads the registry). */
export const NOTHING: RiskLevelActions = { watch: false, hold: false, call: false, ask: 'none' };

export interface LevelBand {
  key: string;
  name: string;
  from: string;
  tone: 'ok' | 'warn' | 'bad';
}

export interface LevelsTexts {
  levelsH: string;
  levelsD: string;
  master: string;
  masterHelp: string;
  offNote: string;
  watch: string;
  watchHelp: string;
  hold: string;
  holdHelp: string;
  call: string;
  callHelp: string;
  ask: string;
  askOpt: Record<RiskLevelAsk, string>;
  partial: string;
  partialPh: string;
  partialHelp: string;
  reason: string;
  reasonHelp: string;
  suggest: string;
  suggestHelp: string;
  reset: string;
  save: string;
  saving: string;
  saved: string;
  unsaved: string;
  discard: string;
  readOnly: string;
  noBands: string;
  never: string;
  err: Record<string, string>;
}

/** The screen's data as the browser gets it. */
export interface LevelsScreen {
  value: RiskLevels;
  bands: LevelBand[];
  reasons: { key: string; name: string }[];
  suggested: Record<string, RiskLevelActions>;
  byDefault: RiskLevels;
  version: string;
}

const ERRORS = ['STALE', 'INVALID_INPUT', 'PARTIAL_UNSET', 'REASON_REQUIRED', 'FORBIDDEN', 'UNAUTHENTICATED', 'network', 'other'] as const;

export function levelsTexts(view: AdminView): LevelsTexts {
  const d = view.dict;
  const k = (x: string) => t(d, `orders.rr.${x}`);
  return {
    levelsH: k('levelsH'),
    levelsD: k('levelsD'),
    master: k('master'),
    masterHelp: k('masterHelp'),
    offNote: k('offNote'),
    watch: k('watch'),
    watchHelp: k('watchHelp'),
    hold: k('hold'),
    holdHelp: k('holdHelp'),
    call: k('call'),
    callHelp: k('callHelp'),
    ask: k('ask'),
    askOpt: Object.fromEntries(LEVEL_ASKS.map((a) => [a, k(`askOpt.${a}`)])) as Record<RiskLevelAsk, string>,
    partial: k('partial'),
    partialPh: k('partialPh'),
    partialHelp: k('partialHelp'),
    reason: k('reason'),
    reasonHelp: k('reasonHelp'),
    suggest: k('suggest'),
    suggestHelp: k('suggestHelp'),
    reset: k('reset'),
    save: k('save'),
    saving: k('saving'),
    saved: k('saved'),
    unsaved: k('unsaved'),
    discard: k('discard'),
    readOnly: k('readOnly'),
    noBands: k('noBands'),
    never: k('never'),
    err: Object.fromEntries(ERRORS.map((e) => [e, k(`err.${e}`)])),
  };
}

/** A value with a level for every band the owner has, and none for a band he no longer has. */
export function forBands(v: RiskLevels, bands: readonly { key: string }[]): RiskLevels {
  return { ...v, levels: Object.fromEntries(bands.map((b) => [b.key, { ...(v.levels[b.key] ?? NOTHING) }])) };
}

/** The screen's data from the order service's view, in the admin's language. */
export function levelsScreen(view: AdminView, v: RiskLevelsView): LevelsScreen {
  const bn = view.lang === 'bn';
  return {
    value: forBands(v.value, v.bands),
    bands: v.bands.map((b) => ({ key: b.key, name: bn ? b.bn : b.en, from: t(view.dict, 'orders.rr.from', { n: b.minScore }), tone: b.tone })),
    reasons: v.holdReasons.map((r) => ({ key: r.key, name: bn ? r.bn : r.en })),
    suggested: v.suggested,
    byDefault: v.byDefault,
    version: v.version,
  };
}

/** "Use the suggested set": every band's steps from the suggestion; the switch, the percent and the reason stay. */
export function withSuggested(draft: RiskLevels, suggested: Record<string, RiskLevelActions>): RiskLevels {
  return { ...draft, levels: Object.fromEntries(Object.keys(draft.levels).map((k) => [k, { ...(suggested[k] ?? NOTHING) }])) };
}

/** "Reset to default": what a new shop ships with (everything off), for the bands the owner has. */
export function asDefault(byDefault: RiskLevels, bands: readonly { key: string }[]): RiskLevels {
  return forBands(byDefault, bands);
}

/** The refusal a draft would meet before it is sent: a partial ask without its percent. */
export function draftProblem(draft: RiskLevels): 'PARTIAL_UNSET' | null {
  return draft.partialPercent === null && Object.values(draft.levels).some((l) => l.ask === 'partial') ? 'PARTIAL_UNSET' : null;
}

/** The percent field's text as a value: empty is "not set", anything else a whole number (the server checks 1–99). */
export function percentOf(text: string): number | null {
  const s = text.trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : Number.NaN;
}

export const sameLevels = (a: RiskLevels, b: RiskLevels): boolean => JSON.stringify(a) === JSON.stringify(b);
