// PR 620 · p3 review: the refusal budget of the ERP's signed calls and webhooks — counted per client address, bounded
// in memory however many addresses send, and a call signed with a secret the shop already knows is never cut off.
import { describe, expect, it } from 'vitest';
import { ADDRESS_SLOTS, admit, countRefusal, giveBack, newRefusalBudget, overBudget, probeOpen, rememberVerified, signedByKnown, VERIFIED_SLOTS } from '../src';

const T0 = Date.parse('2026-10-23T04:00:00Z');

describe('PR 620 · the refusal budget', () => {
  it('counts per address: one address over the limit never cuts off another', () => {
    const b = newRefusalBudget();
    for (let i = 0; i < 5; i++) countRefusal(b, '203.0.113.9', T0);
    expect(overBudget(b, '203.0.113.9', T0, 5)).toBe(true);
    expect(overBudget(b, '198.51.100.7', T0, 5)).toBe(false);
    // A new minute starts again.
    expect(overBudget(b, '203.0.113.9', T0 + 60_000, 5)).toBe(false);
  });

  it('stays bounded however many addresses send; past the bound they share one bucket', () => {
    const b = newRefusalBudget();
    for (let i = 0; i < ADDRESS_SLOTS + 500; i++) countRefusal(b, `10.0.${Math.floor(i / 256)}.${i % 256}`, T0);
    expect(b.addresses.size).toBeLessThanOrEqual(ADDRESS_SLOTS + 1);
    // The 500 that did not fit share one bucket, which is over the limit for any address not kept.
    expect(overBudget(b, '192.0.2.200', T0, 100)).toBe(true);
    // A minute later the old addresses are forgotten first and a new one gets its own place again.
    countRefusal(b, '192.0.2.201', T0 + 61_000);
    expect(b.addresses.has('192.0.2.201')).toBe(true);
    expect(overBudget(b, '192.0.2.202', T0 + 61_000, 100)).toBe(false);
  });

  it('a long or empty address never grows the map: empty is the shared bucket, long is cut', () => {
    const b = newRefusalBudget();
    countRefusal(b, '', T0);
    countRefusal(b, null, T0);
    countRefusal(b, 'x'.repeat(5000), T0);
    expect([...b.addresses.keys()].every((k) => k.length <= 64)).toBe(true);
    expect(b.addresses.size).toBe(2);
  });

  it('lets a call through the cut-off only when it verifies with a secret the last lookup found', () => {
    const b = newRefusalBudget();
    expect(signedByKnown(b, () => true)).toBe(false);
    b.known = ['s1', 's2'];
    expect(signedByKnown(b, (s) => s === 's2')).toBe(true);
    expect(signedByKnown(b, () => false)).toBe(false);
  });

  it('round 2: an IPv6 address counts by its /64; an IPv4 address written as IPv6 is that IPv4 address', () => {
    const b = newRefusalBudget();
    for (let i = 1; i <= 5; i++) countRefusal(b, `2001:db8:1:2::${i.toString(16)}`, T0);
    countRefusal(b, '2001:0db8:0001:0002:ffff:ffff:ffff:ffff', T0);
    expect(overBudget(b, '2001:db8:1:2:abcd::1', T0, 6)).toBe(true);
    expect(overBudget(b, '[2001:db8:1:2::99]', T0, 6)).toBe(true);
    // Another /64 is another sender.
    expect(overBudget(b, '2001:db8:1:3::1', T0, 6)).toBe(false);
    expect(b.addresses.size).toBe(1);
    for (let i = 0; i < 3; i++) countRefusal(b, '::ffff:192.0.2.7', T0);
    expect(overBudget(b, '192.0.2.7', T0, 3)).toBe(true);
  });

  it('round 2: a slot is taken at once and given back only by a call that verified', () => {
    const b = newRefusalBudget();
    const limits = { perMinute: 3, refreshSeconds: 60 };
    const none = () => false;
    // Ten calls at the same moment: three slots, one refresh call, then nothing.
    const slots = Array.from({ length: 10 }, () => admit(b, '203.0.113.9', T0, limits, none));
    expect(slots.filter(Boolean)).toHaveLength(4);
    // Verified calls give their slots back: the next one may go.
    giveBack(b, slots[0]!);
    giveBack(b, slots[2]!);
    expect(admit(b, '203.0.113.9', T0, limits, none)).not.toBeNull();
    expect(admit(b, '203.0.113.9', T0, limits, none)).toBeNull();
    // A slot from a minute that is over changes nothing in the new one.
    const fresh = admit(b, '203.0.113.9', T0 + 61_000, limits, none)!;
    giveBack(b, slots[1]!);
    expect(b.addresses.get('203.0.113.9')).toMatchObject({ refused: 1 });
    giveBack(b, fresh);
    expect(b.addresses.get('203.0.113.9')).toMatchObject({ refused: 0 });
  });

  it('round 2: over the limit, one call per refresh time still reaches the lookup, so a new secret is learnt', () => {
    const b = newRefusalBudget();
    const limits = { perMinute: 1, refreshSeconds: 60 };
    expect(admit(b, 'a', T0, limits, () => false)).not.toBeNull();
    expect(probeOpen(b, T0, 60)).toBe(true);
    expect(admit(b, 'a', T0 + 1_000, limits, () => false)).not.toBeNull();
    expect(probeOpen(b, T0 + 2_000, 60)).toBe(false);
    expect(admit(b, 'a', T0 + 2_000, limits, () => false)).toBeNull();
    expect(probeOpen(b, T0 + 61_000, 60)).toBe(true);
    // A refresh time of 0 still waits a second.
    expect(probeOpen(b, T0 + 2_000, 0)).toBe(true);
    b.probedAt = T0;
    expect(probeOpen(b, T0 + 500, 0)).toBe(false);
  });

  it('round 3: one IPv6 /48 filling every slot never pushes a lately verified sender into the shared bucket', () => {
    const b = newRefusalBudget();
    const limits = { perMinute: 3, refreshSeconds: 60 };
    const nobody = () => false;
    // The real ERP's call verified once (the secret was known then).
    const erp = '2001:db8:aaaa:1::10';
    const s0 = admit(b, erp, T0, limits, nobody)!;
    giveBack(b, s0);
    rememberVerified(b, s0);
    // Somebody with one /48 sends from 65,536 /64s: every slot is taken, the rest share one bucket, far over the limit.
    for (let i = 0; i < ADDRESS_SLOTS + 200; i++) {
      for (let n = 0; n < 3; n++) countRefusal(b, `2001:db8:bbbb:${i.toString(16)}::1`, T0 + 61_000);
    }
    expect(overBudget(b, '2001:db8:bbbb:ffff::1', T0 + 61_000, 3)).toBe(true);
    expect(b.addresses.size).toBeLessThanOrEqual(ADDRESS_SLOTS + VERIFIED_SLOTS + 1);
    // Right after a secret change (the ERP's new signature is not known yet), the ERP's address still has its own
    // bucket: its call goes to the lookup (another /64 of its own /48 that never verified does not).
    b.probedAt = T0 + 61_000;
    const s1 = admit(b, '2001:db8:aaaa:1::99', T0 + 62_000, limits, nobody);
    expect(s1?.key).toBe('2001:db8:aaaa:1::/64');
    expect(admit(b, '2001:db8:aaaa:2::1', T0 + 62_000, limits, nobody)).toBeNull();
    // Bounded: only the latest VERIFIED_SLOTS verified addresses are kept.
    for (let i = 0; i < VERIFIED_SLOTS + 10; i++) rememberVerified(b, countRefusal(b, `198.51.100.${i % 250}`, T0));
    expect(b.verified.size).toBe(VERIFIED_SLOTS);
    expect(b.verified.has('2001:db8:aaaa:1::/64')).toBe(false);
  });
});
