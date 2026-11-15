// PR 846, 851 — the two small settings of lane E5: the days to answer a privacy request, and the ERP accounts for shop money.
import { describe, expect, it } from 'vitest';
import { registry } from '../src/registry';
import { ERP_MATCHING_DEFAULT, erpMatchingSchema, PRIVACY_ANSWER_DAYS_DEFAULT, PRIVACY_ANSWER_DAYS_MAX } from '../src/registry-parity-e5';

describe('PR 846, 851 · parity E5 settings', () => {
  it('are in the registry and ship at the prototype choice or empty', () => {
    expect(registry['privacy.answerDays'].default).toBe(PRIVACY_ANSWER_DAYS_DEFAULT);
    expect(registry['erp.matching'].isOwnerData).toBe(true);
    expect(registry['erp.matching'].default).toBeNull();
    expect(Object.values(ERP_MATCHING_DEFAULT).every((v) => v === '')).toBe(true);
  });
  it('keep the days to answer between one day and the bound, and the account names short', () => {
    const days = registry['privacy.answerDays'].schema;
    expect(days.safeParse(1).success).toBe(true);
    expect(days.safeParse(PRIVACY_ANSWER_DAYS_MAX).success).toBe(true);
    expect(days.safeParse(0).success).toBe(false);
    expect(days.safeParse(PRIVACY_ANSWER_DAYS_MAX + 1).success).toBe(false);
    expect(days.safeParse(2.5).success).toBe(false);
    expect(erpMatchingSchema.safeParse({ cod: 'x'.repeat(81), bkash: '', erpPay: '' }).success).toBe(false);
    expect(erpMatchingSchema.safeParse({ cod: 'Courier cash', bkash: 'bKash merchant', erpPay: 'DBBL', extra: 1 }).success).toBe(false);
  });
});
