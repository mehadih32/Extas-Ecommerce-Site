// S08 · PR 193 (registry v94): holiday mode — at version 94, never owner data, labelled in both languages, off as
// shipped with no dates (the owner's own break is never fixed in code), its words using only their own tokens, and
// switching on needs both days in order.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { HOLIDAY_TOKENS, holidaySchema, holidaySettings } from '../src/registry-holiday';

const spec = holidaySettings['delivery.holiday'];
const tokens = (s: string) => [...s.matchAll(/\{([a-z]+)\}/gi)].map((m) => m[1]);

describe('holiday mode setting (v94)', () => {
  it('is in the registry at version 94, labelled in English and Bengali, its default valid', () => {
    expect(registry['delivery.holiday']).toBe(spec);
    expect(spec.version).toBe(94);
    expect(spec.isOwnerData).toBe(false);
    expect(spec.scope).toBe('store');
    expect(spec.schema.safeParse(spec.default).success).toBe(true);
    for (const lang of ['en', 'bn'] as const) {
      expect(lookup(messages[lang], spec.labelKey)).toBeTruthy();
      expect(lookup(messages[lang], spec.helpKey!)).toBeTruthy();
    }
  });

  it('ships off with no dates; the starting words fill every token they may use, in both languages', () => {
    const d = spec.default;
    expect(d.enabled).toBe(false);
    expect(d.from).toBeNull();
    expect(d.to).toBeNull();
    for (const lang of ['en', 'bn'] as const) {
      expect(new Set(tokens(d.notice[lang]))).toEqual(new Set(HOLIDAY_TOKENS.notice));
      expect(new Set(tokens(d.promise[lang]))).toEqual(new Set(HOLIDAY_TOKENS.promise));
    }
  });

  it('switching on needs the first and last day, in order; a stray token or field is refused', () => {
    const d = spec.default;
    expect(holidaySchema.safeParse({ ...d, enabled: true }).success).toBe(false);
    expect(holidaySchema.safeParse({ ...d, enabled: true, from: '2027-04-01' }).success).toBe(false);
    expect(holidaySchema.safeParse({ ...d, enabled: true, from: '2027-04-05', to: '2027-04-01' }).success).toBe(false);
    expect(holidaySchema.safeParse({ ...d, enabled: true, from: '2027-04-01', to: '2027-04-01' }).success).toBe(true);
    expect(holidaySchema.safeParse({ ...d, from: '2027-04-05', to: '2027-04-01' }).success).toBe(false);
    expect(holidaySchema.safeParse({ ...d, promise: { en: 'From {from}', bn: 'From {from}' } }).success).toBe(false);
    expect(holidaySchema.safeParse({ ...d, showDaysBefore: 31 }).success).toBe(false);
    expect(holidaySchema.safeParse({ ...d, extra: 1 }).success).toBe(false);
  });
});
