import { describe, expect, it } from 'vitest';
import { funnelStepsSchema } from '@extas/analytics';
import { defaultFunnelInput } from './default-funnel';

describe('defaultFunnelInput (PR 340)', () => {
  it('produces a step list the PR 339 funnel schema itself accepts, in both languages', () => {
    for (const lang of ['en', 'bn'] as const) {
      const input = defaultFunnelInput(lang);
      expect(input.name.length).toBeGreaterThan(0);
      expect(funnelStepsSchema.safeParse(input.steps).success).toBe(true);
    }
  });

  it('keeps the same 4 catalogue event names, in the same order, in both languages', () => {
    const names = (lang: 'en' | 'bn') => defaultFunnelInput(lang).steps.map((s) => s.eventName);
    expect(names('en')).toEqual(['product_view', 'add_to_bag', 'checkout_start', 'purchase']);
    expect(names('bn')).toEqual(names('en'));
  });

  it('gives each language its own distinct labels and name', () => {
    const en = defaultFunnelInput('en');
    const bn = defaultFunnelInput('bn');
    expect(en.name).not.toBe(bn.name);
    expect(en.steps.map((s) => s.label)).not.toEqual(bn.steps.map((s) => s.label));
  });

  it('uses unique step keys', () => {
    const keys = defaultFunnelInput('en').steps.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
