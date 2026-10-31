// S18 · PR 389 — the Site manual's search (every word, title first, only visible sections) and "What's new" (built
// register rows, newest first, the Bengali line when there is one).
import { describe, expect, it } from 'vitest';
import { guideDir, parseMarkdown } from './guide';
import { blocksText, parseWhatsNew, queryWords, readWhatsNew, scoreOf, searchManual, SEARCH_MAX_HITS, snippetOf } from './manual-search';
import type { ShellViewer } from './sections';

const owner: ShellViewer = { perms: new Set(), owner: true };
const helper: ShellViewer = { perms: new Set(['help.read']), owner: false };

describe('Site manual search (PR 389)', () => {
  const dir = guideDir();

  it('turns a guide into plain text: headings, lists, tables and boxes', () => {
    const text = blocksText(parseMarkdown('## এটা কী\nএকটা **পাতা** `code`\n\n- এক\n  - দুই\n\n| a | b |\n|---|---|\n| c | d |\n\n> [!TIP]\n> টিপ'));
    expect(text).toBe('এটা কী\nএকটা পাতা code\nএক\nদুই\na · b\nc · d\nটিপ');
  });

  it('reads the words of a query, ignoring a too-short one', () => {
    expect(queryWords('  Courier  courier Refund ')).toEqual(['courier', 'refund']);
    expect(queryWords('a')).toEqual([]);
    expect(queryWords('এক দুই তিন চার পাঁচ ছয় সাত').length).toBe(6);
  });

  it('needs every word, and a word in the title counts more', () => {
    expect(scoreOf('Backups', 'nightly copy', ['backup'])).toBe(5);
    expect(scoreOf('Orders', 'backup backup', ['backup'])).toBe(2);
    expect(scoreOf('Orders', 'backup', ['backup', 'courier'])).toBeNull();
  });

  it('cuts a short piece around the first word found', () => {
    const long = `${'x '.repeat(100)}courier ${'y '.repeat(100)}`;
    const s = snippetOf(long, ['courier']);
    expect(s.startsWith('…')).toBe(true);
    expect(s.endsWith('…')).toBe(true);
    expect(s).toContain('courier');
    expect(snippetOf('short text', ['zzz'])).toBe('short text');
  });

  it('finds pages in the guides, best first, and only in sections the person sees', async () => {
    const hits = await searchManual('ম্যানুয়াল', owner, dir);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.length).toBeLessThanOrEqual(SEARCH_MAX_HITS);
    expect(hits.map((h) => h.id)).toContain('help/site-manual');
    const site = hits.find((h) => h.id === 'help/site-manual')!;
    expect(site.anchor).toBe('p-help-site-manual');
    expect(site.snippet).toContain('ম্যানুয়াল');
    const orders = await searchManual('অর্ডার', helper, dir);
    expect(orders.every((h) => h.section === 'help' || h.section === 'dashboard')).toBe(true);
    expect(await searchManual('x', owner, dir)).toEqual([]);
    expect(await searchManual('zzqqxx-nothing', owner, dir)).toEqual([]);
    expect(await searchManual('অর্ডার', owner, null)).toEqual([]);
  });
});

describe("Site manual What's new (PR 389)", () => {
  const register = [
    '| 12 | S00 | live | 2026-10-20 | pnpm workspace (setup); more |',
    '| 380 | S18 | merged | 2026-10-31 | Settings › Sign-in & security (CN-031 lane B; long) |',
    '| 257 | S13 | merged | 2026-10-31 | event tracking: details |',
    '| 999 | S99 | to build | 2026-10-31 | not built |',
    '| 257 | **Server-side event tracking.** Meta, Google, TikTok |',
    'text | 380 | S18 | merged | 2026-11-01 | not a row start |',
  ].join('\n');

  it('lists built rows newest first, with the Bengali line, the register title, or the row opening', () => {
    const en = parseWhatsNew(register, { '12': 'সেটআপ' }, 'en');
    expect(en.map((x) => [x.pr, x.date, x.text])).toEqual([
      [380, '2026-10-31', 'Settings › Sign-in & security'],
      [257, '2026-10-31', 'Server-side event tracking'],
      [12, '2026-10-20', 'pnpm workspace'],
    ]);
    const bn = parseWhatsNew(register, { '12': 'সেটআপ' }, 'bn', 2);
    expect(bn.map((x) => x.pr)).toEqual([380, 257]);
    expect(parseWhatsNew(register, { '12': 'সেটআপ' }, 'bn')[2]!.text).toBe('সেটআপ');
  });

  it('reads the repository register and the Bengali lines', async () => {
    const items = await readWhatsNew('bn', guideDir());
    expect(items.length).toBeGreaterThan(0);
    for (let i = 1; i < items.length; i++) expect(items[i - 1]!.date >= items[i]!.date).toBe(true);
    expect(await readWhatsNew('en', null)).toEqual([]);
  });
});
