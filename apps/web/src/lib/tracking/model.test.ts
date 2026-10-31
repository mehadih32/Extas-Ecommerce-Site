// S13 · PR 257 — the pure part of server-side tracking: the customer hashes, money in the major unit, which page is
// which event, the platforms' cookies, the delivery state and the stored row as the adapters take it.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { counts, pageKey } from '@/components/shop/TrackingBeacon';
import { afterSend, hashEmail, hashPhone, pageEvent, platformCookies, records, stillWaiting, toAdEvent, toMajor, valueOf, waitingFor } from './model';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

describe('tracking model (PR 257)', () => {
  it('hashes an e-mail trimmed and lower-cased, a phone both ways; never anything that is not one', () => {
    expect(hashEmail('  Sample@Example.COM ')).toBe(sha('sample@example.com'));
    expect(hashEmail('not an email')).toBeNull();
    expect(hashPhone('+8801711000000')).toEqual({ ph: sha('8801711000000'), phPlus: sha('+8801711000000') });
    expect(hashPhone('01711000000')).toBeNull();
    expect(hashPhone(null)).toBeNull();
  });

  it('turns minor units into the major unit by the currency', () => {
    expect(toMajor(245050, 'BDT')).toBe(2450.5);
    expect(toMajor(1200, 'JPY')).toBe(1200);
  });

  it('records only while on and ticked; a test event always', () => {
    const s = { on: true, events: { view: true, addToBag: false, checkout: false, purchase: false }, platforms: { meta: false, google: false, tiktok: false }, matchCustomers: false, maxAttempts: 5 };
    expect(records(s, 'view')).toBe(true);
    expect(records(s, 'purchase')).toBe(false);
    expect(records({ ...s, on: false }, 'view')).toBe(false);
    expect(records({ ...s, on: false }, 'purchase', true)).toBe(true);
  });

  it('knows a product page and the checkout, in both languages, and nothing else', () => {
    expect(pageEvent('/p/blue-polo', '/p/', '/checkout')).toEqual({ name: 'view', slug: 'blue-polo' });
    expect(pageEvent('/bn/p/blue-polo/navy?x=1', '/p/', '/checkout')).toEqual({ name: 'view', slug: 'blue-polo' });
    expect(pageEvent('/item/blue-polo', '/item/', '/checkout')).toEqual({ name: 'view', slug: 'blue-polo' });
    expect(pageEvent('/bn/checkout', '/p/', '/checkout')).toEqual({ name: 'checkout' });
    for (const p of ['/', '/bag', '/checkout/pay/1', '/p', '/collections/polos', '/p/Bad Slug']) expect(pageEvent(p, '/p/', '/checkout'), p).toBeNull();
    // the beacon spares the call on the same pages
    const cfg = { productPrefix: '/p/', checkoutPath: '/checkout', view: true, checkout: true };
    expect([counts('/p/blue-polo', cfg), counts('/bn/checkout', cfg), counts('/bag', cfg), counts('/p/', cfg)]).toEqual([true, true, false, false]);
    expect(counts('/p/blue-polo', { ...cfg, view: false })).toBe(false);
    // another colour of the same product is the same view
    expect(pageKey('/p/blue-polo/navy', cfg)).toBe(pageKey('/bn/p/blue-polo', cfg));
  });

  it('takes the platforms’ cookies only in their own shapes', () => {
    const jar: Record<string, string> = { _fbp: 'fb.1.1700000000000.1234567890', _fbc: 'fb.1.1700000000000.AbC-123', _ga: 'GA1.1.123456789.1700000000', _ttp: '<script>' };
    expect(platformCookies((n) => jar[n] ?? null)).toEqual({ fbp: jar._fbp, fbc: jar._fbc, gaClientId: '123456789.1700000000' });
  });

  it('a delivery: mock, sent, failed with tries left, then left as failed', () => {
    const at = new Date(Date.UTC(2026, 9, 31));
    const w = waitingFor(['meta', 'google']);
    expect(w).toEqual({ meta: { state: 'waiting', attempts: 0 }, google: { state: 'waiting', attempts: 0 } });
    expect(afterSend(w.meta, { ok: true, mode: 'MOCK' }, at).state).toBe('mock');
    expect(afterSend(w.meta, { ok: true, mode: 'LIVE' }, at).state).toBe('sent');
    const f1 = afterSend(w.meta, { ok: false, error: 'x'.repeat(500) }, at);
    expect(f1).toMatchObject({ state: 'failed', attempts: 1 });
    expect(f1.error).toHaveLength(200);
    expect(stillWaiting(f1, 2)).toBe(true);
    expect(stillWaiting(afterSend(f1, { ok: false, error: 'down' }, at), 2)).toBe(false);
    expect(stillWaiting(afterSend(f1, { ok: true, mode: 'LIVE' }, at), 2)).toBe(false);
  });

  it('the stored row as the adapters take it: money in taka, the order number', () => {
    const items = [{ id: 'p', sku: 'S', name: 'Polo', category: 'Polos', colour: 'Navy', size: 'M', quantity: 2, priceMinor: 120000 }];
    expect(valueOf(items)).toBe(240000);
    expect(valueOf([{ ...items[0]!, priceMinor: null }])).toBeNull();
    const e = toAdEvent({ eventId: 'purchase-1', name: 'purchase', url: null, valueMinor: 250000, currency: 'BDT', items, userData: { ext: 'h' }, occurredAt: new Date(0) }, 'EX1');
    expect(e).toMatchObject({ value: 2500, currency: 'BDT', orderNumber: 'EX1', user: { ext: 'h' } });
    expect(e.items[0]).toMatchObject({ price: 1200, colour: 'Navy', size: 'M' });
  });
});
