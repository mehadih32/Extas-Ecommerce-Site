// S29 · PR 754 — the click panel of the Geography map as it is drawn: the five lines, the earlier column and the change
// only while compare is on, the top products in the order given, loading and failure said in words, the Orders link
// carrying the area and the days, "Go deeper" gone at the deepest level, money off when it must be, and the words files.
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { GeoAreaFigures, GeoAreaRow } from '@extas/metrics';
import { panelModel, panelProducts } from '@/lib/geo-map/panel';
import { geoPanelLabels, withGeoPanel } from '@/lib/geo-map/words';
import type { AdminView } from '@/lib/admin-page';
import bn from '../../../../messages/admin-geo-panel.bn.json';
import en from '../../../../messages/admin-geo-panel.en.json';
import { GeoPanelView, type GeoPanelFormat } from './GeoPanel';

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => createElement('a', { href, ...rest }, children) }));

const view = (lang: 'en' | 'bn') => withGeoPanel({ lang, dict: {} } as unknown as AdminView);
const fmt: GeoPanelFormat = { number: (n) => String(n), money: (m) => `Tk ${m / 100}`, name: (e, b) => b ?? e };
const figs = (o: Partial<GeoAreaFigures> = {}): GeoAreaFigures => ({ orders: 128, delivered: 96, salesMinor: 342000_00, pieces: 150, returned: 14, returnRate: 14 / 110, ...o });
const row = (o: Partial<GeoAreaRow> = {}): GeoAreaRow => ({
  areaId: '0195f0a2-7c1e-7a55-9b6e-0e6f6d0c1a2b', code: 'bd.x', level: 'upazila', nameEn: 'Gabtali', nameBn: null, parentAreaId: null, parentNameEn: 'Dhaka', parentNameBn: null,
  lat: null, lng: null, current: figs(), previous: null, delta: null, topCategory: { categoryId: 'c', nameEn: 'Polo shirts', nameBn: null, pieces: 40 }, belowMinOrders: false, ...o,
});
const days = { from: '2026-11-01', to: '2026-11-15' };
const products = [
  { productId: 'p1', nameEn: 'Black Polo', nameBn: null, pieces: 31, salesMinor: 93000_00 },
  { productId: 'p2', nameEn: 'White Tee', nameBn: null, pieces: 22, salesMinor: 33000_00 },
];

function draw(o: { row?: GeoAreaRow; compare?: boolean; moneyHidden?: boolean; state?: Parameters<typeof GeoPanelView>[0]['products']; lang?: 'en' | 'bn' } = {}) {
  const r = o.row ?? row();
  const moneyHidden = o.moneyHidden ?? false;
  const model = panelModel(r, { days, compare: o.compare ?? false, moneyHidden, warnReturnPct: 20 });
  return renderToStaticMarkup(
    <GeoPanelView
      model={model}
      name="Gabtali"
      parent="Dhaka"
      compared={o.compare ? { from: '2026-10-17', to: '2026-10-31' } : null}
      products={o.state ?? { state: 'ready', items: panelProducts(products, 5, moneyHidden), categoryName: 'Polo shirts' }}
      labels={geoPanelLabels(view(o.lang ?? 'en'))}
      fmt={fmt}
      topN={5}
      onRetry={() => {}}
      onClose={() => {}}
      onDeeper={() => {}}
      moneyHidden={moneyHidden}
      minOrders={5}
      warnReturnPct={20}
    />,
  );
}

describe('GeoPanelView', () => {
  it('shows the five figures, the top category and the top products in order', () => {
    const h = draw();
    for (const k of ['orders', 'sales', 'delivered', 'returned', 'returnRate']) expect(h).toContain(`data-fig="${k}"`);
    expect(h).toContain('Polo shirts');
    expect(h.indexOf('Black Polo')).toBeLessThan(h.indexOf('White Tee'));
    expect(h).toContain('31 pcs');
    expect(h).toContain('Tk 93000');
    expect(h).toContain('Top 5 products here');
    expect(h).not.toContain('Earlier');
  });
  it('has no earlier or change column while compare is off, and both when it is on', () => {
    expect(draw()).not.toContain('Compared with');
    const on = draw({ compare: true, row: row({ previous: figs({ orders: 100 }), delta: { orders: 28, delivered: 0, salesMinor: 0, returned: 0, returnRate: 0 } }) });
    expect(on).toContain('Compared with 2026-10-17 to 2026-10-31');
    expect(on).toContain('Earlier');
    expect(on).toContain('+28');
    expect(on).toContain('(+28.0%)');
  });
  it('writes the sign out, so the colour is never the only sign', () => {
    const on = draw({ compare: true, row: row({ previous: figs({ returned: 20 }) }) });
    expect(on).toContain('−6');
    expect(on).toContain('Down');
  });
  it('says "too few orders" and a high return rate in words, and still gives the numbers', () => {
    const h = draw({ row: row({ belowMinOrders: true, current: figs({ returnRate: 0.4 }) }) });
    expect(h).toContain('Fewer than 5 orders here');
    expect(h).toContain('at or above your warning line (20%)');
    expect(h).toContain('>128<');
  });
  it('says loading and failure in words, with a retry', () => {
    expect(draw({ state: { state: 'loading' } })).toContain('Loading the top products');
    const f = draw({ state: { state: 'error' } });
    expect(f).toContain('could not be loaded');
    expect(f).toContain('Try again');
    expect(draw({ state: { state: 'ready', items: [], categoryName: null } })).toContain('No delivered orders here in this period.');
  });
  it('the Orders link carries the area and the days; Go deeper stops at the deepest level', () => {
    const h = draw();
    expect(h).toContain('href="/admin/orders?area=0195f0a2-7c1e-7a55-9b6e-0e6f6d0c1a2b&amp;from=2026-11-01&amp;to=2026-11-15"');
    expect(h).toContain('Go deeper: areas');
    expect(draw({ row: row({ level: 'area' }) })).not.toContain('Go deeper');
  });
  it('leaves money out when the viewer may not see it', () => {
    const h = draw({ moneyHidden: true, row: row({ current: figs({ salesMinor: null }) }) });
    expect(h).not.toContain('data-fig="sales"');
    expect(h).not.toContain('Tk ');
    expect(h).toContain('cannot see money figures');
  });
  it('says delivered and returned are counted on their own days', () => {
    expect(draw()).toContain('Delivered and Returned are counted on their own days');
  });
  it('draws in Bengali with the same structure', () => {
    const h = draw({ lang: 'bn' });
    expect(h).toContain('আরও নিচে: এলাকা');
    expect(h).toContain('এই অর্ডারগুলো খুলুন');
  });
});

describe('the panel words', () => {
  const keys = (o: unknown, p = ''): string[] => Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (typeof v === 'string' ? [p + k] : keys(v, `${p}${k}.`)));
  it('both languages carry the same keys', () => {
    expect(keys(bn).sort()).toEqual(keys(en).sort());
  });
  it('every key resolves to words (no key is shown as itself)', () => {
    const l = geoPanelLabels(view('en'));
    expect(JSON.stringify(l)).not.toContain('geoPanel.');
    expect(l.tooFew(7)).toContain('7');
    expect(l.deeper('areas')).toBe('Go deeper: areas');
    expect(Object.keys(l.fig).sort()).toEqual(['delivered', 'orders', 'returnRate', 'returned', 'sales']);
    expect(Object.keys(l.level).sort()).toEqual(['area', 'district', 'division', 'upazila']);
  });
  it('Bengali text uses Western digits', () => {
    expect(JSON.stringify(bn)).not.toMatch(/[০-৯]/);
  });
});
