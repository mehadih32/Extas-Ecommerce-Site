// S06 · PR 519, 520 (registry v48): the identity graph's and the duplicate rules' settings — at version 48, never owner data, labelled in English and
// Bengali, its default valid and off until the owner switches it on (CN-018); the similarities stay between 0.3 and 1;
// every scenario is its own rule with a window, a confidence and an action, and there is no block action.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry, registryVersion } from '../src/index';
import { DUPLICATE_SCENARIOS, RULE_ACTIONS, duplicateRulesSchema, riskIdentitySchema, riskRulesSettings } from '../src/registry-risk-rules';

describe('risk rules settings (v48)', () => {
  it('every key is in the registry at version 48, never owner data, labelled in both languages, its default valid', () => {
    expect(registryVersion(registry)).toBeGreaterThanOrEqual(48);
    for (const [key, spec] of Object.entries(riskRulesSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(spec);
      expect(spec.version, key).toBe(48);
      expect(spec.isOwnerData, key).toBe(false);
      expect(spec.isPublic, key).toBe(false);
      expect(spec.schema.safeParse(spec.default).success, key).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], spec.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], spec.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });

  it('PR 519: the identity graph is off by default; a similarity below 0.3 or above 1 is refused', () => {
    const d = riskRulesSettings['risk.identity'].default;
    expect(d.enabled).toBe(false);
    expect(d).toMatchObject({ joinOnDevice: true, nameSimilarity: 0.7, addressSimilarity: 0.6 });
    expect(riskIdentitySchema.safeParse({ ...d, nameSimilarity: 0.2 }).success).toBe(false);
    expect(riskIdentitySchema.safeParse({ ...d, addressSimilarity: 1.2 }).success).toBe(false);
    expect(riskIdentitySchema.safeParse({ ...d, ip: true }).success).toBe(false);
  });

  it('PR 520: the rules engine is off by default; each scenario has its own switch, window, confidence and action; no block action', () => {
    const d = riskRulesSettings['risk.duplicateRules'].default;
    expect(d.enabled).toBe(false);
    expect(Object.keys(d.rules)).toEqual([...DUPLICATE_SCENARIOS]);
    expect(DUPLICATE_SCENARIOS).toEqual(['A', 'B', 'C', 'D', 'E', 'H', 'I']);
    expect(RULE_ACTIONS).toEqual(['cancel', 'hold', 'warn', 'allow']);
    for (const k of DUPLICATE_SCENARIOS) {
      expect(d.rules[k]).toMatchObject({ enabled: expect.any(Boolean), windowMinutes: expect.any(Number), minConfidence: expect.any(Number) });
      for (const lang of ['en', 'bn'] as const) expect(lookup(messages[lang], `risk.duplicateRules.scenario.${k}`), `${k} ${lang}`).toBeTruthy();
    }
    // as today when switched on: A and C look back 5 days like the duplicate check; the new ones start off
    expect(d.rules.A).toMatchObject({ enabled: true, windowMinutes: 7_200, action: 'cancel' });
    for (const k of ['D', 'E', 'H', 'I'] as const) expect(d.rules[k].enabled, k).toBe(false);
    expect(duplicateRulesSchema.safeParse({ ...d, rules: { ...d.rules, A: { ...d.rules.A, action: 'block' } } }).success).toBe(false);
    expect(duplicateRulesSchema.safeParse({ ...d, rules: { ...d.rules, B: { ...d.rules.B, minConfidence: 101 } } }).success).toBe(false);
    expect(duplicateRulesSchema.safeParse({ ...d, rules: { ...d.rules, F: d.rules.A } }).success).toBe(false);
  });
});
