// S08 · PR 185–191 (registry v57): every exchange, return and refused-parcel key at version 57 in the Orders group,
// never owner data, labelled in both languages, its default valid; money figures ship empty and new perks ship off.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { exchangeChargeSchema, exchangeEngineSchema, exchangeSwapSchema, exchangeTiersSchema, refusedListSchema, returnsHandlingSchema, returnsQcSchema, returnsSettings } from '../src/registry-returns';

describe('exchange and return settings (v57)', () => {
  it('every key is in the registry at version 57 in the Orders group, labelled in English and Bengali, its default valid', () => {
    for (const [key, spec] of Object.entries(returnsSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(spec);
      expect(spec.version, key).toBe(57);
      expect(spec.group, key).toBe('orders');
      expect(spec.isOwnerData, key).toBe(false);
      expect(spec.schema.safeParse(spec.default).success, key).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], spec.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], spec.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });

  it('PR 185 (B1.8): the four tiers in order, all on; a wrong item needs its root cause (SIM-F-022); the new parcel waits for a person', () => {
    expect(returnsSettings['orders.exchange.tiers'].default).toEqual({ sameColour: true, otherColours: true, sameCategory: true, collectionFirst: true, otherCategories: true, maxOptions: 12 });
    expect(exchangeTiersSchema.safeParse({ ...returnsSettings['orders.exchange.tiers'].default, maxOptions: 0 }).success).toBe(false);
    const e = returnsSettings['orders.exchange.engine'].default;
    expect(e).toMatchObject({ rootCauseForWrong: true, autoConfirm: false, ourMistakePhoto: 'customer' });
    expect(exchangeEngineSchema.safeParse({ ...e, numberPrefix: 'x c' }).success).toBe(false);
    const causes = returnsSettings['orders.exchange.rootCauses'].default;
    expect(causes.map((c) => c.key)).toContain('wrong-pick');
    for (const c of causes) expect(c.bn.length, c.key).toBeGreaterThan(0);
  });

  it('PR 187 (D4, SIM-F-022): another SKU may be recorded with a note, no photo by default, the loss reasons in both languages', () => {
    expect(returnsSettings['orders.returns.qc'].default).toEqual({ acceptOtherSku: true, photoForLoss: false });
    expect(returnsQcSchema.safeParse({ acceptOtherSku: true }).success).toBe(false);
    const reasons = returnsSettings['orders.returns.lossReasons'].default;
    expect(reasons.map((r) => r.key)).toEqual(['stained', 'torn', 'used', 'tags', 'other']);
    for (const r of reasons) expect(r.bn.length, r.key).toBeGreaterThan(0);
  });

  it('PR 189: no returns after receipt stays the policy — our own mistake may come back only when switched on; the window follows the exchange', () => {
    expect(registry['policy.returns.afterDelivery'].default).toBe(false);
    expect(returnsSettings['orders.returns.handling'].default).toEqual({ ourFaultReturns: false, windowHours: null });
    expect(returnsHandlingSchema.safeParse({ ourFaultReturns: true, windowHours: 0 }).success).toBe(false);
    expect(returnsHandlingSchema.safeParse({ ourFaultReturns: true, windowHours: 48 }).success).toBe(true);
  });

  it('PR 190: the customer pays for his own size choice, no figure set; claims need a photo; the re-ship and the swap perks are off', () => {
    expect(returnsSettings['orders.exchange.charge'].default).toEqual({ sizePays: 'customer', fallbackMinor: null, claimPhoto: true, reshipRefusals: ['size-fit'], reshipFree: false });
    expect(exchangeChargeSchema.safeParse({ ...returnsSettings['orders.exchange.charge'].default, fallbackMinor: -1 }).success).toBe(false);
    expect(returnsSettings['orders.exchange.swap'].default).toEqual({ enabled: false, chargeMinor: null, bandKeys: [] });
    expect(exchangeSwapSchema.safeParse({ enabled: true, chargeMinor: 9000, bandKeys: ['dhaka-city'] }).success).toBe(true);
    // the re-ship reasons are refusal reasons the owner has
    const refusals = (registry['orders.refusal.reasons'].default as { key: string }[]).map((r) => r.key);
    for (const k of returnsSettings['orders.exchange.charge'].default.reshipRefusals) expect(refusals).toContain(k);
  });

  it('PR 191: the refused-parcel list is off; when on, a person decides every number it proposes', () => {
    expect(returnsSettings['orders.refused.list'].default).toEqual({ enabled: false, minRefusals: 2 });
    expect(refusedListSchema.safeParse({ enabled: true, minRefusals: 0 }).success).toBe(false);
  });
});
