// PR 625 follow-up (CN-036, "contrast AA in both themes") — every text/background pair the Lumen shell and the shared
// patterns draw with, checked from the theme layer itself (theme/lumen.css) in light, dark and the light island, for
// every ready accent swatch of Settings › Admin look (coral as shipped). Text needs 4.5:1; a focus ring and a pill's
// own dot need 3:1 (non-text). A token change that drops a pair under AA fails here, before any page is looked at.
// The pairs come from the browser contrast audit of 14 admin pages at 390 and 1366 px (lane A builder 31): sidebar
// (normal, hover, active, submenu, badges), top bar, bottom bar, palette, bell panel, tiles, queue rows, pills of every
// tone, toasts, empty states, form hints and placeholders.
import { describe, expect, it } from 'vitest';
import { ADMIN_ACCENT_PRESETS } from '@extas/settings';
import { blockTokens, fadedRules, lumenTokens, pairRatio, type ThemeMode } from '@/lib/admin-lumen/contrast';
import { readAdmin } from '@/lib/admin-lumen/section-check';

const CSS = readAdmin('theme/lumen.css');

/** [what, text, background, what the background sits on (default: the card), minimum]. */
type Pair = [string, string, string, string?, number?];

const SURFACES = ['--lm-bg', '--lm-sf', '--lm-sf2', '--lm-inp', '--lm-hover'];
const v = (t: string) => (t.startsWith('--') ? `var(${t})` : t);

const PAIRS: Pair[] = [
  // ink and the quieter ink on every surface (labels, hints, sidebar items, submenu, top bar, palette rows, empty states)
  ...SURFACES.flatMap((s): Pair[] => [
    [`ink on ${s}`, '--lm-ink', s],
    [`ink2 on ${s} (also every placeholder)`, '--lm-ink2', s],
    [`faint on ${s}`, '--lm-faint', s],
  ]),
  ['ink2 on chip (quiet pill, tab count)', '--lm-ink2', '--lm-chip'],
  ['ink on chip', '--lm-ink', '--lm-chip'],
  ['ink on acbg', '--lm-ink', '--lm-acbg'],
  ['ink on warnbg', '--lm-ink', '--lm-warnbg'],
  ['ink on infobg', '--lm-ink', '--lm-infobg'],
  // the accent as text: active sidebar item and submenu, links, the guide button
  ['ac-ink on acbg (active item)', '--lm-ac-ink', '--lm-acbg'],
  ['ac-ink on sf (link)', '--lm-ac-ink', '--lm-sf'],
  ['ac-ink on sf2', '--lm-ac-ink', '--lm-sf2'],
  ['ac-ink on bg', '--lm-ac-ink', '--lm-bg'],
  ['ac-ink on hover', '--lm-ac-ink', '--lm-hover'],
  // white on the accent: badges, primary buttons, the logo
  ['on-ac on brand (badge)', '--lm-on-ac', '--lm-brand'],
  ['on-ac on brand-deep (button hover)', '--lm-on-ac', '--lm-brand-deep'],
  ['on-ac on pri (primary button)', '--lm-on-ac', '--lm-pri'],
  ['on-ac on logo', '--lm-on-ac', '--lm-logo'],
  // inverted: on tab, language switch, toast, dark pill
  ['bg on ink (on tab, toast)', '--lm-bg', '--lm-ink'],
  ['sf on ink', '--lm-sf', '--lm-ink'],
  ['acbg on ink (toast Undo)', '--lm-acbg', '--lm-ink'],
  ['bg on hero-soft over ink (on tab count)', '--lm-bg', '--lm-on-hero-soft', '--lm-ink'],
  ['sf on bad (marker)', '--lm-sf', '--lm-bad'],
  // the two faded texts the Lumen layer keeps (FADED below): both sit on the ink
  ['toast countdown (bg at 0.75) on ink', 'color-mix(in srgb, var(--lm-bg) 75%, transparent)', '--lm-ink'],
  ['on view pill quiet part (sf at 0.75) on ink', 'color-mix(in srgb, var(--lm-sf) 75%, transparent)', '--lm-ink'],
  // states: pills, tags, need counts, toasts of every tone, on their tint and on a card
  ...(['ok', 'warn', 'bad', 'info'] as const).flatMap((t): Pair[] => [
    [`${t} on ${t}bg (pill)`, `--lm-${t}`, `--lm-${t}bg`],
    [`${t} on sf`, `--lm-${t}`, '--lm-sf'],
    [`${t} on sf2`, `--lm-${t}`, '--lm-sf2'],
  ]),
  // the hero card (dark in both modes) and the avatar
  ['on-hero on hero', '--lm-on-hero', '--lm-hero'],
  ['on-hero2 on hero', '--lm-on-hero2', '--lm-hero'],
  ['ok-on-hero on hero', '--lm-ok-on-hero', '--lm-hero'],
  ['on-hero on hero-soft over hero', '--lm-on-hero', '--lm-on-hero-soft', '--lm-hero-solid'],
  ['on-hero on hero-solid (avatar)', '--lm-on-hero', '--lm-hero-solid'],
  ['hero-solid on on-hero', '--lm-hero-solid', '--lm-on-hero'],
  // non-text: the focus ring on every surface (3:1)
  ...SURFACES.map((s): Pair => [`focus ring on ${s}`, '--lm-focus', s, undefined, 3]),
];

