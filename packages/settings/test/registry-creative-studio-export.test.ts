// S25 · PR 487 (registry v289): the campaign creative export's master switch — off as shipped, never owner data,
// labelled in both languages.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { studioCreativeExportSchema, studioCreativeExportSettings } from '../src/registry-creative-studio-export';

describe('studio.creativeExport (v289)', () => {
  it('is in the registry at version 289, store-level, labelled in English and Bengali', () => {
    const spec = studioCreativeExportSettings['studio.creativeExport'];
    expect(registry['studio.creativeExport']).toBe(spec);
    expect(spec.version).toBe(289);
    expect(spec.isOwnerData).toBe(false);
    expect(spec.scope).toBe('store');
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey)).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!)).toBeTruthy();
    }
  });

  it('ships off (CLAUDE.md rule 1: every integration stays off until the owner turns it on)', () => {
    const d = studioCreativeExportSettings['studio.creativeExport'].default;
    expect(d.enabled).toBe(false);
    expect(studioCreativeExportSchema.safeParse(d).success).toBe(true);
  });

  it('refuses what is out of shape', () => {
    for (const bad of [{ enabled: 'yes' }, { enabled: false, extra: 1 }, {}]) {
      expect(studioCreativeExportSchema.safeParse(bad).success).toBe(false);
    }
  });
});
