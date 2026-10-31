// CN-020 (4) (registry v140, SIM-F-047): the voice address — at version 140, never owner data, labelled in both
// languages, off as shipped, Bengali by default, every number bounded.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { voiceAddressSchema, voiceAddressSettings } from '../src/registry-voice-address';

const spec = voiceAddressSettings['checkout.voice'];

describe('checkout.voice setting (v140)', () => {
  it('is in the registry at version 140, store-level, labelled in English and Bengali', () => {
    expect(registry['checkout.voice']).toBe(spec);
    // review R3 (M1): `retentionDays` came at v142
    expect(spec.version).toBe(142);
    expect(spec.since).toBe(140);
    expect(spec.isOwnerData).toBe(false);
    for (const lang of ['en', 'bn'] as const) for (const k of [spec.labelKey, spec.helpKey!]) expect(lookup(messages[lang], k)).toBeTruthy();
  });

  it('ships off, reads Bengali, keeps the recording; numbers and the language stay in their bounds', () => {
    expect(spec.default).toEqual({ enabled: false, speechLang: 'bn-BD', minConfidence: 0.6, keepRecording: true, maxSeconds: 30, maxKb: 1024, maxPerHour: 10, retentionDays: 30 });
    expect(voiceAddressSchema.safeParse({ ...spec.default, minConfidence: 1.5 }).success).toBe(false);
    expect(voiceAddressSchema.safeParse({ ...spec.default, maxSeconds: 1 }).success).toBe(false);
    expect(voiceAddressSchema.safeParse({ ...spec.default, speechLang: 'bengali please' }).success).toBe(false);
    expect(voiceAddressSchema.safeParse({ ...spec.default, extra: 1 }).success).toBe(false);
  });

  it('review R3 (M1): a recording is never kept forever; a value saved before v142 reads as 30 days', () => {
    expect(voiceAddressSchema.safeParse({ ...spec.default, retentionDays: 0 }).success).toBe(false);
    const { retentionDays: _r, ...old } = spec.default;
    expect(voiceAddressSchema.parse(old).retentionDays).toBe(30);
  });
});
