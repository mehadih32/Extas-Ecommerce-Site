// PR 68 — the floating rail: the drift follows the scroll within its cap, eases back, and never crosses the title's
// line or comes onto the buy bar.
import { shopMoreSettings } from '@extas/settings';
import { describe, expect, it } from 'vitest';
import { driftTarget, easeStep, railClamp } from './pdp-rail';

const set = shopMoreSettings['pdp.icons'].default;

describe('the rail', () => {
  it('is off by default, the heart after the title (demo SHOWN.pdpIcons)', () => {
    expect(set.panel).toBe(false);
    expect(set.wish).toBe('title');
    expect(set.whatsapp).toBe(false);
  });

  it('drifts with half the scroll, never more than the cap either way', () => {
    expect(driftTarget(0, 20, set)).toBe(10);
    expect(driftTarget(30, 100, set)).toBe(38);
    expect(driftTarget(0, -500, set)).toBe(-38);
    expect(driftTarget(5, 0, { ...set, driftMaxPx: 0 })).toBe(0);
  });

  it('eases towards its target and stops there', () => {
    let s = { cur: 0, done: false };
    let frames = 0;
    while (!s.done && frames < 200) {
      s = easeStep(s.cur, 38, set.ease);
      frames++;
    }
    expect(s.cur).toBe(38);
    expect(frames).toBeLessThan(60);
  });

  it('never climbs above the title line, never comes onto the bar', () => {
    const box = { natural: 300, h: 90, titleBottom: 380, vh: 844, bar: 64 };
    // the title is below the rail's own place: the rail comes down under it
    expect(300 + railClamp(0, box, set)).toBe(382);
    // the title has scrolled away: the rail is free within the cap
    expect(railClamp(20, { ...box, titleBottom: -200 }, set)).toBe(20);
    // dragged towards the bar: it stops barGap above it
    const low = railClamp(1000, { ...box, titleBottom: null }, set);
    expect(300 + low + 90).toBe(844 - 64 - 10);
  });

  it('on a screen too short for both lines, the bar wins: the buy controls are never covered', () => {
    const box = { natural: 300, h: 90, titleBottom: 560, vh: 640, bar: 64 };
    const o = railClamp(0, box, set);
    expect(300 + o + 90).toBeLessThanOrEqual(640 - 64 - 10);
  });
});
