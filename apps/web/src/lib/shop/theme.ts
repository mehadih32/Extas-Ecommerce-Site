// PR 82 / 501 — which theme a page wears: the owner's preset (`theme.preset`), unless today falls inside a dated
// window of `theme.schedule` (the festive theme for Eid, D4.2), with the owner's own colours and fonts over it
// (`theme.colours`, `theme.fonts`; refused when they would make text hard to read). `?theme=<name>` previews another
// theme for the person who opens the link only (`theme.previewParam`), never changing what customers see.
import { chooseTheme, cssVariables, isThemePreset, tokensOf, type ThemeChoice, type ThemePreset, type ThemeTokens } from './tokens';

export interface ThemeWindow {
  preset: ThemePreset;
  from: string;
  to: string;
}

/** Today as YYYY-MM-DD in the store's time zone. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** The preset for a day: the first schedule window that holds the day, else the owner's preset. */
export function presetFor(day: string, preset: ThemePreset, schedule: readonly ThemeWindow[]): ThemePreset {
  for (const w of schedule) if (w.from <= day && day <= w.to) return w.preset;
  return preset;
}

export interface ShopThemeInput {
  preset: ThemePreset;
  schedule: readonly ThemeWindow[];
  colours: Record<string, string> | null;
  fonts: { body?: string; display?: string } | null;
  today: string;
  /** `?theme=` from the address, used only when the setting allows previews. */
  preview?: string | null;
  previewAllowed: boolean;
}

export interface ShopTheme {
  choice: ThemeChoice;
  tokens: ThemeTokens;
  /** `--bg:#…;--surface:#…` for the wrapper. */
  css: string;
  previewing: boolean;
}

export function shopTheme(i: ShopThemeInput): ShopTheme {
  const previewing = i.previewAllowed && isThemePreset(i.preview);
  const preset = previewing ? (i.preview as ThemePreset) : presetFor(i.today, i.preset, i.schedule);
  // A preview shows the theme as designed: the owner's colour changes belong to his own theme.
  const choice = chooseTheme(preset, previewing ? null : i.colours, i.fonts);
  const tokens = tokensOf(choice);
  return { choice, tokens, css: cssVariables(tokens), previewing };
}
