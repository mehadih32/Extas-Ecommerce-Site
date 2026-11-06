// PR 643 (CN-036) — Money part 2 in the Lumen look: the books pages and the month end mark every root ready (so they
// follow dark mode), the no-access state carries the page's own test id, the section's styles hold no colour literal or
// font family and keep text at 14 px or more, and a books command's "done" line uses the one toast, never with Undo,
// while its warning-then-send step stays.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readAdmin, smallSizes, styleLiterals, unmarkedDenied, unreadyRoots } from '@/lib/admin-lumen/section-check';

const src = (rel: string) => readFileSync(join(__dirname, '..', '..', rel), 'utf8');
const PAGES = ['money/books/page.tsx', 'money/books/daily/page.tsx', 'money/books/match/page.tsx', 'money/books/differences/page.tsx', 'money/books/closes/page.tsx', 'money/month-end/page.tsx'];

describe('Money part 2: the books and the month end in the Lumen look (PR 643)', () => {
  it.each(PAGES)('%s: every page root and the no-access wrapper are ready, the main one carries the section class', (p) => {
    const s = readAdmin(p);
    expect(unreadyRoots(s)).toEqual([]);
    expect(unmarkedDenied(s)).toEqual([]);
    expect(s).toMatch(/className="a2-z lm-bk" data-lm-ready="" data-testid="/);
  });

  it('the shared books opener draws its no-access state and "books off" ready, with the page\'s test id', () => {
    const s = src('lib/admin-books/page.tsx');
    expect(s).toContain('<div className="a2-z lm-bk" data-lm-ready="" data-testid={o.testId}>');
    expect(s).toContain('<div className="a2-z lm-bk" data-lm-ready="" data-testid={testId}>');
    for (const p of ['match', 'differences', 'closes']) expect(readAdmin(`money/books/${p}/page.tsx`)).toMatch(/openBooksPage\(\{ perm: 'books\.read', testId: 'books-/);
  });

  it('the section styles hold no colour literal or font family, and no text under 14 px', () => {
    expect(styleLiterals(readAdmin('lumen-books.css'))).toEqual([]);
    expect(smallSizes(readAdmin('lumen-books.css'))).toEqual([]);
    expect(readAdmin('layout.tsx')).toMatch(/import '\.\/lumen-books\.css';/);
  });

  it('a books command keeps its warning-then-send step and speaks "done" through the one toast, never with Undo', () => {
    const f = src('components/admin/books/BooksForm.tsx');
    expect(f).toContain('if (done) showToast({ text: done });');
    expect(f).not.toContain('undo:');
    expect(f).toContain("'idempotency-key'");
    expect(f).toMatch(/setMsg\(\{ ok: false/);
  });
});
