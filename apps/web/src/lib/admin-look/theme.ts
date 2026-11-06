// PR 625 (CN-036) — the admin's theme: which look, light or dark, full or reduced motion, and the accent colour, as
// the attributes and the one style value the theme layer (app/admin/theme/lumen.css) reads on the shell's root and on
// <html>. The team chooses the look, the accent and "Reduce motion" for everyone (setting `admin.theme`); each person
// chooses light or dark (the moon button) and may reduce motion for themselves (StaffUser.adminPrefs.theme); the
// system's prefers-reduced-motion is always followed by the stylesheet. No React, no database, no settings package here:
// the layout, the API, the shell and the tests share it (the
// stored prefs are checked in pick.ts, so the shell's bundle carries no schema library).
export type ThemeMode = 'light' | 'dark';
export type ThemeMotion = 'full' | 'reduce';

/** One person's own theme choices (any part may be missing: then the team's or the default applies). */
export interface ThemePrefs {
  look?: string;
  mode?: ThemeMode;
  motion?: ThemeMotion;
}

/** The team's theme (setting `admin.theme`). */
export interface ThemeTeam {
  look: string;
  accent: string;
  reduceMotion: boolean;
}

/** What the admin is drawn in for this person. */
export interface AdminTheme {
  look: string;
  mode: ThemeMode;
  motion: ThemeMotion;
  accent: string;
}

/** The look shipped and drawn when nothing else is readable. */
export const DEFAULT_LOOK = 'lumen';
const HEX = /^#[0-9A-Fa-f]{6}$/;

/** Lumen, light, full motion, the stylesheet's own accent: what a page is drawn in when nothing is known. */
export const DEFAULT_THEME: AdminTheme = { look: DEFAULT_LOOK, mode: 'light', motion: 'full', accent: '' };

/** Prefs with the empty parts dropped (undefined when nothing is left). */
export function cleanTheme(t: ThemePrefs | undefined | null): ThemePrefs | undefined {
  if (!t) return undefined;
  const out: ThemePrefs = {};
  if (t.look) out.look = t.look;
  if (t.mode) out.mode = t.mode;
  if (t.motion) out.motion = t.motion;
  return Object.keys(out).length ? out : undefined;
}

/**
 * The theme for one person: their look when it is built, else the team's (else Lumen); their light or dark (light by
 * default); motion reduced when they or the team chose it; the team's accent when it is a #RRGGBB colour (else none:
 * the stylesheet's own default accent applies).
 */
export function themeOf(team: ThemeTeam | null | undefined, prefs: ThemePrefs | undefined, built: readonly string[]): AdminTheme {
  const pick = (l: string | undefined) => (l && built.includes(l) ? l : undefined);
  return {
    look: pick(prefs?.look) ?? pick(team?.look) ?? DEFAULT_LOOK,
    mode: prefs?.mode === 'dark' ? 'dark' : 'light',
    motion: prefs?.motion === 'reduce' || (prefs?.motion !== 'full' && team?.reduceMotion) ? 'reduce' : 'full',
    accent: team?.accent && HEX.test(team.accent) ? team.accent : '',
  };
}

/** The attributes the theme layer reads (on the shell's root, on <html> and on a page without the shell). */
export function themeAttrs(t: AdminTheme): Record<'data-lm-look' | 'data-lm-mode' | 'data-lm-motion', string> {
  return { 'data-lm-look': t.look, 'data-lm-mode': t.mode, 'data-lm-motion': t.motion };
}

/** The accent as the one style value the theme layer mixes every accent token from (none = the stylesheet's own). */
export function themeStyle(t: AdminTheme): Record<string, string> {
  return t.accent && HEX.test(t.accent) ? { '--lm-accent': t.accent } : {};
}

/** The prefs with one person's theme part changed (null clears it: follow the team or the default again). */
export function withTheme<P extends { theme?: ThemePrefs }>(prefs: P, patch: { [K in keyof ThemePrefs]?: ThemePrefs[K] | null }): P {
  const next: ThemePrefs = { ...(prefs.theme ?? {}) };
  for (const k of ['look', 'mode', 'motion'] as const) {
    if (!(k in patch)) continue;
    const v = patch[k];
    if (v === null || v === undefined) delete next[k];
    else (next as Record<string, string>)[k] = v;
  }
  const theme = cleanTheme(next);
  const out = { ...prefs };
  if (theme) out.theme = theme;
  else delete out.theme;
  return out;
}

/** In the browser: put the theme on <html> too (dialogs open in document.body, outside the shell); returns the undo. */
export function themeOnRoot(t: AdminTheme): () => void {
  const el = document.documentElement;
  const attrs = themeAttrs(t);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  const style = themeStyle(t);
  if (style['--lm-accent']) el.style.setProperty('--lm-accent', style['--lm-accent']);
  else el.style.removeProperty('--lm-accent');
  return () => {
    for (const k of Object.keys(attrs)) el.removeAttribute(k);
    el.style.removeProperty('--lm-accent');
  };
}

/** In the browser: is motion reduced now (the person's or team's choice on <html>, or the system's)? */
export function motionReduced(): boolean {
  if (typeof document === 'undefined') return false;
  if (document.documentElement.dataset.lmMotion === 'reduce') return true;
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
