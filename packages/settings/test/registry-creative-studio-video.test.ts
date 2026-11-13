// S25 · PR 482 (registry v282): the image-to-video engine's master switch and its cost-per-second rate — off / 0
// as shipped, never owner data, labelled in both languages, every value bounded.
// S25 · PR 484 (registry v289 — 288 was taken by registry-photoshoot.ts's PR 447, merged first) adds `bestOfTwo`:
// off as shipped (CN-018 — an off-by-default yes/no perk).
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { studioVideoSchema, studioVideoSettings, VIDEO_RATE_MAX_MINOR } from '../src/registry-creative-studio-video';

describe('studio.video (v289)', () => {
  it('is in the registry at version 289 (since 282), store-level, labelled in English and Bengali', () => {
    const spec = studioVideoSettings['studio.video'];
    expect(registry['studio.video']).toBe(spec);
    expect(spec.version).toBe(289);
    expect(spec.since).toBe(282);
    expect(spec.isOwnerData).toBe(false);
    expect(spec.scope).toBe('store');
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey)).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!)).toBeTruthy();
    }
  });

  it('ships off, with no rate set and best-of-2 off (CN-018: never an invented cost, never on by itself)', () => {
    const d = studioVideoSettings['studio.video'].default;
    expect(d.enabled).toBe(false);
    expect(d.costPerSecondMinor).toBe(0);
    expect(d.bestOfTwo).toBe(false);
    expect(studioVideoSchema.safeParse(d).success).toBe(true);
  });

  it('refuses what is out of range', () => {
    const d = studioVideoSettings['studio.video'].default;
    for (const bad of [{ costPerSecondMinor: -1 }, { costPerSecondMinor: 1.5 }, { costPerSecondMinor: VIDEO_RATE_MAX_MINOR + 1 }, { enabled: 'yes' }, { bestOfTwo: 'yes' }, { extra: 1 }]) {
      expect(studioVideoSchema.safeParse({ ...d, ...bad }).success).toBe(false);
    }
  });
});
