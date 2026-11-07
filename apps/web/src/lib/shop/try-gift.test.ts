// Follow-up 219 — a test server's gift trial reaches the checkout's own requests: the requote and the placement read
// gift mode on for the browser that carries the trial cookie, and only there; the live shop never reads the cookie.
import { describe, expect, it } from 'vitest';
import type { CheckoutApiDeps } from './checkout-api';
import { trialOfRequest, withGiftTrial } from './try-gift';

const req = (cookie?: string) => new Request('http://localhost/api/checkout/quote', { method: 'POST', headers: cookie ? { cookie } : {} });
const settings = { value: async (key: string) => (key === 'checkout.gift' ? { enabled: false, note: true } : 7) };
const deps = { storeId: 1, checkout: { settings } } as unknown as CheckoutApiDeps;

describe('the gift trial in the checkout requests (follow-up 219)', () => {
  it('reads the trial only on a test server and only from its own cookie', () => {
    expect(trialOfRequest(req('a=1; extas_try_gift=1'), true)).toBe(true);
    expect(trialOfRequest(req('extas_try_gift=1'), false)).toBe(false);
    expect(trialOfRequest(req('extas_try_gift=0'), true)).toBe(false);
    expect(trialOfRequest(req('xextas_try_gift=1'), true)).toBe(false);
    expect(trialOfRequest(req(), true)).toBe(false);
  });

  it('turns gift mode on in the settings it reads, and nothing else', async () => {
    const d = withGiftTrial(req('extas_try_gift=1'), deps, true)!;
    expect(await d.checkout.settings.value('checkout.gift' as never, { storeId: 1 })).toEqual({ enabled: true, note: true });
    expect(await d.checkout.settings.value('checkout.cod' as never, { storeId: 1 })).toBe(7);
    expect(withGiftTrial(req(), deps, true)).toBe(deps);
    expect(withGiftTrial(req('extas_try_gift=1'), deps, false)).toBe(deps);
    expect(withGiftTrial(req('extas_try_gift=1'), null, true)).toBeNull();
  });
});
