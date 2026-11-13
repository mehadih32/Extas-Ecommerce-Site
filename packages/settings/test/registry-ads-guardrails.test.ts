// S15 · PR 581 (registry v333): Tirondaj's own ads guardrails — off as shipped, every ceiling and the CPA cap at
// 0, labelled in both languages, the kill switch and auto-decrease both off by default.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { adsGuardrailsSchema, adsGuardrailsSettings, GUARDRAILS_COUNT_MAX, GUARDRAILS_MONEY_MAX } from '../src/registry-ads-guardrails';

describe('ads guardrails (v333)', () => {
  it('is in the registry at version 333, per store, labelled in English and Bengali, its default valid', () => {
    const s = adsGuardrailsSettings['ads.guardrails'];
    expect(registry['ads.guardrails']).toBe(s);
    expect(s.version).toBe(333);
    expect(s.scope).toBe('store');
    expect(s.isOwnerData).toBe(false);
    expect(s.schema.safeParse(s.default).success).toBe(true);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], s.labelKey), lang).toBeTruthy();
      expect(lookup(messages[lang], s.helpKey!), lang).toBeTruthy();
      expect(lookup(messages[lang], `groups.${s.group}`), lang).toBeTruthy();
    }
  });

  it('ships off: every ceiling and the cap off, no auto-decrease, kill switch off', () => {
    expect(adsGuardrailsSettings['ads.guardrails'].default).toEqual({
      on: false,
      dailyBudgetCeiling: 0,
      monthlyBudgetCeiling: 0,
      maxCostPerPurchase: 0,
      targetSales: 0,
      targetPurchases: 0,
      autoDecreaseAllowed: false,
      decreaseStepPercent: 20,
      killSwitch: false,
    });
  });

  it('keeps every number in bounds and refuses an unknown field', () => {
    const d = adsGuardrailsSettings['ads.guardrails'].default;
    const ok = (patch: Record<string, unknown>) => adsGuardrailsSchema.safeParse({ ...d, ...patch }).success;
    expect(ok({ on: true, killSwitch: true, dailyBudgetCeiling: GUARDRAILS_MONEY_MAX, targetPurchases: GUARDRAILS_COUNT_MAX })).toBe(true);
    expect(ok({ dailyBudgetCeiling: -1 })).toBe(false);
    expect(ok({ dailyBudgetCeiling: GUARDRAILS_MONEY_MAX + 1 })).toBe(false);
    expect(ok({ targetPurchases: GUARDRAILS_COUNT_MAX + 1 })).toBe(false);
    expect(ok({ decreaseStepPercent: 0 })).toBe(false);
    expect(ok({ decreaseStepPercent: 91 })).toBe(false);
    expect(ok({ priceMinor: 100 })).toBe(false);
  });
});
