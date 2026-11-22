// S29 · PR 756 — the report toolbar keeps a report's own choices (the Geography map's slices) when the period changes,
// and a saved view writes them back; with no `mix` the addresses are exactly what they were before.
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ReportBar } from './ReportBar';

vi.mock('next/link', () => ({ default: ({ href, children, scroll: _s, ...rest }: { href: string; children: ReactNode; scroll?: boolean }) => createElement('a', { href, ...rest }, children) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }));

const base = { dict: {}, here: '/admin/reports/geo-map', id: 'gm', from: '2026-11-01', to: '2026-11-15', today: '2026-11-15', csv: '/api/x.csv', notes: [], limitDays: 400 } as const;
const links = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!.replace(/&amp;/g, '&')).filter((h) => h.startsWith('/admin/reports/geo-map?'));

describe('ReportBar mix', () => {
  it('with no mix, no address carries a slice', () => {
    const l = links(renderToStaticMarkup(<ReportBar {...base} />));
    expect(l.length).toBeGreaterThan(3);
    expect(l.join(' ')).not.toContain('channel=');
  });
  it('with a mix, every period button and the compare switch keep it', () => {
    const l = links(renderToStaticMarkup(<ReportBar {...base} mix={{ channel: 'PHONE', pay: 'COD' }} />));
    expect(l.length).toBeGreaterThan(3);
    for (const h of l) {
      expect(h).toContain('channel=PHONE');
      expect(h).toContain('pay=COD');
    }
  });
  it('the mix never overrides the period or the compare switch', () => {
    const l = links(renderToStaticMarkup(<ReportBar {...base} mix={{ from: '2000-01-01', p: 'x', cmp: '1', channel: 'PHONE' }} />));
    for (const h of l) {
      expect(h).not.toContain('from=2000-01-01');
      expect(h).not.toContain('p=x');
    }
  });
  it('a saved view brings its slices back', () => {
    const html = renderToStaticMarkup(
      <ReportBar {...base} reportKey="geo-map" views={[{ id: 'v1', name: 'Phone COD', preset: 'last30', compare: true, filters: { channel: 'PHONE', pay: 'COD' } }]} />,
    );
    const option = /<option value="([^"]+)">Phone COD<\/option>/.exec(html)?.[1]?.replace(/&amp;/g, '&') ?? '';
    expect(option).toContain('channel=PHONE');
    expect(option).toContain('pay=COD');
    expect(option).not.toContain('from=2000');
  });
});
