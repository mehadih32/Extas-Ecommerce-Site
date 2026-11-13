import { describe, expect, it } from 'vitest';
import { recordAdCreativeDay } from './overview';

const NO_DB = {} as never; // the checks run before the database is touched
const ok = { adId: 'a', day: '2026-11-13', spendStoreMinor: 100, impressions: 10, clicks: 1, purchases: 0 };

describe('PR 699 · one ad day writer refuses bad figures first', () => {
  it.each([
    ['a bad day', { day: '13-11-2026' }],
    ['a negative spend', { spendStoreMinor: -1 }],
    ['a fraction', { impressions: 1.5 }],
    ['not a number', { clicks: Number.NaN }],
    ['more clicks than shows', { clicks: 11 }],
  ])('%s', async (_n, bad) => {
    await expect(recordAdCreativeDay(NO_DB, { ...ok, ...bad })).rejects.toThrow('BAD_AD_DAY');
  });
});
