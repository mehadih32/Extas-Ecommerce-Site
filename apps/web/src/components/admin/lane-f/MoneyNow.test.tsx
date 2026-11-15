import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { daysToHold, holdTone } from '../../../lib/lane-f/money-now';
import { BooksMatch, CashForecast, CourierMoney, MoneyTiles, Rich } from './MoneyNow';

describe('Finance overview — where the money is now', () => {
  it('draws one link per tile with the small figures and the hold bar', () => {
    const html = renderToStaticMarkup(
      <MoneyTiles title="Where the money is now" tiles={[{ key: 'hand', label: 'In hand', value: '৳10', sub: 's', href: '/admin/money/cash', mini: [{ label: 'Cash', shown: '৳4' }] }, { key: 'erp', label: 'Owed to ERP', value: '৳5', sub: 's', tone: 'warn', href: '/admin/money/books', holdBar: ['u', 'w', ''] }]} />,
    );
    expect(html).toContain('data-testid="fn-now-hand"');
    expect(html).toContain('lf-tile warn');
    expect(html).toContain('Cash <b>৳4</b>');
    expect((html.match(/<i class=/g) ?? []).length).toBe(3);
  });
  it('writes bold words without raw HTML', () => {
    expect(renderToStaticMarkup(<Rich text="<b>Matching.</b> Both say ৳5" />)).toBe('<b>Matching.</b><span> Both say ৳5</span>');
  });
  it('shows the payouts as chips or the empty line', () => {
    const texts = { title: 'T', sub: 'S', cod: 'COD', codSub: 'c', claims: 'Claims', claimsSub: 'n', payouts: 'Payouts', noPayout: 'No payout is expected right now.', c360: 'Open Courier 360', account: 'Courier account', match: 'Match courier statement' };
    const links = { c360: '/a', account: '/b', match: '/c' };
    expect(renderToStaticMarkup(<CourierMoney texts={texts} codShown="৳1" claimsShown="৳2" claimsBad payouts={[]} links={links} />)).toContain('No payout is expected right now.');
    const html = renderToStaticMarkup(<CourierMoney texts={texts} codShown="৳1" claimsShown="৳2" claimsBad={false} payouts={[{ id: 'p', label: 'Pathao · Requested', tone: 'info' }]} links={links} />);
    expect(html).toContain('Pathao · Requested');
    expect(html).toContain('href="/c"');
  });
  it('draws the forecast line, the tightest day and a day by day table', () => {
    const days = [
      { day: '2026-11-16', label: '16 Nov', inShown: '৳5', outShown: '৳0', balShown: '৳15', bal: 15, tight: false },
      { day: '2026-11-17', label: '17 Nov', inShown: '৳0', outShown: '৳9', balShown: '৳6', bal: 6, tight: true },
    ];
    const texts = { title: 'Next 2 days of cash', series: 'Money in hand', tightest: '', inWord: 'in', outWord: 'out', dayBy: 'Day by day', dayHead: 'Day', inHead: 'In', outHead: 'Out', handHead: 'In hand', tightBadge: 'Tightest', fixed: '', none: 'No forecast', start: '' };
    const html = renderToStaticMarkup(<CashForecast texts={texts} days={days} tightLine="Tightest day: <b>17 Nov</b>" tightBad={false} inTotal="৳5" outTotal="৳9" startLine="Start" fixedLine={null} />);
    expect(html).toContain('<polyline');
    expect(html).toContain('<b>17 Nov</b>');
    expect(html).toContain('Tightest</span>');
    expect(renderToStaticMarkup(<CashForecast texts={texts} days={[]} tightLine={null} tightBad={false} inTotal="" outTotal="" startLine="" fixedLine={null} />)).toContain('No forecast');
  });
  it('colours the books-match card', () => {
    expect(renderToStaticMarkup(<BooksMatch title="T" tone="bad" action={{ label: 'Fix', href: '/x' }}>x</BooksMatch>)).toContain('lf-callout bad');
  });
});

describe('ERP hold clock', () => {
  it('is green before the warning day, orange from it and red once the hold starts', () => {
    expect(holdTone(3, 15, 30)).toBe('good');
    expect(holdTone(16, 15, 30)).toBe('warn');
    expect(holdTone(30, 15, 30)).toBe('bad');
    expect(holdTone(null, 15, 30)).toBe('good');
  });
  it('counts the days left, never below zero', () => {
    expect(daysToHold('2026-11-30', '2026-11-20')).toBe(10);
    expect(daysToHold('2026-11-10', '2026-11-20')).toBe(0);
    expect(daysToHold(null, '2026-11-20')).toBeNull();
  });
});
