// PR 740–744 — every screen's keys are real settings, no key is on two screens, every section id is unique and has words.
import { describe, expect, it } from 'vitest';
import { registry } from '@extas/settings';
import { isScreenId, keysOf, SCREEN_IDS, SCREENS } from './screens';
import en from '../../../messages/admin-pagesettings.en.json';
import bn from '../../../messages/admin-pagesettings.bn.json';

const flat = (o: unknown, p = ''): string[] => (o && typeof o === 'object' ? Object.entries(o).flatMap(([k, v]) => flat(v, p ? `${p}.${k}` : k)) : [p]);

describe('page-settings screens (PR 740–744)', () => {
  it('every key is in the registry and on one screen only', () => {
    const seen = new Map<string, string>();
    for (const id of SCREEN_IDS) {
      for (const k of keysOf(SCREENS[id])) {
        expect(k in registry, k).toBe(true);
        expect(seen.get(k), `${k} is on two screens`).toBeUndefined();
        seen.set(k, id);
      }
    }
  });

  it('section ids are unique and every screen is known', () => {
    const ids = SCREEN_IDS.flatMap((s) => SCREENS[s].sections.map((x) => x.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(isScreenId('home')).toBe(true);
    expect(isScreenId('nope')).toBe(false);
  });

  it('every section has a title in English and Bengali, and both files have the same keys', () => {
    const e = (en as { ps: { sec: Record<string, { title: string }> } }).ps.sec;
    const b = (bn as { ps: { sec: Record<string, { title: string }> } }).ps.sec;
    for (const s of SCREEN_IDS.flatMap((x) => SCREENS[x].sections)) {
      expect(e[s.id]?.title, s.id).toBeTruthy();
      expect(b[s.id]?.title, s.id).toBeTruthy();
    }
    expect(flat(en).sort()).toEqual(flat(bn).sort());
  });
});
