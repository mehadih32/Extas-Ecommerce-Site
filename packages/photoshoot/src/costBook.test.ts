// S24 · PR 468 — pure tests for the Cost Book's own sub-job catalogue: no database needed.
import { describe, expect, it } from 'vitest';
import { isPhotoshootSubJobKey, photoshootSubJob, PHOTOSHOOT_SUB_JOBS } from './costBook';

describe('PHOTOSHOOT_SUB_JOBS', () => {
  it("is C7.20's own seven sub-jobs, verbatim and in its own order", () => {
    expect(PHOTOSHOOT_SUB_JOBS.map((j) => j.key)).toEqual(['ghost_mannequin', 'try_on', 'detail_reprojection', 'upscale', 'finishing', 'detail_finder', 'quality_scoring']);
  });

  it('every entry carries both languages and a real pointer to the module that builds it', () => {
    for (const j of PHOTOSHOOT_SUB_JOBS) {
      expect(j.nameEn.length).toBeGreaterThan(0);
      expect(j.nameBn.length).toBeGreaterThan(0);
      expect(j.builtIn.length).toBeGreaterThan(0);
    }
  });

  it('every key is unique', () => {
    const keys = PHOTOSHOOT_SUB_JOBS.map((j) => j.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('isPhotoshootSubJobKey / photoshootSubJob', () => {
  it('recognises every real key and nothing else', () => {
    expect(isPhotoshootSubJobKey('finishing')).toBe(true);
    expect(isPhotoshootSubJobKey('upscale')).toBe(true);
    expect(isPhotoshootSubJobKey('not_a_real_sub_job')).toBe(false);
    expect(isPhotoshootSubJobKey(42)).toBe(false);
  });

  it('looks a real one up by key; throws on an unknown one', () => {
    expect(photoshootSubJob('detail_finder').nameEn).toBe('Detail Finder');
    expect(() => photoshootSubJob('nope' as never)).toThrow(/unknown photoshoot sub-job key/);
  });
});
