// PR 606 — the bulk lane's trial on test servers: it turns the lane on for one browser only, keeps the owner's own
// numbers, and its door is shut on the live shop.
import { registry } from '@extas/settings';
import { afterEach, describe, expect, it } from 'vitest';
import { bulkTrial, bulkTrialSettings, tryBulkHandler, tryBulkOnRequest, TRY_BULK_COOKIE } from './try-bulk';

const was = process.env.EXTAS_SHOP_TEST_PAGES;
afterEach(() => {
  if (was === undefined) delete process.env.EXTAS_SHOP_TEST_PAGES;
  else process.env.EXTAS_SHOP_TEST_PAGES = was;
});
const lane = registry['orders.bulkLane'].default;

describe('the bulk lane trial', () => {
  it('draws the lane on, the bag card from two pieces when the owner set no number, his own number when he did', () => {
    expect(lane.enabled).toBe(false);
    expect(bulkTrial(lane)).toMatchObject({ enabled: true, bag: { atPieces: 2, atStockLimit: true } });
    expect(bulkTrial({ ...lane, bag: { atPieces: 12, atStockLimit: false } }).bag).toEqual({ atPieces: 12, atStockLimit: false });
    expect(bulkTrial(lane).minQuantity).toBe(lane.minQuantity);
  });

  it('overrides that one setting and nothing else', async () => {
    const settings = { value: async (key: string) => (key === 'orders.bulkLane' ? lane : `v:${key}`) } as never;
    const s = bulkTrialSettings(settings);
    expect((await s.value('orders.bulkLane')).enabled).toBe(true);
    expect(await s.value('store.name')).toBe('v:store.name');
  });

  it('is shut on the live shop: the door is 404 and the cookie is never read', async () => {
    delete process.env.EXTAS_SHOP_TEST_PAGES;
    const req = new Request('https://shop.example.test/api/shop/try-bulk', { method: 'POST', headers: { 'sec-fetch-site': 'same-origin', cookie: `${TRY_BULK_COOKIE}=1` } });
    expect((await tryBulkHandler(req)).status).toBe(404);
    expect(tryBulkOnRequest(req)).toBe(false);
    process.env.EXTAS_SHOP_TEST_PAGES = '1';
    expect(tryBulkOnRequest(req)).toBe(true);
  });
});
