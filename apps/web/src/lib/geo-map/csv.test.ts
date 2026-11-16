// S29 · PR 752 — the Geography map's CSV without a database: no Sales column without the money permission, the earlier
// period's columns only with compare, the unknown / outside / total rows, formula-looking names made safe.
import { describe, expect, it } from 'vitest';
import type { GeoAreaFigures, GeoAreaRow, GeoByArea } from '@extas/metrics/geo-types';
import { geoMapCsv, geoMapFileName, ratePct } from './csv';

const fig = (o: Partial<GeoAreaFigures> = {}): GeoAreaFigures => ({ orders: 0, delivered: 0, salesMinor: 0, pieces: 0, returned: 0, returnRate: null, ...o });
const row = (name: string, current: GeoAreaFigures, previous: GeoAreaFigures | null = null): GeoAreaRow => ({
  areaId: `id-${name}`,
  code: `bd.${name.toLowerCase()}`,
  level: 'district',
  nameEn: name,
  nameBn: null,
  parentAreaId: null,
  parentNameEn: 'Dhaka',
  parentNameBn: null,
  lat: null,
  lng: null,
  current,
  previous,
  delta: null,
  topCategory: { categoryId: 'c', nameEn: 'Polo, shirts', nameBn: null, pieces: 3 },
  belowMinOrders: false,
});
const data = (over: Partial<GeoByArea> = {}, level: 'district' | 'area' = 'district'): GeoByArea => ({
  query: { level, parentAreaId: null, days: { from: '2026-10-01', to: '2026-10-31' }, compare: 'off', compareDays: null },
  rows: [row('Gazipur', fig({ orders: 10, delivered: 8, salesMinor: 120_000, pieces: 9, returned: 1, returnRate: 1 / 9 }))],
  unknown: fig({ orders: 2 }),
  outside: fig({ orders: 4, delivered: 3, salesMinor: 50_000 }),
  total: fig({ orders: 16, delivered: 11, salesMinor: 170_000, pieces: 12, returned: 1, returnRate: 1 / 12 }),
  totalPrevious: null,
  unknownShare: 0.125,
  ...over,
});

describe('the Geography map CSV', () => {
  it('lists the figures, the unknown and the total; the rate in per cent; a comma in a name quoted', () => {
    const lines = geoMapCsv(data(), 'BDT', true).trimEnd().split('\r\n');
    expect(lines[0]).toBe('code,area,parent,level,orders,deliveredOrders,salesMinor,pieces,returnedOrders,returnRatePct,topCategory,currency');
    expect(lines[1]).toBe('bd.gazipur,Gazipur,Dhaka,district,10,8,120000,9,1,11.1,"Polo, shirts",BDT');
    expect(lines[2]).toBe(',(area not known),,district,2,0,0,0,0,,,BDT');
    expect(lines[lines.length - 1]).toBe(',(total),,district,16,11,170000,12,1,8.3,,BDT');
    expect(lines).toHaveLength(4);
  });

  it('has no Sales column and no Sales number without the money permission', () => {
    const noMoney = data({ rows: [row('Gazipur', fig({ orders: 10, delivered: 8, salesMinor: null }))], unknown: fig({ salesMinor: null }), total: fig({ orders: 10, salesMinor: null }) });
    const text = geoMapCsv(noMoney, 'BDT', false);
    expect(text.split('\r\n')[0]).toBe('code,area,parent,level,orders,deliveredOrders,pieces,returnedOrders,returnRatePct,topCategory,currency');
    expect(text).not.toMatch(/sales/i);
  });

  it('adds the earlier period beside each row (zero for an area with none) and the total, and none for unknown', () => {
    const d = data({
      query: { level: 'district', parentAreaId: null, days: { from: '2026-10-01', to: '2026-10-31' }, compare: 'previous', compareDays: { from: '2026-09-01', to: '2026-09-30' } },
      rows: [row('Gazipur', fig({ orders: 10 }), fig({ orders: 4, delivered: 3, salesMinor: 9_000 })), row('Bogura', fig({ orders: 1 }), null)],
      totalPrevious: fig({ orders: 4, delivered: 3, salesMinor: 9_000 }),
    });
    const lines = geoMapCsv(d, 'BDT', true).trimEnd().split('\r\n');
    expect(lines[0]).toContain('earlierOrders,earlierDeliveredOrders,earlierSalesMinor,earlierPieces,earlierReturnedOrders,earlierReturnRatePct,currency');
    expect(lines[1]).toMatch(/,4,3,9000,0,0,,BDT$/);
    expect(lines[2]).toMatch(/,0,0,0,0,0,,BDT$/);
    expect(lines[3]).toMatch(/,,,,,,,BDT$/); // unknown: no earlier figures of its own
    expect(lines[4]).toMatch(/,4,3,9000,0,0,,BDT$/);
  });

  it('counts the outside of Dhaka City at the area level only', () => {
    expect(geoMapCsv(data({}, 'area'), 'BDT', true)).toContain('(outside Dhaka City)');
    expect(geoMapCsv(data(), 'BDT', true)).not.toContain('(outside Dhaka City)');
  });

  it('makes a name that looks like a formula safe', () => {
    const d = data({ rows: [row('=HYPERLINK("x")', fig())] });
    expect(geoMapCsv(d, 'BDT', true)).toContain(`"'=HYPERLINK(""x"")"`);
  });

  it('names the file by level and days; rates are per cent with one decimal', () => {
    expect(geoMapFileName(data())).toBe('geography-district-2026-10-01-2026-10-31.csv');
    expect(ratePct(0.1234)).toBe(12.3);
    expect(ratePct(null)).toBeNull();
  });
});
