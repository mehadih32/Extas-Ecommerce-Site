// S22 · PR 624 (CN-034, registry v189): the Messenger button — off as shipped, the Page is owner data with no default,
// labelled in both languages, the Page's name read from any address the owner may paste.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { isOwnerSetting } from '../src/owner-data';
import { registry } from '../src/registry';
import { MESSENGER_PLACES, messengerPageOf, supportMessengerButtonSchema, supportMessengerSettings } from '../src/registry-support-messenger';

describe('Messenger button settings (v189)', () => {
  it('are in the registry at version 189, store-level, labelled in English and Bengali', () => {
    for (const k of ['contact.messenger', 'support.messengerButton'] as const) {
      const s = supportMessengerSettings[k];
      expect(registry[k]).toBe(s);
      expect(s.version).toBe(189);
      expect(s.scope).toBe('store');
      for (const lang of ['en', 'bn'] as const) for (const m of [s.labelKey, s.helpKey!]) expect(lookup(messages[lang], m)).toBeTruthy();
    }
  });

  it("the Page is the owner's own data and ships empty; the button is not owner data and ships off", () => {
    const page = supportMessengerSettings['contact.messenger'];
    expect(page.isOwnerData).toBe(true);
    expect(page.default).toBeNull();
    expect(isOwnerSetting('contact.messenger', registry)).toBe(true);
    const b = supportMessengerSettings['support.messengerButton'];
    expect(b.isOwnerData).toBe(false);
    expect(b.isPublic).toBe(false);
    expect(b.default.enabled).toBe(false);
    expect(b.default.places).toEqual([...MESSENGER_PLACES]);
    expect(b.default.label.en && b.default.label.bn && b.default.hint.en && b.default.hint.bn).toBeTruthy();
  });

  it('the button refuses a place twice, an unknown place, empty or too long words and extra fields', () => {
    const d = supportMessengerSettings['support.messengerButton'].default;
    expect(supportMessengerButtonSchema.safeParse({ ...d, places: [] }).success).toBe(true);
    for (const bad of [{ places: ['header', 'header'] }, { places: ['footer'] }, { label: { en: '', bn: 'x' } }, { label: { en: 'x'.repeat(41), bn: 'x' } }, { hint: { en: 'x', bn: 'x'.repeat(121) } }, { extra: 1 }])
      expect(supportMessengerButtonSchema.safeParse({ ...d, ...bad }).success).toBe(false);
  });

  it("reads the Page's name from a name, an @name or any Facebook or Messenger address", () => {
    const cases: [string, string | null][] = [
      ['extas.bd', 'extas.bd'],
      ['@extasbd', 'extasbd'],
      ['  extasbd  ', 'extasbd'],
      ['https://m.me/extas.bd', 'extas.bd'],
      ['m.me/extasbd?ref=x', 'extasbd'],
      ['facebook.com/extasbd/', 'extasbd'],
      ['https://www.facebook.com/extasbd/about', 'extasbd'],
      ['https://web.facebook.com/extasbd', 'extasbd'],
      ['https://www.facebook.com/profile.php?id=100012345678', '100012345678'],
      ['https://www.facebook.com/pages/EXTAS/123456789', '123456789'],
      ['https://www.facebook.com/p/EXTAS-100012345678/', '100012345678'],
      ['https://www.messenger.com/t/extasbd', 'extasbd'],
      ['123456789', '123456789'],
      ['', null],
      ['12', null],
      ['extas..bd', null],
      ['.extas', null],
      ['facebook.com', null],
      ['m.me', null],
      ['www.extas.com', null],
      ['https://www.facebook.com/groups/12345', null],
      ['https://www.facebook.com/sharer.php?u=x', null],
      ['https://evil.example/extasbd', null],
      ['https://facebook.com.evil.example/extasbd', null],
      ['javascript:alert(1)', null],
      ['https://user:pw@facebook.com/extasbd', null],
      ['extas bd', null],
    ];
    for (const [input, want] of cases) expect(messengerPageOf(input), input).toBe(want);
  });

  it('the stored Page is the bare name only', () => {
    const schema = supportMessengerSettings['contact.messenger'].schema;
    expect(schema.safeParse('extas.bd').success).toBe(true);
    expect(schema.safeParse(null).success).toBe(true);
    expect(schema.safeParse('https://m.me/extas.bd').success).toBe(false);
    expect(schema.safeParse('extas..bd').success).toBe(false);
  });
});
