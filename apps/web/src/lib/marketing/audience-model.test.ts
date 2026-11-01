// S13 · PR 262 — the audience's conditions without a database: what each condition needs, the "and" and the "leave out".
import { describe, expect, it } from 'vitest';
import { AUDIENCE_RULES, RULE_NEEDS, audienceInputSchema, canAudienceStep, combine, definitionOf, definitionSchema } from './audience-model';

const SIZE = '0192f000-0000-7000-8000-000000000001';

describe('audience conditions (PR 262)', () => {
  it('lists every condition with what it needs, and asks for the owner\'s days where days are needed', () => {
    expect(AUDIENCE_RULES.every((k) => RULE_NEEDS[k])).toBe(true);
    expect(definitionSchema.safeParse({ rules: [{ kind: 'ordered', days: 30 }] }).success).toBe(true);
    const noDays = definitionSchema.safeParse({ rules: [{ kind: 'incomplete' }] });
    expect(noDays.success).toBe(false);
    expect(definitionSchema.safeParse({ rules: [{ kind: 'vip', days: 7 }] }).success).toBe(false);
    expect(definitionSchema.safeParse({ rules: [{ kind: 'size' }] }).success).toBe(false);
    expect(definitionSchema.safeParse({ rules: [{ kind: 'size', ref: SIZE }] }).success).toBe(true);
    expect(definitionSchema.safeParse({ rules: [{ kind: 'refused', ref: SIZE }] }).success).toBe(false);
    expect(definitionSchema.safeParse({ rules: [{ kind: 'ordered', days: 0 }] }).success).toBe(false);
  });

  it('needs one condition that brings people in; a name; nothing else', () => {
    expect(definitionSchema.safeParse({ rules: [{ kind: 'refused', exclude: true }] }).success).toBe(false);
    expect(definitionSchema.safeParse({ rules: [] }).success).toBe(false);
    expect(audienceInputSchema.safeParse({ name: ' ', definition: { rules: [{ kind: 'vip' }] } }).success).toBe(false);
    expect(audienceInputSchema.safeParse({ name: 'VIP', definition: { rules: [{ kind: 'vip' }] }, extra: 1 }).success).toBe(false);
    expect(definitionOf({ rules: 'bad' })).toEqual({ v: 1, rules: [] });
  });

  it('keeps the people in every "bring in" condition, less everyone in a "leave out" one', () => {
    const s = (...x: string[]) => new Set(x);
    const rules = [{ exclude: false }, { exclude: false }, { exclude: true }];
    expect([...combine(rules, [s('a', 'b', 'c'), s('b', 'c', 'd'), s('c')])]).toEqual(['b']);
    expect(combine([{ exclude: true }], [s('a')]).size).toBe(0);
    expect([...combine([{ exclude: false }], [s('a', 'b')])].sort()).toEqual(['a', 'b']);
  });

  it('archives and restores, and recounts only a live audience', () => {
    expect(canAudienceStep('recount', 'ACTIVE')).toBe(true);
    expect(canAudienceStep('recount', 'ARCHIVED')).toBe(false);
    expect(canAudienceStep('archive', 'ARCHIVED')).toBe(false);
    expect(canAudienceStep('restore', 'ARCHIVED')).toBe(true);
  });
});
