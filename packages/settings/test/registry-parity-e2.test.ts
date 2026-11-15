// PR 815-820 — the small settings of Settings and AI Center: off or empty as shipped, strict about what the owner may save.
import { describe, expect, it } from 'vitest';
import { registry } from '../src/registry';
import { AI_DIGEST_DEFAULT, aiDigestSchema, aiTrainingOffSchema, PAYMENTS_SETTLEMENT_DEFAULT, paymentsSettlementSchema, TELEGRAM_CONTROL_DEFAULT, telegramControlSchema } from '../src/registry-parity-e2';

describe('PR 815-820 · parity E2 settings', () => {
  it('every key is in the registry and ships off or empty', () => {
    expect(registry['ai.costSaverAuto'].default).toBe(false);
    expect(registry['ai.digest'].default).toEqual(AI_DIGEST_DEFAULT);
    expect(AI_DIGEST_DEFAULT.on).toBe(false);
    expect(registry['ai.trainingOff'].default).toEqual({ ids: [] });
    expect(Object.values(TELEGRAM_CONTROL_DEFAULT.alerts).some(Boolean)).toBe(false);
    expect(TELEGRAM_CONTROL_DEFAULT.accounts).toEqual([]);
    expect(PAYMENTS_SETTLEMENT_DEFAULT.accounts).toEqual([]);
    expect(registry['payments.settlement'].isOwnerData).toBe(true);
    expect(registry['payments.settlement'].default).toBeNull();
  });
  it('refuses a bad time, a bad Telegram number and a settlement longer than a month', () => {
    expect(aiDigestSchema.safeParse({ ...AI_DIGEST_DEFAULT, time: '25:00' }).success).toBe(false);
    expect(aiDigestSchema.safeParse({ ...AI_DIGEST_DEFAULT, time: '09:30' }).success).toBe(true);
    expect(telegramControlSchema.safeParse({ ...TELEGRAM_CONTROL_DEFAULT, accounts: [{ id: 'abc', who: 'x', role: 'y' }] }).success).toBe(false);
    expect(telegramControlSchema.safeParse({ ...TELEGRAM_CONTROL_DEFAULT, accounts: [{ id: '5218840193', who: 'x', role: 'y' }] }).success).toBe(true);
    expect(paymentsSettlementSchema.safeParse({ ...PAYMENTS_SETTLEMENT_DEFAULT, bkash: { account: 'A', days: 40 } }).success).toBe(false);
    expect(aiTrainingOffSchema.safeParse({ ids: ['a'], extra: 1 }).success).toBe(false);
  });
});
