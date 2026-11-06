// PR 72 follow-up (104) — the test servers' sample delivery rule: it stands in only while the delivery page's own rules
// say nothing, promises no amount or time, and never answers on the live shop.
import { afterEach, describe, expect, it } from 'vitest';
import { TRY_DELIVERY_WORDS, tryDeliveryHandler, withSampleDelivery } from './try-delivery';

const was = process.env.EXTAS_SHOP_TEST_PAGES;
afterEach(() => {
  if (was === undefined) delete process.env.EXTAS_SHOP_TEST_PAGES;
  else process.env.EXTAS_SHOP_TEST_PAGES = was;
});
const post = (site = 'same-origin') => new Request('https://shop.example.test/api/shop/try-delivery', { method: 'POST', headers: { 'sec-fetch-site': site } });
const silent = (key: string) => ({ key, short: null, full: null });

describe('the sample delivery rule on test servers (follow-up 104)', () => {
  it('stands in for the delivery rule while the page says nothing, in the page language', () => {
    const out = withSampleDelivery([silent('delivery'), silent('cod'), silent('festive')], 'bn');
    expect(out[0]).toEqual({ key: 'delivery', ...TRY_DELIVERY_WORDS.bn });
    expect(out.slice(1)).toEqual([silent('cod'), silent('festive')]);
    expect(withSampleDelivery([silent('cod')], 'en')[0]).toEqual({ key: 'delivery', ...TRY_DELIVERY_WORDS.en });
  });

  it('never covers a rule the store has live', () => {
    const live = [silent('delivery'), { key: 'cod', short: 'Cash on delivery', full: null }];
    expect(withSampleDelivery(live, 'en')).toEqual(live);
  });

  it('promises no amount and no time (sample words only)', () => {
    for (const w of Object.values(TRY_DELIVERY_WORDS)) expect(`${w.short} ${w.full}`).not.toMatch(/[0-9০-৯৳]/);
  });

  it('answers only on a test server, same site only', () => {
    delete process.env.EXTAS_SHOP_TEST_PAGES;
    expect(tryDeliveryHandler(post()).status).toBe(404);
    process.env.EXTAS_SHOP_TEST_PAGES = '1';
    const r = tryDeliveryHandler(post());
    expect(r.status).toBe(200);
    expect(r.headers.get('set-cookie')).toMatch(/^extas_try_delivery=1; Path=\/;/);
    expect(tryDeliveryHandler(post('cross-site')).status).toBe(403);
  });
});
