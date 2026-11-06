// S02 · PR 596 — the side canvas's one fit rule and which zones a page shows: a zone takes its standard size when the
// gutter has room, scales down to the room it has, hides below half its size or under the narrowest window, keeps its
// gap from the content and the window's edge; a page shows only its own zones that are switched on and on their days.
import { describe, expect, it } from 'vitest';
import type { SideZone } from '@extas/settings';
import { zonesFor } from './side-canvas';
import { fitZone, floatOffset, MIN_SCALE, zoneLive } from './side-fit';

const zone = (id: string, over: Partial<SideZone> = {}): SideZone => ({
  id,
  name: id,
  side: 'left',
  on: true,
  pages: 'both',
  cats: [],
  from: null,
  to: null,
  top: 24,
  width: 160,
  height: 300,
  mode: 'sticky',
  kind: 'teaser',
  ref: '',
  alt: { en: '', bn: '' },
  text: { en: 'Eid week', bn: 'ঈদের সপ্তাহ' },
  href: '',
  style: 'card',
  ...over,
});

describe('side canvas — the fit rule (PR 596)', () => {
  it('takes the standard size in a wide window and stays inside its gutter with its gap', () => {
    const f = fitZone({ side: 'left', width: 160, height: 300 }, 1920, 1280, 16, 1280);
    expect(f).toMatchObject({ show: true, scale: 1, width: 160, height: 300 });
    expect(f.x).toBeGreaterThanOrEqual(16);
    expect(f.x + f.width).toBeLessThanOrEqual((1920 - 1280) / 2 - 16);
    const r = fitZone({ side: 'right', width: 160, height: 300 }, 1920, 1280, 16, 1280);
    expect(r.x).toBeGreaterThanOrEqual(1920 - (1920 - 1280) / 2 + 16);
    expect(r.x + r.width).toBeLessThanOrEqual(1920 - 16);
  });

  it('scales down to the room it has, never over the content, and hides below half its size', () => {
    // 1440 around 1200: 120 px gutter, 88 px room for a 160 px zone → 0.55
    const f = fitZone({ side: 'left', width: 160, height: 300 }, 1440, 1200, 16, 1280);
    expect(f.show).toBe(true);
    expect(f.scale).toBeCloseTo(88 / 160);
    expect(f.width).toBe(88);
    expect(f.x + f.width).toBeLessThanOrEqual(120);
    expect(fitZone({ side: 'left', width: 200, height: 300 }, 1440, 1200, 16, 1280)).toMatchObject({ show: false });
    expect(88 / 200).toBeLessThan(MIN_SCALE);
  });

  it('hides under the narrowest window and when there is no gutter at all', () => {
    expect(fitZone({ side: 'left', width: 60, height: 60 }, 1279, 900, 16, 1280).show).toBe(false);
    expect(fitZone({ side: 'right', width: 60, height: 60 }, 1366, 1400, 16, 1280).show).toBe(false);
  });

  it('drifts a floating zone gently between -float/2 and +float/2, and not at all at 0', () => {
    const seen = Array.from({ length: 400 }, (_, i) => floatOffset(i * 7, 40));
    expect(Math.min(...seen)).toBe(-20);
    expect(Math.max(...seen)).toBe(20);
    expect(floatOffset(1234, 0)).toBe(0);
  });
});

describe('side canvas — which zones a page shows (PR 596)', () => {
  const today = '2026-11-06';
  it('keeps a zone to its switch and whole days', () => {
    expect(zoneLive({ on: false, from: null, to: null }, today)).toBe(false);
    expect(zoneLive({ on: true, from: '2026-11-07', to: null }, today)).toBe(false);
    expect(zoneLive({ on: true, from: null, to: '2026-11-05' }, today)).toBe(false);
    expect(zoneLive({ on: true, from: today, to: today }, today)).toBe(true);
  });

  it('gives the home page and the category pages their own zones, and chosen categories only theirs', () => {
    const all = [zone('both01'), zone('home01', { pages: 'home' }), zone('cats01', { pages: 'categories' }), zone('polo01', { pages: 'categories', cats: ['polo'] }), zone('off001', { on: false })];
    expect(zonesFor(all, 'home', null, today).map((z) => z.id)).toEqual(['both01', 'home01']);
    expect(zonesFor(all, 'category', 'polo', today).map((z) => z.id)).toEqual(['both01', 'cats01', 'polo01']);
    expect(zonesFor(all, 'category', 'jeans', today).map((z) => z.id)).toEqual(['both01', 'cats01']);
  });
});
