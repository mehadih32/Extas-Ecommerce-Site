// S28 · PR 714-717 — the parts the four v5 report pages share, as the server draws them: the period bar (periods, dates, CSV, notes),
// the table (its empty state and right-aligned figures), the "how these figures are worked out" fold, and the hero chart fed by
// `heroRange` (a line, the span before dashed, no colour in the markup).
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import bn from '../../../../messages/admin-reports-v5.bn.json';
import en from '../../../../messages/admin-reports-v5.en.json';
import costEn from '../../../../messages/admin-cost-report.en.json';
import shellEn from '../../../../messages/admin-shell.en.json';
import type { Dict } from '@/lib/i18n';
import { heroRange } from '@/lib/reports-v5/model';
import { LumenProvider } from '../lumen/context';
import { HeroChart } from '../lumen/HeroChart';
import { ReportBar } from './ReportBar';
import { HowFigures, ReportTable } from './ReportParts';

const dict = { reportsV5: en.reportsV5, moneyCostReport: costEn.moneyCostReport } as unknown as Dict;
const bnDict = { reportsV5: bn.reportsV5, moneyCostReport: costEn.moneyCostReport } as unknown as Dict;

describe('period bar', () => {
  const html = renderToStaticMarkup(<ReportBar dict={dict} here="/admin/reports/profit" id="rp" from="2026-11-01" to="2026-11-14" today="2026-11-14" current="month" csv="/api/admin/reports/export/profit?from=2026-11-01&to=2026-11-14" notes={['tooLong', 'byMonth']} limitDays={1830} />);
  it('has the six one-press periods, the current one marked', () => {
    for (const p of ['today', 'week', 'month', 'lastMonth', 'year', 'lastYear']) expect(html).toContain(`data-testid="rp-quick-${p}"`);
    expect(html).toMatch(/aria-current="true" data-testid="rp-quick-month" href="\/admin\/reports\/profit\?period=month"/);
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
  });
  it('has two dates that cannot be in the future, Show and the CSV download', () => {
    expect(html).toContain('max="2026-11-14"');
    expect(html).toContain('value="2026-11-01"');
    expect(html).toContain('data-testid="rp-show"');
    expect(html).toMatch(/href="\/api\/admin\/reports\/export\/profit\?from=2026-11-01&amp;to=2026-11-14"[^>]*download/);
  });
  it('says what was changed in the period (the month-by-month note is the money reports\', not shown here)', () => {
    expect(html).toContain('data-testid="rp-note-tooLong"');
    expect(html).toContain('1830');
    expect(html).not.toContain('rp-note-byMonth');
  });
});

describe('table and fold', () => {
  it('draws an empty message instead of an empty table', () => {
    const html = renderToStaticMarkup(<ReportTable cols={[{ h: 'A' }]} rows={[]} testId="t" rowId="r" empty="Nothing." />);
    expect(html).toContain('Nothing.');
    expect(html).not.toContain('<table');
  });
  it('right-aligns figure columns and gives every row its test id', () => {
    const html = renderToStaticMarkup(<ReportTable cols={[{ h: 'Name' }, { h: 'Sales', right: true }]} rows={[['Polo', '৳10'], ['Denim', '৳5']]} testId="t" rowId="r" empty="x" />);
    expect(html.match(/data-testid="r"/g)).toHaveLength(2);
    expect(html).toMatch(/<th style="text-align:right">Sales<\/th>/);
  });
  it('the fold names each figure, how it is counted, and links to the full figure', () => {
    const html = renderToStaticMarkup(<HowFigures dict={dict} testId="how" items={[{ label: 'Net profit', how: 'Contribution less costs.', href: '/admin/money/profit', linkText: 'Open' }, { label: 'Margin', how: 'A share.' }]} />);
    expect(html).toContain('How these figures are worked out');
    expect(html).toContain('<details');
    expect(html).toContain('href="/admin/money/profit"');
    expect(renderToStaticMarkup(<HowFigures dict={bnDict} testId="how" items={[]} />)).toContain('এই সংখ্যাগুলো কীভাবে হিসাব হয়');
  });
});

describe('hero chart from a report series', () => {
  const fmt = { kind: 'money' as const, locale: 'en-BD', currency: 'BDT', digits: 2 };
  const range = heroRange({ key: 'p', label: '1 Nov – 3 Nov', days: ['2026-11-01', '2026-11-02', '2026-11-03'], values: [100_00, 250_00, 0], before: [50_00, 60_00, 70_00], delta: 0.4, vs: 'Compared with 29 Oct to 31 Oct', amount: (m) => `৳${m / 100}`, dayLabel: (d) => d.slice(5) });
  const html = renderToStaticMarkup(
    <LumenProvider value={{ dict: shellEn as unknown as Dict, undoSeconds: 5, pageStep: 12 }}>
      <HeroChart title="Profit before ads, day by day" ranges={[range]} format={fmt} seriesName="Profit before ads" prevName="Span before" testId="rp-hero" />
    </LumenProvider>,
  );
  it('is a plain SVG line with the span before and the final figure', () => {
    expect(html).toContain('data-testid="rp-hero"');
    expect(html).toContain('<svg');
    expect(html).toContain('৳350');
    expect(html).toContain('lm-hero-prev');
    expect(html).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });
});
