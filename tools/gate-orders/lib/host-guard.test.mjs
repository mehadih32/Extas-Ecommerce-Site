// Tests for the gate runs' host guard (PR 414 follow-up, CN-013 phase 2; run with the web tests).
import { expect, it } from 'vitest';
import { baseOf, hostGuard, hostList, normHost } from './host-guard.mjs';

const preview = 'preview.example.test';

it('reads a host in its plain form and refuses what is not one', () => {
  expect(normHost('HTTPS://Preview.Example.Test:443/x?y#z')).toBe(preview);
  expect(normHost('preview.example.test.')).toBe(preview);
  expect(normHost('localhost')).toBe('localhost');
  expect(normHost('')).toBe('');
  expect(normHost('not a host')).toBe('');
  expect(normHost('-bad.example.test')).toBe('');
  expect(hostList('shop.example.test, www.example.test  bad host')).toEqual(['shop.example.test', 'www.example.test', 'bad', 'host'].filter((h) => normHost(h)));
});

it('lets a run start only on the preview host of the settings', () => {
  expect(hostGuard({ target: preview, preview })).toEqual({ ok: true, host: preview, why: null });
  expect(hostGuard({ target: preview, preview, saved: preview, live: ['shop.example.test'] }).ok).toBe(true);
});

it('refuses every other case, and says which rule refused it', () => {
  expect(hostGuard({ target: preview, preview: '' })).toMatchObject({ ok: false, why: expect.stringMatching(/no preview host/) });
  expect(hostGuard({ target: '', preview })).toMatchObject({ ok: false, why: expect.stringMatching(/no valid host/) });
  expect(hostGuard({ target: 'shop.example.test', preview })).toMatchObject({ ok: false, why: expect.stringMatching(/not the preview host/) });
  expect(hostGuard({ target: preview, preview, saved: 'other.example.test' })).toMatchObject({ ok: false, why: expect.stringMatching(/saved preview host is another/) });
  expect(hostGuard({ target: preview, preview, saved: 'not a host' })).toMatchObject({ ok: false, why: expect.stringMatching(/not a host name/) });
  // the preview host set to a host the shop sells on (a mistake in the settings) is refused too
  expect(hostGuard({ target: preview, preview, live: [preview] })).toMatchObject({ ok: false, why: expect.stringMatching(/sells on/) });
  expect(hostGuard({ target: preview, preview, live: `x.example.test ${preview}` })).toMatchObject({ ok: false });
});

it('opens only https on the guarded host, with no path, port or login in the address', () => {
  expect(baseOf(`https://${preview}`, preview)).toBe(`https://${preview}`);
  expect(baseOf(`https://${preview}/`, preview)).toBe(`https://${preview}`);
  expect(baseOf(`http://${preview}`, preview)).toBeNull();
  expect(baseOf(`https://${preview}:8443`, preview)).toBeNull();
  expect(baseOf(`https://${preview}/shop`, preview)).toBeNull();
  expect(baseOf(`https://u:p@${preview}`, preview)).toBeNull();
  expect(baseOf('https://other.example.test', preview)).toBeNull();
  expect(baseOf('not a url', preview)).toBeNull();
});

it('a local proof may use plain http on the loopback only, and only when asked', () => {
  expect(baseOf('http://localhost:3100', 'localhost', { loopback: true })).toBe('http://localhost:3100');
  expect(baseOf('http://localhost:3100', 'localhost')).toBeNull();
  expect(baseOf(`http://${preview}:3100`, preview, { loopback: true })).toBeNull();
});
