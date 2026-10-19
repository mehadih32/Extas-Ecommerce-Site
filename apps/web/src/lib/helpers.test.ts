import { afterEach, describe, expect, it } from 'vitest';
import { t } from './i18n';
import { dateTime, num } from './format';

describe('t', () => {
  const dict = { a: { b: 'মোট {n}টা' } };
  it('looks up nested keys and fills variables', () => expect(t(dict, 'a.b', { n: 5 })).toBe('মোট 5টা'));
  it('returns the key when missing, so a gap is visible', () => expect(t(dict, 'a.c')).toBe('a.c'));
});

describe('format', () => {
  afterEach(() => {
    delete process.env.EXTAS_LOCALE;
    delete process.env.EXTAS_TIMEZONE;
  });
  it('writes Bengali digits by default', () => expect(num(598)).toBe('৫৯৮'));
  it('follows the locale setting', () => {
    process.env.EXTAS_LOCALE = 'en-US';
    expect(num(1234)).toBe('1,234');
  });
  it('uses the time zone setting and survives bad input', () => {
    process.env.EXTAS_LOCALE = 'en-GB';
    process.env.EXTAS_TIMEZONE = 'Asia/Dhaka';
    expect(dateTime('2026-10-19T20:40:00Z')).toContain('02:40');
    expect(dateTime('nope')).toBeNull();
    expect(dateTime(undefined)).toBeNull();
  });
});
