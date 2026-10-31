// S06 · PR 163 — the Repeat refusers card's draft rules, client-safe (the browser card loads this file, never the order
// service): the terms the owner can choose, in the order the card offers them, whether two values are the same, and the
// number of refusals read from its box (empty means "not set"). The API checks every value again.
import type { RefuserTerms, RiskRefusers } from '@extas/settings';

/** The terms, in the order the card offers them (here so the client card does not load the settings registry). */
export const REFUSER_TERM_CHOICES: readonly RefuserTerms[] = ['none', 'delivery', 'full', 'codOff'];

export const sameRefusers = (a: RiskRefusers, b: RiskRefusers): boolean => a.enabled === b.enabled && a.minRefused === b.minRefused;

/** The box's text as the setting's number: empty is "not set" (null); anything but a whole number from 1 is refused. */
export function minRefusedOf(text: string): { ok: true; value: number | null } | { ok: false } {
  const s = text.trim();
  if (!s) return { ok: true, value: null };
  if (!/^\d+$/.test(s)) return { ok: false };
  const n = Number(s);
  return n >= 1 ? { ok: true, value: n } : { ok: false };
}
