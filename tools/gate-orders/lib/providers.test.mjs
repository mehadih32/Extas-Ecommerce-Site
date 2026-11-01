// Tests for what a real connection means for the gate's test orders (PR 414 follow-up, CN-013 phase 2).
import { expect, it } from 'vitest';
import { oracleClient } from './oracle-client.mjs';
import { providerPolicy } from './providers.mjs';
import { numberOf, serverShare, inLang, tapUntil } from './shopper.mjs';
import { classOf, DEVICES, NETWORKS, slowFactor } from './profiles.mjs';

it('on the mocks everything runs', () => {
  expect(providerPolicy([])).toEqual({ blockAll: null, prepaid: null, booking: null });
});

it('a real message gateway or ERP stops every order; a real gateway or courier stops only its checks', () => {
  expect(providerPolicy([{ kind: 'SMS', provider: 'ssl' }]).blockAll).toMatch(/SMS \(ssl\).*no order is placed/);
  expect(providerPolicy([{ kind: 'ERP', provider: 'bhandari' }]).blockAll).toMatch(/ERP/);
  expect(providerPolicy([{ kind: 'EMAIL', provider: 'x' }]).blockAll).toBeTruthy();
  const p = providerPolicy([{ kind: 'PAYMENT', provider: 'bkash' }, { kind: 'COURIER', provider: 'steadfast' }]);
  expect(p.blockAll).toBeNull();
  expect(p.prepaid).toMatch(/bkash/);
  expect(p.booking).toMatch(/steadfast/);
});

it("talks to the oracle with the run's token and passes its refusal on", async () => {
  const seen = [];
  const fake = async (url, init) => {
    seen.push({ url, auth: init.headers.authorization, body: init.body });
    return { status: 200, json: async () => (url.endsWith('/order') ? { ok: true, result: { number: '1' } } : { ok: false, error: 'no GATE TEST order 2' }) };
  };
  const o = oracleClient('http://oracle:1/', 'tok-0123456789', fake);
  await expect(o.call('order', { number: '1' })).resolves.toEqual({ number: '1' });
  await expect(o.call('cancel', { number: '2' })).rejects.toThrow(/oracle cancel: no GATE TEST order 2/);
  expect(seen[0]).toMatchObject({ url: 'http://oracle:1/order', auth: 'Bearer tok-0123456789', body: '{"number":"1"}' });
  expect(() => oracleClient('', 'x')).toThrow(/address and token/);
});

it('the devices and networks: most are phones, the slowest wait longest, the server share leaves the round trip out', () => {
  expect(Object.values(DEVICES).filter((d) => d.kind !== 'desktop').length).toBeGreaterThan(Object.values(DEVICES).filter((d) => d.kind === 'desktop').length);
  expect(classOf('tablet')).toBe('phone');
  expect(classOf('desktop-1920')).toBe('desktop');
  expect(slowFactor('android-low', 'slow-3g')).toBeGreaterThan(slowFactor('desktop-1366', 'wifi'));
  expect(slowFactor('desktop-1366', 'wifi')).toBe(1);
  expect(Object.values(NETWORKS).filter((n) => n.budget).length).toBe(2);
  expect(serverShare({ requestStart: 10, responseStart: 400 }, 165)).toBe(225);
  expect(serverShare({ requestStart: 10, responseStart: 100 }, 165)).toBe(0);
  expect(serverShare(null, 0)).toBeNull();
  expect(inLang('bn', '/checkout')).toBe('/bn/checkout');
  expect(inLang('bn', '/')).toBe('/bn');
  expect(inLang('en', '/bag')).toBe('/bag');
});

it('the order number of the page the checkout landed on (its answer may be gone after the page moved on)', () => {
  expect(numberOf('https://preview.example.test/checkout/thanks/100512?k=abc')).toBe('100512');
  expect(numberOf('http://127.0.0.1:3100/bn/checkout/pay/1007')).toBe('1007');
  expect(numberOf('https://preview.example.test/checkout')).toBeNull();
  expect(numberOf(undefined)).toBeNull();
});

it('a tap that lands before the page woke up is tapped again, and counted; a page that never wakes is an error', async () => {
  const sh = { factor: 0.001 };
  let taps = 0;
  const target = { click: async () => void (taps += 1) };
  const doneAfter = (n) => ({ first: () => ({ waitFor: async () => (taps >= n ? undefined : Promise.reject(new Error('not yet'))) }) });
  expect(await tapUntil(sh, target, doneAfter(1))).toBe(0);
  taps = 0;
  expect(await tapUntil(sh, target, doneAfter(3))).toBe(2);
  taps = 0;
  await expect(tapUntil(sh, target, doneAfter(99), { tries: 3 })).rejects.toThrow(/did nothing 3 times/);
  expect(taps).toBe(3);
});
