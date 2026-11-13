import { describe, expect, it } from 'vitest';
import { buildDigestContent, digestWindows, pctChange, summarizeEvents, DIGEST_WINDOW_DAYS, type DigestFunnelInput } from './digest';
import type { FunnelEventRow } from './funnel';

const ev = (over: Partial<FunnelEventRow> = {}): FunnelEventRow => ({
  visitorId: over.visitorId ?? 'v1',
  name: over.name ?? 'page_view',
  pageType: over.pageType ?? null,
  productId: over.productId ?? null,
  categoryId: over.categoryId ?? null,
});

describe('digestWindows', () => {
  it('weekly is a 7-day window, the previous window the same length right before it', () => {
    const end = new Date('2026-11-12T00:00:00.000Z');
    const w = digestWindows('weekly', end);
    expect(w.current).toEqual({ start: new Date('2026-11-05T00:00:00.000Z'), end });
    expect(w.previous).toEqual({ start: new Date('2026-10-29T00:00:00.000Z'), end: new Date('2026-11-05T00:00:00.000Z') });
  });

  it('monthly is a 30-day window', () => {
    const end = new Date('2026-11-12T00:00:00.000Z');
    const w = digestWindows('monthly', end);
    expect(w.current.start.getTime()).toBe(end.getTime() - 30 * 86_400_000);
    expect(w.previous.start.getTime()).toBe(w.current.start.getTime() - 30 * 86_400_000);
  });

  it('DIGEST_WINDOW_DAYS names what each kind means', () => {
    expect(DIGEST_WINDOW_DAYS).toEqual({ weekly: 7, monthly: 30 });
  });
});

describe('summarizeEvents', () => {
  it('lists every catalogue event name, zero included, with its own and unique-visitor counts', () => {
    const rows = [ev({ visitorId: 'a', name: 'page_view' }), ev({ visitorId: 'a', name: 'page_view' }), ev({ visitorId: 'b', name: 'page_view' }), ev({ visitorId: 'a', name: 'purchase' })];
    const out = summarizeEvents(rows);
    expect(out.find((r) => r.name === 'page_view')).toEqual({ name: 'page_view', count: 3, visitors: 2 });
    expect(out.find((r) => r.name === 'purchase')).toEqual({ name: 'purchase', count: 1, visitors: 1 });
    expect(out.find((r) => r.name === 'wishlist_add')).toEqual({ name: 'wishlist_add', count: 0, visitors: 0 });
  });

  it('counts nothing for an empty window', () => {
    const out = summarizeEvents([]);
    expect(out.every((r) => r.count === 0 && r.visitors === 0)).toBe(true);
    expect(out.length).toBeGreaterThan(0);
  });
});

describe('pctChange', () => {
  it('is the fractional change', () => {
    expect(pctChange(120, 100)).toBeCloseTo(0.2);
    expect(pctChange(80, 100)).toBeCloseTo(-0.2);
    expect(pctChange(100, 100)).toBe(0);
  });

  it('is null when there is nothing to divide by (prev is zero), never Infinity', () => {
    expect(pctChange(5, 0)).toBeNull();
    expect(pctChange(0, 0)).toBeNull();
  });
});

describe('buildDigestContent', () => {
  const window = { current: { start: new Date('2026-11-05'), end: new Date('2026-11-12') }, previous: { start: new Date('2026-10-29'), end: new Date('2026-11-05') } };

  it('reports every event line with its change, and runs each funnel over both windows', () => {
    const currentEvents = [ev({ visitorId: 'a', name: 'product_view' }), ev({ visitorId: 'a', name: 'add_to_bag' }), ev({ visitorId: 'b', name: 'product_view' })];
    const previousEvents = [ev({ visitorId: 'x', name: 'product_view' })];
    const funnels: DigestFunnelInput[] = [
      {
        id: 'f1',
        name: 'Shop funnel',
        steps: [
          { key: 'view', label: 'Viewed', eventName: 'product_view', pageType: null, productId: null, categoryId: null },
          { key: 'bag', label: 'Added to bag', eventName: 'add_to_bag', pageType: null, productId: null, categoryId: null },
        ],
      },
    ];
    const out = buildDigestContent({ kind: 'weekly', window, currentEvents, previousEvents, funnels });
    expect(out.kind).toBe('weekly');
    expect(out.periodStart).toBe(window.current.start.toISOString());
    expect(out.periodEnd).toBe(window.current.end.toISOString());
    expect(out.previousPeriodStart).toBe(window.previous.start.toISOString());

    const view = out.events.find((e) => e.name === 'product_view')!;
    expect(view).toEqual({ name: 'product_view', count: 2, visitors: 2, prevCount: 1, prevVisitors: 1, changeCount: 1, changeVisitors: 1 });
    const bag = out.events.find((e) => e.name === 'add_to_bag')!;
    expect(bag).toEqual({ name: 'add_to_bag', count: 1, visitors: 1, prevCount: 0, prevVisitors: 0, changeCount: null, changeVisitors: null });

    expect(out.funnels).toHaveLength(1);
    expect(out.funnels[0]!.funnelId).toBe('f1');
    expect(out.funnels[0]!.current.steps.map((s) => s.visitors)).toEqual([2, 1]);
    expect(out.funnels[0]!.previous.steps.map((s) => s.visitors)).toEqual([1, 0]);
  });

  it('is deterministic: the same inputs always give the same output', () => {
    const currentEvents = [ev({ visitorId: 'a', name: 'purchase' })];
    const a = buildDigestContent({ kind: 'monthly', window, currentEvents, previousEvents: [], funnels: [] });
    const b = buildDigestContent({ kind: 'monthly', window, currentEvents, previousEvents: [], funnels: [] });
    expect(a).toEqual(b);
  });

  it('with no funnels saved yet, the digest still carries every event line', () => {
    const out = buildDigestContent({ kind: 'weekly', window, currentEvents: [], previousEvents: [], funnels: [] });
    expect(out.funnels).toEqual([]);
    expect(out.events.length).toBeGreaterThan(0);
  });
});
