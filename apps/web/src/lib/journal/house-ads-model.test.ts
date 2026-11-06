// S12 · PR 592 — the house ads' rules without a database: what an ad and a place may be, which ads a page gets (the
// most relevant, at most three on an article, one inside the words, never twice, never before the first paragraph),
// whole shop days, the popup's trigger, cap and search guard, and the click an order credits.
import { describe, expect, it } from 'vitest';
import { HOUSE_ADS_DEFAULT } from '@extas/settings';
import {
  adInputSchema,
  adState,
  capWindow,
  creditedClick,
  datesOf,
  daysOf,
  fromSearchSite,
  isRunning,
  parseClick,
  pickForPage,
  placeInputSchema,
  popupMayOpen,
  popupOf,
  readPopup,
  relevance,
  serializeClick,
  type Candidate,
  type PopupMoment,
} from './house-ads-model';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const S = HOUSE_ADS_DEFAULT;
const TZ = 'Asia/Dhaka';

const cand = (n: number, patch: Partial<Candidate> = {}): Candidate => ({ placeId: id(100 + n), adId: id(n), slot: 'end', kind: 'banner', target: '/collections/polo', weight: 1, postId: null, blogCategoryId: null, after: null, ...patch });
const article = { postId: id(900), categoryIds: [id(800), id(801)], productIds: [id(700)] };

describe('an ad and a place', () => {
  const ad = { name: 'Polo week', kind: 'banner', target: '/collections/polo', creativeAssetId: id(1), weight: 2, headlineEn: 'Polos for the heat' };

  it('a banner goes to a shop page and needs a picture; the others name their product, combo or category by id', () => {
    expect(adInputSchema.safeParse(ad).success).toBe(true);
    expect(adInputSchema.safeParse({ ...ad, creativeAssetId: null }).success).toBe(false);
    expect(adInputSchema.safeParse({ ...ad, target: 'https://elsewhere.example/x' }).success).toBe(false);
    expect(adInputSchema.safeParse({ ...ad, target: '//elsewhere.example' }).success).toBe(false);
    expect(adInputSchema.safeParse({ ...ad, kind: 'product', target: id(5), creativeAssetId: null }).success).toBe(true);
    expect(adInputSchema.safeParse({ ...ad, kind: 'product', target: '/products/x' }).success).toBe(false);
  });

  it('needs an English headline, keeps Bengali optional, refuses unknown fields and a last day before the first', () => {
    expect(adInputSchema.safeParse({ ...ad, headlineEn: ' ' }).success).toBe(false);
    const r = adInputSchema.parse({ ...ad, headlineBn: '  ', textEn: 'Cool cotton' });
    expect(r.headlineBn).toBeNull();
    expect(r.textEn).toBe('Cool cotton');
    expect(adInputSchema.safeParse({ ...ad, network: 'adsense' }).success).toBe(false);
    expect(adInputSchema.safeParse({ ...ad, startsOn: '2026-11-10', endsOn: '2026-11-09' }).success).toBe(false);
    expect(adInputSchema.safeParse({ ...ad, startsOn: '2026-11-10', endsOn: '2026-11-10' }).success).toBe(true);
  });

  it('a place inside the words or between cards needs its position; a topic or article place needs which one', () => {
    expect(placeInputSchema.safeParse({ slot: 'inline', scope: 'all' }).success).toBe(false);
    expect(placeInputSchema.safeParse({ slot: 'inline', scope: 'all', after: 2 }).success).toBe(true);
    expect(placeInputSchema.safeParse({ slot: 'inline', scope: 'all', after: 0 }).success).toBe(false);
    expect(placeInputSchema.safeParse({ slot: 'end', scope: 'category' }).success).toBe(false);
    expect(placeInputSchema.safeParse({ slot: 'end', scope: 'post', postId: id(9) }).success).toBe(true);
    expect(placeInputSchema.safeParse({ slot: 'listTop', scope: 'post', postId: id(9) }).success).toBe(false);
  });

  it('a popup keeps its own trigger and cap, else the settings’ defaults; other places store none', () => {
    expect(popupOf({ slot: 'end', trigger: null, pct: null, seconds: null, capTimes: null, capDays: null }, S)).toBeNull();
    expect(popupOf({ slot: 'popup', trigger: null, pct: null, seconds: null, capTimes: null, capDays: null }, S)).toEqual({ trigger: { kind: 'scroll', pct: 50, seconds: 0 }, cap: { times: 1, days: 7 } });
    expect(popupOf({ slot: 'popup', trigger: 'leave', pct: 70, seconds: null, capTimes: 2, capDays: 3 }, S)).toEqual({ trigger: { kind: 'leave', pct: 70, seconds: 0 }, cap: { times: 2, days: 3 } });
    expect(readPopup({ kind: 'odd', pct: 500 }, null, S)).toEqual({ trigger: { kind: 'scroll', pct: 50, seconds: 0 }, cap: { times: 1, days: 7 } });
  });
});

