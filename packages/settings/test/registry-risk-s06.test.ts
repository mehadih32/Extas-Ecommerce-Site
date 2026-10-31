// S06 after launch (CN-031 lane A, registry versions 100–109). PR 162 (v100): the blocklist switch — in the registry,
// labelled in both languages, off as shipped, only "mark" or "hold" (never a cancel), and the hold reason it uses on the
// shipped hold-reason list.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { riskBlocklistSchema, riskS06Settings } from '../src/registry-risk-s06';

describe('S06 risk settings (v100–109)', () => {
  it('PR 162: the blocklist is in the registry at version 100, labelled in English and Bengali, off as shipped', () => {
    const spec = riskS06Settings['risk.blocklist'];
    expect(registry['risk.blocklist']).toBe(spec);
    expect(spec.version).toBe(100);
    expect(spec.isOwnerData).toBe(false);
    expect(spec.isPublic).toBe(false);
    expect(spec.schema.safeParse(spec.default).success).toBe(true);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey), lang).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!), lang).toBeTruthy();
    }
    expect(spec.default).toEqual({ enabled: false, onOrder: 'mark', holdReasonKey: 'risk-check' });
  });

  it('PR 162: a match is only marked or held; a cancel or an unknown field is refused', () => {
    const d = riskS06Settings['risk.blocklist'].default;
    expect(riskBlocklistSchema.safeParse({ ...d, onOrder: 'hold' }).success).toBe(true);
    expect(riskBlocklistSchema.safeParse({ ...d, onOrder: 'cancel' }).success).toBe(false);
    expect(riskBlocklistSchema.safeParse({ ...d, tellCustomer: true }).success).toBe(false);
  });

  it('PR 162: the hold reason it uses ships on the hold-reason list', () => {
    const key = riskS06Settings['risk.blocklist'].default.holdReasonKey;
    expect(registry['orders.hold.reasons'].default.find((r) => r.key === key)).toBeTruthy();
  });
});
