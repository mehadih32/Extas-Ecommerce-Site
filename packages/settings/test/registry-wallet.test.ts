// S07 · PR 171–174 (registry v55): every wallet, refund, advance and statement key at version 55 in the payment group,
// never owner data, labelled in both languages, its default valid and off (CN-018: a new money feature waits for the
// owner).
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { apologySchema, walletManualSchema, walletSettings } from '../src/registry-wallet';

describe('wallet, refunds, advances and statements settings (v55)', () => {
  it('every key is in the registry at version 55 in the payment group, labelled in English and Bengali, its default valid', () => {
    for (const [key, spec] of Object.entries(walletSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(spec);
      expect(spec.version, key).toBe(55);
      expect(spec.group, key).toBe('payment');
      expect(spec.isOwnerData, key).toBe(false);
      expect(spec.schema.safeParse(spec.default).success, key).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], spec.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], spec.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });

  it('PR 171: changing a wallet by hand and the apology credit ship off, with no amounts', () => {
    expect(walletSettings['payments.wallet.manual'].default).toEqual({ enabled: false, maxMinor: null });
    expect(walletManualSchema.safeParse({ enabled: true, maxMinor: -1 }).success).toBe(false);
    const a = walletSettings['payments.wallet.apology'].default;
    expect(a).toMatchObject({ enabled: false, amountMinor: null, percent: null, capMinor: null, to: 'WALLET' });
    expect(apologySchema.safeParse({ ...a, percent: 101 }).success).toBe(false);
    // the next-order target waits for the coupons (PR 272): not offered yet
    expect(apologySchema.safeParse({ ...a, to: 'NEXT_ORDER' }).success).toBe(false);
  });
});
