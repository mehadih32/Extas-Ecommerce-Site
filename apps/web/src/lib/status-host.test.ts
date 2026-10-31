// Review R1 m4 / R2 (security): the status page and the health detail only on the preview host and the server's own
// internal checks; never on a store's own domain, nor on another public host once the preview host is set.
import { describe, expect, it } from 'vitest';
import { hostOf, isInternalHost, showsDetail } from './status-host';

const PREVIEW = 'preview.example.test';
const MAIN = 'shop.example.test';

describe('status-host · who sees /status and the health detail', () => {
  it('reads a plain host name from the Host header (lower case, no port, no trailing dot)', () => {
    expect(hostOf('Preview.Example.Test:443')).toBe(PREVIEW);
    expect(hostOf('preview.example.test.')).toBe(PREVIEW);
    expect(hostOf('app-blue:3000')).toBe('app-blue');
    expect(hostOf('[::1]:3000')).toBe('[::1]');
    for (const bad of [null, undefined, '', 'a b', 'evil.test/x', 'user@host']) expect(hostOf(bad)).toBeNull();
  });
  it('the server’s own addresses are internal; a public name is not', () => {
    for (const h of ['app-blue', 'app-green', 'localhost', '127.0.0.1', '10.0.0.4', '[::1]']) expect(isInternalHost(h)).toBe(true);
    for (const h of [PREVIEW, MAIN, 'www.shop.example.test']) expect(isInternalHost(h)).toBe(false);
  });
  it('the preview host and internal checks see it; a store domain and any other public host do not', () => {
    const o = { stagingHost: PREVIEW, shopDomains: [MAIN, `www.${MAIN}`] };
    expect(showsDetail(PREVIEW, o)).toBe(true);
    expect(showsDetail('app-blue', o)).toBe(true);
    expect(showsDetail('127.0.0.1', o)).toBe(true);
    expect(showsDetail(MAIN, o)).toBe(false);
    expect(showsDetail(`www.${MAIN}`, o)).toBe(false);
    expect(showsDetail('other.example.test', o)).toBe(false);
    expect(showsDetail(null, o)).toBe(false);
  });
  it('with no preview host set yet: never a store domain, and the preview itself is not broken', () => {
    const o = { stagingHost: null, shopDomains: [MAIN] };
    expect(showsDetail(MAIN, o)).toBe(false);
    expect(showsDetail(PREVIEW, o)).toBe(true);
  });
});
