// PR 171 — the wallet's rules without a database: the balance from the ledger, no debit below zero, the reversal's
// direction, how late an order came, and the apology credit per order and by rule (CN-018 #8). Made-up amounts.
import { describe, expect, it } from 'vitest';
import { registry } from '@extas/settings';
import { apologyAmount, isLate, lateHoursOf, ledgerBalance, nextBalance, opposite, REVERSIBLE_REASONS, ruleCredit, WALLET_REASONS, type ApologyRule } from './wallet-pure';

const RULE: ApologyRule = { ...registry['payments.wallet.apology'].default, enabled: true };

describe('PR 171 · the wallet ledger', () => {
  it('the balance is credits less debits; a debit never takes it below zero', () => {
    expect(ledgerBalance([])).toBe(0);
    expect(ledgerBalance([{ direction: 'CREDIT', amountMinor: 5_000 }, { direction: 'DEBIT', amountMinor: 2_000 }, { direction: 'CREDIT', amountMinor: 100 }])).toBe(3_100);
    expect(nextBalance(3_000, 'DEBIT', 3_000)).toBe(0);
    expect(nextBalance(3_000, 'DEBIT', 3_001)).toBeNull();
    expect(nextBalance(0, 'CREDIT', 1)).toBe(1);
    expect(opposite('CREDIT')).toBe('DEBIT');
    expect(opposite('DEBIT')).toBe('CREDIT');
  });

  it('money spent on an order, a refund and a correction are never reversed by hand', () => {
    for (const r of ['ORDER', 'REFUND', 'CORRECTION', 'EXCHANGE_CREDIT']) expect(REVERSIBLE_REASONS.has(r), r).toBe(false);
    for (const r of REVERSIBLE_REASONS) expect(WALLET_REASONS as readonly string[]).toContain(r);
  });

  it('how late: hours past the band promise from the placed moment; no promise, no lateness', () => {
    const placedAt = new Date('2026-10-20T06:00:00Z');
    expect(lateHoursOf({ placedAt, deliveredAt: new Date('2026-10-22T06:00:00Z'), hoursMax: 48 }, new Date())).toBe(0);
    expect(lateHoursOf({ placedAt, deliveredAt: new Date('2026-10-23T08:30:00Z'), hoursMax: 48 }, new Date())).toBe(26);
    expect(lateHoursOf({ placedAt, deliveredAt: null, hoursMax: 48 }, new Date('2026-10-22T09:00:00Z'))).toBe(3);
    expect(lateHoursOf({ placedAt, deliveredAt: null, hoursMax: null }, new Date())).toBeNull();
    expect(isLate(0, 0)).toBe(false);
    expect(isLate(1, 0)).toBe(true);
    expect(isLate(5, 24)).toBe(false);
    expect(isLate(null, 0)).toBe(false);
  });

  it('the shipped rule is off, per order, to the wallet, with no amounts (the owner types them)', () => {
    expect(registry['payments.wallet.apology'].default).toEqual({ enabled: false, mode: 'PER_ORDER', kind: 'AMOUNT', amountMinor: null, percent: null, capMinor: null, lateAfterHours: 0, to: 'WALLET' });
    expect(registry['payments.wallet.manual'].default).toEqual({ enabled: false, maxMinor: null });
  });

  it('per order: the person types it, within the limit (the cap, else the rule, else the goods)', () => {
    expect(apologyAmount(RULE, { goodsMinor: 200_000, lateHours: 0 })).toEqual({ ok: false, code: 'INVALID_INPUT' });
    expect(apologyAmount(RULE, { goodsMinor: 200_000, lateHours: 0 }, 5_000)).toEqual({ ok: true, amountMinor: 5_000, limitMinor: 200_000 });
    expect(apologyAmount(RULE, { goodsMinor: 200_000, lateHours: 0 }, 200_001)).toEqual({ ok: false, code: 'OVER_LIMIT' });
    const capped = { ...RULE, capMinor: 10_000 };
    expect(apologyAmount(capped, { goodsMinor: 200_000, lateHours: 3 }, 10_001)).toEqual({ ok: false, code: 'OVER_LIMIT' });
    const withRule = { ...RULE, amountMinor: 8_000 };
    expect(apologyAmount(withRule, { goodsMinor: 200_000, lateHours: 3 }, 8_000)).toMatchObject({ ok: true, limitMinor: 8_000 });
    expect(apologyAmount(withRule, { goodsMinor: 200_000, lateHours: 3 }, 8_001)).toEqual({ ok: false, code: 'OVER_LIMIT' });
  });

  it('by rule: the rule decides (a fixed amount or a share of the goods), only once late enough, capped', () => {
    const fixed: ApologyRule = { ...RULE, mode: 'RULE', amountMinor: 10_000, lateAfterHours: 24 };
    expect(apologyAmount(fixed, { goodsMinor: 200_000, lateHours: 23 })).toEqual({ ok: false, code: 'NOT_LATE' });
    expect(apologyAmount(fixed, { goodsMinor: 200_000, lateHours: 24 })).toEqual({ ok: true, amountMinor: 10_000, limitMinor: 200_000 });
    expect(apologyAmount(fixed, { goodsMinor: 200_000, lateHours: 30 }, 10_000)).toEqual({ ok: false, code: 'INVALID_INPUT' });
    expect(apologyAmount({ ...fixed, amountMinor: null }, { goodsMinor: 200_000, lateHours: 30 })).toEqual({ ok: false, code: 'NOT_CONFIGURED' });
    const share: ApologyRule = { ...RULE, mode: 'RULE', kind: 'PERCENT', percent: 5, capMinor: 7_500 };
    expect(ruleCredit(share, 99_990)).toBe(5_000);
    expect(apologyAmount(share, { goodsMinor: 99_990, lateHours: 1 })).toEqual({ ok: true, amountMinor: 5_000, limitMinor: 7_500 });
    expect(apologyAmount(share, { goodsMinor: 300_000, lateHours: 1 })).toEqual({ ok: true, amountMinor: 7_500, limitMinor: 7_500 });
    expect(apologyAmount(share, { goodsMinor: 300_000, lateHours: 0 })).toEqual({ ok: false, code: 'NOT_LATE' });
    expect(apologyAmount(share, { goodsMinor: 300_000, lateHours: null })).toEqual({ ok: false, code: 'NOT_LATE' });
  });
});
