// PR 815-816 — lane E3's small settings: empty or at the prototype's starting choice, strict about what the owner may save.
import { describe, expect, it } from 'vitest';
import { registry } from '../src/registry';
import { blockedAddressesSchema, PRIVACY_KEEP_MONTHS_DEFAULT, privacyKeepMonthsSchema } from '../src/registry-parity-e3';

describe('PR 815-816 · parity E3 settings', () => {
  it('ships with nobody blocked and the prototype keep times', () => {
    expect(registry['security.blockedAddresses'].default).toEqual({ list: [] });
    expect(registry['privacy.keepMonths'].default).toEqual(PRIVACY_KEEP_MONTHS_DEFAULT);
  });
  it('refuses a keep time the page does not offer and a block entry with a missing address', () => {
    expect(privacyKeepMonthsSchema.safeParse({ media: 24, chat: 12 }).success).toBe(true);
    expect(privacyKeepMonthsSchema.safeParse({ media: 0, chat: 12 }).success).toBe(false);
    expect(privacyKeepMonthsSchema.safeParse({ media: 24, chat: 7 }).success).toBe(false);
    expect(blockedAddressesSchema.safeParse({ list: [{ ip: '45.142.212.61', why: 'too many wrong passwords', at: '2026-11-15T10:00:00Z' }] }).success).toBe(true);
    expect(blockedAddressesSchema.safeParse({ list: [{ ip: '', why: '', at: '' }] }).success).toBe(false);
  });
});
