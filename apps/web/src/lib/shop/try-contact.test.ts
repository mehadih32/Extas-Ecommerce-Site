// Follow-up 59 — the test servers' sample contact is sample data (the seed's sample customer, +88010) and never answers
// on the live shop.
import { sampleCatalogue, SAMPLE_PHONE } from '@extas/seed';
import { afterEach, describe, expect, it } from 'vitest';
import { TRY_CONTACT_NUMBER, tryContactHandler } from './try-contact';

const was = process.env.EXTAS_SHOP_TEST_PAGES;
afterEach(() => {
  if (was === undefined) delete process.env.EXTAS_SHOP_TEST_PAGES;
  else process.env.EXTAS_SHOP_TEST_PAGES = was;
});
const post = (site = 'same-origin') => new Request('https://shop.example.test/api/shop/try-contact', { method: 'POST', headers: { 'sec-fetch-site': site } });

describe('the sample contact on test servers', () => {
  it('is the seed`s sample customer number, in the unallocated +88010 range', () => {
    expect(TRY_CONTACT_NUMBER).toBe(sampleCatalogue.customer.phone);
    expect(TRY_CONTACT_NUMBER).toMatch(SAMPLE_PHONE);
  });

  it('answers only on a test server, same site only', () => {
    delete process.env.EXTAS_SHOP_TEST_PAGES;
    expect(tryContactHandler(post()).status).toBe(404);
    process.env.EXTAS_SHOP_TEST_PAGES = '1';
    const r = tryContactHandler(post());
    expect(r.status).toBe(200);
    expect(r.headers.get('set-cookie')).toMatch(/^extas_try_contact=1; Path=\/;/);
    expect(tryContactHandler(post('cross-site')).status).toBe(403);
  });
});
