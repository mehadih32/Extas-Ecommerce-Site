// S29 · PR 758–760 — the table of the risk, money and stock, and demand and customers lenses: only the columns somebody has a
// figure for, flagged places first, "—" (never 0) for a part the role may not see, the total and the "No area" line.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { LensResult } from '@extas/metrics';
import { geoDict } from '@/lib/geo-map/dicts';
import { geoLensTableLabels } from '@/lib/geo-map/lenses-words';
import { GeoLensTable } from './GeoLensTable';

const labels = geoLensTableLabels({ dict: geoDict('en') }, 'risk');
const fmt = { number: (n: number) => String(n), money: (m: number) => `T${m / 100}` };
const row = (id: string, nameEn: string, figures: Record<string, number | null>, flags: string[] = []) => ({ areaId: id, nameEn, nameBn: null, parentAreaId: null, parentNameEn: null, parentNameBn: null, figures, flags });
const data: Pick<LensResult, 'rows' | 'total' | 'unknown' | 'outside' | 'hidden'> = {
  rows: [row('a', 'Dhaka', { delivered: 30, returned: 3, returnRate: 0.09, claims: null }), row('b', 'Bogura', { delivered: 8, returned: 4, returnRate: 0.3333, claims: null }, ['returnHotspot'])],
  total: { delivered: 38, returned: 7, returnRate: 0.1556, claims: null },
  unknown: { delivered: 2, returned: 0, returnRate: 0, claims: null },
  outside: { delivered: 0, returned: 0, returnRate: null, claims: null },
  hidden: ['claims'],
};
const html = renderToStaticMarkup(<GeoLensTable lens="risk" data={data} labels={labels} fmt={fmt} nameOf={(r) => r.nameEn} />);

describe('GeoLensTable', () => {
  it('draws the columns that have figures and leaves out the one the role cannot read', () => {
    expect(html).toContain('Return rate');
    expect(html).not.toContain('Claims');
    expect(html).toContain('data-testid="geo-lens-hidden"');
  });
  it('puts the flagged place first and names the flag', () => {
    expect(html.indexOf('Bogura')).toBeLessThan(html.indexOf('Dhaka'));
    expect(html).toContain('data-flag="returnHotspot"');
    expect(html).toContain('Return hotspot');
  });
  it('writes shares as per cent, the total, and the no-area line only when it has orders', () => {
    expect(html).toContain('33.3%');
    expect(html).toContain('Total');
    expect(html).toContain('No area');
    expect(html).not.toContain('Outside Dhaka City');
  });
  it('says so when there is nothing', () => {
    const empty = renderToStaticMarkup(<GeoLensTable lens="risk" data={{ ...data, rows: [] }} labels={labels} fmt={fmt} nameOf={(r) => r.nameEn} />);
    expect(empty).toContain('geo-lens-none');
  });
});
