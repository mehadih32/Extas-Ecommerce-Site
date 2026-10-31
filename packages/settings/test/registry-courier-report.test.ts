// S08 · PR 192 (registry v93): the RTO cost book switch, courier claims and Support › Rider issues — every key at
// version 93, never owner data, labelled in both languages, its default valid and off; a refund is never asked by
// default (CLAUDE.md rule 6).
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { courierReportSettings, riderIssuesSchema } from '../src/registry-courier-report';

describe('courier report settings (v93)', () => {
  it('every key is in the registry at version 93, labelled in English and Bengali, its default valid', () => {
    for (const [key, spec] of Object.entries(courierReportSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(spec);
      expect(spec.version, key).toBe(93);
      expect(spec.isOwnerData, key).toBe(false);
      expect(spec.scope, key).toBe('store');
      expect(spec.schema.safeParse(spec.default).success, key).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], spec.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], spec.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });

  it('everything ships off, and no refund is asked by default', () => {
    expect(courierReportSettings['delivery.courier.rtoBook'].default).toEqual({ enabled: false });
    expect(courierReportSettings['delivery.courier.claims'].default).toEqual({ enabled: false });
    const r = courierReportSettings['support.riderIssues'].default;
    expect(r.enabled).toBe(false);
    expect(r.refundAsk).toBe(false);
    expect(r.proofRequired).toBe(true);
    expect(riderIssuesSchema.safeParse({ ...r, maxPhotos: 0 }).success).toBe(false);
    expect(riderIssuesSchema.safeParse({ ...r, photoMaxMb: 21 }).success).toBe(false);
    expect(riderIssuesSchema.safeParse({ ...r, extra: 1 }).success).toBe(false);
  });
});
