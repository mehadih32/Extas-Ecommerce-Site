// PR 53 — the first-screen budget's arithmetic: the photo gives way so the size row and the measurement line end just
// above the buy bar, within its floor and ceiling (demo PDP_FIT).
import { shopMoreSettings } from '@extas/settings';
import { describe, expect, it } from 'vitest';
import { anchorClears, photoBounds, planPhoto } from './pdp-fit';

const fit = shopMoreSettings['pdp.fit'].default;
const line = (bottom: number, clear = 14.61) => ({ sel: '.pdp-fitline', bottom, clear });

describe('photoBounds', () => {
  it('the floor and the ceiling are each the smaller of a pixel number and a share of the screen', () => {
    expect(photoBounds(fit, 844)).toEqual({ min: 150, max: 0.52 * 844, deep: 0.345 * 844 });
    expect(photoBounds(fit, 640).min).toBe(128);
    expect(photoBounds(fit, 1200).max).toBe(500);
  });

  it('never goes under the absolute floor, nor above its own ceiling', () => {
    expect(photoBounds(fit, 400).min).toBe(90);
    expect(photoBounds({ ...fit, photoFloorPx: 300 }, 400).min).toBe(0.52 * 400);
  });
});

describe('planPhoto', () => {
  const vh = 844;
  const bar = 64;

  it('brings the measurement line to just above the bar', () => {
    // the line is 40 px too low: the photo gives up 40 px
    const target = vh - bar - 14.61;
    const plan = planPhoto(fit, vh, bar, 400, [line(target + 40)]);
    expect(plan).toEqual({ want: 360, who: '.pdp-fitline' });
  });

  it('keeps the photo within its floor and ceiling', () => {
    expect(planPhoto(fit, vh, bar, 400, [line(2000)])?.want).toBe(150);
    // everything already fits under a photo at its ceiling: no anchor ends the screen
    expect(planPhoto(fit, vh, bar, 400, [line(300)])).toEqual({ want: 0.52 * vh, who: '' });
  });

  it('a deeper block ends the first screen only while the photo stays tall enough', () => {
    const target = vh - bar - fit.clearPx;
    const deepOk = planPhoto(fit, vh, bar, 400, [{ sel: '.pdp-fmssec', bottom: target + 50, clear: fit.clearPx }, line(target - 100)]);
    expect(deepOk?.who).toBe('.pdp-fmssec');
    expect(deepOk?.want).toBeCloseTo(350);
    const tooShort = planPhoto(fit, vh, bar, 400, [{ sel: '.pdp-fmssec', bottom: target + 200, clear: fit.clearPx }, line(target + 20, fit.clearPx)]);
    expect(tooShort?.who).toBe('.pdp-fitline');
    expect(tooShort?.want).toBeCloseTo(380);
  });

  it('no anchor on the page: no plan (a one-size product without a measurement line keeps its photo)', () => {
    expect(planPhoto(fit, vh, bar, 400, [])).toBeNull();
  });

  it('works for any screen: the line clears the bar after the plan on 320–440 px phones', () => {
    for (const [vhx, low] of [
      [640, 120],
      [800, 60],
      [956, 10],
    ] as const) {
      const target = vhx - bar - 14.61;
      const plan = planPhoto(fit, vhx, bar, 300, [line(target + low)])!;
      const after = target + low - (300 - plan.want);
      expect(anchorClears(after, 14.61, vhx, bar), String(vhx)).toBe(true);
    }
  });
});
