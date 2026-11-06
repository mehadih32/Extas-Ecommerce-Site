// PR 625 (CN-036) — the admin theme: the team's look and accent, each person's light or dark and "Reduce motion", the
// attributes the theme layer reads, and the stored prefs (a broken theme part never loses the rest).
import { describe, expect, it } from 'vitest';
import { readPrefs, withGuide, withLook } from './pick';
import { DEFAULT_THEME, themeAttrs, themeOf, themeStyle, withTheme } from './theme';

const BUILT = ['lumen'];
const team = { look: 'lumen', accent: '#12B5A6', reduceMotion: false };

describe('admin theme (PR 625)', () => {
  it('is Lumen, light, full motion with the stylesheet accent when nothing is known', () => {
    expect(themeOf(null, undefined, BUILT)).toEqual(DEFAULT_THEME);
    expect(DEFAULT_THEME).toEqual({ look: 'lumen', mode: 'light', motion: 'full', accent: '' });
  });

  it('follows the team’s look and accent; a person’s own light or dark and motion win', () => {
    expect(themeOf(team, undefined, BUILT)).toEqual({ look: 'lumen', mode: 'light', motion: 'full', accent: '#12B5A6' });
    expect(themeOf(team, { mode: 'dark' }, BUILT).mode).toBe('dark');
    expect(themeOf({ ...team, reduceMotion: true }, undefined, BUILT).motion).toBe('reduce');
    expect(themeOf({ ...team, reduceMotion: true }, { motion: 'full' }, BUILT).motion).toBe('full');
    expect(themeOf(team, { motion: 'reduce' }, BUILT).motion).toBe('reduce');
  });

  it('never draws a look that is not built, and never an accent that is not a #RRGGBB colour', () => {
    expect(themeOf({ ...team, look: 'studio' }, { look: 'night' }, BUILT).look).toBe('lumen');
    expect(themeOf({ ...team, accent: 'red;background:url(x)' }, undefined, BUILT).accent).toBe('');
    expect(themeStyle({ ...DEFAULT_THEME, accent: 'x' })).toEqual({});
    expect(themeStyle({ ...DEFAULT_THEME, accent: '#12B5A6' })).toEqual({ '--lm-accent': '#12B5A6' });
  });

  it('gives the theme layer its three attributes', () => {
    expect(themeAttrs({ look: 'lumen', mode: 'dark', motion: 'reduce', accent: '' })).toEqual({ 'data-lm-look': 'lumen', 'data-lm-mode': 'dark', 'data-lm-motion': 'reduce' });
  });

  it('keeps a person’s theme beside their designs and guide choice; null clears a part', () => {
    let p = withTheme(readPrefs({ look: { dashboard: 'B' }, guide: 'popup' }), { mode: 'dark' });
    expect(p).toEqual({ look: { dashboard: 'B' }, guide: 'popup', theme: { mode: 'dark' } });
    p = withTheme(p, { motion: 'reduce' });
    expect(withLook(p, 'orders', 'A').theme).toEqual({ mode: 'dark', motion: 'reduce' });
    expect(withGuide(p, null).theme).toEqual({ mode: 'dark', motion: 'reduce' });
    expect(readPrefs(JSON.parse(JSON.stringify(p))).theme).toEqual({ mode: 'dark', motion: 'reduce' });
    expect(withTheme(withTheme(p, { mode: null }), { motion: null }).theme).toBeUndefined();
  });

  it('a broken stored theme is dropped, the rest of the prefs kept', () => {
    expect(readPrefs({ look: { dashboard: 'B' }, theme: { mode: 'sepia' } })).toEqual({ look: { dashboard: 'B' } });
    expect(readPrefs({ theme: 'dark' })).toEqual({ look: {} });
  });
});
