// S02 · PR 75 follow-up (go-live gate customer 360°) — `pages.contactForm`: off as it ships, every number the owner's,
// and its words (label, help, the inbox channel's name, the order line) in both languages.
import { describe, expect, it } from 'vitest';
import { contactFormSchema, lookup, messages, registry } from '../src/index';

describe('pages.contactForm (PR 75 follow-up)', () => {
  const spec = registry['pages.contactForm'];

  it('ships off, per store, with a default the schema accepts', () => {
    expect(spec.scope).toBe('store');
    expect(spec.default).toEqual({ enabled: false, perPhonePerDay: 3, maxChars: 1000 });
    expect(contactFormSchema.safeParse(spec.default).success).toBe(true);
    expect(spec.isOwnerData).toBe(false);
    expect(spec.isPublic).toBe(false);
  });

  it('keeps the day limit within 1–20 and the message within 100–2000 characters', () => {
    const ok = (v: object) => contactFormSchema.safeParse({ ...spec.default, ...v }).success;
    expect(ok({ perPhonePerDay: 0 })).toBe(false);
    expect(ok({ perPhonePerDay: 21 })).toBe(false);
    expect(ok({ maxChars: 99 })).toBe(false);
    expect(ok({ maxChars: 2001 })).toBe(false);
    expect(ok({ enabled: true, perPhonePerDay: 20, maxChars: 2000 })).toBe(true);
    expect(contactFormSchema.safeParse({ ...spec.default, extra: 1 }).success).toBe(false);
  });

  it('has its words in English and Bengali', () => {
    for (const k of [spec.labelKey, spec.helpKey ?? '', 'pages.contactForm.channel', 'pages.contactForm.orderLine']) {
      expect(lookup(messages.en, k), k).toBeTruthy();
      expect(lookup(messages.bn, k), k).toBeTruthy();
    }
    expect(lookup(messages.bn, 'pages.contactForm.orderLine')).toContain('{number}');
  });
});
