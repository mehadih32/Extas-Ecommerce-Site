// S25 · PR 481 — pure tests for the motion library's shapes and the suggestion logic (no database).
import { describe, expect, it } from 'vitest';
import { DEFAULT_MOTION_ACTIONS, MOTION_GARMENT_HINTS, motionActionInput, motionActionSpecSchema, suggestMotionAction, type MotionActionView } from './motion';

describe('DEFAULT_MOTION_ACTIONS', () => {
  it('covers every garment hint the blueprint names, with no duplicate keys', () => {
    const keys = DEFAULT_MOTION_ACTIONS.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
    const hints = new Set(DEFAULT_MOTION_ACTIONS.map((a) => a.spec.garmentHint));
    for (const h of ['tracksuit', 'polo', 'formalShirt', 'panjabi', 'footwear', 'bag'] as const) expect(hints.has(h)).toBe(true);
  });

  it('every default parses as a valid input', () => {
    for (const a of DEFAULT_MOTION_ACTIONS) expect(motionActionInput.safeParse(a).success).toBe(true);
  });

  it('the group workout is the only group clip (C8.1: group shots are cut together, never one generated crowd)', () => {
    const group = DEFAULT_MOTION_ACTIONS.filter((a) => a.spec.groupClip);
    expect(group.map((a) => a.key)).toEqual(['groupWorkout']);
  });
});

describe('motionActionSpecSchema', () => {
  it('refuses a spec whose minSeconds is after maxSeconds', () => {
    const bad = { nameBn: 'x', garmentHint: 'polo', descriptionEn: 'x', descriptionBn: 'x', minSeconds: 8, maxSeconds: 4, groupClip: false };
    expect(motionActionSpecSchema.safeParse(bad).success).toBe(false);
  });

  it('refuses a garment hint outside the fixed list', () => {
    const bad = { nameBn: 'x', garmentHint: 'jeans', descriptionEn: 'x', descriptionBn: 'x', minSeconds: 4, maxSeconds: 8, groupClip: false };
    expect(motionActionSpecSchema.safeParse(bad).success).toBe(false);
  });

  it('accepts every listed garment hint', () => {
    for (const h of MOTION_GARMENT_HINTS) expect(motionActionSpecSchema.safeParse({ nameBn: 'x', garmentHint: h, descriptionEn: 'x', descriptionBn: 'x', minSeconds: 4, maxSeconds: 8, groupClip: false }).success).toBe(true);
  });
});

describe('motionActionInput', () => {
  it('refuses a key that is not camelCase', () => {
    const bad = { key: 'office-walk', name: 'x', spec: DEFAULT_MOTION_ACTIONS[0]!.spec };
    expect(motionActionInput.safeParse(bad).success).toBe(false);
  });
});

function fakeView(key: string, garmentHint: (typeof MOTION_GARMENT_HINTS)[number], archived = false): MotionActionView {
  return { id: key, key, name: key, categoryId: null, spec: { nameBn: key, garmentHint, descriptionEn: 'x', descriptionBn: 'x', minSeconds: 4, maxSeconds: 8, groupClip: false }, sharedWithAllStores: true, archived, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
}

describe('suggestMotionAction', () => {
  it('picks the action matching the garment hint', () => {
    const actions = [fakeView('walking', 'polo'), fakeView('jogging', 'tracksuit')];
    expect(suggestMotionAction(actions, 'tracksuit')?.key).toBe('jogging');
  });

  it('falls back to "other" when nothing matches the hint', () => {
    const actions = [fakeView('misc', 'other'), fakeView('walking', 'polo')];
    expect(suggestMotionAction(actions, 'footwear')?.key).toBe('misc');
  });

  it('returns null when nothing fits and there is no "other" either', () => {
    const actions = [fakeView('walking', 'polo')];
    expect(suggestMotionAction(actions, 'footwear')).toBeNull();
  });

  it('never suggests an archived action', () => {
    const actions = [fakeView('jogging', 'tracksuit', true)];
    expect(suggestMotionAction(actions, 'tracksuit')).toBeNull();
  });
});
