// S02 · PR 597 — the pure rules of a saved shop look: only shop looks are read, newer sections and zones are kept as
// hidden copies, values that no longer fit stay as they are, money settings are never part of a look. Sample values only.
import { describe, expect, it } from 'vitest';
import { blockDefaults, registry } from '@extas/settings';
import { isShopLook, keepHidden, LOOK_KEYS, lookOf, planRestore, planRows, summaryOf } from './look-model';

const block = (id: string, on: boolean) => ({ id, page: 'home', cat: null, name: id, on, dev: 'both', from: null, to: null, before: null, type: 'spacer', data: blockDefaults('spacer') });

describe('look model (PR 597)', () => {
  it('carries layout and look settings only, never money, bag or checkout settings', () => {
    for (const k of LOOK_KEYS) expect(registry[k]).toBeDefined();
    const banned = /price|discount|cod|delivery|checkout|bag|announce|flashSale|coupon|offer/i;
    expect(LOOK_KEYS.filter((k) => banned.test(k))).toEqual([]);
  });

  it('reads only whole-shop looks; a home look or junk is an empty look', () => {
    expect(isShopLook({ scope: 'shop', settings: {} })).toBe(true);
    expect(isShopLook({ scope: 'home', settings: {} })).toBe(false);
    expect(lookOf({ scope: 'home', settings: { 'home.rowFade': false } }).settings).toEqual({});
    const l = lookOf({ scope: 'shop', settings: { 'home.rowFade': false, 'store.name': 'x' }, rows: { houseAds: ['b', 'a', 'a', 3] }, auto: { kind: 'undo', of: 'Eid' } });
    expect(l.settings).toEqual({ 'home.rowFade': false });
    expect(l.rows).toEqual({ houseAds: ['a', 'b'], placements: [] });
    expect(l.auto).toEqual({ kind: 'undo', of: 'Eid' });
  });

  it('keeps entries made since the look at the end, switched off', () => {
    const r = keepHidden([{ id: 'a', on: true }], [{ id: 'b', on: true }, { id: 'a', on: false }, { id: 'c', on: false }]);
    expect(r.value).toEqual([{ id: 'a', on: true }, { id: 'b', on: false }, { id: 'c', on: false }]);
    expect(r.hidden).toBe(1);
    expect(keepHidden([{ cat: 'polos', on: true, rows: [] }], [{ cat: 'shirts', on: true, rows: [] }]).value).toEqual([{ cat: 'polos', on: true, rows: [] }, { cat: 'shirts', on: false, rows: [] }]);
    expect(keepHidden({ enabled: true }, { enabled: false }).value).toEqual({ enabled: true });
  });

  it('plans the writes: only changed keys, newer sections hidden, a value that no longer fits stays', () => {
    const saved = lookOf({ scope: 'shop', settings: { 'layout.blocks': [block('aaaaaa01', true)], 'home.rowFade': 'not a boolean', 'shop.sweep': registry['shop.sweep'].default } });
    const now = { 'layout.blocks': [block('bbbbbb01', true)], 'home.rowFade': true, 'shop.sweep': registry['shop.sweep'].default };
    const plan = planRestore(saved, now);
    expect(plan.writes.map((w) => w.key)).toEqual(['layout.blocks']);
    expect((plan.writes[0]!.value as { id: string; on: boolean }[]).map((b) => [b.id, b.on])).toEqual([
      ['aaaaaa01', true],
      ['bbbbbb01', false],
    ]);
    expect(plan.hidden).toBe(1);
    expect(plan.kept).toContain('home.rowFade');
    expect(plan.kept).toContain('home.hero');
  });

  it('switches house ads to the saved set', () => {
    expect(planRows({ houseAds: ['a', 'b'], placements: [] }, { houseAds: ['b', 'c'], placements: ['p'] })).toEqual({ on: { houseAds: ['a'], placements: [] }, off: { houseAds: ['c'], placements: ['p'] } });
  });

  it('counts what a look holds', () => {
    const s = summaryOf(lookOf({ scope: 'shop', settings: { 'layout.blocks': [block('aaaaaa01', true), block('aaaaaa02', false)], 'layout.sideCanvas': { enabled: true }, 'layout.sideZones': [{ id: 'z', on: true }], 'layout.categoryOwn': [{ cat: 'polos', on: true }] }, rows: { houseAds: ['x'] } }));
    expect(s).toEqual({ sections: 2, sectionsOn: 1, canvasOn: true, zones: 1, zonesOn: 1, ownOn: 1, ads: 1 });
  });
});