/** The older pages' accent text (--g = --lm-brand, shell.css) on their light tints: such a part is drawn only in the
 *  light look or in the light island (in dark, a page in the look draws accent text with --lm-ac-ink). */
const LIGHT_PAIRS: Pair[] = [
  ['brand text on sf', '--lm-brand', '--lm-sf'],
  ['brand text on bg', '--lm-brand', '--lm-bg'],
  ['brand text on hover (guide button)', '--lm-brand', '--lm-hover'],
  ['brand text on sf2', '--lm-brand', '--lm-sf2'],
  ['brand text on acbg', '--lm-brand', '--lm-acbg'],
];

/** Faded on purpose: the × of the toast (an icon), the toast's Undo countdown and an on view pill's quiet part (both on
 *  the ink, pairs above). A new fade on text fails until it is checked here. */
const FADED = ['.lm-toast-u small', '.lm-toast-x', '[data-lm-look] [data-lm-ready] .a2-view.on .a2-mute'];

const MODES: ThemeMode[] = ['light', 'dark', 'island'];

describe('Lumen theme layer: every token pair meets AA', () => {
  for (const mode of MODES) {
    for (const preset of ADMIN_ACCENT_PRESETS) {
      it(`${mode}, accent ${preset.id}`, () => {
        const t = lumenTokens(CSS, mode, preset.hex);
        const low = [...PAIRS, ...(mode === 'dark' ? [] : LIGHT_PAIRS)].flatMap(([what, fg, bg, on, min]) => {
          const r = pairRatio(t, v(fg), v(bg), on ? v(on) : 'var(--lm-sf)');
          const need = min ?? 4.5;
          return r + 1e-9 < need ? [`${what}: ${r.toFixed(2)} < ${need}`] : [];
        });
        expect(low).toEqual([]);
      });
    }
  }

  it('the light island repeats the light colours exactly (a token changed in one must change in both)', () => {
    const light = lumenTokens(CSS, 'light');
    const island = blockTokens(CSS, "[data-lm-look='lumen'][data-lm-mode='dark'] :is(");
    for (const k of Object.keys(island)) expect([k, island[k]]).toEqual([k, light[k]]);
  });

  it('no text in the Lumen layer is faded with opacity, except the two parts on the ink checked above', () => {
    const files = [
      'theme/lumen.css',
      'lumen-shell.css',
      'lumen-patterns.css',
      'lumen-sections.css',
      'lumen-help.css',
      'lumen-settings.css',
      'lumen-reports.css',
      'lumen-books.css',
    ];
    const faded = files.flatMap((f) => fadedRules(readAdmin(f)));
    expect(faded).toEqual(FADED);
  });
});
