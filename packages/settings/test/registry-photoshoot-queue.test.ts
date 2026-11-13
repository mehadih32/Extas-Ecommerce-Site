// S24 · PR 452 (registry v290): the photoshoot queue's own concurrency limit — unlimited (0) by default (CN-018).
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { photoshootMaxConcurrentJobsSchema, photoshootQueueSettings, PHOTOSHOOT_MAX_CONCURRENT_JOBS_DEFAULT } from '../src/registry-photoshoot-queue';

describe('photoshoot queue concurrency setting (v290)', () => {
  it('is in the registry at version 300, store-scoped, labelled in English and Bengali, its default valid', () => {
    for (const [key, s] of Object.entries(photoshootQueueSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(s);
      expect(s.version, key).toBe(300);
      expect(s.scope, key).toBe('store');
      expect(s.schema.safeParse(s.default).success, key).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], s.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], s.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });

  it('ships unlimited: 0', () => {
    expect(photoshootQueueSettings['studio.photoshoot.maxConcurrentJobs'].default).toBe(PHOTOSHOOT_MAX_CONCURRENT_JOBS_DEFAULT);
    expect(PHOTOSHOOT_MAX_CONCURRENT_JOBS_DEFAULT).toBe(0);
  });

  it('takes a whole number of jobs, 0 to 100, only', () => {
    expect(photoshootMaxConcurrentJobsSchema.safeParse(0).success).toBe(true);
    expect(photoshootMaxConcurrentJobsSchema.safeParse(5).success).toBe(true);
    expect(photoshootMaxConcurrentJobsSchema.safeParse(100).success).toBe(true);
    expect(photoshootMaxConcurrentJobsSchema.safeParse(101).success).toBe(false);
    expect(photoshootMaxConcurrentJobsSchema.safeParse(-1).success).toBe(false);
    expect(photoshootMaxConcurrentJobsSchema.safeParse(1.5).success).toBe(false);
  });
});
