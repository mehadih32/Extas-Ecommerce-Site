// S13 · PR 273 (registry v178): the referral programme — at version 178, never owner data, labelled in both languages,
// off as it ships with no amount, every number bounded and the window in order.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { REFERRAL_CODE_MAX, referralProgrammeSchema, referralSettings } from '../src/registry-referrals';

describe('referrals.programme (v178)', () => {
  it('is in the registry at version 178, store-level, labelled in English and Bengali', () => {
    const spec = referralSettings['referrals.programme'];
    expect(registry['referrals.programme']).toBe(spec);
    expect(spec.version).toBe(178);
    expect(spec.isOwnerData).toBe(false);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey)).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!)).toBeTruthy();
    }
  });

  it('ships off with no rule and no reward, and refuses what is out of range', () => {
    const d = referralSettings['referrals.programme'].default;
    expect(d).toMatchObject({ on: false, friendRuleKey: '', rewardMinor: null, rewardsMax: null, startsOn: null, endsOn: null });
    expect(referralProgrammeSchema.safeParse(d).success).toBe(true);
    expect(referralProgrammeSchema.safeParse({ ...d, startsOn: '2026-12-01', endsOn: '2026-12-31' }).success).toBe(true);
    for (const bad of [{ rewardMinor: 0 }, { rewardMinor: 1.5 }, { rewardsMax: 0 }, { codeLength: 5 }, { codeLength: REFERRAL_CODE_MAX + 1 }, { startsOn: '2026-12-31', endsOn: '2026-12-01' }, { startsOn: '31-12-2026' }, { extra: 1 }])
      expect(referralProgrammeSchema.safeParse({ ...d, ...bad }).success).toBe(false);
  });
});
