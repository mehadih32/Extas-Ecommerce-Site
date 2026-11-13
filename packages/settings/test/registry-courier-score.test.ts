// S28 · PR 662 — the courier score settings: in the registry, labelled in both languages, off as shipped.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { courierScoreSettings } from '../src/registry-courier-score';

describe('S28 PR 662 courier score settings', () => {
  it.each(['risk.courierScore', 'risk.courierScoreReport'] as const)('%s is in the registry, labelled, validated', (key) => {
    const spec = courierScoreSettings[key];
    expect(registry[key]).toBe(spec);
    expect(spec.isOwnerData).toBe(false);
    expect(spec.schema.safeParse(spec.default).success).toBe(true);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey), lang).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!), lang).toBeTruthy();
    }
  });
  it('the score ships off', () => {
    expect(courierScoreSettings['risk.courierScore'].default.enabled).toBe(false);
  });
});
