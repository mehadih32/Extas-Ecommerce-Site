// PR 12 (CN-025, CN-026 (b)) — the look registry's rules without a database: which design a page is drawn in, the
// person's saved choices, the date choice, the drawing arithmetic, the To-do drawer's grouping and the registry itself.
import { describe, expect, it } from 'vitest';
import { adminLookSettings } from '@extas/settings';
import { LOOK_PAGES, lookCatalog, lookPage } from '@/components/admin/look/registry';
import { previewHref } from '@/components/admin/look/types';
import { groupTodo, hotOf, pruneLater, splitLater, todoGroupOf } from '../admin-shell/todo';
import { change, funnelShares, heatAlpha, heatPeak, niceScale, rate, smoothPath, sparkPath, ticksOf, trailingAverage, windows, xLabelsAt } from './chart';
import { DASH_PARTS, mayRead, PART_KEYS } from './dashboard-data';
import { guideModeOf, pickDesign, readPrefs, teamDesign, withGuide, withLook } from './pick';
import { chartWindow, rangeFrom, rangeHref, shiftDay, spanDays } from './range';

const TEAM = { pages: {}, perPerson: true };

describe('which design a page is drawn in', () => {
  const keys = ['A', 'B', 'C'];
  it('goes preview → the person’s own → the team’s → the standard → the first', () => {
    expect(pickDesign(keys, 'B', { preview: 'C', mine: 'A', team: { pages: { dashboard: 'A' }, perPerson: true }, page: 'dashboard' })).toEqual({ key: 'C', from: 'preview' });
    expect(pickDesign(keys, 'B', { mine: 'A', team: { pages: { dashboard: 'C' }, perPerson: true }, page: 'dashboard' })).toEqual({ key: 'A', from: 'mine' });
    expect(pickDesign(keys, 'B', { mine: 'A', team: { pages: { dashboard: 'C' }, perPerson: false }, page: 'dashboard' })).toEqual({ key: 'C', from: 'team' });
    expect(pickDesign(keys, 'B', { team: TEAM, page: 'dashboard' })).toEqual({ key: 'B', from: 'standard' });
    expect(pickDesign(['A'], 'B', { team: TEAM, page: 'orders' })).toEqual({ key: 'A', from: 'standard' });
  });
  it('skips a key the page does not have at every step, so a removed design never leaves a page blank', () => {
    expect(pickDesign(keys, 'B', { preview: 'Z', mine: 'Y', team: { pages: { dashboard: 'X' }, perPerson: true }, page: 'dashboard' })).toEqual({ key: 'B', from: 'standard' });
  });
  it('marks the team default without the person’s own choice', () => {
    expect(teamDesign(keys, 'B', { pages: { dashboard: 'C' }, perPerson: true }, 'dashboard')).toBe('C');
    expect(teamDesign(keys, 'B', TEAM, 'dashboard')).toBe('B');
  });
});

describe('the person’s own choices (StaffUser.adminPrefs)', () => {
  it('reads what is good and drops the rest', () => {
    expect(readPrefs(null)).toEqual({ look: {} });
    expect(readPrefs('nonsense')).toEqual({ look: {} });
    expect(readPrefs({ look: { dashboard: 'C' }, guide: 'popup' })).toEqual({ look: { dashboard: 'C' }, guide: 'popup' });
    expect(readPrefs({ look: { dashboard: 'cc' } })).toEqual({ look: {} });
    expect(readPrefs({ guide: 'window' })).toEqual({ look: {} });
  });
  it('sets and clears a page’s design and the guide', () => {
    const p = withLook({ look: { orders: 'A' } }, 'dashboard', 'C');
    expect(p.look).toEqual({ orders: 'A', dashboard: 'C' });
    expect(withLook(p, 'dashboard', null).look).toEqual({ orders: 'A' });
    expect(withGuide(p, 'page')).toEqual({ look: p.look, guide: 'page' });
    expect(withGuide({ look: {}, guide: 'page' }, null)).toEqual({ look: {} });
  });
  it('opens the guide the person’s way only while the team allows it (CN-026 (b))', () => {
    expect(guideModeOf({ desktop: 'panel', perPerson: true }, { look: {}, guide: 'popup' })).toBe('popup');
    expect(guideModeOf({ desktop: 'panel', perPerson: false }, { look: {}, guide: 'popup' })).toBe('panel');
    expect(guideModeOf({ desktop: 'page', perPerson: true }, { look: {} })).toBe('page');
  });
});

