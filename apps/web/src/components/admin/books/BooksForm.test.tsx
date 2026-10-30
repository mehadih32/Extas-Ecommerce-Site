// CN-029 Phase 3 qa-gate F1 (PR 616) — Books › Differences › "Put right" ran off a phone in English: the form opened
// inside the half-width status cell of a row card, and its long send button ("Reverse and add the right entry") could
// not wrap. On a phone the cell holding the form spans the card (`a2-tdw`), the form stretches to the cell and its
// buttons wrap; desktop keeps its table. The device gate measures the opened form (docs/qa/device-gate.json).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { diffStatusCellClass } from '@/lib/admin-books/page';
import { BooksForm } from './BooksForm';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, '../../../app/admin/shell.css'), 'utf8');

/** The admin shell split in two: the rules inside its `@media (max-width:767px){…}` blocks (phones) and the rest. */
function byPhone(text: string): { phone: string; rest: string } {
  const phone: string[] = [];
  let rest = '';
  let from = 0;
  const head = '@media (max-width:767px){';
  for (let i = text.indexOf(head); i >= 0; i = text.indexOf(head, from)) {
    let depth = 1;
    let j = i + head.length;
    while (j < text.length && depth) {
      if (text[j] === '{') depth++;
      else if (text[j] === '}') depth--;
      j++;
    }
    phone.push(text.slice(i + head.length, j - 1));
    rest += text.slice(from, i);
    from = j;
  }
  return { phone: phone.join('\n'), rest: rest + text.slice(from) };
}

describe('F1 · the books form fits a phone', () => {
  it('the form carries the hook the phone layout stretches', () => {
    const html = renderToStaticMarkup(<BooksForm dict={{}} url="/api/x" label="Put right" busyLabel="…" sendLabel="Send" fields={[]} testId="books-adjust" />);
    expect(html).toMatch(/^<span class="a2-stack a2-bkf"/);
  });

  it('on a phone the opened form takes the whole card and its buttons wrap', () => {
    const { phone, rest } = byPhone(css);
    expect(phone).toMatch(/\.adm2 \.a2-tbl td \.a2-bkf\{[^}]*align-self:stretch/);
    expect(phone).toMatch(/\.adm2 \.a2-tbl td \.a2-bkf\{[^}]*min-width:0/);
    expect(phone).toMatch(/\.adm2 \.a2-bkf \.a2-btn\{[^}]*white-space:normal/);
    expect(phone).toMatch(/\.adm2 \.a2-bkf \.a2-btn\{[^}]*height:auto/);
    // never on a desktop: the rules live only in the phone block
    expect(rest).not.toMatch(/\.a2-bkf/);
  });

  it('the status cell spans the row card only when it holds "Put right"', () => {
    expect(diffStatusCellClass(true)).toBe('a2-tdw');
    expect(diffStatusCellClass(false)).toBeUndefined();
  });
});
