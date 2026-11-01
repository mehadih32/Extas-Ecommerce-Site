// PR 425 follow-up (go-live gate customer 360°, 1 Nov) — a number typed into the Support inbox search, in any of the
// ways people type it, looks for the same digits. Made-up test numbers.
import { describe, expect, it } from 'vitest';
import { inboxPhoneDigits } from './search-pure';

describe('the inbox search digits (PR 425 follow-up)', () => {
  it('Bengali digits, spaces, dashes, +880 and the leading 0 all give the same digits', () => {
    for (const typed of ['০১৭১২-৩৪৫৬৭৮', '01712 345678', '+880 1712-345678', '8801712345678', '+৮৮০১৭১২৩৪৫৬৭৮', '00880 1712 345678']) {
      expect(inboxPhoneDigits(typed), typed).toBe('1712345678');
    }
  });

  it('part of a number is searched as typed; too few digits or none is not a number search', () => {
    expect(inboxPhoneDigits('৩৪৫৬')).toBe('3456');
    expect(inboxPhoneDigits('12')).toBe('');
    expect(inboxPhoneDigits('Rahim')).toBe('');
  });
});
