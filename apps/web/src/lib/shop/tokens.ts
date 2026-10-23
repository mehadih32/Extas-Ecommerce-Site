// PR 82 — the design tokens and the four themes (Blueprint D4.2 "Themes", Shilpi U05). This file is the ONE place the
// storefront's colours, radii and type families are defined (A1.4: the design tokens have one owner, the storefront
// lead). Values are the approved V12 demo's (docs/demo/src/styles.css theme blocks, with the later global radius
// override of r12 folded in, so each theme lists what the demo actually shows). Components never read a raw value:
// they use the CSS variables this file emits (`--bg`, `--brand` …), so a theme switch or an owner colour change
// (PR 501, setting `theme.colours`) reaches every page at once.
//
// Three tiers (U05 §2): the primitive values live here per theme; the semantic names are the variable names; component
// tokens (footer bands `--f1…--f5`, payment tiles `--pm`) alias them inside the shell stylesheet.

export const THEME_PRESETS = ['classic', 'noir', 'ivory', 'festive'] as const;
export type ThemePreset = (typeof THEME_PRESETS)[number];

/** Every colour token a theme sets. Order = the demo's order (kept, so diffs against the demo stay readable). */
export const COLOUR_TOKENS = [
  'bg',
  'surface',
  'surface2',
  'ink',
  'ink2',
  'text2',
  'muted',
  'strike',
  'line',
  'line2',
  'input',
  'brand',
  'brand-dark',
  'brand-ink',
  'brand-tint',
  'brand-line',
  'sale',
  'gold',
  'gold-bg',
  'warn',
  'warn-bg',
  'hero',
  'hero-ink',
  'hero-sub',
  'announce',
  'announce-ink',
  'footer',
  'footer-ink',
  'footer-line',
] as const;
export type ColourToken = (typeof COLOUR_TOKENS)[number];

/** Non-colour tokens: radii and the type system. */
export const SHAPE_TOKENS = ['radius', 'btn-radius', 'card-radius'] as const;
export const TYPE_TOKENS = ['font-body', 'font-display', 'display-weight', 'display-case', 'display-track'] as const;
export type ShapeToken = (typeof SHAPE_TOKENS)[number];
export type TypeToken = (typeof TYPE_TOKENS)[number];
export type Token = ColourToken | ShapeToken | TypeToken;
export type ThemeTokens = Record<Token, string>;

/** The self-hosted families a theme or the owner may choose (apps/web/src/fonts). The stack after each is the fallback.
 * Follow-up 23: the Bengali fallback is the shop's own `Hind Siliguri Shop` family (~~`Hind Siliguri`~~, which the
 * admin keeps), whose Bengali letters are declared only once their files are cached (lib/shop/font-preload.ts). */
export const FONT_FAMILIES = {
  'instrument-sans': "'Instrument Sans','Hind Siliguri Shop',system-ui,-apple-system,'Segoe UI',sans-serif",
  archivo: "'Archivo','Hind Siliguri Shop',system-ui,sans-serif",
  'hind-siliguri': "'Hind Siliguri Shop',system-ui,sans-serif",
  'cormorant-garamond': "'Cormorant Garamond','Archivo',serif",
} as const;
export type FontFamilyKey = keyof typeof FONT_FAMILIES;

const classic: ThemeTokens = {
  bg: '#F4F3F0',
  surface: '#FFFFFF',
  surface2: '#FAFAF8',
  ink: '#171715',
  ink2: '#2F2D29',
  text2: '#54504A',
  muted: '#6E675E',
  strike: '#7F796F',
  line: '#E6E3DE',
  line2: '#EFEDE8',
  input: '#D8D4CD',
  brand: '#1F4E46',
  'brand-dark': '#15302B',
  'brand-ink': '#FFFFFF',
  'brand-tint': '#EEF3F1',
  'brand-line': '#D5E1DC',
  sale: '#B4453C',
  gold: '#8A6420',
  'gold-bg': '#F6EFDF',
  warn: '#8A5A1E',
  'warn-bg': '#F6EFDF',
  hero: '#22403A',
  'hero-ink': '#FFFFFF',
  'hero-sub': '#CBDED7',
  announce: '#15302B',
  'announce-ink': '#E8EFEC',
  footer: '#121211',
  'footer-ink': '#C9C4BC',
  'footer-line': '#2A2926',
  // The demo's r12 override (`--btn-radius:10px; --radius:8px; --card-radius:12px`, !important) beats every theme
  // block's own radii, Noir's 0 and Festive's pill included, so these are the radii every theme shows (D3.1 "softly
  // rounded: 10 px buttons, 8 px controls, 12 px cards").
  radius: '8px',
  'btn-radius': '10px',
  'card-radius': '12px',
  'font-body': FONT_FAMILIES['instrument-sans'],
  'font-display': FONT_FAMILIES.archivo,
  'display-weight': '800',
  'display-case': 'none',
  'display-track': '-0.01em',
};

