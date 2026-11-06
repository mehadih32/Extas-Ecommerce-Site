// Follow-up 566 (PR 617, 616) — a day row on the Daily summary page opens that day's lines with their sources (the
// match page's day explain); a day not matched yet says so there, in both languages.
import { describe, expect, it } from 'vitest';
import { readAdmin } from '@/lib/admin-lumen/section-check';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../messages/admin-books.bn.json';
import en from '../../../../../messages/admin-books.en.json';

describe('follow-up 566 · the Daily summary day opens its explain', () => {
  it('each day row links to the match page for that day', () => {
    expect(readAdmin('money/books/daily/page.tsx')).toContain('href={`/admin/money/books/match?day=${r.date}`} className="a2-b a2-lnk" data-testid="bd-day-link"');
  });
  it('the match page says when the day asked for has no close yet', () => {
    const s = readAdmin('money/books/match/page.tsx');
    expect(s).toContain('data-testid="books-explain-none"');
    for (const d of [en, bn] as Dict[]) expect(t(d, 'bk.explain.none', { date: '7 Nov 2026' })).toContain('7 Nov 2026');
  });
});
