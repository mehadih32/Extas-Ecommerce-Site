// S29 · PR 757 — the courier and coverage lens as drawn: flagged places first, the best courier named from the shop's own
// parcels, "not enough parcels" instead of a made-up rate, the gap list, nothing that changes a courier rule, and the words
// files match in both languages.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CourierLensResponse } from '@extas/metrics';
import type { AdminView } from '@/lib/admin-page';
import { geoLensLabels, withGeoLens } from '@/lib/geo-map/lens-words';
import bn from '../../../../messages/admin-geo-lens.bn.json';
import en from '../../../../messages/admin-geo-lens.en.json';
import { GeoCourierLens } from './GeoCourierLens';

const view = (lang: 'en' | 'bn' = 'en') => withGeoLens({ lang, dict: {} } as unknown as AdminView);
const th = { minParcels: 5, lowSuccessPct: 70, lateWarnPct: 30, gapLimit: 20 };
const data: CourierLensResponse = {
  lens: 'courier',
  level: 'district',
  rows: [
    { areaId: 'a1', figures: { orders: 10, parcels: 8, courierSuccessRate: 0.5, lateShare: 0.4, couriersUsed: 2 }, flags: ['lowSuccess', 'late'] },
    { areaId: 'a2', figures: { orders: 30, parcels: 20, courierSuccessRate: 0.9, lateShare: 0.1, couriersUsed: 1 }, flags: [] },
    { areaId: 'a3', figures: { orders: 2, parcels: 2, courierSuccessRate: null, lateShare: null, couriersUsed: 1 }, flags: ['tooFewParcels'] },
    { areaId: 'a4', figures: { orders: 4, parcels: 0, courierSuccessRate: null, lateShare: null, couriersUsed: 0 }, flags: [] },
  ],
  details: {
    a1: { mostUsedCourierId: 'c1', couriers: [], best: { courierId: 'c2', successRate: 0.8, parcels: 6 } },
    a2: { mostUsedCourierId: 'c1', couriers: [], best: null },
  },
  couriers: [
    { id: 'c1', name: 'Courier A' },
    { id: 'c2', name: 'Courier B' },
  ],
  gaps: [{ areaId: 'a5', level: 'UPAZILA', nameEn: 'Gabtali', nameBn: null, orders: 7 }],
  places: {},
  unknownOrders: 3,
  days: { from: '2026-10-10', to: '2026-10-12' },
  thresholds: th,
};
const names: Record<string, string> = { a1: 'Dhaka', a2: 'Chattogram', a3: 'Sylhet', a4: 'Barishal', a5: 'Gabtali' };
const fmt = { number: (n: number) => String(n), pct: (r: number) => `${Math.round(r * 100)}%` };
const draw = (d: CourierLensResponse = data, lang: 'en' | 'bn' = 'en') => renderToStaticMarkup(<GeoCourierLens data={d} labels={geoLensLabels(view(lang))} nameOf={(id) => names[id] ?? id} fmt={fmt} />);

describe('GeoCourierLens', () => {
  it('lists flagged places first, names the best courier and keeps unflagged places with parcels', () => {
    const h = draw();
    expect(h.indexOf('Dhaka')).toBeLessThan(h.indexOf('Chattogram'));
    expect(h).toContain('Courier B · 80%');
    expect(h).toContain('Most used: Courier A');
    expect(h).toContain('data-flag="lowSuccess"');
    expect(h).toContain('Low delivery rate');
    expect(h).toContain('Often late');
  });
  it('says "not enough parcels" instead of a rate, and drops a place with no parcels and no flag', () => {
    const h = draw();
    expect(h).toContain('Not enough parcels');
    expect(h).toContain('Sylhet');
    expect(h).not.toContain('Barishal');
  });
  it('names the gaps with their orders and the orders that have no area', () => {
    const h = draw();
    expect(h).toContain('data-testid="geo-gaps"');
    expect(h).toContain('Gabtali');
    expect(h).toContain('3 orders have no area');
  });
  it('shows the empty sentences when there is nothing', () => {
    const h = draw({ ...data, rows: [], gaps: [], unknownOrders: 0 });
    expect(h).toContain('geo-lens-none');
    expect(h).toContain('geo-gaps-none');
  });
  it('offers no button or form: it is advice only', () => {
    const h = draw();
    expect(h).not.toContain('<button');
    expect(h).not.toContain('<form');
  });
  it('speaks Bengali with Western digits', () => {
    const h = draw(data, 'bn');
    expect(h).toContain('কুরিয়ার আর কভারেজ');
    expect(h).toContain('3টা অর্ডারে এলাকা নেই');
  });
  it('has the same keys in both words files', () => {
    const keys = (o: Record<string, unknown>, p = ''): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v as Record<string, unknown>, `${p}${k}.`) : [`${p}${k}`]));
    expect(keys(bn)).toEqual(keys(en));
  });
});
