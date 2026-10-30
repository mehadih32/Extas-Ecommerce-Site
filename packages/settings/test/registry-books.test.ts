// CN-028 · PR 615, 616 (CN-029 Phase 1, registry v68): every key of the books is in the registry at version 68, in the
// Books group, labelled in English and Bengali, its default valid and inside its own limits. Nothing here is owner data
// and nothing is public.
import { describe, expect, it } from 'vitest';
import { lookup, messages } from '../src/messages';
import { registry } from '../src/registry';
import { booksSettings } from '../src/registry-books';

describe('books settings (v68)', () => {
  it('every key is in the registry at version 68, in the Books group, labelled in both languages, its default valid', () => {
    for (const [key, s] of Object.entries(booksSettings)) {
      expect(registry[key as keyof typeof registry]).toBe(s);
      expect([s.version, s.group, s.isOwnerData, s.isPublic], key).toEqual([68, 'books', false, false]);
      expect(s.schema.safeParse(s.default).success, key).toBe(true);
      for (const lang of ['en', 'bn'] as const) {
        expect(lookup(messages[lang], s.labelKey), `${key} ${lang}`).toBeTruthy();
        expect(lookup(messages[lang], s.helpKey!), `${key} ${lang}`).toBeTruthy();
      }
    }
  });

  it('PR 615: a payment matches within 2 days (§3.1), the statement is read a week back, a page holds 50 rows', () => {
    expect([booksSettings['books.payments.matchDays'].default, booksSettings['books.account.lookbackDays'].default, booksSettings['books.ledger.pageSize'].default]).toEqual([2, 7, 50]);
    expect(booksSettings['books.payments.matchDays'].schema.safeParse(-1).success).toBe(false);
    expect(booksSettings['books.account.lookbackDays'].schema.safeParse(0).success).toBe(false);
    expect(booksSettings['books.ledger.pageSize'].schema.safeParse(500).success).toBe(false);
  });
});
