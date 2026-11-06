// PR 625 follow-up (CN-036, "contrast AA in both themes") — reads the Lumen theme layer (app/admin/theme/lumen.css) the
// way a browser would for one mode and one accent, so a test can check every text/background token pair the admin
// draws with (WCAG 2.x contrast: 4.5:1 for text, 3:1 for large text and for focus rings and other non-text marks).
// It understands what the theme layer uses: #hex, rgb()/rgba(), var(--lm-…), color-mix(in srgb, A p%, B) with B a
// colour or `transparent`, and linear-gradient(…) (a gradient counts with each of its stops: the worst one decides).
// Pure: no DOM, no file access (the caller passes the stylesheet's text).

/** A colour as 0–255 red, green, blue and 0–1 alpha. */
export type Rgba = [number, number, number, number];

export type ThemeMode = 'light' | 'dark' | 'island';

const LIGHT_HEAD = ":root,\n[data-lm-look='lumen'] {";
const DARK_HEAD = "[data-lm-look='lumen'][data-lm-mode='dark'] {";
const ISLAND_HEAD = "[data-lm-look='lumen'][data-lm-mode='dark'] :is(";
const SHARED_HEAD = ':root,\n[data-lm-look] {';

/** The `--name: value` declarations of the block that starts with `head` (comments dropped). */
export function blockTokens(css: string, head: string): Record<string, string> {
  const at = css.indexOf(head);
  if (at < 0) throw new Error(`theme block not found: ${head}`);
  const open = css.indexOf('{', at);
  const body = css.slice(open + 1, css.indexOf('\n}', open)).replace(/\/\*[\s\S]*?\*\//g, '');
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--lm-[a-z0-9-]+)\s*:\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim();
  return out;
}

/** Every --lm-* token for one mode: light = the default block; dark = light + the dark block; island = dark + the
 *  light island (a page not yet in the look). `accent` (#RRGGBB) replaces the stylesheet's own, as the shell does. */
export function lumenTokens(css: string, mode: ThemeMode, accent?: string): Record<string, string> {
  const t = {
    ...blockTokens(css, SHARED_HEAD),
    ...blockTokens(css, LIGHT_HEAD),
  };
  if (mode !== 'light') Object.assign(t, blockTokens(css, DARK_HEAD));
  if (mode === 'island') Object.assign(t, blockTokens(css, ISLAND_HEAD));
  if (accent) t['--lm-accent'] = accent;
  return t;
}

/** The value's top-level comma-separated parts (commas inside brackets kept). */
function args(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function inner(s: string): string {
  return s.slice(s.indexOf('(') + 1, s.lastIndexOf(')'));
}

function hex(s: string): Rgba {
  let h = s.slice(1);
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
}

/** color-mix(in srgb, A p%, B): premultiplied-alpha mix, as CSS Color 5 defines it. */
function mix(a: Rgba, p: number, b: Rgba): Rgba {
  const q = 1 - p;
  const alpha = a[3] * p + b[3] * q;
  if (alpha === 0) return [0, 0, 0, 0];
  const ch = (i: number) => (a[i]! * a[3] * p + b[i]! * b[3] * q) / alpha;
  return [ch(0), ch(1), ch(2), alpha];
}

/** A value as one or more colours (a gradient gives each stop; anything else gives one). */
export function resolve(value: string, tokens: Record<string, string>, depth = 0): Rgba[] {
  if (depth > 20) throw new Error(`token loop at ${value}`);
  const v = value.trim();
  if (v.startsWith('var(')) {
    const [name, fallback] = args(inner(v));
    const got = tokens[name!];
    if (got === undefined) {
      if (fallback === undefined) throw new Error(`unknown token ${name}`);
      return resolve(fallback, tokens, depth + 1);
    }
    return resolve(got, tokens, depth + 1);
  }
  if (v === 'transparent') return [[0, 0, 0, 0]];
  if (v.startsWith('#')) return [hex(v)];
  if (v.startsWith('rgb')) {
    const n = inner(v)
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number);
    return [[n[0]!, n[1]!, n[2]!, n[3] ?? 1]];
  }
  if (v.startsWith('color-mix(')) {
    const [space, a, b] = args(inner(v));
    if (space !== 'in srgb') throw new Error(`only srgb mixes are read: ${v}`);
    const pa = /\s(\d+(?:\.\d+)?)%$/.exec(a!);
    const ca = resolve(pa ? a!.slice(0, pa.index) : a!, tokens, depth + 1)[0]!;
    const cb = resolve(b!.replace(/\s\d+(?:\.\d+)?%$/, ''), tokens, depth + 1)[0]!;
    return [mix(ca, pa ? Number(pa[1]) / 100 : 0.5, cb)];
  }
  if (v.startsWith('linear-gradient(')) {
    return args(inner(v))
      .filter((part) => !/^(to |\d+(\.\d+)?deg)/.test(part))
      .map((stop) => resolve(stop.replace(/\s+\d+(\.\d+)?%$/, ''), tokens, depth + 1)[0]!);
  }
  throw new Error(`colour not understood: ${v}`);
}

/** A colour over an opaque one (alpha compositing). */
export function over(top: Rgba, under: Rgba): Rgba {
  const a = top[3];
  return [top[0] * a + under[0] * (1 - a), top[1] * a + under[1] * (1 - a), top[2] * a + under[2] * (1 - a), 1];
}

function luminance(c: Rgba): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}

/** WCAG contrast ratio of two opaque colours (1–21). */
export function ratio(a: Rgba, b: Rgba): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * The worst contrast of text `fg` on `bg` (each a CSS value: a token, a mix, a gradient …), where `bg` itself may be
 * see-through and sits on `under` (the page or card under it; opaque white when not given).
 */
export function pairRatio(tokens: Record<string, string>, fg: string, bg: string, under = '#ffffff'): number {
  let worst = Infinity;
  for (const base of resolve(under, tokens)) {
    for (const b of resolve(bg, tokens)) {
      const back = over(b, over(base, [255, 255, 255, 1]));
      for (const f of resolve(fg, tokens)) worst = Math.min(worst, ratio(over(f, back), back));
    }
  }
  return worst;
}

/**
 * The rules of a stylesheet that fade their element with an opacity between 0 and 1 (text drawn that way loses
 * contrast the token pairs cannot see). Disabled controls (WCAG exempts them) and svg icons are left out; opacity 0
 * (hidden, or an animation's start) is not a fade.
 */
export function fadedRules(css: string): string[] {
  const out: string[] = [];
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const o = /(?:^|;)\s*opacity:\s*(\d*\.?\d+)\s*(?:;|$)/.exec(m[2]!);
    if (!o || Number(o[1]) <= 0 || Number(o[1]) >= 1) continue;
    const sel = m[1]!.trim().replace(/\s+/g, ' ');
    if (/:disabled|aria-disabled|\bsvg\b/.test(sel)) continue;
    out.push(sel);
  }
  return out;
}
