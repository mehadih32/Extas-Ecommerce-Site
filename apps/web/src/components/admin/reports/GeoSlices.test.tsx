// S29 · PR 756 — the slices of the Geography map as drawn: only the slices switched on show, the bar keeps the rest of the
// address and the screen's own category and product, "Orders by …" adds up to its Total with the unknowns apart and no
// money column without money rights, and the words files match.
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SLICE_DIMENSIONS, type SliceBreakdown } from '@extas/metrics';
import type { AdminView } from '@/lib/admin-page';
import { geoSliceTableLabels, geoSlicesLabels, sliceValueName, withGeoSlices } from '@/lib/geo-map/slices-words';
import bn from '../../../../messages/admin-geo-slices.bn.json';
import en from '../../../../messages/admin-geo-slices.en.json';
import { GeoSliceTable } from './GeoSliceTable';
import { GeoSlicesBar } from './GeoSlicesBar';

vi.mock('next/link', () => ({ default: ({ href, children, scroll: _s, ...rest }: { href: string; children: ReactNode; scroll?: boolean }) => createElement('a', { href, ...rest }, children) }));

const ID = '0195f0a2-7c1e-7a55-9b6e-0e6f6d0c1a2b';
const view = (lang: 'en' | 'bn' = 'en') => withGeoSlices({ lang, dict: {} } as unknown as AdminView);
const labels = geoSlicesLabels(view());
const draw = (o: { shown?: Parameters<typeof GeoSlicesBar>[0]['shown']; slices?: Parameters<typeof GeoSlicesBar>[0]['slices'] } = {}) =>
  renderToStaticMarkup(
    <GeoSlicesBar shown={o.shown ?? ['channel', 'paymentType', 'courierId', 'customerType']} slices={o.slices ?? {}} couriers={[{ id: ID, name: 'Courier A' }]} base={{ p: 'm', level: 'district', channel: 'OLD' }} path="/admin/reports/geo-map" labels={labels} />,
  );

describe('GeoSlicesBar', () => {
  it('draws only the slices that are switched on', () => {
    const all = draw();
    for (const n of ['channel', 'pay', 'courier', 'cust']) expect(all).toContain(`name="${n}"`);
    const some = draw({ shown: ['channel', 'customerType'] });
    expect(some).toContain('name="channel"');
    expect(some).toContain('name="cust"');
    expect(some).not.toContain('name="pay"');
    expect(some).not.toContain('name="courier"');
  });
  it('draws nothing when no order-level slice is on (category and product are the screen\'s own)', () => {
    expect(draw({ shown: [] })).toBe('');
    expect(draw({ shown: ['categoryId', 'productId'] })).toBe('');
  });
  it('keeps the rest of the address as hidden fields, replacing its own slice parts, and carries category and product', () => {
    const h = draw({ slices: { channel: 'PHONE', categoryId: ID } });
    expect(h).toContain('name="p" value="m"');
    expect(h).toContain('name="level" value="district"');
    expect(h).not.toContain('name="channel" value="OLD"');
    expect(h).toContain(`name="cat" value="${ID}"`);
  });
  it('marks the chosen values, names the options, and offers Clear only when a choice is set', () => {
    const h = draw({ slices: { channel: 'PHONE', paymentType: 'COD' } });
    expect(h).toContain('<option value="PHONE" selected="">Phone</option>');
    expect(h).toContain('<option value="COD" selected="">Cash on delivery</option>');
    expect(h).toContain('Filters (2)');
    expect(h).toContain('data-testid="geo-slices-clear"');
    expect(draw()).not.toContain('geo-slices-clear');
    expect(draw()).toContain('>Filters<');
  });
  it('Clear keeps the period and the screen\'s own category, drops the slices', () => {
    const h = draw({ slices: { channel: 'PHONE', categoryId: ID } });
    const href = /href="([^"]+)"[^>]*data-testid="geo-slices-clear"/.exec(h)?.[1]?.replace(/&amp;/g, '&') ?? '';
    expect(href).toContain('p=m');
    expect(href).toContain(`cat=${ID}`);
    expect(href).not.toContain('channel=');
  });
  it('says that filters narrow the orders and that unknowns are counted apart', () => {
    expect(draw()).toContain('counted apart, never dropped');
  });
});

