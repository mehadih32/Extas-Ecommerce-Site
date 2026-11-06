// PR 627 (CN-036, LUMEN-SPEC §3 items 1 and 7) — the shared patterns as the server draws them: summary tiles with the
// final figure for screen readers and ▲/▼ by good news, the hero chart with its range switch and plain SVG line, the
// toast's Undo only for reversible actions, the empty state and the skeleton; words from the shell's dictionary in
// both languages, and no colour written in the markup (the theme layer's tokens only).
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import bn from '../../../../messages/admin-shell.bn.json';
import en from '../../../../messages/admin-shell.en.json';
import type { Dict } from '@/lib/i18n';
import { LumenProvider } from './context';
import { EmptyState } from './EmptyState';
import { HeroChart, type HeroRange } from './HeroChart';
import { Skeleton } from './Skeleton';
import { SummaryTiles } from './SummaryTiles';
import { toastShown, ToastView } from './Toast';

const num = { kind: 'number' as const, locale: 'en-IN' };
const colour = /#[0-9a-f]{3,8}\b|rgba?\(/i;
const wrap = (dict: Dict, el: ReactElement) => renderToStaticMarkup(<LumenProvider value={{ dict, undoSeconds: 5, pageStep: 12 }}>{el}</LumenProvider>);

describe('summary tiles', () => {
  const html = renderToStaticMarkup(
    <SummaryTiles
      label="Today"
      tiles={[
        { key: 'sales', label: 'Sales', value: 123456, shown: '৳1,23,456', format: num, delta: 0.124, deltaText: '12.4%', vs: 'vs the 7 days before', href: '/admin/reports' },
        { key: 'returns', label: 'Returns', value: 3, shown: '3', format: num, delta: 0.5, good: 'down' },
        { key: 'new', label: 'New buyers', value: 0, shown: '0', format: num, delta: null },
      ]}
    />,
  );

  it('writes the final figure for screen readers, links a tile with a page', () => {
    expect(html).toContain('<span class="lm-vh">৳1,23,456</span>');
    expect(html).toContain('href="/admin/reports"');
    expect(html).toContain('data-testid="lm-tiles-sales"');
  });

  it('colours the change by good news (returns up is bad), "—" with nothing to compare', () => {
    expect(html).toMatch(/lm-dl ok[^]*12\.4%/);
    expect(html).toMatch(/lm-dl bad[^]*50\.0%/);
    expect(html).toContain('<span class="lm-dl flat">—</span>');
    expect(html).not.toMatch(colour);
  });
});

describe('hero chart', () => {
  const ranges: HeroRange[] = [
    { key: '7', label: '7D', total: 7000, shown: '7,000', delta: 0.1, deltaText: '10.0%', points: [1, 2, 3, 4, 5, 6, 7].map((v) => ({ label: `D${v}`, value: v * 100, shown: String(v * 100) })), prev: [1, 1, 1, 1, 1, 1, 1], mini: [{ label: 'Orders', shown: '12' }] },
    { key: '30', label: '30D', total: 30000, shown: '30,000', points: [], href: '/admin?range=30' },
  ];

  it('draws the title, the figure, the range switch and a plain SVG line with the period before', () => {
    const html = wrap(en as Dict, <HeroChart title="Sales" ranges={ranges} format={num} seriesName="Sales" />);
    expect(html).toContain('Sales');
    expect(html).toContain('<span class="lm-vh">7,000</span>');
    expect(html).toMatch(/<button[^>]*class="on"[^>]*aria-pressed="true"[^>]*>7D<\/button>/);
    expect(html).toContain('href="/admin?range=30"');
    expect(html).toContain('class="lm-hero-line"');
    expect(html).toContain('class="lm-hero-prev"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('Orders');
    expect(html).not.toMatch(colour);
  });

  it('says so when a range has no figures, in Bengali too', () => {
    const html = wrap(bn as Dict, <HeroChart title="বিক্রি" ranges={ranges} initial="30" format={num} seriesName="বিক্রি" />);
    expect(html).toContain('এই সময়ের কোনো সংখ্যা এখনো নেই।');
    expect(html).not.toContain('lm-hero-line');
  });
});

describe('toast', () => {
  const draw = (kind: string) => renderToStaticMarkup(<ToastView toast={toastShown({ text: 'Order confirmed', undo: { kind, run: () => true } }, 1)} undoLabel="Undo" closeLabel="Close" left={5} />);

  it('offers Undo for a reversible action, with the seconds left', () => {
    const html = draw('order.confirm');
    expect(html).toContain('data-testid="lm-toast-undo"');
    expect(html).toContain('<small aria-hidden="true">5</small>');
  });

  it('never offers Undo for money, refunds, COD, prices, discounts, blocking or deleting', () => {
    for (const kind of ['money', 'refund', 'payout.received', 'cod', 'price', 'discount', 'block', 'delete', 'something.new']) expect(draw(kind), kind).not.toContain('lm-toast-undo');
    expect(renderToStaticMarkup(<ToastView toast={toastShown({ text: 'Saved' }, 2)} undoLabel="Undo" closeLabel="Close" />)).not.toContain('lm-toast-undo');
  });
});

describe('empty state and skeleton', () => {
  it('says all is caught up with one next step', () => {
    const html = renderToStaticMarkup(<EmptyState title="All caught up" text="Nothing waits for you." action={{ label: 'All orders', href: '/admin/orders' }} />);
    expect(html).toContain('All caught up');
    expect(html).toContain('href="/admin/orders"');
  });

  it('marks the area busy and names it for screen readers', () => {
    for (const kind of ['tiles', 'chart', 'rows', 'lines', 'split', 'form'] as const) {
      const html = renderToStaticMarkup(<Skeleton kind={kind} count={3} label="Loading…" />);
      expect(html, kind).toContain('aria-busy="true"');
      expect(html, kind).toContain('<span class="lm-vh">Loading…</span>');
    }
  });
});

describe('words', () => {
  it('has every pattern word in both languages', () => {
    const lmEn = (en.shell as Record<string, unknown>).lm as Record<string, string>;
    const lmBn = (bn.shell as Record<string, unknown>).lm as Record<string, string>;
    expect(Object.keys(lmBn).sort()).toEqual(Object.keys(lmEn).sort());
    for (const v of Object.values(lmBn)) expect(v).not.toMatch(/[০-৯]/);
  });
});
