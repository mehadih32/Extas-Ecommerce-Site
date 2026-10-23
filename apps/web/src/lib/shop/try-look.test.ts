// PR 128 — the test servers' sample thank-you door is sample data (the unallocated +88010 range, a visitor id of the bag
// cookie's shape) and never answers on the live shop.
import { visitorIdSchema } from '@extas/cart';
import { SAMPLE_PHONE } from '@extas/seed';
import { afterEach, describe, expect, it } from 'vitest';
import { TRY_LOOK_ORDER, TRY_LOOK_VISITOR, tryLookHandler } from './try-look';
import { readFileSync } from 'node:fs';

const was = { pages: process.env.EXTAS_SHOP_TEST_PAGES, db: process.env.DATABASE_URL };
afterEach(() => {
  if (was.pages === undefined) delete process.env.EXTAS_SHOP_TEST_PAGES;
  else process.env.EXTAS_SHOP_TEST_PAGES = was.pages;
  if (was.db === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = was.db;
});
const post = (site = 'same-origin') => new Request('https://shop.example.test/api/shop/try-look', { method: 'POST', headers: { 'sec-fetch-site': site } });

describe('the sample thank-you page with "Complete your look" (test servers only)', () => {
  it('is sample data: a visitor id of the bag cookie`s shape, a +88010 phone, the test server`s own number', () => {
    expect(visitorIdSchema.safeParse(TRY_LOOK_VISITOR).success).toBe(true);
    expect(TRY_LOOK_ORDER).toMatch(/^TRY-/);
    const phone = /TRY_LOOK_PHONE = '([^']+)'/.exec(readFileSync(new URL('./try-look.ts', import.meta.url), 'utf8'))?.[1];
    expect(phone).toMatch(SAMPLE_PHONE);
  });

  it('answers 404 on the live shop and refuses another site', async () => {
    delete process.env.EXTAS_SHOP_TEST_PAGES;
    expect((await tryLookHandler(post())).status).toBe(404);
    process.env.EXTAS_SHOP_TEST_PAGES = '1';
    process.env.DATABASE_URL = 'postgresql://nobody@127.0.0.1:1/none';
    expect((await tryLookHandler(post('cross-site'))).status).toBe(403);
  });
});