/** Each theme = Classic with its own values over it (the demo's cascade: `:root` first, then `[data-theme]`). */
export const THEMES: Record<ThemePreset, ThemeTokens> = {
  classic,
  noir: {
    ...classic,
    bg: '#FFFFFF',
    surface: '#FFFFFF',
    surface2: '#F7F7F7',
    ink: '#0E0E0E',
    ink2: '#1E1E1E',
    text2: '#444444',
    muted: '#5E5E5E',
    strike: '#777777',
    line: '#E7E7E7',
    line2: '#F0F0F0',
    input: '#CFCFCF',
    brand: '#0E0E0E',
    'brand-dark': '#000000',
    'brand-ink': '#FFFFFF',
    'brand-tint': '#F3F1EC',
    'brand-line': '#DCD6CA',
    hero: '#1A1A1A',
    'hero-ink': '#FFFFFF',
    'hero-sub': '#D6CFC2',
    announce: '#0E0E0E',
    'announce-ink': '#E9E3D7',
    footer: '#0B0B0B',
    'footer-line': '#262626',
    'display-case': 'uppercase',
    'display-track': '0.06em',
    'display-weight': '700',
  },
  ivory: {
    ...classic,
    bg: '#F7F3EA',
    surface: '#FFFDF8',
    surface2: '#FBF7EE',
    ink: '#2B2620',
    ink2: '#3A332B',
    text2: '#5A5046',
    muted: '#6F655A',
    strike: '#857A6E',
    line: '#E7DFD0',
    line2: '#EFE8DA',
    input: '#D9CFBD',
    brand: '#8A5A3B',
    'brand-dark': '#5E3C26',
    'brand-ink': '#FFFFFF',
    'brand-tint': '#F3E9DF',
    'brand-line': '#E4D2C1',
    hero: '#D9CBB4',
    'hero-ink': '#2B2620',
    'hero-sub': '#4C4237',
    announce: '#5E3C26',
    'announce-ink': '#F6EDE3',
    footer: '#2B2620',
    'footer-ink': '#D9CFC2',
    'footer-line': '#433B32',
    'font-display': FONT_FAMILIES['cormorant-garamond'],
    'display-weight': '600',
    'display-track': '0',
  },
  festive: {
    ...classic,
    bg: '#0F1B33',
    surface: '#17264A',
    surface2: '#1B2C55',
    ink: '#F3EBDD',
    ink2: '#EFE6D6',
    text2: '#D8CFBF',
    muted: '#BEB5A6',
    strike: '#A79F92',
    line: '#2A3A63',
    line2: '#24345A',
    input: '#3A4B76',
    brand: '#C9A14A',
    'brand-dark': '#A8832F',
    'brand-ink': '#0F1B33',
    'brand-tint': '#22335E',
    'brand-line': '#3B4C78',
    sale: '#E07A6E',
    gold: '#E3C77E',
    'gold-bg': '#2A3866',
    warn: '#E3C77E',
    'warn-bg': '#2A3866',
    hero: '#1B2C55',
    'hero-ink': '#F3EBDD',
    'hero-sub': '#E3C77E',
    announce: '#C9A14A',
    'announce-ink': '#0F1B33',
    footer: '#0A1326',
    'footer-ink': '#D8CFBF',
    'footer-line': '#22325A',
  },
};

export const isThemePreset = (v: unknown): v is ThemePreset => typeof v === 'string' && (THEME_PRESETS as readonly string[]).includes(v);
export const isColourToken = (v: string): v is ColourToken => (COLOUR_TOKENS as readonly string[]).includes(v);

// ---- contrast (U04/U05: accessibility is enforced at the token layer) ----

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
export const isHex = (v: string): boolean => HEX.test(v);

