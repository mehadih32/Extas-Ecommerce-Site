// S07 · PR 171–174 (registry v55): every wallet, refund, advance and statement key at version 55 in the payment group,
// never owner data, labelled in both languages, its default valid and off (CN-018: a new money feature waits for the
// owner).
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { apologySchema, gatewayStatementSchema, partialSchema, refundRulesSchema, STATEMENT_MISMATCH_CODES, statementReasonsSchema, walletManualSchema, walletSettings } from '../src/registry-wallet';

describe('wallet, refunds, advances and statements settings (v55)', () => {
  it('every key is in the registry at version 55 in the payment group, labelled in English and Bengali, its default valid', () => {
    for (const [key, spec] of Object.entries(walletSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(spec);
      // review R3 (M3): the refund rules changed at v141 (`rtoAdvance`)
      expect(spec.version, key).toBe(key === 'payments.refunds' ? 141 : 55);
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

  it('review R3 (M3): a delivery-charge advance is kept by default; a value saved before v141 reads as KEEP', () => {
    expect(walletSettings['payments.refunds'].default.rtoAdvance).toBe('KEEP');
    expect(walletSettings['payments.refunds'].since).toBe(55);
    const old = { toWallet: false, afterDelivery: false, afterDeliverySources: ['RIDER_OVERCHARGE'], rtoDeliveryCharge: 'REFUND', fourEyes: false };
    expect(refundRulesSchema.parse(old)).toMatchObject({ rtoAdvance: 'KEEP' });
    expect(refundRulesSchema.safeParse({ ...old, rtoAdvance: 'GIFT' }).success).toBe(false);
  });

  it('PR 172: the refund rules ship at their safest: no wallet refunds, none after delivery but the rider overcharge', () => {
    const r = walletSettings['payments.refunds'].default;
    expect(r).toEqual({ toWallet: false, afterDelivery: false, afterDeliverySources: ['RIDER_OVERCHARGE'], rtoDeliveryCharge: 'REFUND', fourEyes: false, rtoAdvance: 'KEEP' });
    expect(refundRulesSchema.safeParse({ ...r, afterDeliverySources: ['OTHER', 'OTHER'] }).success).toBe(false);
    expect(refundRulesSchema.safeParse({ ...r, afterDeliverySources: ['CANCEL'] }).success).toBe(false);
  });

  it('PR 173: partial payment ships off, with the 10% cap of §59 answer 29, no minimum and no full advance', () => {
    const p = walletSettings['payments.partial'].default;
    expect(p).toEqual({ enabled: false, capPercent: 10, minMinor: null, allowFull: false });
    expect(partialSchema.safeParse({ ...p, capPercent: 101 }).success).toBe(false);
    expect(partialSchema.safeParse({ ...p, capPercent: 12.5 }).success).toBe(false);
  });

  it('PR 174: statements are read exactly (no difference allowed, nothing missing until the owner sets days); every reason has its words', () => {
    const st = walletSettings['payments.statement'].default;
    expect(st).toMatchObject({ toleranceMinor: 0, missingAfterDays: 0 });
    expect(st.columns.trx.length).toBeGreaterThan(0);
    expect(gatewayStatementSchema.safeParse({ ...st, columns: { ...st.columns, amount: [] } }).success).toBe(false);
    const reasons = walletSettings['payments.statement.reasons'].default;
    expect(reasons.map((r) => r.code)).toEqual([...STATEMENT_MISMATCH_CODES]);
    expect(statementReasonsSchema.safeParse(reasons.slice(1)).success).toBe(false);
    expect(statementReasonsSchema.safeParse([...reasons.slice(1), reasons[1]]).success).toBe(false);
  });
});
