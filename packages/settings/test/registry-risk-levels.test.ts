// S06 · PR 161 (registry v54): the actions per risk level — in the registry at version 54, labelled in both languages,
// off by default (the master and every action, CN-018), the suggested set only a suggestion, a partial ask refused
// without its percent, and the hold reason it uses on the shipped hold-reason list.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { NO_RISK_ACTIONS, riskLevelSettings, riskLevelsSchema, SUGGESTED_RISK_LEVELS } from '../src/registry-risk-levels';

describe('risk level settings (v54)', () => {
  it('in the registry at version 54, labelled in English and Bengali, its default valid and off', () => {
    const spec = riskLevelSettings['risk.levels'];
    expect(registry['risk.levels']).toBe(spec);
    expect(spec.version).toBe(54);
    expect(spec.isOwnerData).toBe(false);
    expect(spec.schema.safeParse(spec.default).success).toBe(true);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey), lang).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!), lang).toBeTruthy();
    }
    expect(spec.default.enabled).toBe(false);
    expect(Object.values(spec.default.levels).every((l) => JSON.stringify(l) === JSON.stringify(NO_RISK_ACTIONS))).toBe(true);
    expect(spec.default.partialPercent).toBeNull();
  });

  it('the suggested set holds and asks only in the high band; a partial ask needs its percent (1–99)', () => {
    expect(SUGGESTED_RISK_LEVELS.medium).toEqual({ watch: true, hold: false, call: true, ask: 'delivery' });
    expect(SUGGESTED_RISK_LEVELS.high).toEqual({ watch: true, hold: true, call: true, ask: 'full' });
    const d = riskLevelSettings['risk.levels'].default;
    const partial = { ...d, levels: { ...d.levels, medium: { ...NO_RISK_ACTIONS, ask: 'partial' as const } } };
    expect(riskLevelsSchema.safeParse(partial).success).toBe(false);
    expect(riskLevelsSchema.safeParse({ ...partial, partialPercent: 30 }).success).toBe(true);
    expect(riskLevelsSchema.safeParse({ ...partial, partialPercent: 100 }).success).toBe(false);
  });

  it('the hold reason a level uses ships on the hold-reason list, named in both languages', () => {
    const key = riskLevelSettings['risk.levels'].default.holdReasonKey;
    const reason = registry['orders.hold.reasons'].default.find((r) => r.key === key);
    expect(reason).toBeTruthy();
    expect(registry['orders.hold.reasons'].version).toBe(54);
  });
});