describe('GeoSliceTable', () => {
  const data: SliceBreakdown = {
    dimension: 'channel',
    days: { from: '2026-11-01', to: '2026-11-15' },
    buckets: [
      { key: 'WEBSITE', orders: 6, delivered: 4, returned: 1, salesMinor: 40_000 },
      { key: 'PHONE', orders: 3, delivered: 2, returned: 0, salesMinor: 20_000 },
      { key: 'UNKNOWN', orders: 1, delivered: 1, returned: 0, salesMinor: 5_000 },
    ],
    total: { orders: 10, delivered: 7, returned: 1, salesMinor: 65_000 },
  };
  const fmt = { number: (n: number) => String(n), money: (m: number) => `Tk ${m / 100}` };
  const t = (d: SliceBreakdown) =>
    renderToStaticMarkup(<GeoSliceTable data={d} labels={geoSliceTableLabels(view())} valueName={(dim, k) => sliceValueName(view(), dim, k)} hrefFor={(dim) => `/x?by=${dim}`} fmt={fmt} />);
  it('lists each value with its words, the unknown apart, and a Total that is the parts added up', () => {
    const h = t(data);
    expect(h).toContain('Orders by channel');
    expect(h).toContain('>Website<');
    expect(h).toContain('>Phone<');
    expect(h).toContain('>Not known<');
    expect(h).toContain('data-testid="geo-slice-total"');
    expect(data.buckets.reduce((n, b) => n + b.orders, 0)).toBe(data.total.orders);
    expect(h).toMatch(/Total<\/th><td class="gst-n">10<\/td><td class="gst-n">7<\/td><td class="gst-n">1<\/td><td class="gst-n">Tk 650<\/td>/);
  });
  it('has a tab for every dimension, linking to it, the chosen one marked', () => {
    const h = t(data);
    for (const d of SLICE_DIMENSIONS) expect(h).toContain(`href="/x?by=${d}"`);
    expect(h).toMatch(/aria-current="true"[^>]*data-dimension="channel"|data-dimension="channel"[^>]*aria-current="true"/);
  });
  it('has no money column when the viewer may not see money', () => {
    const h = t({ ...data, buckets: data.buckets.map((b) => ({ ...b, salesMinor: null })), total: { ...data.total, salesMinor: null } });
    expect(h).not.toContain('>Sales<');
    expect(h).not.toContain('Tk ');
  });
  it('says so when there are no orders', () => {
    expect(t({ ...data, buckets: [], total: { orders: 0, delivered: 0, returned: 0, salesMinor: 0 } })).toContain('No orders in this period.');
  });
  it('names a courier from the screen\'s list, and shows the key when it has no name', () => {
    expect(sliceValueName(view(), 'courier', ID, new Map([[ID, 'Courier A']]))).toBe('Courier A');
    expect(sliceValueName(view(), 'courier', ID)).toBeNull();
    expect(sliceValueName(view(), 'customerType', 'REPEAT')).toBe('Repeat customers');
    expect(sliceValueName(view(), 'paymentType', 'OTHER')).toBe('Cash at the counter');
    expect(sliceValueName(view(), 'channel', 'FAX')).toBeNull();
  });
});

describe('the slices words', () => {
  const keys = (o: unknown, p = ''): string[] => Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (typeof v === 'string' ? [p + k] : keys(v, `${p}${k}.`)));
  it('both languages carry the same keys, in Western digits', () => {
    expect(keys(bn).sort()).toEqual(keys(en).sort());
    expect(JSON.stringify(bn)).not.toMatch(/[০-৯]/);
  });
  it('every channel has words in both languages', () => {
    for (const lang of ['en', 'bn'] as const) {
      const l = geoSlicesLabels(view(lang));
      expect(Object.keys(l.channel.names)).toHaveLength(10);
      expect(Object.values(l.channel.names).every((n) => n && !n.startsWith('geoSlices.'))).toBe(true);
    }
  });
});