function channel(hex: string): [number, number, number] {
  const h = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
  return [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
}

/** WCAG 2.x relative luminance of a #rgb / #rrggbb colour. */
export function luminance(hex: string): number {
  const [r, g, b] = channel(hex).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours (1–21). */
export function contrast(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Text-on-background pairs every theme must keep at 4.5:1 or better (checklist A11y, D1.4 "4.5:1 checked in CI"). */
export const TEXT_PAIRS: ReadonlyArray<readonly [ColourToken, ColourToken]> = [
  ['ink', 'bg'],
  ['ink', 'surface'],
  ['text2', 'surface'],
  ['muted', 'surface'],
  ['muted', 'bg'],
  ['brand-ink', 'brand'],
  ['announce-ink', 'announce'],
  ['footer-ink', 'footer'],
  ['hero-ink', 'hero'],
  ['brand', 'surface'],
  ['sale', 'surface'],
  ['gold', 'surface'],
];
export const MIN_TEXT_CONTRAST = 4.5;

export interface ContrastIssue {
  fg: ColourToken;
  bg: ColourToken;
  ratio: number;
}

/** The pairs of a token set that fall under 4.5:1. An owner colour change that breaks one is not applied. */
export function contrastIssues(t: Pick<ThemeTokens, ColourToken>): ContrastIssue[] {
  const out: ContrastIssue[] = [];
  for (const [fg, bg] of TEXT_PAIRS) {
    const a = t[fg];
    const b = t[bg];
    if (!isHex(a) || !isHex(b)) continue;
    const ratio = contrast(a, b);
    if (ratio < MIN_TEXT_CONTRAST) out.push({ fg, bg, ratio: Math.round(ratio * 100) / 100 });
  }
  return out;
}

// ---- the tokens a page wears ----

export interface ThemeChoice {
  preset: ThemePreset;
  /** The owner's colour changes (PR 501, `theme.colours`), already checked; empty = the theme as designed. */
  colours: Partial<Record<ColourToken, string>>;
  /** The owner's font choice (`theme.fonts`); missing = the theme's own. */
  fonts: { body?: FontFamilyKey; display?: FontFamilyKey };
  /** Colour changes that were refused (unknown token, not a colour, or a contrast pair under 4.5:1). */
  refused: string[];
}

/**
 * Applies the owner's colour overrides on top of a theme. Unknown tokens and non-hex values are refused; if the result
 * breaks a text pair, the whole override set is refused (the designed theme stays — never an unreadable shop).
 */
export function chooseTheme(
  preset: ThemePreset,
  colours: Record<string, string> | null | undefined,
  fonts: { body?: string | null; display?: string | null } | null | undefined,
): ThemeChoice {
  const refused: string[] = [];
  const ok: Partial<Record<ColourToken, string>> = {};
  for (const [k, v] of Object.entries(colours ?? {})) {
    if (isColourToken(k) && isHex(v)) ok[k] = v.toUpperCase();
    else refused.push(k);
  }
  const merged = { ...THEMES[preset], ...ok };
  const issues = contrastIssues(merged);
  const accepted = issues.length ? {} : ok;
  if (issues.length) refused.push(...Object.keys(ok));
  const f: ThemeChoice['fonts'] = {};
  if (fonts?.body && fonts.body in FONT_FAMILIES) f.body = fonts.body as FontFamilyKey;
  if (fonts?.display && fonts.display in FONT_FAMILIES) f.display = fonts.display as FontFamilyKey;
  return { preset, colours: accepted, fonts: f, refused };
}

/** The final token values of a choice. */
export function tokensOf(choice: ThemeChoice): ThemeTokens {
  const t: ThemeTokens = { ...THEMES[choice.preset], ...choice.colours };
  if (choice.fonts.body) t['font-body'] = FONT_FAMILIES[choice.fonts.body];
  if (choice.fonts.display) t['font-display'] = FONT_FAMILIES[choice.fonts.display];
  return t;
}

/** CSS custom properties for the shop wrapper, e.g. `--bg:#F4F3F0;--surface:#FFFFFF;…`. */
export function cssVariables(t: ThemeTokens): string {
  return (Object.keys(t) as Token[]).map((k) => `--${k}:${t[k]}`).join(';');
}

/** The tokens as a W3C Design Tokens (DTCG 2025.10) document, for design tools (U05 §1). */
export function toDesignTokens(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of THEME_PRESETS) {
    const t = THEMES[p];
    out[p] = {
      color: Object.fromEntries(COLOUR_TOKENS.map((k) => [k, { $type: 'color', $value: t[k] }])),
      radius: Object.fromEntries(SHAPE_TOKENS.map((k) => [k, { $type: 'dimension', $value: { value: Number.parseFloat(t[k]), unit: 'px' } }])),
      font: {
        body: { $type: 'fontFamily', $value: t['font-body'] },
        display: { $type: 'fontFamily', $value: t['font-display'] },
      },
    };
  }
  return out;
}
