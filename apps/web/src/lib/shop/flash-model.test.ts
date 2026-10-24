// PR 44 — the flash sale's rules: only a running sale shows, only real markdowns (H3), the two rows (§57.1, §58.1), the
// "Up to" tag from the cards' own struck prices, and a clock that counts down to the owner's end and stops at zero.
import { homeFlashRowsSchema, homeFlashSaleSchema, registry } from '@extas/settings';
import { describe, expect, it } from 'vitest';
import type { ShopCard } from './catalogue';
import { clockDeadline, clockParts, CLOCK_TRUST_MS, flashOff, flashPick, flashRows, flashRunning, flashUpTo, nextTickMs } from './flash-model';
import { flashTrialAsked, trialSale, TRIAL_LEFT_MS } from './flash';

const card = (id: string, priceMinor: number | null, wasMinor: number | null = null): ShopCard => ({
  id,
  slug: id,
  nameEn: id,
  nameBn: null,
  garment: null,
  categorySlug: null,
  fit: null,
  priceMinor,
  wasMinor,
  colours: [],
  badge: null,
  photos: {},
  inStock: true,
  sortRank: 0,
});

const H = 3_600_000;
const NOW = Date.parse('2026-10-24T06:00:00.000Z');
const sale = (over: Partial<ReturnType<typeof homeFlashSaleSchema.parse>> = {}) =>
  homeFlashSaleSchema.parse({ on: true, startsAt: null, endsAt: new Date(NOW + 4 * H).toISOString(), source: 'products', productIds: [], collection: null, ...over });

describe('the settings', () => {
  it('ship no sale (owner data, PR 509) and the demo`s rows', () => {
    expect(registry['home.flashSale'].default).toBeNull();
    expect(registry['home.flashSale'].isOwnerData).toBe(true);
    expect(registry['home.flashRows'].default).toEqual({ onlyMarkdowns: true, inStockOnly: true, perRow: 10, fillTo: 5, speed: 24, upTo: true });
    expect(registry['home.flashSale'].version).toBe(45);
    expect(registry['home.flashRows'].version).toBe(45);
  });

  it('refuse a sale that ends before it starts, a collection sale with no collection, a product twice', () => {
    expect(() => sale({ startsAt: new Date(NOW + 5 * H).toISOString() })).toThrow();
    expect(() => sale({ source: 'collection', collection: null })).toThrow();
    const id = '0f9e2b55-5b8f-4b8e-9d55-4c1bd0d5a001';
    expect(() => sale({ productIds: [id, id] })).toThrow();
    expect(() => sale({ endsAt: 'tomorrow' })).toThrow();
    expect(homeFlashRowsSchema.safeParse({ onlyMarkdowns: true, inStockOnly: true, perRow: 1, fillTo: 8, speed: 24, upTo: true }).success).toBe(false);
  });
});

describe('a running sale', () => {
  it('runs only when on, begun and not over', () => {
    expect(flashRunning(null, NOW)).toBeNull();
    expect(flashRunning(sale({ on: false }), NOW)).toBeNull();
    expect(flashRunning(sale(), NOW)).toEqual({ startsAt: null, endsAt: NOW + 4 * H });
    expect(flashRunning(sale({ startsAt: new Date(NOW + H).toISOString() }), NOW)).toBeNull();
    expect(flashRunning(sale({ startsAt: new Date(NOW - H).toISOString() }), NOW)?.endsAt).toBe(NOW + 4 * H);
    expect(flashRunning(sale(), NOW + 4 * H)).toBeNull();
  });
});

describe('the cards (H3: only real markdowns)', () => {
  const cards = [card('a', 95000, 119000), card('b', 120000), card('c', null), card('d', 100000, 100000), card('e', 136000, 160000)];

  it('keeps only cards with a struck price the PR 38 rule gave, unless the owner switched that off', () => {
    expect(flashPick(cards, { onlyMarkdowns: true }).map((c) => c.id)).toEqual(['a', 'e']);
    expect(flashPick(cards, { onlyMarkdowns: false }).map((c) => c.id)).toEqual(['a', 'b', 'd', 'e']);
  });

  it('works the tag out from the shown cards`s own prices, never a typed number', () => {
    expect(flashOff(card('a', 95000, 119000))).toBe(20);
    expect(flashOff(card('b', 120000))).toBe(0);
    expect(flashUpTo(cards)).toBe(20);
    expect(flashUpTo([card('b', 1000)])).toBe(0);
  });
});