describe('dates are whole shop days', () => {
  it('from the start of the first day to the end of the last, in the store’s time zone, and back', () => {
    const d = datesOf('2026-11-10', '2026-11-12', TZ);
    expect(d.startsAt!.toISOString()).toBe('2026-11-09T18:00:00.000Z');
    expect(d.endsAt!.toISOString()).toBe('2026-11-12T18:00:00.000Z');
    expect(daysOf(d.startsAt, d.endsAt, TZ)).toEqual({ startsOn: '2026-11-10', endsOn: '2026-11-12' });
    expect(datesOf(null, null, TZ)).toEqual({ startsAt: null, endsAt: null });
  });

  it('running only while on, not set aside and inside its days', () => {
    const d = datesOf('2026-11-10', '2026-11-12', TZ);
    const ad = { enabled: true, archivedAt: null, ...d };
    expect(isRunning(ad, new Date('2026-11-09T17:59:59Z'))).toBe(false);
    expect(isRunning(ad, new Date('2026-11-09T18:00:00Z'))).toBe(true);
    expect(isRunning(ad, new Date('2026-11-12T17:59:59Z'))).toBe(true);
    expect(isRunning(ad, new Date('2026-11-12T18:00:00Z'))).toBe(false);
    expect(isRunning({ ...ad, enabled: false }, new Date('2026-11-11T00:00:00Z'))).toBe(false);
    expect(adState(ad, new Date('2026-11-01T00:00:00Z'))).toBe('waiting');
    expect(adState(ad, new Date('2026-11-20T00:00:00Z'))).toBe('ended');
    expect(adState({ ...ad, archivedAt: new Date() }, new Date())).toBe('aside');
  });
});

describe('which ads a page gets', () => {
  it('relevance: this article, then its topic, then a product it shows, then all; another article’s or topic’s never', () => {
    expect(relevance(cand(1, { postId: id(900) }), article)).toBe(3);
    expect(relevance(cand(1, { blogCategoryId: id(801) }), article)).toBe(2);
    expect(relevance(cand(1, { kind: 'product', target: id(700) }), article)).toBe(1);
    expect(relevance(cand(1), article)).toBe(0);
    expect(relevance(cand(1, { postId: id(901) }), article)).toBe(-1);
    expect(relevance(cand(1, { blogCategoryId: id(802) }), article)).toBe(-1);
  });

  it('the most relevant ad wins its place, whatever the weights', () => {
    const got = pickForPage([cand(1, { weight: 100 }), cand(2, { blogCategoryId: id(800) })], article, ['end'], S, () => 0);
    expect(got.map((c) => c.adId)).toEqual([id(2)]);
  });

  it('weights share a place among equally relevant ads', () => {
    const list = [cand(1, { weight: 1 }), cand(2, { weight: 3 })];
    expect(pickForPage(list, article, ['end'], S, () => 0.2)[0]!.adId).toBe(id(1));
    expect(pickForPage(list, article, ['end'], S, () => 0.3)[0]!.adId).toBe(id(2));
  });

  it('an article keeps three at most, one inside the words, never the same ad twice; the popup replaces the bar', () => {
    const list = [
      cand(1, { slot: 'inline', after: 2 }),
      cand(2, { slot: 'inline', after: 4 }),
      cand(3, { slot: 'end' }),
      cand(1, { slot: 'end', placeId: id(150) }),
      cand(4, { slot: 'popup' }),
      cand(5, { slot: 'bar' }),
      cand(6, { slot: 'sidebar' }),
    ];
    const got = pickForPage(list, article, ['inline', 'end', 'popup', 'bar', 'sidebar'], S, () => 0);
    expect(got.map((c) => [c.slot, c.adId])).toEqual([
      ['inline', id(1)],
      ['end', id(3)],
      ['popup', id(4)],
      ['bar', id(5)],
    ]);
    const two = pickForPage(list, article, ['inline', 'end', 'popup', 'bar', 'sidebar'], { maxPerPage: 6, inlineMax: 2 }, () => 0);
    expect(two.filter((c) => c.slot === 'inline').map((c) => c.after)).toEqual([2, 4]);
    expect(two.some((c) => c.slot === 'sidebar')).toBe(true);
    expect(new Set(two.map((c) => c.adId)).size).toBe(two.length);
  });

  it('no ad inside the words while the inside count is 0; list pages take one ad per card position', () => {
    expect(pickForPage([cand(1, { slot: 'inline', after: 1 })], article, ['inline'], { maxPerPage: 3, inlineMax: 0 })).toEqual([]);
    const list = { postId: null, categoryIds: [], productIds: [] };
    const got = pickForPage([cand(1, { slot: 'listTop' }), cand(2, { slot: 'listBetween', after: 3 }), cand(3, { slot: 'listBetween', after: 6 }), cand(4, { slot: 'end' })], list, ['listTop', 'listBetween'], S, () => 0);
    expect(got.map((c) => c.adId)).toEqual([id(1), id(2), id(3)]);
  });
});

