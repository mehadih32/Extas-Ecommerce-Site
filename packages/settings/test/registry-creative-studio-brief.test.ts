// S25 · PR 490 (registry v290): the creative brief's master switch — off as shipped, never owner data, labelled
// in both languages.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { studioCreativeBriefSchema, studioCreativeBriefSettings } from '../src/registry-creative-studio-brief';

describe('studio.creativeBrief (v290)', () => {
  it('is in the registry at version 290, store-level, labelled in English and Bengali', () => {
    const spec = studioCreativeBriefSettings['studio.creativeBrief'];
    expect(registry['studio.creativeBrief']).toBe(spec);
    expect(spec.version).toBe(290);
    expect(spec.isOwnerData).toBe(false);
    expect(spec.scope).toBe('store');
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey)).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!)).toBeTruthy();
    }
  });

  it('ships off (CLAUDE.md rule 1: every integration stays off until the owner turns it on)', () => {
    const d = studioCreativeBriefSettings['studio.creativeBrief'].default;
    expect(d.enabled).toBe(false);
    expect(studioCreativeBriefSchema.safeParse(d).success).toBe(true);
  });

  it('refuses what is out of shape', () => {
    for (const bad of [{ enabled: 'yes' }, { enabled: false, extra: 1 }, {}]) {
      expect(studioCreativeBriefSchema.safeParse(bad).success).toBe(false);
    }
  });
});
