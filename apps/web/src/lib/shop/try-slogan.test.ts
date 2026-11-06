// PR 85 follow-up (111) — the test servers' long sample slogan: within the owner's limit, in both languages, and never
// answering on the live shop.
import { registry } from '@extas/settings';
import { afterEach, describe, expect, it } from 'vitest';
import { TRY_SLOGAN, trySloganHandler } from './try-slogan';

const was = process.env.EXTAS_SHOP_TEST_PAGES;
afterEach(() => {
  if (was === undefined) delete process.env.EXTAS_SHOP_TEST_PAGES;
  else process.env.EXTAS_SHOP_TEST_PAGES = was;
});
const post = (site = 'same-origin') => new Request('https://shop.example.test/api/shop/try-slogan', { method: 'POST', headers: { 'sec-fetch-site': site } });

describe('the long sample slogan on test servers (follow-up 111)', () => {
  it('is a valid slogan near the limit in both languages', () => {
    expect(registry['brand.slogan'].schema.safeParse(TRY_SLOGAN).success).toBe(true);
    expect(TRY_SLOGAN.en.length).toBeGreaterThan(100);
    expect(TRY_SLOGAN.bn.length).toBeGreaterThan(100);
  });

  it('answers only on a test server, same site only', () => {
    delete process.env.EXTAS_SHOP_TEST_PAGES;
    expect(trySloganHandler(post()).status).toBe(404);
    process.env.EXTAS_SHOP_TEST_PAGES = '1';
    const r = trySloganHandler(post());
    expect(r.status).toBe(200);
    expect(r.headers.get('set-cookie')).toMatch(/^extas_try_slogan=1; Path=\/;/);
    expect(trySloganHandler(post('cross-site')).status).toBe(403);
  });
});
