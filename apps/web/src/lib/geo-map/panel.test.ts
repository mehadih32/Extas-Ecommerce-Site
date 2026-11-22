// S29 · PR 754 — the click panel of the Geography map, without a database.
import { describe, expect, it } from 'vitest';
import type { GeoAreaFigures, GeoAreaRow } from '@extas/metrics';
import { DEEPER, SHALLOWER, formatDiff, formatFigure, ordersHref, panelLines, panelModel, panelProducts } from './panel';

const figs = (o: Partial<GeoAreaFigures> = {}): GeoAreaFigures => ({ orders: 128, delivered: 96, salesMinor: 342000_00, pieces: 150, returned: 14, returnRate: 14 / 110, ...o });
const fmt = { number: (n: number) => String(n), money: (m: number) => `Tk ${m / 100}` };
const row = (o: Partial<GeoAreaRow> = {}): GeoAreaRow => ({
  areaId: '0195f0a2-7c1e-7a55-9b6e-0e6f6d0c1a2b',
  code: 'bd.dhaka.dhaka.gabtali',
  level: 'upazila',
  nameEn: 'Gabtali',
  nameBn: null,
  parentAreaId: null,
  parentNameEn: 'Dhaka',
  parentNameBn: null,
  lat: null,
  lng: null,
  current: figs(),
  previous: null,
  delta: null,
  topCategory: null,
  belowMinOrders: false,
  ...o,
});

describe('panelLines', () => {
  it('has the five lines of the plan in order, with no earlier column while compare is off', () => {
    const lines = panelLines(figs(), null, { compare: false, moneyHidden: false });
    expect(lines.map((l) => l.key)).toEqual(['orders', 'sales', 'delivered', 'returned', 'returnRate']);
    expect(lines.every((l) => l.before === null && l.diff === null && l.tone === 0)).toBe(true);
  });
  it('drops the money line, and only it, when the viewer may not see money', () => {
    const lines = panelLines(figs({ salesMinor: null }), null, { compare: false, moneyHidden: true });
    expect(lines.map((l) => l.key)).toEqual(['orders', 'delivered', 'returned', 'returnRate']);
  });
  it('gives the earlier figure and the difference; more returns is bad news, more orders good', () => {
    const lines = panelLines(figs(), figs({ orders: 100, returned: 9, returnRate: 0.09, salesMinor: 400000_00 }), { compare: true, moneyHidden: false });
    const by = Object.fromEntries(lines.map((l) => [l.key, l]));
    expect(by.orders).toMatchObject({ now: 128, before: 100, diff: 28, tone: 1 });
    expect(by.orders!.percent).toBeCloseTo(28);
    expect(by.sales).toMatchObject({ diff: 342000_00 - 400000_00, tone: -1 });
    expect(by.returned).toMatchObject({ diff: 5, tone: -1 });
    expect(by.returnRate!.diff).toBeCloseTo(14 / 110 - 0.09);
    expect(by.returnRate!.percent).toBeNull();
    expect(by.returnRate!.tone).toBe(-1);
  });
  it('an area with no figure in the earlier period counts as zero there', () => {
    const lines = panelLines(figs(), null, { compare: true, moneyHidden: false });
    expect(lines.find((l) => l.key === 'orders')).toMatchObject({ before: 0, diff: 128, percent: null });
    expect(lines.find((l) => l.key === 'returnRate')).toMatchObject({ before: null, diff: null });
  });
});

describe('panelProducts', () => {
  const list = [1, 2, 3, 4, 5, 6, 7].map((i) => ({ productId: `p${i}`, nameEn: `P${i}`, nameBn: null, pieces: 10 - i, salesMinor: i * 100 }));
  it('keeps the order, takes at most the setting, and hides money when it must', () => {
    expect(panelProducts(list, 5, false).map((p) => p.productId)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
    expect(panelProducts(list, 0, false)).toEqual([]);
    expect(panelProducts(list, 3, true).every((p) => p.salesMinor === null)).toBe(true);
    expect(panelProducts(list, 3, false)[0]!.salesMinor).toBe(100);
  });
});

describe('the links and levels', () => {
  it('the Orders list opens on the area and the days of the map', () => {
    expect(ordersHref('A1', { from: '2026-11-01', to: '2026-11-15' })).toBe('/admin/orders?area=A1&from=2026-11-01&to=2026-11-15');
  });
  it('Go deeper runs division, district, upazila, area, then stops', () => {
    expect(DEEPER.division).toBe('district');
    expect(DEEPER.district).toBe('upazila');
    expect(DEEPER.upazila).toBe('area');
    expect(DEEPER.area).toBeNull();
    expect(SHALLOWER.area).toBe('upazila');
    expect(SHALLOWER.division).toBeNull();
  });
});

describe('panelModel', () => {
  const days = { from: '2026-11-01', to: '2026-11-15' };
  it('says "too few orders" and still gives the numbers', () => {
    const m = panelModel(row({ belowMinOrders: true }), { days, compare: false, moneyHidden: false, warnReturnPct: 20 });
    expect(m.tooFew).toBe(true);
    expect(m.lines.find((l) => l.key === 'orders')!.now).toBe(128);
    expect(m.deeper).toBe('area');
    expect(m.ordersHref).toContain('area=0195f0a2');
  });
  it('warns at or above the owners return line, never below, never without a rate', () => {
    expect(panelModel(row({ current: figs({ returnRate: 0.2 }) }), { days, compare: false, moneyHidden: false, warnReturnPct: 20 }).returnWarn).toBe(true);
    expect(panelModel(row({ current: figs({ returnRate: 0.19 }) }), { days, compare: false, moneyHidden: false, warnReturnPct: 20 }).returnWarn).toBe(false);
    expect(panelModel(row({ current: figs({ returnRate: null }) }), { days, compare: false, moneyHidden: false, warnReturnPct: 20 }).returnWarn).toBe(false);
  });
});

describe('formatting', () => {
  it('figures by kind, with a dash for not known', () => {
    expect(formatFigure('count', 12, fmt)).toBe('12');
    expect(formatFigure('money', 12345, fmt)).toBe('Tk 123.45');
    expect(formatFigure('rate', 0.1273, fmt)).toBe('12.7%');
    expect(formatFigure('rate', null, fmt)).toBe('—');
  });
  it('differences with a sign; a rate in points', () => {
    expect(formatDiff('count', 3, fmt, 'pts')).toBe('+3');
    expect(formatDiff('count', -3, fmt, 'pts')).toBe('−3');
    expect(formatDiff('count', 0, fmt, 'pts')).toBe('0');
    expect(formatDiff('rate', 0.036, fmt, 'pts')).toBe('+3.6 pts');
    expect(formatDiff('money', -5000, fmt, 'pts')).toBe('−Tk 50');
    expect(formatDiff('count', null, fmt, 'pts')).toBe('—');
  });
});
