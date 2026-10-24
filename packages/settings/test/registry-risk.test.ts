// S06 · PR 157 (registry v43): `risk.history` at version 43, never owner data, labelled in English and Bengali, its
// default valid; the refusals the shop caused (SIM-F-044) are in the refusal list.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry, registryVersion } from '../src/index';
import { orderEditSettings } from '../src/registry-order-edit';
import { riskSettings } from '../src/registry-risk';

describe('risk settings (v43)', () => {
  it('every key is in the registry at version 43, never owner data, labelled in both languages, its default valid', () => {
    expect(registryVersion(registry)).toBeGreaterThanOrEqual(43);
    for (const [key, spec] of Object.entries(riskSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(spec);
      expect(spec.version, key).toBe(43);
      expect(spec.isOwnerData, key).toBe(false);
      expect(spec.isPublic, key).toBe(false);
      expect(spec.schema.safeParse(spec.default).success, key).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], spec.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], spec.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });

  it('SIM-F-044: "late", "wrong item" and "damaged" are refusal reasons, and every our-fault key is one of them', () => {
    const reasons = orderEditSettings['orders.refusal.reasons'].default.map((r) => r.key);
    expect(reasons).toEqual(expect.arrayContaining(['late', 'wrong-item', 'damaged']));
    for (const k of riskSettings['risk.history'].default.ourFaultRefusals) expect(reasons, k).toContain(k);
  });
});
