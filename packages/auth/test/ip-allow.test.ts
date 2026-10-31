// S18 · PR 380 — the admin's address list: single addresses and ranges, IPv4 and IPv6 (and IPv4 written inside IPv6),
// nothing that is not an address ever matches, an empty list allows nobody.
import { describe, expect, it } from 'vitest';
import { addressOnList, ipBytes, parseAllowEntry } from '../src/ip-allow';

describe('ip allow list', () => {
  it('reads IPv4, IPv6, compressed IPv6 and IPv4-mapped forms the same way', () => {
    expect(ipBytes('203.0.113.7')).toEqual(ipBytes('::ffff:203.0.113.7'));
    expect(ipBytes('2001:db8::1')).toEqual(ipBytes('2001:0db8:0000:0000:0000:0000:0000:0001'));
    expect(ipBytes('[2001:db8::1]')).toEqual(ipBytes('2001:db8::1'));
    for (const bad of ['', '256.1.1.1', '1.2.3', 'abc', '1::2::3', '2001:db8:::1', '12345::1', '1.2.3.4/24']) expect(ipBytes(bad), bad).toBeNull();
  });

  it('matches single addresses and ranges', () => {
    const list = ['203.0.113.0/24', '198.51.100.9', '2001:db8:10::/48'];
    expect(addressOnList('203.0.113.200', list)).toBe(true);
    expect(addressOnList('203.0.114.1', list)).toBe(false);
    expect(addressOnList('198.51.100.9', list)).toBe(true);
    expect(addressOnList('198.51.100.10', list)).toBe(false);
    expect(addressOnList('2001:db8:10:ffff::1', list)).toBe(true);
    expect(addressOnList('2001:db8:11::1', list)).toBe(false);
    expect(addressOnList('::ffff:203.0.113.5', list)).toBe(true);
    expect(addressOnList('0.0.0.0', ['0.0.0.0/0'])).toBe(true);
  });

  it('never matches without an address, with a broken one or an empty list', () => {
    expect(addressOnList(null, ['0.0.0.0/0'])).toBe(false);
    expect(addressOnList('unknown', ['0.0.0.0/0'])).toBe(false);
    expect(addressOnList('203.0.113.7', [])).toBe(false);
    expect(addressOnList('203.0.113.7', ['nonsense', '203.0.113.0/33'])).toBe(false);
  });

  it('a range size must fit its kind of address', () => {
    expect(parseAllowEntry('203.0.113.0/32')).not.toBeNull();
    expect(parseAllowEntry('203.0.113.0/33')).toBeNull();
    expect(parseAllowEntry('2001:db8::/128')).not.toBeNull();
    expect(parseAllowEntry('2001:db8::/129')).toBeNull();
    expect(parseAllowEntry('1.2.3.4/8/8')).toBeNull();
  });
});