describe('the date choice', () => {
  const ranges = [1, 7, 30];
  it('takes a preset, else the first', () => {
    expect(rangeFrom({ range: '7' }, ranges, '2026-10-24', 366)).toEqual({ kind: 'preset', days: 7, from: '2026-10-18', to: '2026-10-24', prev: { from: '2026-10-11', to: '2026-10-17' } });
    expect(rangeFrom({ range: '9' }, ranges, '2026-10-24', 366).days).toBe(1);
    expect(rangeFrom({}, ranges, '2026-10-24', 366)).toMatchObject({ kind: 'preset', days: 1, from: '2026-10-24', prev: { from: '2026-10-23', to: '2026-10-23' } });
  });
  it('takes two good dates of the person’s own: not after today, at most the setting’s days', () => {
    expect(rangeFrom({ from: '2026-09-01', to: '2026-09-30' }, ranges, '2026-10-24', 366)).toEqual({ kind: 'custom', days: 30, from: '2026-09-01', to: '2026-09-30', prev: { from: '2026-08-02', to: '2026-08-31' } });
    expect(rangeFrom({ from: '2026-10-01', to: '2026-10-30' }, ranges, '2026-10-24', 366).kind).toBe('preset');
    expect(rangeFrom({ from: '2026-09-30', to: '2026-09-01' }, ranges, '2026-10-24', 366).kind).toBe('preset');
    expect(rangeFrom({ from: '2026-01-01', to: '2026-09-30' }, ranges, '2026-10-24', 30).kind).toBe('preset');
    expect(rangeFrom({ from: '2026-02-30', to: '2026-03-02' }, ranges, '2026-10-24', 366).kind).toBe('preset');
  });
  it('counts calendar days across months and leap years', () => {
    expect(shiftDay('2028-02-28', 1)).toBe('2028-02-29');
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
    expect(spanDays('2026-10-01', '2026-10-01')).toBe(1);
    expect(spanDays('2026-12-25', '2027-01-03')).toBe(10);
  });
  it('stretches the chart back to the minimum days, and keeps the choice in the address', () => {
    const r = rangeFrom({ range: '1' }, ranges, '2026-10-24', 366);
    expect(chartWindow(r, 14)).toEqual({ from: '2026-10-11', to: '2026-10-24', days: 14, prev: { from: '2026-09-27', to: '2026-10-10' } });
    expect(rangeHref({ kind: 'preset', days: 7 })).toBe('/admin?home=1&range=7');
    expect(rangeHref({ kind: 'custom', from: '2026-09-01', to: '2026-09-30' }, 'C')).toBe('/admin?home=1&from=2026-09-01&to=2026-09-30&design=C');
  });
});

describe('the drawing arithmetic', () => {
  it('rounds an axis and lists its lines', () => {
    expect(niceScale(0)).toEqual({ max: 1, step: 1 });
    expect(niceScale(870)).toEqual({ max: 1000, step: 500 });
    expect(ticksOf(niceScale(870))).toEqual([0, 500, 1000]);
    expect(niceScale(61, 3)).toEqual({ max: 75, step: 25 });
  });
  it('smooths over the trailing days and places the x labels', () => {
    expect(trailingAverage([3, 6, 9, 0], 3)).toEqual([3, 5, 6, 5]);
    expect(trailingAverage([3, 6], 1)).toEqual([3, 6]);
    // a jump after flat days: no control point below the flat line (y 100) or above the peak (y 0)
    const ys = [...smoothPath([[0, 100], [1, 100], [2, 100], [3, 0]]).matchAll(/-?\d+\.\d/g)].map((m) => Number(m[0])).filter((_, j) => j % 2 === 1);
    expect(Math.max(...ys)).toBeLessThanOrEqual(100);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(xLabelsAt(14).map((x) => x.i)).toEqual([0, 3, 6, 9, 13]);
    expect(xLabelsAt(30).map((x) => x.i)).toEqual([0, 5, 10, 15, 20, 29]);
    expect(xLabelsAt(1)).toEqual([{ i: 0, left: 50, end: false }]);
  });
  it('compares, rates and shares without dividing by nothing', () => {
    expect(change(150, 100)).toBe(0.5);
    expect(change(5, 0)).toBeNull();
    expect(change(null, 10)).toBeNull();
    expect(rate(3, 4)).toBe(0.75);
    expect(rate(0, 0)).toBeNull();
    expect(funnelShares([10, 8, 0, 0])).toEqual([null, 80, 0, 0]);
  });
  it('finds the busiest heat cell and shades it', () => {
    expect(heatPeak([[0, 0], [0, 0]])).toBeNull();
    expect(heatPeak([[1, 4], [2, 0]])).toEqual({ row: 0, col: 1, v: 4 });
    expect(heatAlpha(0, 4)).toBe(0);
    expect(heatAlpha(4, 4)).toBe(0.95);
    expect(heatAlpha(2, 4)).toBe(0.53);
  });
  it('cuts week windows from the end and draws a spark line', () => {
    expect(windows([1, 2, 3, 4, 5, 6, 7], 3, (w) => w.join(''))).toEqual(['234', '567']);
    const s = sparkPath([1], 100, 30);
    expect(s.d.startsWith('M')).toBe(true);
    expect(s.last).toEqual([98, 27]);
  });
});

