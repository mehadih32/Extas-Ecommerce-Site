// S13 · PR 532 — the deep conversion feed's pure rules: when an order is a qualified sale (§59.2), what holds it back,
// the names on a generous platform (never two purchases for one order), and the outcome and intent it carries.
import { describe, expect, it } from 'vitest';
import { registry } from '@extas/settings';
import { courierExtra, heldBackOf, intentExtra, outcomeOf, qualifiedAt, type ExtraOrder } from './feed-extras';
import { adNameOf, generousOn, recordsFeed, toAdEvent } from './model';

const H = 3_600_000;
const NOW = new Date(Date.UTC(2026, 10, 6, 12));
const ago = (h: number) => new Date(NOW.getTime() - h * H);
const track = { ...registry['ads.tracking'].default, on: true };
const dp = { ...registry['ads.deliveredPurchase'].default, on: true };
const feed = { ...registry['ads.conversionFeed'].default, on: true };

describe('the qualified sale (§59.2)', () => {
  it('a delivery counts at once; with the courier only after the owner’s hours', () => {
    expect(qualifiedAt({ toStatus: 'DELIVERED', createdAt: ago(1) }, 2, NOW)).toEqual(ago(1));
    expect(qualifiedAt({ toStatus: 'PARTIALLY_DELIVERED', createdAt: ago(1) }, 2, NOW)).toEqual(ago(1));
    expect(qualifiedAt({ toStatus: 'HANDED_OVER', createdAt: ago(1) }, 2, NOW)).toBeNull();
    expect(qualifiedAt({ toStatus: 'IN_TRANSIT', createdAt: ago(5) }, 2, NOW)).toEqual(ago(3));
    expect(qualifiedAt({ toStatus: 'HANDED_OVER', createdAt: ago(0) }, 0, NOW)).toEqual(NOW);
  });

  it('held back only when cancelled or marked bad', () => {
    const o = { status: 'HANDED_OVER' as const, internalFlags: ['vip'], flags: [], blocked: false };
    expect(heldBackOf(o, [], true, 'RISK_BLOCKLIST')).toBeNull();
    expect(heldBackOf({ ...o, status: 'CANCELLED' }, [], true, 'RISK_BLOCKLIST')).toBe('cancelled');
    expect(heldBackOf(o, ['vip'], true, 'RISK_BLOCKLIST')).toBe('flag');
    expect(heldBackOf({ ...o, blocked: true }, [], true, 'RISK_BLOCKLIST')).toBe('blocked');
    expect(heldBackOf({ ...o, flags: ['RISK_BLOCKLIST'] }, [], true, 'RISK_BLOCKLIST')).toBe('blocked');
    expect(heldBackOf({ ...o, blocked: true }, [], false, 'RISK_BLOCKLIST')).toBeNull();
    // a parcel refused after the hours is not taken back (the generous rule); returned is its own event
    expect(heldBackOf({ ...o, status: 'RETURNED' }, [], true, 'RISK_BLOCKLIST')).toBeNull();
  });

  it('is recorded only while tracking, delivered sales and the feed are on and the step ticked', () => {
    expect(recordsFeed(track, dp, feed, 'qualified')).toBe(true);
    expect(recordsFeed(track, { ...dp, on: false }, feed, 'shipped')).toBe(false);
    expect(recordsFeed(track, dp, { ...feed, on: false }, 'shipped')).toBe(false);
    expect(recordsFeed(track, dp, { ...feed, steps: { ...feed.steps, returned: false } }, 'returned')).toBe(false);
    expect(recordsFeed({ ...track, on: false }, dp, feed, 'shipped', true)).toBe(true); // the admin's test event
  });
});

describe('the names on a generous platform', () => {
  it('the qualified sale is the purchase; the order placed and the delivery keep their own names', () => {
    expect(generousOn(dp, feed, 'meta')).toBe(true);
    expect(generousOn(dp, feed, 'google')).toBe(false);
    expect(generousOn(dp, { ...feed, steps: { ...feed.steps, qualified: false } }, 'meta')).toBe(false);
    expect(generousOn({ ...dp, on: false }, feed, 'meta')).toBe(false);
    for (const means of ['placed', 'delivered'] as const) {
      expect(adNameOf('qualified', means, true)).toBe('purchase');
      expect(adNameOf('purchase', means, true)).toBe('placed');
      expect(adNameOf('delivered', means, true)).toBe('delivered');
      expect(adNameOf('qualified', means)).toBe('qualified');
    }
    expect(adNameOf('delivered', 'delivered')).toBe('purchase'); // PR 258 unchanged elsewhere
    expect(adNameOf('shipped', 'placed', true)).toBe('shipped');
    expect(adNameOf('returned', 'placed')).toBe('returned');
  });

  it('a feed step with no browser is system-generated and carries its extra', () => {
    const row = { eventId: 'qualified-EX1', name: 'qualified', url: null, valueMinor: 330_000, currency: 'BDT', items: [], userData: { ext: 'a'.repeat(64) }, occurredAt: NOW };
    expect(toAdEvent(row, 'EX1', 'placed', { generous: true, extra: { outcome: 'with_courier' } })).toMatchObject({ name: 'purchase', system: true, value: 3300, extra: { outcome: 'with_courier' } });
    expect(toAdEvent(row, 'EX1')).not.toHaveProperty('extra');
  });
});

describe('the outcome and the intent', () => {
  const o: ExtraOrder = {
    placedAt: ago(50),
    status: 'DELIVERED',
    deliveredAt: ago(2),
    paymentMethod: 'COD',
    courier: 'sample-courier',
    utmSource: 'Facebook',
    utmMedium: 'Paid',
    utmCampaign: 'Winter polo',
    adPlatform: 'meta',
    adCampaignId: null,
    landingPageId: 'lp',
    referrer: null,
  };

  it('says what the courier did, as of the event', () => {
    expect(outcomeOf('shipped', o, ago(40))).toBe('with_courier');
    expect(outcomeOf('qualified', o, ago(40))).toBe('with_courier');
    expect(outcomeOf('qualified', o, ago(1))).toBe('delivered');
    expect(outcomeOf('delivered', { ...o, status: 'PARTIALLY_DELIVERED' }, ago(1))).toBe('partly_delivered');
    expect(outcomeOf('view', o, NOW)).toBeNull();
    expect(courierExtra('delivered', ago(2), o)).toEqual({ outcome: 'delivered', courier: 'sample-courier', days_to_outcome: 2, payment: 'cod' });
    expect(courierExtra('purchase', ago(50), o)).toEqual({ outcome: 'placed', payment: 'cod' });
    expect(courierExtra('view', NOW, o)).toEqual({});
  });

  it('carries the visit, never a person', () => {
    const x = intentExtra(o, { views: 4, bagAdds: 2, checkouts: 1 }, true);
    expect(x).toEqual({ channel: 'facebook', medium: 'paid', campaign: 'Winter polo', ad_click: true, landing_page: true, returning_customer: true, views: 4, bag_adds: 2, checkouts: 1 });
    expect(intentExtra({ ...o, utmSource: null, utmMedium: null, utmCampaign: null, adPlatform: null, landingPageId: null }, { views: 0, bagAdds: 0, checkouts: 0 }, false)).toMatchObject({ channel: 'direct', ad_click: false, landing_page: false });
    expect(intentExtra({ ...o, utmSource: null, adPlatform: null, referrer: 'https://example.test/' }, { views: 0, bagAdds: 0, checkouts: 0 }, false).channel).toBe('referral');
  });
});
