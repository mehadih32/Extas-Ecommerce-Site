// S02 · PR 78 follow-up (677) — the admin's own words in Website › Words & language (read only): every admin words file
// is listed (the list stays equal to the folder), each word with its English and Bengali, searched and paged.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADMIN_WORD_FILES, adminWordList, adminWordRows } from './admin-words';

const MESSAGES = join(__dirname, '..', '..', '..', 'messages');

describe('the admin`s own words (PR 78 follow-up, 677)', () => {
  it('lists every admin words file of the folder (a new file joins ADMIN_WORD_FILES)', () => {
    const onDisk = readdirSync(MESSAGES)
      .filter((f) => /^admin.*\.en\.json$/.test(f))
      .map((f) => f.replace(/\.en\.json$/, ''))
      .sort();
    expect(Object.keys(ADMIN_WORD_FILES).sort()).toEqual(onDisk);
  });

  it('every word carries its file, key and both languages', () => {
    const rows = adminWordRows();
    expect(rows.length).toBeGreaterThan(1000);
    const title = rows.find((r) => r.file === 'admin-words' && r.key === 'wd.title');
    expect(title).toEqual({ file: 'admin-words', key: 'wd.title', en: 'Words & language', bn: expect.stringMatching(/\p{Script=Bengali}/u) });
  });

  it('searches the file, the key and both languages, and pages', () => {
    const found = adminWordList({ q: 'Words & language' }, 10);
    expect(found.rows.some((r) => r.key === 'wd.title')).toBe(true);
    expect(adminWordList({ q: 'admin-words' }, 10).total).toBeGreaterThan(10);
    const p2 = adminWordList({ p: 2 }, 10);
    expect(p2).toMatchObject({ p: 2, total: adminWordRows().length });
    expect(p2.rows[0]).toEqual(adminWordRows()[10]);
    expect(adminWordList({ p: 99999 }, 10).p).toBe(p2.pages);
    expect(adminWordList({ q: 'no such word anywhere at all' }, 10)).toMatchObject({ rows: [], total: 0, p: 1, pages: 1 });
  });
});
