// S06 · PR 519 (registry v48): the identity graph's setting — at version 48, never owner data, labelled in English and
// Bengali, its default valid and off until the owner switches it on (CN-018); the similarities stay between 0.3 and 1.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry, registryVersion } from '../src/index';
import { riskIdentitySchema, riskRulesSettings } from '../src/registry-risk-rules';

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
});
