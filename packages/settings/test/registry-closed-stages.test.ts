// S19 · PR 652 (registry v75): the closed stages' switch — one per closed stage, all off (hidden) as shipped, labelled
// in both languages; an unknown stage is refused.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { CLOSED_STAGES, closedStageSettings, closedStagesShownSchema } from '../src/registry-closed-stages';

describe('closed stages (v75)', () => {
  it('is in the registry at version 235, installation-wide, labelled in English and Bengali, its default valid', () => {
    for (const [key, s] of Object.entries(closedStageSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(s);
      expect(s.version, key).toBe(235);
      expect(s.scope, key).toBe('installation');
      expect(s.schema.safeParse(s.default).success, key).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], s.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], s.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });

  it('ships every closed stage hidden (the owner CN-036: S15, S17, S23, S24, S25, S26, S27)', () => {
    expect([...CLOSED_STAGES]).toEqual(['S15', 'S17', 'S23', 'S24', 'S25', 'S26', 'S27']);
    expect(Object.values(closedStageSettings['stages.closedShown'].default).every((v) => v === false)).toBe(true);
  });

  it('takes only the closed stages, each a yes/no', () => {
    expect(closedStagesShownSchema.safeParse({ ...closedStageSettings['stages.closedShown'].default, S15: true }).success).toBe(true);
    expect(closedStagesShownSchema.safeParse({ ...closedStageSettings['stages.closedShown'].default, S12: true }).success).toBe(false);
    expect(closedStagesShownSchema.safeParse({ ...closedStageSettings['stages.closedShown'].default, S15: 'yes' }).success).toBe(false);
  });
});
