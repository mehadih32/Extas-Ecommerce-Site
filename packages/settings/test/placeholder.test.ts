// S18 · PR 383 — the placeholder guard: the texts that once shipped in the footer ("[your DBID number]", "[number]",
// "[support email]") and their cousins are caught, in plain and two-language values; real values pass.
import { describe, expect, it } from 'vitest';
import { isPlaceholderGuarded, looksLikePlaceholder, withoutPlaceholder } from '../src/placeholder';

describe('placeholder guard (PR 383)', () => {
  it('catches bracketed, templated and filler values', () => {
    for (const v of ['[your DBID number]', '[number]', '[support email]', '{{dbid}}', '<dbid>', 'TBD', 'tba', 'N/A', 'n.a.', 'TODO', 'xxx', 'XXXX-XXXX', '000000', '123456', 'lorem ipsum', 'Placeholder', 'your number here', '...', '—', '-', '?']) {
      expect(looksLikePlaceholder(v), v).toBe(true);
    }
  });

  it('lets real values through', () => {
    for (const v of ['TRAD/DNCC/012345/2024', '358912476', '000123456-0101', 'EXTAS Fashion Ltd.', 'support@extas.example', '+8801700000000', 'https://facebook.com/extas', 'বাড়ি ১২, রোড ৫']) {
      expect(looksLikePlaceholder(v), v).toBe(false);
    }
    expect(looksLikePlaceholder(null)).toBe(false);
    expect(looksLikePlaceholder(42)).toBe(false);
  });

  it('looks inside two-language values, and empties what it catches', () => {
    expect(looksLikePlaceholder({ en: 'House 1, Road 2', bn: '[ঠিকানা]' })).toBe(true);
    expect(looksLikePlaceholder({ en: 'House 1', bn: 'বাড়ি ১' })).toBe(false);
    expect(withoutPlaceholder('legal.dbid', '[your DBID number]', null)).toBeNull();
    expect(withoutPlaceholder('legal.dbid', '358912476', null)).toBe('358912476');
    expect(withoutPlaceholder('store.name', '[name]', 'x')).toBe('[name]'); // only the guarded groups
  });

  it('guards the owner details the shop prints: legal numbers, contacts, social links', () => {
    expect(isPlaceholderGuarded('legal.bin')).toBe(true);
    expect(isPlaceholderGuarded('contact.email')).toBe(true);
    expect(isPlaceholderGuarded('social.facebook')).toBe(true);
    expect(isPlaceholderGuarded('home.hero')).toBe(false);
  });
});