describe('the popup', () => {
  const m = (p: Partial<PopupMoment> = {}): PopupMoment => ({ readPct: 0, seconds: 0, leaving: false, pastFirstScreen: false, phone: false, fromSearch: false, shownInWindow: 0, closedThisVisit: false, ...p });
  const scroll = { kind: 'scroll', pct: 50, seconds: 0 } as const;
  const cap = { times: 1, days: 7 };

  it('opens on its trigger: read this far, this long on the page, or leaving', () => {
    expect(popupMayOpen(scroll, cap, m({ readPct: 49 }), true)).toBe(false);
    expect(popupMayOpen(scroll, cap, m({ readPct: 50 }), true)).toBe(true);
    expect(popupMayOpen({ kind: 'time', pct: 50, seconds: 20 }, cap, m({ seconds: 20 }), true)).toBe(true);
    expect(popupMayOpen({ kind: 'time', pct: 50, seconds: 0 }, cap, m({ seconds: 999 }), true)).toBe(false);
    expect(popupMayOpen({ kind: 'leave', pct: 50, seconds: 0 }, cap, m({ leaving: true }), true)).toBe(true);
  });

  it('never past its cap, never again after a close this visit', () => {
    expect(popupMayOpen(scroll, cap, m({ readPct: 90, shownInWindow: 1 }), true)).toBe(false);
    expect(popupMayOpen(scroll, cap, m({ readPct: 90, closedThisVisit: true }), true)).toBe(false);
    const now = Date.parse('2026-11-10T00:00:00Z');
    expect(capWindow([now - 8 * 86_400_000, now - 86_400_000, Number.NaN], now, 7)).toEqual([now - 86_400_000]);
  });

  it('a phone visitor from a search engine never gets it on the first screen (the guard can be switched off)', () => {
    const searcher = m({ readPct: 90, phone: true, fromSearch: true });
    expect(popupMayOpen(scroll, cap, searcher, true)).toBe(false);
    expect(popupMayOpen(scroll, cap, { ...searcher, pastFirstScreen: true }, true)).toBe(true);
    expect(popupMayOpen(scroll, cap, searcher, false)).toBe(true);
    expect(popupMayOpen(scroll, cap, { ...searcher, phone: false }, true)).toBe(true);
  });

  it('knows a search engine by the organic list’s match words', () => {
    expect(fromSearchSite('https://www.google.com.bd/', ['google'])).toBe(true);
    expect(fromSearchSite('https://www.bing.com/search?q=x', ['bing.com'])).toBe(true);
    expect(fromSearchSite('https://notgoogle.com/', ['google'])).toBe(false);
    expect(fromSearchSite('', ['google'])).toBe(false);
  });
});

describe('the click an order credits', () => {
  it('the cookie holds one place id and a time, nothing else', () => {
    const c = serializeClick(id(101), 1_780_000_000_000);
    expect(parseClick(c)).toEqual({ placeId: id(101), at: 1_780_000_000_000 });
    expect(parseClick('x.1')).toBeNull();
    expect(parseClick(null)).toBeNull();
  });

  it('only a click before the order and within the credit days', () => {
    const placed = new Date('2026-11-10T00:00:00Z');
    const at = (days: number) => ({ placeId: id(101), at: placed.getTime() - days * 86_400_000 });
    expect(creditedClick(at(7), placed, 7)).not.toBeNull();
    expect(creditedClick(at(7.01), placed, 7)).toBeNull();
    expect(creditedClick(at(-0.1), placed, 7)).toBeNull();
    expect(creditedClick(null, placed, 7)).toBeNull();
  });
});
