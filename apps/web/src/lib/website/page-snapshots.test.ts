// S02 · PR 597 follow-up (695) — one page's snapshots, the pure part: the place keys, and what a restore hands the
// page's own Save (the saved order and sections; sections and zones made since kept, switched off; a saved one that no
// longer fits its rules stays as it is now).
import { describe, expect, it } from 'vitest';
import { blockDefaults, type LayoutBlock, type SideZone } from '@extas/settings';
import { defaultLayout } from '../shop/layouts';
import type { LayoutView } from './layouts-admin';
import { layoutRestoreInput, placeKey, placeOf, sideRestoreInput } from './page-snapshots';
import type { SideView } from './side-canvas-admin';

const block = (id: string, on = true, over: Partial<LayoutBlock> = {}): LayoutBlock =>
  ({ id, page: 'home', cat: null, name: 'Sample', on, dev: 'both', from: null, to: null, before: null, type: 'spacer', data: blockDefaults('spacer'), ...over }) as LayoutBlock;
const zone = (id: string, on = true): SideZone =>
  ({ id, name: 'Sample', side: 'right', on, pages: 'both', cats: [], from: null, to: null, top: 24, width: 160, height: 300, mode: 'sticky', kind: 'teaser', ref: '', alt: { en: '', bn: '' }, text: { en: 'Eid', bn: 'ঈদ' }, href: '', style: 'card' }) as SideZone;
const view = (over: Partial<LayoutView> = {}): LayoutView => ({ page: 'home', cat: null, rows: defaultLayout('home'), defaults: defaultLayout('home'), locked: [], version: 'v-now', blocks: [], own: null, shared: 0, ownRows: null, ...over });

describe('page snapshots (PR 597 follow-up 695)', () => {
  it('keys every place and reads only real ones back', () => {
    for (const p of [{ kind: 'side' }, { kind: 'layout', page: 'home', cat: null }, { kind: 'layout', page: 'category', cat: 'polo' }, { kind: 'layout', page: 'bag', cat: null }] as const) expect(placeOf(placeKey(p))).toEqual(p);
    expect(placeKey({ kind: 'layout', page: 'category', cat: 'polo' })).toBe('layout:category:polo');
    for (const bad of ['layout:nowhere', 'layout:home:polo', 'layout:category:Polo!', 'shop', '', null, 7]) expect(placeOf(bad)).toBeNull();
  });

  it('brings back the saved order and sections, keeps newer sections switched off, never takes another scope', () => {
    const rows = defaultLayout('home');
    const savedRows = [...rows].reverse().map((r) => ({ ...r }));
    const now = view({ blocks: [block('old001', false), block('new001'), block('new002', false)] });
    const r = layoutRestoreInput({ sections: savedRows, blocks: [block('old001', true)], own: null }, now);
    expect(r.input).toMatchObject({ page: 'home', cat: null, version: 'v-now', own: undefined });
    expect((r.input.sections as { id: string }[]).map((x) => x.id)).toEqual(savedRows.map((x) => x.id));
    expect(r.input.blocks).toMatchObject([
      { id: 'old001', on: true },
      { id: 'new001', on: false },
      { id: 'new002', on: false },
    ]);
    expect(r.hidden).toBe(1);
    // a saved section that no longer fits (or is another scope's) stays as it is now
    const odd = layoutRestoreInput({ sections: savedRows, blocks: [{ ...block('old001'), type: 'gone' }, block('cat001', true, { page: 'category', cat: 'polo' })], own: null }, view({ blocks: [block('old001', false)] }));
    expect(odd.input.blocks).toEqual([block('old001', false)]);
  });

  it('fills a missing page section in, keeps a locked one on, and keeps one category’s switch', () => {
    const cat = view({ page: 'category', cat: 'polo', rows: defaultLayout('category'), own: false });
    const r = layoutRestoreInput({ sections: [], blocks: [], own: true }, cat);
    expect((r.input.sections as unknown[]).length).toBe(defaultLayout('category').length);
    expect(r.input.own).toBe(true);
    expect(layoutRestoreInput({ sections: 'x', blocks: 'y' }, cat).input).toMatchObject({ sections: cat.rows, blocks: [], own: false });
  });

  it('brings the side canvas back; zones made since stay, switched off; a canvas that no longer fits stays as it is now', () => {
    const now: SideView = { canvas: { enabled: true, gap: 16, float: 40, minWidth: 1280 }, zones: [zone('aaa001'), zone('bbb002')], version: 'v-side' };
    const r = sideRestoreInput({ canvas: { enabled: false, gap: 16, float: 40, minWidth: 1280 }, zones: [zone('aaa001', false)] }, now);
    expect(r.input).toMatchObject({ canvas: { enabled: false }, version: 'v-side', zones: [{ id: 'aaa001', on: false }, { id: 'bbb002', on: false }] });
    expect(r.hidden).toBe(1);
    expect(sideRestoreInput({ canvas: { enabled: false, minWidth: 5 }, zones: [] }, now).input.canvas).toEqual(now.canvas);
  });
});
