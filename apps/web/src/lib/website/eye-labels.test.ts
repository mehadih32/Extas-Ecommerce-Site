// S02 · PR 81: every eye-toggle of PR 80 has its words on Website › Eye-toggles in English and Bengali (and no word is
// left for a switch that is gone), every place and screen is named, and the Bengali uses Western digits.
import { describe, expect, it } from 'vitest';
import { EYE_AREAS, EYE_TOGGLES } from '@extas/settings';
import bn from '../../../messages/admin-eye.bn.json';
import en from '../../../messages/admin-eye.en.json';

describe('Website › Eye-toggles words (PR 81)', () => {
  it('names every eye-toggle, place and screen in both languages', () => {
    const ids = EYE_TOGGLES.map((t) => t.id).sort();
    for (const m of [en, bn]) {
      const labels = m.ey.labels as Record<string, string>;
      expect(Object.keys(labels).sort()).toEqual(ids);
      for (const id of ids) expect(labels[id]!.trim().length, id).toBeGreaterThan(0);
      for (const a of EYE_AREAS) expect((m.ey.area as Record<string, string>)[a], a).toBeTruthy();
      for (const s of ['both', 'phone', 'desktop']) expect((m.ey.screen as Record<string, string>)[s], s).toBeTruthy();
    }
    expect(JSON.stringify(bn)).not.toMatch(/[০-৯]/);
  });
});
