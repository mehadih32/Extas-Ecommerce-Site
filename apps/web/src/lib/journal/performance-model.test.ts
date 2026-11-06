// S12 · PR 250 — the content performance report's pure rules: the read cookie (ids and times only, newest ten, junk
// dropped), once a shop day, where a reader came from, which reads an order credits, and the rows' order.
import { describe, expect, it } from 'vitest';
import type { OrganicSource } from '@extas/metrics/pure';
import { addRead, articleRows, creditedReads, parseReads, readOrigin, readToday, READS_MAX, serializeReads } from './performance-model';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const SOURCES: OrganicSource[] = [
  { name: 'Google', kind: 'search', match: ['google'] },
  { name: 'ChatGPT', kind: 'ai', match: ['chatgpt.com'] },
];
const DAY = 86_400_000;

describe('PR 250 · the read cookie', () => {
  it('round-trips ids and whole seconds, drops anything else, keeps the newest ten', () => {
    const reads = [{ postId: id(1), at: 1_700_000_000_000 }];
    expect(parseReads(serializeReads(reads))).toEqual(reads);
    expect(parseReads(`nope_${id(2)}.12a_${id(3)}.5_<script>.1`)).toEqual([{ postId: id(3), at: 5000 }]);
    let all = parseReads('');
    for (let i = 0; i < READS_MAX + 3; i++) all = addRead(all, id(i), i * 1000);
    expect(all).toHaveLength(READS_MAX);
    expect(all[0]!.postId).toBe(id(3));
  });

  it('a second read of the same article moves it to the newest, not twice', () => {
    const r = addRead(addRead(addRead([], id(1), 1000), id(2), 2000), id(1), 3000);
    expect(r).toEqual([
      { postId: id(2), at: 2000 },
      { postId: id(1), at: 3000 },
    ]);
  });

  it('counts once a shop day: Dhaka midnight starts a new day', () => {
    const at = Date.parse('2026-11-06T17:30:00Z'); // 23:30 in Dhaka
    const r = [{ postId: id(1), at }];
    expect(readToday(r, id(1), new Date('2026-11-06T17:50:00Z'), 'Asia/Dhaka')).toBe(true);
    expect(readToday(r, id(1), new Date('2026-11-06T18:10:00Z'), 'Asia/Dhaka')).toBe(false);
    expect(readToday(r, id(2), new Date(at), 'Asia/Dhaka')).toBe(false);
  });
});

describe('PR 250 · where a reader came from', () => {
  it('the shop, a listed search engine or AI assistant, or other', () => {
    expect(readOrigin('shop', SOURCES)).toBe('shop');
    expect(readOrigin('https://www.google.com', SOURCES)).toBe('search');
    expect(readOrigin('https://chatgpt.com', SOURCES)).toBe('search');
    expect(readOrigin('https://l.facebook.com', SOURCES)).toBe('other');
    expect(readOrigin('', SOURCES)).toBe('other');
    expect(readOrigin(42, SOURCES)).toBe('other');
  });
});

describe('PR 250 · which reads an order credits', () => {
  const placed = new Date('2026-11-06T06:00:00Z');
  const t = placed.getTime();
  const reads = [
    { postId: id(1), at: t - 10 * DAY },
    { postId: id(2), at: t - 3 * DAY },
    { postId: id(3), at: t - DAY },
    { postId: id(4), at: t + 60_000 },
  ];
  it('last: only the newest read inside the window (never a read after the order)', () => {
    expect(creditedReads(reads, placed, { windowDays: 7, credit: 'last' })).toEqual([{ postId: id(3), at: t - DAY }]);
  });
  it('every: each read inside the window', () => {
    expect(creditedReads(reads, placed, { windowDays: 7, credit: 'every' }).map((r) => r.postId)).toEqual([id(2), id(3)]);
    expect(creditedReads(reads, placed, { windowDays: 30, credit: 'every' })).toHaveLength(3);
  });
  it('nothing read in the window: no credit', () => {
    expect(creditedReads(reads.slice(0, 1), placed, { windowDays: 7, credit: 'last' })).toEqual([]);
  });
});

describe('PR 250 · the report rows', () => {
  it('Sales first, then Ordered value, then readers; untouched articles that are not live are left out', () => {
    const posts = [
      { id: id(1), title: 'Readers only', locale: 'en', live: true },
      { id: id(2), title: 'Sells', locale: 'bn', live: true },
      { id: id(3), title: 'Old, untouched', locale: 'en', live: false },
      { id: id(4), title: 'Ordered, not delivered', locale: 'en', live: false },
    ];
    const traffic = new Map([
      [id(1), { readers: 40, fromSearch: 30, fromShop: 5, fromOther: 5 }],
      [id(2), { readers: 20, fromSearch: 10, fromShop: 10, fromOther: 0 }],
    ]);
    const money = new Map([
      [id(2), { ordered: { orders: 2, valueMinor: 300_000 }, sales: { orders: 1, valueMinor: 150_000 } }],
      [id(4), { ordered: { orders: 1, valueMinor: 90_000 }, sales: { orders: 0, valueMinor: 0 } }],
    ]);
    const rows = articleRows(posts, traffic, money);
    expect(rows.map((r) => r.title)).toEqual(['Sells', 'Ordered, not delivered', 'Readers only']);
    expect(rows[0]!.perHundred).toBe(10);
    expect(rows[1]!.perHundred).toBeNull();
    expect(rows[2]).toMatchObject({ readers: 40, ordered: { orders: 0, valueMinor: 0 }, perHundred: 0 });
  });
});
