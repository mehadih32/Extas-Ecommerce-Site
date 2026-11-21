// PR 1189 (prototype v5, Orders › Returns & exchanges): Custom is a chip that leads to the day boxes, Partial deliveries sits
// beside Exchange requests, and Handed back is always a tab (the hand-back desk on contract v6, Receive & QC before it).
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import en from '../../../../messages/admin-returns.en.json';
import { ReturnsLens } from './ReturnsLens';

const view = { dict: { returns: en }, timeZone: 'UTC', locale: 'en', lang: 'en' } as never;
const counts = { requests: 2, coming: 0, waiting: 0, replace: 0, approved: 0, declined: 0, cancelled: 0 };
const draw = (handbackHref: string | null, from?: string, to?: string) =>
  renderToStaticMarkup(<ReturnsLens view={view} tab={null} from={from} to={to} counts={counts} reminders={{ requests: 2, comingSoon: 0, waiting: 0 }} courier={{ partial: 3, short: 0, money: 0 } as never} handbackHref={handbackHref} now={new Date('2026-11-21T06:00:00Z')} />);

describe('ReturnsLens', () => {
  it('draws Custom as a chip that leads to the day boxes, marked for a custom range', () => {
    expect(draw(null)).toMatch(/<a class="a2-view" href="#returns-range"[^>]*>Custom<\/a>/);
    expect(draw(null, '2020-01-02', '2020-01-05')).toMatch(/<a class="a2-view on" href="#returns-range" aria-current="page"[^>]*>Custom<\/a>/);
    expect(draw(null)).toContain('id="returns-range"');
  });
  it('puts Partial deliveries right after Exchange requests, with its count', () => {
    const h = draw(null);
    expect(h.indexOf('returns-tab-partial')).toBeGreaterThan(h.indexOf('returns-tab-requests'));
    expect(h.indexOf('returns-tab-partial')).toBeLessThan(h.indexOf('returns-tab-coming'));
    expect(h).toMatch(/Partial deliveries<span class="a2-cnt">3<\/span>/);
  });
  it('always shows Handed back: the desk on contract v6, Receive & QC before it', () => {
    expect(draw('/admin/orders/returns/handback')).toMatch(/data-testid="returns-tab-handed" href="\/admin\/orders\/returns\/handback"/);
    expect(draw(null)).toMatch(/data-testid="returns-tab-handed" href="\/admin\/orders\/returns\/qc"/);
  });
});
