// Follow-up 586 (PR 382): security events keep an internet address only as its short mark — the same mark the
// security page, the bot notes and the rate limits show (apps/web lib/security/edge-gate.ts addressTag) — never the
// address itself.
import { describe, expect, it } from 'vitest';
import { addressMark, networkOf, withAddressMark } from '../src';

describe('follow-up 586: the address mark', () => {
  it('is eight hex characters, the same for the same address, different for another', () => {
    expect(addressMark('203.0.113.9')).toMatch(/^[0-9a-f]{8}$/);
    expect(addressMark('203.0.113.9')).toBe(addressMark('203.0.113.9'));
    expect(addressMark('203.0.113.9')).not.toBe(addressMark('203.0.113.10'));
    // FNV-1a 32 bit, as addressTag: the empty text is the offset basis
    expect(addressMark('')).toBe('811c9dc5');
    expect(addressMark(null)).toBeNull();
    expect(addressMark(undefined)).toBeNull();
  });

  it('withAddressMark swaps `ip` for `address` and keeps every other field', () => {
    expect(withAddressMark({ phone: '+8801712345678', ip: '198.51.100.7', customerId: 'c1' })).toEqual({ phone: '+8801712345678', address: addressMark('198.51.100.7'), customerId: 'c1' });
    expect(withAddressMark({ staffUserId: 's1', ip: null })).toEqual({ staffUserId: 's1', address: null });
    expect(withAddressMark({ staffUserId: 's1' })).toEqual({ staffUserId: 's1' });
    expect(JSON.stringify(withAddressMark({ ip: '198.51.100.7' }))).not.toContain('198.51.100.7');
  });
});

describe('networkOf (follow-up 609)', () => {
  it('an IPv4 address by its /24, an IPv6 address by its /48, anything else as itself', () => {
    expect(networkOf('203.0.113.50')).toBe(networkOf('203.0.113.77'));
    expect(networkOf('203.0.113.50')).not.toBe(networkOf('203.0.114.50'));
    expect(networkOf('2001:db8:1:2::5')).toBe(networkOf('2001:DB8:1:ffff::1'));
    expect(networkOf('2001:db8:1:2::5')).not.toBe(networkOf('2001:db8:2::1'));
    expect(networkOf('::ffff:203.0.113.9')).toBe(networkOf('203.0.113.1'));
    expect([networkOf(null), networkOf(''), networkOf('unknown')]).toEqual(['?', '?', 'unknown']);
  });
});
