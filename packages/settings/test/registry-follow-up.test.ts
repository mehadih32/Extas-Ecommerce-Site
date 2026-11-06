// S13 · PR 275 (registry v210): the follow-up ladder of an unfinished checkout — at version 210, off as it ships, never
// owner data, labelled in both languages, bounded numbers, and never more than two messages.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { FOLLOW_UP_CEILING, followUpSchema, followUpSettings } from '../src/registry-follow-up';

describe('orders.followUp (v210)', () => {
  it('is in the registry at version 210, store-level, off, labelled in English and Bengali', () => {
    const spec = followUpSettings['orders.followUp'];
    expect(registry['orders.followUp']).toBe(spec);
    expect(spec.version).toBe(210);
    expect(spec.isOwnerData).toBe(false);
    expect(spec.default.enabled).toBe(false);
    expect(spec.default.offer.enabled).toBe(false);
    expect(spec.default.offer.couponCode).toBe('');
    expect(FOLLOW_UP_CEILING).toBe(2);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey)).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!)).toBeTruthy();
    }
  });

  it('ships a valid default and refuses out-of-range numbers, unknown or repeated channels and extra keys', () => {
    const d = followUpSettings['orders.followUp'].default;
    expect(followUpSchema.safeParse(d).success).toBe(true);
    const bad: Record<string, unknown>[] = [
      { firstAfterMinutes: 14 },
      { firstAfterMinutes: 2_881 },
      { channels: [] },
      { channels: ['SMS', 'SMS'] },
      { channels: ['EMAIL'] },
      { minStep: 'cart' },
      { phoneGapDays: 0 },
      { catchUpHours: 0 },
      { catchUpHours: 169 },
      { offer: { ...d.offer, afterHours: 0 } },
      { offer: { ...d.offer, afterHours: 169 } },
      { offer: { ...d.offer, couponCode: 'X'.repeat(41) } },
      { maxMessages: 3 },
    ];
    for (const b of bad) expect(followUpSchema.safeParse({ ...d, ...b }).success).toBe(false);
  });
});
