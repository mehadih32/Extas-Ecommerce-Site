// S13 · PR 532 (registry v232): the deep conversion feed — at version 232, off as it ships, Facebook generous (§59.2),
// never owner data, labelled in both languages; every number bounded.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { conversionFeedSchema, conversionFeedSettings, heldFlags } from '../src/registry-conversion-feed';
import { ALL_TRACKING_EVENTS, FEED_TRACKING_EVENTS } from '../src/registry-tracking';

describe('ads.conversionFeed (v232, v261, v262)', () => {
  const spec = conversionFeedSettings['ads.conversionFeed'];
  it('is in the registry at version 262 (PR 532 follow-up 664), store-level, off, Facebook generous, labelled in English and Bengali', () => {
    expect(registry['ads.conversionFeed']).toBe(spec);
    expect(spec.version).toBe(262);
    expect(spec.default.withdrawOnReturn).toBe(false);
    expect(spec.default.shareIds).toBe(false);
    expect(spec.isOwnerData).toBe(false);
    expect(spec.default.on).toBe(false);
    expect(spec.default.generous).toEqual({ meta: true, google: false, tiktok: false });
    expect(spec.default.holdFlags).toEqual({});
    expect(conversionFeedSchema.safeParse(spec.default).success).toBe(true);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey)).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!)).toBeTruthy();
    }
  });

  it('bounds every number and takes flag keys only', () => {
    const ok = spec.default;
    for (const bad of [{ ...ok, holdHours: 73 }, { ...ok, holdHours: -1 }, { ...ok, intentDays: 0 }, { ...ok, intentDays: 31 }, { ...ok, holdFlags: { 'Not A Key!': true } }, { ...ok, extra: 1 }, { ...ok, steps: { shipped: true } }])
      expect(conversionFeedSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    expect(heldFlags({ holdFlags: { 'call-first': false, fake: true } })).toEqual(['fake']);
  });

  it('PR 532 follow-up 661: a value saved before v261 reads with the withdrawal off', () => {
    const { withdrawOnReturn: _w, shareIds: _s, ...before } = spec.default;
    expect(conversionFeedSchema.parse(before).withdrawOnReturn).toBe(false);
    expect(conversionFeedSchema.parse(before).shareIds).toBe(false);
    expect(conversionFeedSchema.safeParse({ ...spec.default, withdrawOnReturn: 'yes' }).success).toBe(false);
  });

  it('adds the feed events to the tracking table', () => {
    expect(FEED_TRACKING_EVENTS).toEqual(['shipped', 'returned', 'qualified']);
    for (const e of FEED_TRACKING_EVENTS) expect(ALL_TRACKING_EVENTS).toContain(e);
  });
});
