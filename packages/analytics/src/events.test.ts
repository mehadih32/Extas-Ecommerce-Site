// S15 · PR 338 — pure tests: the owner's own catalogue, and the deterministic shaping of one raw event.
import { describe, expect, it } from 'vitest';
import {
  ANALYTICS_EVENT_NAMES,
  clampOccurredAt,
  clampProps,
  isAnalyticsEventName,
  normalizeAnalyticsEvent,
  OCCURRED_AT_PAST_MS,
  PAGE_TYPE_MAX,
  PROP_TEXT_MAX,
  PROPS_MAX_KEYS,
  SOURCE_BUTTON_MAX,
} from './events';

describe('the owner\'s own event catalogue (Blueprint D5)', () => {
  it('names every event in the owner\'s own V2 list (D5 V2 note) and the D5.1 starting set', () => {
    for (const name of ['search', 'whatsapp_click', 'add_to_bag', 'order_now', 'remove_from_bag', 're_add', 'new_add_after_remove', 'all_colours_click', 'size_chart_click', 'wishlist_add']) {
      expect(ANALYTICS_EVENT_NAMES, name).toContain(name);
    }
  });

  it('isAnalyticsEventName accepts only a catalogued name', () => {
    expect(isAnalyticsEventName('purchase')).toBe(true);
    expect(isAnalyticsEventName('made_up_event')).toBe(false);
    expect(isAnalyticsEventName(42)).toBe(false);
    expect(isAnalyticsEventName(null)).toBe(false);
  });
});

describe('normalizeAnalyticsEvent — never invents, never throws (D5.3: "tracking can fail, the shop cannot")', () => {
  const now = new Date('2026-11-12T10:00:00.000Z');

  it('refuses a payload that is not an object', () => {
    expect(normalizeAnalyticsEvent(null, now)).toBeNull();
    expect(normalizeAnalyticsEvent('add_to_bag', now)).toBeNull();
    expect(normalizeAnalyticsEvent(undefined, now)).toBeNull();
  });

  it('refuses an event name outside the catalogue — never invented, never stored', () => {
    expect(normalizeAnalyticsEvent({ name: 'invented_event' }, now)).toBeNull();
    expect(normalizeAnalyticsEvent({}, now)).toBeNull();
  });

  it('a minimal valid event normalizes with every optional field null and occurredAt defaulting to now', () => {
    expect(normalizeAnalyticsEvent({ name: 'page_view' }, now)).toEqual({
      name: 'page_view',
      pageType: null,
      productId: null,
      categoryId: null,
      comboId: null,
      sourceButton: null,
      props: null,
      occurredAt: now,
    });
  });

  it('keeps well-shaped fields and ignores an id that does not look like one', () => {
    const e = normalizeAnalyticsEvent(
      { name: 'product_view', pageType: 'product', productId: 'df9e9b10-aaaa-7000-8000-0000000000aa', categoryId: 'not-an-id', sourceButton: 'pdp_bar' },
      now,
    );
    expect(e).toMatchObject({ name: 'product_view', pageType: 'product', productId: 'df9e9b10-aaaa-7000-8000-0000000000aa', categoryId: null, sourceButton: 'pdp_bar' });
  });

  it('clamps an over-long pageType and sourceButton rather than refusing the event', () => {
    const e = normalizeAnalyticsEvent({ name: 'page_view', pageType: 'x'.repeat(PAGE_TYPE_MAX + 50), sourceButton: 'y'.repeat(SOURCE_BUTTON_MAX + 50) }, now)!;
    expect(e.pageType).toHaveLength(PAGE_TYPE_MAX);
    expect(e.sourceButton).toHaveLength(SOURCE_BUTTON_MAX);
  });
});

describe('clampProps — lenient shaping, never a wholesale refusal', () => {
  it('a non-object becomes null', () => {
    expect(clampProps(null)).toBeNull();
    expect(clampProps('x')).toBeNull();
    expect(clampProps([1, 2])).toBeNull();
  });

  it('keeps string, number, boolean and null values; drops a nested object or array value', () => {
    expect(clampProps({ term: 'polo', qty: 2, ok: true, missing: null, nested: { a: 1 }, arr: [1] })).toEqual({ term: 'polo', qty: 2, ok: true, missing: null });
  });

  it('drops a non-finite number and truncates an over-long string', () => {
    expect(clampProps({ bad: Infinity, long: 'z'.repeat(PROP_TEXT_MAX + 20) })).toEqual({ long: 'z'.repeat(PROP_TEXT_MAX) });
  });

  it('keeps only the first PROPS_MAX_KEYS keys, never refusing the whole event for a wide payload', () => {
    const wide = Object.fromEntries(Array.from({ length: PROPS_MAX_KEYS + 10 }, (_, i) => [`k${i}`, i]));
    expect(Object.keys(clampProps(wide)!)).toHaveLength(PROPS_MAX_KEYS);
  });

  it('an empty object becomes null, never a stored {}', () => {
    expect(clampProps({})).toBeNull();
    expect(clampProps({ a: { nested: true } })).toBeNull();
  });
});

describe('clampOccurredAt — a browser clock is never trusted past a narrow, honest window', () => {
  const now = new Date('2026-11-12T10:00:00.000Z');

  it('a missing or unreadable time defaults to now', () => {
    expect(clampOccurredAt(undefined, now)).toEqual(now);
    expect(clampOccurredAt('not-a-date', now)).toEqual(now);
    expect(clampOccurredAt(12345, now)).toEqual(now);
  });

  it('a time in the future clamps to now', () => {
    expect(clampOccurredAt(new Date(now.getTime() + 60_000).toISOString(), now)).toEqual(now);
  });

  it('a time far in the past clamps to the oldest allowed instant', () => {
    const farPast = new Date(now.getTime() - OCCURRED_AT_PAST_MS * 5).toISOString();
    expect(clampOccurredAt(farPast, now)).toEqual(new Date(now.getTime() - OCCURRED_AT_PAST_MS));
  });

  it('a time inside the honest window is kept as sent', () => {
    const recent = new Date(now.getTime() - 5_000);
    expect(clampOccurredAt(recent.toISOString(), now)).toEqual(recent);
  });
});
