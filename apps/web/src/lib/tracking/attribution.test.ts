// S13 · PR 257 follow-up (go-live gate customer 360°, 1 Nov) — a tagged visit is kept until the order: the tags and the
// platform read from the link, the shop's own pages never "where he came from", the cookie read back only when it is
// ours, within the owner's days and with the switch on, and the first or the latest visit as he chose. The proxy sets
// the cookie on a tagged page and keeps that answer out of every cache. Every value is a made-up test value.
import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { AttributionSettings } from '@extas/settings';

let cfg: AttributionSettings = { on: true, keepDays: 30, touch: 'last' };
vi.mock('../settings', () => ({
  settingsResolver: () => ({ value: async (key: string) => (key === 'ads.attribution' ? cfg : undefined) }),
  settingsTimeoutMs: () => 1_000,
  withTimeout: <T,>(p: Promise<T>) => p,
}));
vi.mock('../seo/redirect-table', () => ({ redirectTable: async () => ({}), forwardOf: () => null, countRedirectHit: () => {} }));
vi.mock('../seo/bengali-gate', () => ({ bengaliGateSends: async () => false }));
vi.mock('../shop/store-id', () => ({ shopStoreId: () => 1 }));

const { ATTRIBUTION_COOKIE, decodeTouch, encodeTouch, hasTags, keptTouch, landingCookie, nextTouch, orderAttributionOf, stillKept, touchOf } = await import('./attribution');
const { proxy } = await import('../../proxy');

const NOW = Date.UTC(2026, 10, 1, 6, 0, 0); // hardcode-ok: a made-up test time
const DAY = 86_400_000;
const FBCLID = 'IwAR3abcDEF_ghi-123456';
const q = (s: string) => new URLSearchParams(s);

describe('a tagged visit (PR 257 follow-up)', () => {
  it('reads the campaign tags and the platform of the click id', () => {
    const t = touchOf(q(`utm_source=facebook&utm_medium=paid_social&utm_campaign=eid-polo&fbclid=${FBCLID}`), 'https://m.facebook.com/story.php?id=9', 'shop.test', NOW)!;
    expect(t).toEqual({ utmSource: 'facebook', utmMedium: 'paid_social', utmCampaign: 'eid-polo', adPlatform: 'META', referrer: 'https://m.facebook.com', fbc: `fb.1.${NOW}.${FBCLID}`, at: NOW });
    expect(touchOf(q('gclid=Cj0KCQjw_abcdefgh'), null, 'shop.test', NOW)?.adPlatform).toBe('GOOGLE');
    expect(touchOf(q('ttclid=E.C.P.abcdefgh'.replace(/\./g, '_')), null, 'shop.test', NOW)?.adPlatform).toBe('TIKTOK');
  });

  it('an untagged address, a broken click id or the shop itself as referrer keep nothing of their own', () => {
    expect(hasTags(q('colour=navy&s=M'))).toBe(false);
    expect(touchOf(q('colour=navy'), 'https://m.facebook.com/', 'shop.test', NOW)).toBeNull();
    expect(touchOf(q('fbclid=<script>'), null, 'shop.test', NOW)).toBeNull();
    expect(touchOf(q('utm_source=newsletter'), 'https://shop.test/p/polo', 'shop.test', NOW)?.referrer).toBeNull();
  });

  it('the cookie reads back only when it is ours; a damaged one is nothing', () => {
    const t = touchOf(q('utm_source=facebook&utm_campaign=eid'), null, 'shop.test', NOW)!;
    expect(decodeTouch(encodeTouch(t))).toEqual(t);
    expect(decodeTouch('not base64 !')).toBeNull();
    expect(decodeTouch(Buffer.from('{"at":"soon"}').toString('base64url'))).toBeNull();
    // a forged platform or fbc is dropped, the rest kept
    const forged = Buffer.from(JSON.stringify({ ...t, adPlatform: 'MYSPACE', fbc: 'evil' })).toString('base64url');
    expect(decodeTouch(forged)).toMatchObject({ utmSource: 'facebook', adPlatform: null, fbc: null });
  });

  it('counts only within the owner’s days and with the switch on; the first or the latest visit as he chose', () => {
    const old = touchOf(q('utm_source=old'), null, 'shop.test', NOW - 31 * DAY)!;
    const recent = touchOf(q('utm_source=recent'), null, 'shop.test', NOW - DAY)!;
    const arrived = touchOf(q('utm_source=new'), null, 'shop.test', NOW)!;
    expect(stillKept(old, cfg, NOW)).toBeNull();
    expect(stillKept(recent, cfg, NOW)).toEqual(recent);
    expect(stillKept(recent, { ...cfg, on: false }, NOW)).toBeNull();
    expect(nextTouch(recent, arrived, cfg, NOW)).toEqual(arrived);
    expect(nextTouch(recent, arrived, { ...cfg, touch: 'first' }, NOW)).toBeNull();
    expect(nextTouch(old, arrived, { ...cfg, touch: 'first' }, NOW)).toEqual(arrived);
    expect(nextTouch(null, arrived, { ...cfg, on: false }, NOW)).toBeNull();
    expect(orderAttributionOf(recent)).toEqual({ utmSource: 'recent', utmMedium: null, utmCampaign: null, adPlatform: null, referrer: null });
  });

  it('the landing cookie and the checkout read follow the setting', async () => {
    const line = await landingCookie({ storeId: 1, params: q('utm_source=facebook'), referer: null, host: 'shop.test', cookie: null, now: NOW });
    expect(line).toMatch(new RegExp(`^${ATTRIBUTION_COOKIE}=[A-Za-z0-9_-]+; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 86_400}$`));
    const value = line!.split(';')[0]!.split('=')[1]!;
    expect((await keptTouch(value, 1, null, NOW + DAY))?.utmSource).toBe('facebook');
    cfg = { ...cfg, on: false };
    try {
      expect(await landingCookie({ storeId: 1, params: q('utm_source=facebook'), referer: null, host: 'shop.test', cookie: null, now: NOW })).toBeNull();
      expect(await keptTouch(value, 1, null, NOW + DAY)).toBeNull();
    } finally {
      cfg = { ...cfg, on: true };
    }
  });
});

describe('the proxy keeps the tags of a tagged shop page (PR 257 follow-up)', () => {
  it('sets the cookie and keeps that answer out of every cache', async () => {
    const res = await proxy(new NextRequest(`http://127.0.0.1:3000/p/essential-pique-polo?utm_source=facebook&fbclid=${FBCLID}`, { headers: { referer: 'https://l.facebook.com/' } }));
    const set = res.headers.get('set-cookie') ?? '';
    expect(set).toContain(`${ATTRIBUTION_COOKIE}=`);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.headers.get('cdn-cache-control')).toBe('no-store');
    const kept = decodeTouch(set.split(';')[0]!.split('=')[1]!);
    expect(kept).toMatchObject({ utmSource: 'facebook', adPlatform: 'META', referrer: 'https://l.facebook.com' });
  });

  it('an untagged page sets nothing', async () => {
    const res = await proxy(new NextRequest('http://127.0.0.1:3000/p/essential-pique-polo'));
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});
