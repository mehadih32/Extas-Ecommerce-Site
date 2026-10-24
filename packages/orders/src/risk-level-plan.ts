// S06 · PR 161 — what follows at an order's risk level, as one pure function (no database, no clock): the band the
// score put the order in and the owner's `risk.levels` in, the steps out — a watch mark, a hold, a confirmation call,
// and what the customer would be asked to pay first. The same band and settings always give the same steps, so the
// order's timeline line says exactly why.
//
// The ask is only ever a proposal (a person presses "Request advance", PR 542); nothing here blocks anyone or changes a
// COD rule, a price or a charge (CLAUDE.md rule 6). Types only from the settings: this file is in the client-safe pure
// entry (the browser never loads the settings registry).
import type { RiskLevelActions, RiskLevelAsk, RiskLevels } from '@extas/settings';

export type { RiskLevelActions, RiskLevelAsk };

/** The steps one band asks for. */
export interface LevelPlan extends RiskLevelActions {
  band: string;
}

/** True when a band's steps do nothing at all. */
export const isEmptyLevel = (a: RiskLevelActions): boolean => !a.watch && !a.hold && !a.call && a.ask === 'none';

/**
 * The steps for a band: null while the owner's master switch is off, for an order not scored (no band), or for a band
 * that does nothing. A partial ask without its percent is no ask (the setting refuses it, an older value may not).
 */
export function levelPlanOf(band: string | null, cfg: Pick<RiskLevels, 'enabled' | 'levels' | 'partialPercent'>): LevelPlan | null {
  if (!cfg.enabled || !band) return null;
  const a = cfg.levels[band];
  if (!a) return null;
  const ask: RiskLevelAsk = a.ask === 'partial' && cfg.partialPercent === null ? 'none' : a.ask;
  const plan = { band, watch: a.watch, hold: a.hold, call: a.call, ask };
  return isEmptyLevel(plan) ? null : plan;
}
