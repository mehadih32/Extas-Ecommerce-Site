// CN-053 — the admin's small choices in the browser: a broken store never throws and a bad value is the default.
import { describe, expect, it } from 'vitest';
import { readChoice } from './admin-prefs-client';

const isLang = (v: string): v is 'en' | 'bn' => v === 'en' || v === 'bn';

describe('readChoice', () => {
  it('returns a valid stored choice', () => expect(readChoice(() => 'bn', isLang, 'en')).toBe('bn'));
  it('falls back on a corrupt, missing or unreadable value', () => {
    expect(readChoice(() => '{"x":', isLang, 'en')).toBe('en');
    expect(readChoice(() => null, isLang, 'en')).toBe('en');
    expect(readChoice(() => undefined, isLang, 'en')).toBe('en');
    expect(
      readChoice(
        () => {
          throw new Error('SecurityError');
        },
        isLang,
        'en',
      ),
    ).toBe('en');
  });
});
