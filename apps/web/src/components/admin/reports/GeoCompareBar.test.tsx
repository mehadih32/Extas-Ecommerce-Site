// S29 · PR 754 — the Compare control of the Geography map: four choices as links that keep the rest of the address, the
// chosen one marked, the two day boxes only for "Own days", and the earlier days named while compare is on.
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { GeoCompare } from '@extas/metrics';
import type { AdminView } from '@/lib/admin-page';
import { geoCompareLabels, withGeoPanel } from '@/lib/geo-map/words';
import { GeoCompareBar } from './GeoCompareBar';

vi.mock('next/link', () => ({ default: ({ href, children, scroll: _scroll, ...rest }: { href: string; children: ReactNode; scroll?: boolean }) => createElement('a', { href, ...rest }, children) }));

const labels = geoCompareLabels(withGeoPanel({ lang: 'en', dict: {} } as unknown as AdminView));
const days = { from: '2026-11-01', to: '2026-11-15' };
const draw = (mode: GeoCompare, o: { custom?: { from: string; to: string } | null; range?: { from: string; to: string } | null } = {}) =>
  renderToStaticMarkup(<GeoCompareBar mode={mode} days={days} custom={o.custom ?? null} range={o.range ?? null} base={{ period: 'month', level: 'district' }} path="/admin/reports/geo-map" labels={labels} />);

describe('GeoCompareBar', () => {
  it('has the four choices as links that keep the period and level', () => {
    const h = draw('off');
    for (const m of ['off', 'previous', 'lastYear', 'custom']) expect(h).toContain(`data-mode="${m}"`);
    expect(h).toContain('href="/admin/reports/geo-map?period=month&amp;level=district&amp;compare=previous"');
    expect(h).toContain('href="/admin/reports/geo-map?period=month&amp;level=district&amp;compare=off"');
    expect(h).toContain('Previous period');
    expect(h).toContain('Same period last year');
  });
  it('marks the chosen one, and shows no day boxes unless it is Own days', () => {
    const h = draw('previous', { range: { from: '2026-10-17', to: '2026-10-31' } });
    expect(h).toMatch(/aria-current="true"[^>]*data-mode="previous"|data-mode="previous"[^>]*aria-current="true"/);
    expect(h).not.toContain('geo-compare-custom');
    expect(h).toContain('Compared with 2026-10-17 to 2026-10-31');
  });
  it('Own days opens two day boxes, filled in, and the choice link starts from the previous period', () => {
    expect(draw('off')).toContain('compare=custom&amp;cfrom=2026-10-17&amp;cto=2026-10-31');
    const h = draw('custom', { custom: { from: '2026-09-01', to: '2026-09-30' } });
    expect(h).toContain('data-testid="geo-compare-custom"');
    expect(h).toContain('name="cfrom"');
    expect(h).toContain('value="2026-09-01"');
    expect(h).toContain('value="2026-09-30"');
    expect(h).toContain('name="period" value="month"');
  });
  it('shows no "compared with" line while compare is off', () => {
    expect(draw('off')).not.toContain('Compared with');
  });
});