describe('the To-do drawer (V12.4)', () => {
  const items = [
    { id: 'jobsDead', group: todoGroupOf({ section: 'reports' }) },
    { id: 'ordersCancelRequests', group: todoGroupOf({ group: 'urgent', section: 'orders' }) },
    { id: 'ordersConfirm', group: todoGroupOf({ section: 'orders' }) },
    { id: 'lowStock', group: todoGroupOf({ group: 'stock', section: 'products' }) },
  ];
  it('puts the lists under their headings, urgent first, and marks the one to start with', () => {
    const g = groupTodo(items);
    expect(g.map((x) => x.group)).toEqual(['urgent', 'orders', 'stock', 'system']);
    expect(hotOf(g)).toBe('ordersConfirm');
    expect(hotOf(groupTodo([items[1]!]))).toBeNull();
  });
  it('puts a list aside until its time, and forgets the marks that ran out', () => {
    const s = splitLater(items, { ordersConfirm: 2_000, lowStock: 500 }, 1_000);
    expect(s.later.map((x) => x.id)).toEqual(['ordersConfirm']);
    expect(s.open.map((x) => x.id)).toEqual(['jobsDead', 'ordersCancelRequests', 'lowStock']);
    expect(pruneLater({ a: 2_000, b: 500, c: Number.NaN }, 1_000)).toEqual({ a: 2_000 });
  });
});

describe('the look registry', () => {
  it('lists each page once, with unique one-letter keys and its standard among them', () => {
    expect(new Set(LOOK_PAGES.map((p) => p.id)).size).toBe(LOOK_PAGES.length);
    for (const p of LOOK_PAGES) {
      const keys = p.designs.map((d) => d.key);
      expect(new Set(keys).size).toBe(keys.length);
      for (const k of keys) expect(k).toMatch(/^[A-Z]$/);
      expect(keys).toContain(p.standard);
      for (const d of p.designs) {
        expect(d.name.en && d.name.bn && d.desc.en && d.desc.bn).toBeTruthy();
        expect(typeof d.Thumb).toBe('function');
      }
    }
  });
  it('has the V12.4 Dashboard default as its one design for launch (CN-027), drawing only loader parts', () => {
    const d = lookPage('dashboard')!;
    expect(d.designs.map((x) => x.key)).toEqual(['A']);
    expect(d.standard).toBe('A');
    for (const x of d.designs) {
      expect(x.Render).toBeTypeOf('function');
      for (const part of x.parts) expect(DASH_PARTS).toContain(part);
    }
    expect(lookCatalog()).toMatchObject({ dashboard: ['A'], orders: ['A'], products: ['A'] });
    expect(previewHref(d, 'A')).toBe('/admin?home=1&design=A');
    expect(previewHref(lookPage('orders')!, 'A')).toBe('/admin/orders?design=A');
  });
  it('reads a part only for someone holding one of its keys', () => {
    const v = (perms: string[]) => ({ perms: new Set(perms), owner: false });
    expect(mayRead('money', v(['orders.read']))).toBe(false);
    expect(mayRead('money', v(['metrics.read']))).toBe(true);
    expect(mayRead('delivery', v(['delivery.read']))).toBe(true);
    expect(mayRead('queues', v([]))).toBe(true);
    expect(mayRead('lowStock', { perms: new Set(), owner: true })).toBe(true);
    expect(Object.keys(PART_KEYS).sort()).toEqual([...DASH_PARTS].sort());
  });
  it('ships the team default off nothing: the standard design, a personal choice allowed, the guide as a panel', () => {
    expect(adminLookSettings['admin.look'].default).toEqual({ pages: {}, perPerson: true });
    expect(adminLookSettings['admin.guideOpens'].default).toEqual({ desktop: 'panel', phone: 'sheet', perPerson: true });
  });
});
