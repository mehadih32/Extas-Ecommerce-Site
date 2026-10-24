// S05 · PR 541 (registry v46): the order sections — at version 46, never owner data, labelled in English and Bengali, its
// default valid; the strong sections wait for a person, watch only marks; a band is high or watch, never both; only the
// risk model's own signals can steer a section.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry, registryVersion } from '../src/index';
import { RISK_REVIEW_SECTIONS, RISK_SECTIONS, riskMoreSettings, riskSectionsSchema } from '../src/registry-risk-more';

describe('risk sections (v46)', () => {
  it('every key is in the registry at version 46, never owner data, labelled in both languages, its default valid', () => {
    expect(registryVersion(registry)).toBeGreaterThanOrEqual(46);
    for (const [key, spec] of Object.entries(riskMoreSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(spec);
      expect(spec.version, key).toBe(46);
      expect(spec.isOwnerData, key).toBe(false);
      expect(spec.isPublic, key).toBe(false);
      expect(spec.schema.safeParse(spec.default).success, key).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], spec.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], spec.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });

  it('the strong sections wait for a person, a band to watch is only marked, and the sections are tried in one order', () => {
    const d = riskMoreSettings['risk.sections'].default;
    expect(d.review).toEqual(['reorder', 'identity', 'high']);
    expect(d.review).not.toContain('watch');
    expect(RISK_SECTIONS).toEqual(['duplicate', 'reorder', 'identity', 'high', 'watch', 'prepaid', 'clear']);
    for (const r of RISK_REVIEW_SECTIONS) expect(RISK_SECTIONS).toContain(r);
  });

  it('refuses a band in both lists, a signal the model does not have, and a section that cannot wait (prepaid, clear)', () => {
    const d = riskMoreSettings['risk.sections'].default;
    expect(riskSectionsSchema.safeParse({ ...d, watchBands: ['high'] }).success).toBe(false);
    expect(riskSectionsSchema.safeParse({ ...d, identitySignals: ['nope'] }).success).toBe(false);
    expect(riskSectionsSchema.safeParse({ ...d, reorderSignals: ['inTransit', 'inTransit'] }).success).toBe(false);
    expect(riskSectionsSchema.safeParse({ ...d, review: ['prepaid'] }).success).toBe(false);
    expect(riskSectionsSchema.safeParse({ ...d, review: ['clear'] }).success).toBe(false);
  });
});
