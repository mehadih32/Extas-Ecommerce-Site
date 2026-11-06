// PR 630 (CN-036) — Settings › Admin look, the theme part: four looks with only Lumen selectable (ক খ গ "Planned", no
// button), light or dark, the accent swatches (coral first) and "Reduce motion" as the person's own; the team's part
// only for someone who may change settings; words in both languages.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ADMIN_ACCENT_PRESETS, ADMIN_THEME_LOOKS } from '@extas/settings';
import { smallSizes, styleLiterals } from '@/lib/admin-lumen/section-check';
import bn from '../../../../messages/admin-shell.bn.json';
import en from '../../../../messages/admin-shell.en.json';
import { ThemeChooser, type ThemeChooserProps } from './ThemeChooser';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {} }) }));

type Th = { looks: Record<string, { name: string; desc: string }>; swatch: Record<string, string> } & Record<string, unknown>;
const words = (dict: typeof en) => (dict.look as unknown as { theme: Th }).theme;
function props(dict: typeof en, over: Partial<ThemeChooserProps> = {}): ThemeChooserProps {
  const th = words(dict);
  return {
    looks: ADMIN_THEME_LOOKS.map((l) => ({ id: l.id, letter: l.letter, built: l.built, name: th.looks[l.id]!.name, desc: th.looks[l.id]!.desc })),
    now: { look: 'lumen', mode: 'light', motion: 'full', accent: '#FF5A36' },
    mine: { accent: null },
    team: null,
    swatches: ADMIN_ACCENT_PRESETS.map((p) => ({ id: p.id, hex: p.hex, name: th.swatch[p.id]! })),
    words: Object.fromEntries(Object.entries(th).filter(([, v]) => typeof v === 'string')) as Record<string, string>,
    ...over,
  };
}

describe('Admin look: theme', () => {
  it('lists the four looks; Lumen in use, the other three Planned and not selectable', () => {
    const html = renderToStaticMarkup(<ThemeChooser {...props(en)} />);
    for (const id of ['lumen', 'clear', 'night', 'studio']) expect(html).toContain(`data-testid="look-theme-${id}"`);
    expect(html.match(/>Planned</g)).toHaveLength(3);
    expect(html.match(/aria-disabled="true"/g)).toHaveLength(3);
    expect(html).not.toContain('Use this look');
    expect(html).toMatch(/look-theme-lumen[^]*In use/);
  });

  it('shows light chosen, coral chosen, motion not reduced, and no team part without the permission', () => {
    const html = renderToStaticMarkup(<ThemeChooser {...props(en)} />);
    expect(html).toMatch(/role="radio" aria-checked="true" class="on"[^>]*data-value="light"/);
    expect(html).toMatch(/aria-checked="true" class="lm-swatch on"[^>]*data-value="coral"/);
    expect(html).toMatch(/role="switch" aria-checked="false"[^>]*data-testid="look-theme-motion"/);
    expect(html).not.toContain('look-theme-team');
  });

  it('marks the person’s own accent and dark mode, and shows the team part with settings.write', () => {
    const html = renderToStaticMarkup(<ThemeChooser {...props(en, { now: { look: 'lumen', mode: 'dark', motion: 'reduce', accent: '#7C5CFF' }, mine: { accent: '#7C5CFF' }, team: { accent: '#FF5A36', reduceMotion: false } })} />);
    expect(html).toMatch(/aria-checked="true" class="on"[^>]*data-value="dark"/);
    expect(html).toMatch(/aria-checked="true" class="lm-swatch on"[^>]*data-value="violet"/);
    expect(html).toContain("Use the team&#x27;s colour");
    expect(html).toContain('data-testid="look-theme-team-accent"');
    expect(html).toMatch(/role="switch" aria-checked="true"[^>]*data-testid="look-theme-motion"/);
  });

  it('speaks Bengali with Western digits only', () => {
    const html = renderToStaticMarkup(<ThemeChooser {...props(bn as unknown as typeof en)} />);
    expect(html).toContain('অ্যাডমিনের চেহারা');
    expect(html).toContain('পরিকল্পনায়');
    const th = JSON.stringify(words(bn as unknown as typeof en));
    expect(th).not.toMatch(/[০-৯]/);
  });
});

describe('Admin look page styles (PR 630 follow-up)', () => {
  it('its pills ("In use", "Planned", "Yours") and every other text are at least 14 px, in tokens', () => {
    const css = readFileSync(join(__dirname, '..', '..', '..', 'app', 'admin', 'settings', 'look', 'look-theme.css'), 'utf8');
    expect(smallSizes(css)).toEqual([]);
    expect(styleLiterals(css)).toEqual([]);
    expect(css).toMatch(/\.lm-pill \{[^}]*font-size: var\(--lm-fs-card\)/);
  });
});
