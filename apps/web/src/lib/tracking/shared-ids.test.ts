// S13 · PR 532 follow-up (664) — the order's server event ids for a browser pixel: nothing while sharing or tracking is
// off; per ticked platform every event the server will send for the order, under the platform's own name, the
// qualified sale (as the purchase) only on a generous platform; never a contact or an amount.
import { describe, expect, it } from 'vitest';
import { registry } from '@extas/settings';
import { sharedIds } from './shared-ids';

const t = { ...registry['ads.tracking'].default, on: true, platforms: { meta: true, google: true, tiktok: false } };
const dp = { ...registry['ads.deliveredPurchase'].default, on: true };
const feed = { ...registry['ads.conversionFeed'].default, on: true, shareIds: true };

describe('the shared event ids (PR 532 follow-up 664)', () => {
  it('shares nothing while off, or while tracking is off', () => {
    expect(registry['ads.conversionFeed'].default.shareIds).toBe(false);
    expect(sharedIds('EX1001', { t, dp, feed: { ...feed, shareIds: false } })).toBeNull();
    expect(sharedIds('EX1001', { t: { ...t, on: false }, dp, feed })).toBeNull();
  });

  it('lists each ticked platform`s events for the order with its own names; the qualified sale only where generous', () => {
    const ids = sharedIds('EX1001', { t, dp, feed })!;
    expect(Object.keys(ids.events)).toEqual(['meta', 'google']);
    const meta = Object.fromEntries(ids.events.meta!.map((e) => [e.id, e.name]));
    // Facebook is generous as shipped: the qualified sale is its purchase, the order placed its own event
    expect(meta['qualified-EX1001']).toBe('Purchase');
    expect(meta['purchase-EX1001']).toBe('OrderPlaced');
    const google = Object.fromEntries(ids.events.google!.map((e) => [e.id, e.name]));
    expect(google['purchase-EX1001']).toBe('purchase');
    expect(google).not.toHaveProperty('qualified-EX1001');
    expect(JSON.stringify(ids)).not.toMatch(/value|phone|email|@/);
  });

  it('follows the switches: only the events the server records', () => {
    const ids = sharedIds('EX 1/2', { t, dp: { ...dp, on: false }, feed })!;
    expect(ids.events.meta!.map((e) => e.id)).toEqual(['purchase-EX-1-2']);
  });
});