describe('the two rows', () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => card(`p${i}`, 1000, 2000));
  const ids = (r: { cards: ShopCard[] }) => r.cards.map((c) => c.id);

  it('draw nothing for no card and one row for one card', () => {
    expect(flashRows([], { perRow: 10, fillTo: 8 })).toEqual([]);
    const one = flashRows(many(1), { perRow: 10, fillTo: 8 });
    expect(one).toHaveLength(1);
    expect(one[0]!.copies).toEqual([false]);
  });

  it('split a long sale: about ten in each row (§57.1), never more than two rows', () => {
    const rows = flashRows(many(100), { perRow: 10, fillTo: 8 });
    expect(rows).toHaveLength(2);
    expect(ids(rows[0]!)).toEqual(many(10).map((c) => c.id));
    expect(ids(rows[1]!)).toEqual(many(20).slice(10).map((c) => c.id));
    expect(rows.flatMap((r) => r.copies)).not.toContain(true);
  });

  it('repeat a short sale so both rows glide (the demo`s 8), the second half a lap in, every repeat a copy', () => {
    const rows = flashRows(many(3), { perRow: 10, fillTo: 8 });
    expect(ids(rows[0]!)).toEqual(['p0', 'p1', 'p2', 'p0', 'p1', 'p2', 'p0', 'p1']);
    expect(ids(rows[1]!)).toEqual(['p2', 'p0', 'p1', 'p2', 'p0', 'p1', 'p2', 'p0']);
    expect(rows[0]!.copies).toEqual([false, false, false, true, true, true, true, true]);
    expect(rows[1]!.copies.every(Boolean)).toBe(true);
    // the two rows never show the same card at the same place
    rows[0]!.cards.forEach((c, i) => expect(c.id).not.toBe(rows[1]!.cards[i]!.id));
  });

  it('every product is reachable once by keyboard and screen reader', () => {
    for (const n of [2, 3, 7, 12, 15, 16, 40]) {
      const rows = flashRows(many(n), { perRow: 10, fillTo: 8 });
      const shown = rows.flatMap((r) => r.cards.filter((_, i) => !r.copies[i]).map((c) => c.id));
      expect(new Set(shown).size, `n=${n}`).toBe(shown.length);
      expect(shown.length, `n=${n}`).toBe(Math.min(n, 20));
    }
  });
});

describe('the clock (§58.11: it ticks and never restarts)', () => {
  it('shows hours in all, minutes and seconds, numbers only, and zero at the end', () => {
    expect(clockParts(((4 * 60 + 12) * 60 + 38) * 1000)).toMatchObject({ h: '04', m: '12', s: '38', hours: 4, minutes: 12 });
    expect(clockParts(52 * H + 999)).toMatchObject({ h: '52', m: '00', s: '00' });
    expect(clockParts(0)).toMatchObject({ h: '00', m: '00', s: '00' });
    expect(clockParts(-5000)).toMatchObject({ h: '00', m: '00', s: '00' });
  });

  it('counts down to the owner`s end on a right phone clock, and on the server`s time on a wrong one', () => {
    const end = NOW + H;
    expect(clockDeadline(end, NOW, NOW + 2_000)).toBe(end);
    expect(clockDeadline(end, NOW, NOW - CLOCK_TRUST_MS)).toBe(end);
    // a phone 3 hours behind still sees one hour left, not four
    const behind = NOW - 3 * H;
    expect(clockDeadline(end, NOW, behind) - behind).toBe(H);
    const ahead = NOW + 2 * H;
    expect(clockDeadline(end, NOW, ahead) - ahead).toBe(H);
  });

  it('wakes exactly when the shown second changes', () => {
    expect(nextTickMs(4500)).toBe(505);
    expect(nextTickMs(4000)).toBe(16);
    // the shown seconds after the wait are exactly one less
    for (const left of [7_250, 7_000, 6_999, 1_001, 60_000]) {
      const now = clockParts(left).hours * 3600 + clockParts(left).minutes * 60 + Number(clockParts(left).s);
      const next = clockParts(left - nextTickMs(left));
      expect(next.hours * 3600 + next.minutes * 60 + Number(next.s), `left=${left}`).toBe(now - 1);
    }
  });
});

describe('the test server`s trial', () => {
  it('answers only on a test server, and runs the demo`s 04:12:38', () => {
    const was = process.env.EXTAS_SHOP_TEST_PAGES;
    try {
      delete process.env.EXTAS_SHOP_TEST_PAGES;
      expect(flashTrialAsked({ try: 'flash' })).toBe(false);
      process.env.EXTAS_SHOP_TEST_PAGES = '1';
      expect(flashTrialAsked({ try: 'flash' })).toBe(true);
      expect(flashTrialAsked({ try: '1' })).toBe(false);
    } finally {
      if (was === undefined) delete process.env.EXTAS_SHOP_TEST_PAGES;
      else process.env.EXTAS_SHOP_TEST_PAGES = was;
    }
    const t = trialSale(NOW);
    expect(homeFlashSaleSchema.safeParse(t).success).toBe(true);
    expect(clockParts(Date.parse(t.endsAt) - NOW)).toMatchObject({ h: '04', m: '12', s: '38' });
    expect(TRIAL_LEFT_MS).toBe(Date.parse(t.endsAt) - NOW);
  });
});
