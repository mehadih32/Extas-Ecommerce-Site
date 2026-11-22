// S29 · PR 753 — the screen's own rules (colour steps, grey cases, sort order, zoom), no browser and no database.
import { describe, expect, it } from 'vitest';
import type { GeoAreaFigures, GeoAreaRow } from '@extas/metrics/geo-types';
import { childLevel, fillClass, fitBox, maxOf, metricValue, pctText, rampStep, sortRows, zoomBox } from './model';

const fig = (o: Partial<GeoAreaFigures> = {}): GeoAreaFigures => ({ orders: 0, delivered: 0, salesMinor: 0, pieces: 0, returned: 0, returnRate: null, ...o });
const row = (name: string, current: GeoAreaFigures, over: Partial<GeoAreaRow> = {}): GeoAreaRow => ({
  areaId: name,
  code: `bd.${name}`,
  level: 'district',
  nameEn: name,
  nameBn: null,
  parentAreaId: null,
  parentNameEn: null,
  parentNameBn: null,
  lat: null,
  lng: null,
  current,
  previous: null,
  delta: null,
  topCategory: null,
  belowMinOrders: false,
  ...over,
});

describe('the Geography map screen rules', () => {
  it('goes down one level at a time and stops at the areas', () => {
    expect(childLevel('division')).toBe('district');
    expect(childLevel('district')).toBe('upazila');
    expect(childLevel('upazila')).toBe('area');
    expect(childLevel('area')).toBeNull();
  });

  it('puts a value on a step between 0 and the largest; none for no value', () => {
    expect(rampStep(0, 100, 5)).toBe(0);
    expect(rampStep(100, 100, 5)).toBe(4);
    expect(rampStep(50, 100, 5)).toBe(2);
    expect(rampStep(null, 100, 5)).toBeNull();
    expect(rampStep(7, 0, 5)).toBe(0);
    expect(rampStep(500, 100, 5)).toBe(4);
  });

  it('greys an area with no row, below the minimum, or with no figure; else a step', () => {
    expect(fillClass(undefined, 'orders', 10, 5)).toBe('gm-none');
    expect(fillClass(row('a', fig({ orders: 9 }), { belowMinOrders: true }), 'orders', 10, 5)).toBe('gm-none');
    expect(fillClass(row('a', fig({ orders: 9 })), 'returnRate', 1, 5)).toBe('gm-none');
    expect(fillClass(row('a', fig({ orders: 10 })), 'orders', 10, 5)).toBe('gm-s4');
  });

  it('reads each figure; change needs the earlier period', () => {
    const f = fig({ orders: 12, delivered: 9, salesMinor: 5000, returned: 2, returnRate: 0.18 });
    expect(metricValue(f, 'sales')).toBe(5000);
    expect(metricValue(f, 'returnRate')).toBe(0.18);
    expect(metricValue(f, 'change')).toBeNull();
    expect(metricValue(f, 'change', fig({ orders: 6 }))).toBe(1);
    expect(metricValue(fig({ salesMinor: null }), 'sales')).toBeNull();
  });

  it('finds the largest among rows that count', () => {
    const rows = [row('a', fig({ orders: 3 })), row('b', fig({ orders: 9 })), row('c', fig({ orders: 90 }), { belowMinOrders: true })];
    expect(maxOf(rows, 'orders')).toBe(9);
  });

  it('sorts both ways with the missing figures last', () => {
    const rows = [row('b', fig({ salesMinor: 5 })), row('a', fig({ salesMinor: null })), row('c', fig({ salesMinor: 9 }))];
    expect(sortRows(rows, 'sales', 'desc').map((r) => r.nameEn)).toEqual(['c', 'b', 'a']);
    expect(sortRows(rows, 'sales', 'asc').map((r) => r.nameEn)).toEqual(['b', 'c', 'a']);
    expect(sortRows(rows, 'name', 'asc').map((r) => r.nameEn)).toEqual(['a', 'b', 'c']);
  });

  it('words a share and builds a viewBox', () => {
    expect(pctText(0.1234)).toBe('12.3%');
    expect(pctText(null)).toBe('—');
    expect(fitBox({ x: 10, y: 20, width: 100, height: 50 }, 0.1)).toBe('0 15 120 60');
    expect(zoomBox('0 0 100 80', 2)).toBe('25 20 50 40');
  });
});
