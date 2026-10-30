// CN-029 Phase 3 qa-gate I3 (PR 610) — while the ERP holds the shop's account and checkout is paused, the customer is
// told calmly the moment the bag or the checkout opens, and the words stay on the page (never a short toast after he
// filled the whole form). The words are the shop's own (messages), with nothing personal and nothing about the ERP.
// Confirm during the pause is still refused and no order is made (packages/checkout place.db.test.ts); its answer is an
// expected state of the shop, so it comes back as a normal answer (200, `ok: false`, `PAUSED`) that the browser never
// logs as a failed request (the smoke's "no console error" rule). Every other refusal keeps its own status.
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { CheckoutError } from '@extas/checkout';
import { PausedNote } from '@/components/shop/checkout/PausedNote';
import bn from '../../../messages/shop.bn.json';
import en from '../../../messages/shop.en.json';
import { placeRefusal } from './checkout-api';
import { keysOf } from './dict';
import { tryPauseHandler, tryPauseOnRequest, TRY_PAUSE_COOKIE } from './try-pause';

const was = process.env.EXTAS_SHOP_TEST_PAGES;
afterEach(() => {
  if (was === undefined) delete process.env.EXTAS_SHOP_TEST_PAGES;
  else process.env.EXTAS_SHOP_TEST_PAGES = was;
});

const words = (d: unknown) => (d as { checkout: { paused: { title: string; text: string } } }).checkout.paused;

describe('I3 · the checkout pause, told on arrival', () => {
  it('Confirm during the pause answers PAUSED as a normal answer; every other refusal keeps its status', async () => {
    const r = placeRefusal(new CheckoutError('PAUSED', 'checkout is paused while the ERP holds the account'));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: false, error: 'PAUSED' });
    expect(placeRefusal(new CheckoutError('OUT_OF_STOCK', 'sold out')).status).toBe(409);
    expect(placeRefusal(new CheckoutError('FORM', 'name', ['name'], { field: 'name' })).status).toBe(400);
  });

  it('the notice is a calm status line that stays on the page, in the shop words', () => {
    const html = renderToStaticMarkup(<PausedNote title={words(en).title} text={words(en).text} testId="co-paused" />);
    expect(html).toContain('role="status"');
    expect(html).toContain('data-testid="co-paused"');
    expect(html).toContain(words(en).title);
    expect(html).not.toContain('role="alert"');
  });

  it('both languages carry the words; nothing about the ERP, a hold or anyone', () => {
    expect(keysOf(bn).filter((k) => k.startsWith('checkout.paused.')).sort()).toEqual(keysOf(en).filter((k) => k.startsWith('checkout.paused.')).sort());
    for (const w of [words(en), words(bn)]) {
      expect(w.title.length).toBeGreaterThan(0);
      expect(w.text.length).toBeGreaterThan(0);
      expect(`${w.title} ${w.text}`).not.toMatch(/ERP|hold|হোল্ড|account|অ্যাকাউন্ট|payment|বকেয়া/i);
    }
  });

  it('the pause trial for the device gate is shut on the live shop: the door is 404 and the cookie is never read', async () => {
    delete process.env.EXTAS_SHOP_TEST_PAGES;
    const req = new Request('https://shop.example.test/api/shop/try-pause', { method: 'POST', headers: { 'sec-fetch-site': 'same-origin', cookie: `${TRY_PAUSE_COOKIE}=1` } });
    expect((await tryPauseHandler(req)).status).toBe(404);
    expect(tryPauseOnRequest(req)).toBe(false);
    process.env.EXTAS_SHOP_TEST_PAGES = '1';
    expect(tryPauseOnRequest(req)).toBe(true);
  });
});
