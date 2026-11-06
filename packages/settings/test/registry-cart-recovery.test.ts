// S13 · PR 276 (registry v211): abandoned-bag recovery with the offer rules — at version 211, off as it ships (and its
// offer off with no code), never owner data, labelled in both languages, bounded numbers, the follow-up's channels only.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { cartRecoverySchema, cartRecoverySettings } from '../src/registry-cart-recovery';

describe('orders.cartRecovery (v211)', () => {
  it('is in the registry at version 211, store-level, off, labelled in English and Bengali', () => {
    const spec = cartRecoverySettings['orders.cartRecovery'];
    expect(registry['orders.cartRecovery']).toBe(spec);
    expect(spec.version).toBe(211);
    expect(spec.isOwnerData).toBe(false);
    expect(spec.default.enabled).toBe(false);
    expect(spec.default.offer.enabled).toBe(false);
    expect(spec.default.offer.couponCode).toBe('');
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey)).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!)).toBeTruthy();
    }
  });

  it('ships a valid default and refuses out-of-range numbers, unknown or repeated channels and extra keys', () => {
    const d = cartRecoverySettings['orders.cartRecovery'].default;
    expect(cartRecoverySchema.safeParse(d).success).toBe(true);
    const bad: Record<string, unknown>[] = [
      { firstAfterMinutes: 29 },
      { firstAfterMinutes: 2_881 },
      { channels: [] },
      { channels: ['WHATSAPP', 'WHATSAPP'] },
      { channels: ['EMAIL'] },
      { minBagMinor: -1 },
      { minBagMinor: 1.5 },
      { catchUpHours: 0 },
      { creditDays: 0 },
      { creditDays: 31 },
      { offer: { ...d.offer, afterHours: 0 } },
      { offer: { ...d.offer, oncePerDays: 0 } },
      { offer: { ...d.offer, minBagMinor: -5 } },
      { offer: { ...d.offer, couponCode: 'X'.repeat(41) } },
      { offer: { ...d.offer, percent: 10 } },
      { maxMessages: 3 },
    ];
    for (const b of bad) expect(cartRecoverySchema.safeParse({ ...d, ...b }).success).toBe(false);
  });
});
