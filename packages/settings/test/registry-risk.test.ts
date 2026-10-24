// S06 · PR 157, 156 (registry v43): every risk key at version 43, never owner data, labelled in English and Bengali, its
// default valid; the model is off until the owner switches it on (CN-018), the bands' thresholds rise from 0, and the
// refusals the shop caused (SIM-F-044) are in the refusal list and kept out of the score.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry, registryVersion } from '../src/index';
import { orderEditSettings } from '../src/registry-order-edit';
import { RISK_SIGNAL_KEYS, riskBandsSchema, riskSettings, riskSignalsSchema } from '../src/registry-risk';

describe('risk settings (v43)', () => {
  it('every key is in the registry at version 43, never owner data, labelled in both languages, its default valid', () => {
    expect(registryVersion(registry)).toBeGreaterThanOrEqual(43);
    for (const [key, spec] of Object.entries(riskSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(spec);
      // PR 541 (v46) added two signals to `risk.signals` (since v43)
      expect(spec.version, key).toBe(key === 'risk.signals' ? 46 : 43);
      expect(spec.isOwnerData, key).toBe(false);
      expect(spec.isPublic, key).toBe(false);
      expect(spec.schema.safeParse(spec.default).success, key).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], spec.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], spec.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });

  it('CN-018: no order is scored until the owner switches the model on; amounts and place lists start empty', () => {
    expect(riskSettings['risk.score'].default.enabled).toBe(false);
    const s = riskSettings['risk.signals'].default;
    expect(s.orderValue).toMatchObject({ enabled: false, atLeastMinor: null });
    expect(s.riskyArea).toMatchObject({ enabled: false, areaIds: [] });
    expect(RISK_SIGNAL_KEYS).toHaveLength(16);
    // PR 541: the new signals start off, the pieces empty
    expect(s.orderPieces).toMatchObject({ enabled: false, atLeast: null });
    expect(s.identityMatch.enabled).toBe(false);
  });

  it('a weight is 0–100 and every signal has its own switch', () => {
    const s = riskSettings['risk.signals'].default;
    expect(riskSignalsSchema.safeParse({ ...s, refusals: { ...s.refusals, weight: 101 } }).success).toBe(false);
    expect(riskSignalsSchema.safeParse({ ...s, refusals: { ...s.refusals, weight: -1 } }).success).toBe(false);
    for (const k of RISK_SIGNAL_KEYS) expect(typeof s[k].enabled, k).toBe('boolean');
    // a cancel code outside the order core's list is refused
    expect(riskSignalsSchema.safeParse({ ...s, cancels: { ...s.cancels, codes: ['NOPE'] } }).success).toBe(false);
  });

  it('the bands start at 0, their thresholds rise and their keys are unique; both languages come from the messages', () => {
    const b = riskSettings['risk.bands'].default;
    expect(b.map((x) => x.minScore)).toEqual([0, 35, 65]);
    expect(b[0]).toMatchObject({ en: 'Low', bn: 'কম' });
    expect(riskBandsSchema.safeParse([{ ...b[0]!, minScore: 5 }]).success).toBe(false);
    expect(riskBandsSchema.safeParse([b[0], { ...b[1]!, minScore: 0 }]).success).toBe(false);
    expect(riskBandsSchema.safeParse([b[0], { ...b[1]!, key: 'low' }]).success).toBe(false);
  });

  it('SIM-F-044: "late", "wrong item" and "damaged" are refusal reasons, and every our-fault key is one of them', () => {
    const reasons = orderEditSettings['orders.refusal.reasons'].default.map((r) => r.key);
    expect(reasons).toEqual(expect.arrayContaining(['late', 'wrong-item', 'damaged']));
    for (const k of riskSettings['risk.history'].default.ourFaultRefusals) expect(reasons, k).toContain(k);
  });
});
