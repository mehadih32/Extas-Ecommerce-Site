// S02 · PR 595 — the page layout builder's one list: the page's own sections with the owner's sections in between.
// No owner's section = today's page exactly; a section shows only when switched on and on its whole days; it keeps its
// place above an own section (or at the end) through a round trip; a category takes its own order only while on.
import { describe, expect, it } from 'vitest';
import { blockDefaults, HOME_SECTIONS, type CategoryOwn, type LayoutBlock } from '@extas/settings';
import { blocksOf, categoryRows, pageItems } from './blocks';
import { blockLive, blockState, flatten, unflatten } from './layout-flat';
import { defaultLayout, fullLayout } from './layouts';

const strip = (id: string, over: Partial<LayoutBlock> = {}): LayoutBlock =>
  ({ id, page: 'home', cat: null, name: id, on: true, dev: 'both', from: null, to: null, before: 'reviews', type: 'offerStrip', data: blockDefaults('offerStrip'), ...over }) as LayoutBlock;

const ids = (items: ReturnType<typeof pageItems>) => items.map((it) => (it.kind === 'sec' ? it.row.id : `+${it.block.id}`));

describe('page layout builder — the owner’s sections (PR 595)', () => {
  it('draws today’s home page exactly when the owner added nothing', () => {
    expect(ids(pageItems('home', defaultLayout('home'), [], '2026-11-06'))).toEqual([...HOME_SECTIONS]);
  });

  it('puts a section above the own section it names, the rest at the end, and only on its days', () => {
    const list = [strip('offer01'), strip('endaaa', { before: null }), strip('later1', { from: '2026-11-07' }), strip('gone01', { to: '2026-11-05' }), strip('hidden', { on: false })];
    const got = ids(pageItems('home', defaultLayout('home'), list, '2026-11-06'));
    expect(got.slice(got.indexOf('+offer01'), got.indexOf('+offer01') + 2)).toEqual(['+offer01', 'reviews']);
    expect(got.at(-1)).toBe('+endaaa');
    expect(got).not.toContain('+later1');
    expect(got).not.toContain('+gone01');
    expect(got).not.toContain('+hidden');
    expect(ids(pageItems('home', defaultLayout('home'), list, '2026-11-07'))).toContain('+later1');
  });

  it('keeps a section above a hidden own section where that section would be', () => {
    const rows = fullLayout('home', defaultLayout('home').map((r) => (r.id === 'reviews' ? { ...r, on: false } : r)));
    const got = ids(pageItems('home', rows, [strip('offer01')], '2026-11-06'));
    expect(got).not.toContain('reviews');
    expect(got[got.indexOf('+offer01') + 1]).toBe('journal');
  });

  it('round-trips the editor’s one list: a moved section takes the own section under it as its place', () => {
    const rows = defaultLayout('home');
    const flat = flatten(rows, [strip('a00001'), strip('b00001', { before: null })]);
    const back = unflatten(flat);
    expect(back.rows).toEqual(rows);
    expect(back.blocks.map((b) => [b.id, b.before])).toEqual([
      ['a00001', 'reviews'],
      ['b00001', null],
    ]);
    // move the end section to the very top: it now sits above the hero
    const moved = [flat.at(-1)!, ...flat.slice(0, -1)];
    expect(unflatten(moved).blocks.find((b) => b.id === 'b00001')!.before).toBe('hero');
  });

  it('gives a category page every category’s sections and its own, and its own order only while switched on', () => {
    const all = [strip('h00001'), strip('c00001', { page: 'category', before: 'info' }), strip('p00001', { page: 'category', cat: 'polo', before: 'info' }), strip('j00001', { page: 'category', cat: 'jeans', before: 'info' })];
    expect(blocksOf(all, 'home').map((b) => b.id)).toEqual(['h00001']);
    expect(blocksOf(all, 'category', 'polo').map((b) => b.id)).toEqual(['c00001', 'p00001']);
    const every = defaultLayout('category');
    const mine = [...every].reverse() as never as CategoryOwn[number]['rows'];
    expect(categoryRows([{ cat: 'polo', on: true, rows: mine }], 'polo', every)).toBe(mine);
    expect(categoryRows([{ cat: 'polo', on: false, rows: mine }], 'polo', every)).toBe(every);
    expect(categoryRows([{ cat: 'polo', on: true, rows: mine }], 'jeans', every)).toBe(every);
  });

  it('names a section’s state for the list', () => {
    const today = '2026-11-06';
    expect(blockState({ on: false, from: null, to: null }, today)).toBe('off');
    expect(blockState({ on: true, from: '2026-11-07', to: null }, today)).toBe('soon');
    expect(blockState({ on: true, from: null, to: '2026-11-05' }, today)).toBe('ended');
    expect(blockState({ on: true, from: today, to: today }, today)).toBe('live');
    expect(blockLive({ on: true, from: today, to: today }, today)).toBe(true);
  });
});
