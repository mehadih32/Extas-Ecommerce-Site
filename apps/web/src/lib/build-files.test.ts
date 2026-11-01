// S21 · PR 594 — Blueprint & files on a made-up server copy: three kept copies of the docs, `current` pointing at the
// newest; the listing, the search, the sections, the versions, and the paths that are never opened.
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { countIn, docFolders, docSections, docVersions, folderOf, listDocs, readDoc, readDocVersion, searchDocs } from './build-files';

const base = mkdtempSync(join(tmpdir(), 'extas-docs-'));
const copy = (id: string, committed: string, files: Record<string, string>) => {
  for (const [p, text] of Object.entries(files)) {
    const full = join(base, id, 'docs', p);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, text);
  }
  writeFileSync(join(base, id, 'COMMIT'), `commit=${id}0000\ncommitted=${committed}\n`);
};
copy('aaaaaaaaaaa1', '2026-10-29 10:00', { 'BLUEPRINT.md': '# Blueprint\nold words\n', 'owner/NOTE.md': '# Note\nsame\n' });
copy('aaaaaaaaaaa2', '2026-10-30 10:00', { 'BLUEPRINT.md': '# Blueprint\nold words\n', 'owner/NOTE.md': '# Note\nsame\n' });
copy('aaaaaaaaaaa3', '2026-10-31 10:00', {
  'BLUEPRINT.md': '# Blueprint\nintro\n## Part A\nexchange window is 3 days\n```\n## not a heading\n```\n## Part B\nthe Exchange rule\n',
  'owner/NOTE.md': '# Note\nsame\n',
  'agents/skills/x/SKILL.md': '# Someone else’s skill\n',
  'reports/smoke/latest/report.md': '# Smoke\n',
  'demo/page.html': '<p>not markdown</p>',
});
symlinkSync(join(base, 'aaaaaaaaaaa3'), join(base, 'current'));
const docs = join(base, 'current', 'docs');

afterAll(() => rmSync(base, { recursive: true, force: true }));

describe('PR 594 · Blueprint & files', () => {
  it('lists the Markdown files, core first, never the skill copies or the smoke pictures', async () => {
    const list = await listDocs(docs);
    expect(list.map((f) => f.path)).toEqual(['BLUEPRINT.md', 'owner/NOTE.md']);
    expect(list[0]).toMatchObject({ title: 'Blueprint', core: true });
    expect(list[0]!.hash).toMatch(/^[0-9a-f]{12}$/);
    // the top-level files stay on the first screen; the rest are grouped by their top folder
    expect(list.filter((f) => !folderOf(f.path)).map((f) => f.path)).toEqual(['BLUEPRINT.md']);
    expect(docFolders(list)).toEqual([{ dir: 'owner', count: 1, size: Buffer.byteLength('# Note\nsame\n') }]);
  });

  it('opens only a file the listing gave', async () => {
    expect((await readDoc(docs, 'owner/NOTE.md'))?.text).toContain('same');
    for (const bad of ['../COMMIT', 'agents/skills/x/SKILL.md', '/etc/passwd', 'demo/page.html', 'owner//NOTE.md', '.hidden.md']) expect(await readDoc(docs, bad)).toBeNull();
  });

  it('searches inside every file, case ignored, most hits first', async () => {
    expect(countIn('Exchange exchange EXCHANGE', 'exchange')).toBe(3);
    expect(countIn('abc', 'a')).toBe(0);
    const hits = await searchDocs(docs, 'exchange');
    expect(hits.map((h) => [h.file.path, h.count])).toEqual([['BLUEPRINT.md', 2]]);
    expect((await searchDocs(docs, 'note')).map((h) => h.file.path)).toEqual(['owner/NOTE.md']);
  });

  it('cuts a file at its headings, not inside code', () => {
    const s = docSections('intro line\n# Blueprint\nx\n## Part A\nexchange\n```\n## not a heading\n```\n## **Part B**\ny\n', 'Start');
    expect(s.map((x) => x.title)).toEqual(['Start', 'Blueprint', 'Part A', 'Part B']);
    expect(s[2]!.md).toContain('## not a heading');
  });

  it('cuts a long part again, repeating the table header in each piece', () => {
    const rows = Array.from({ length: 10 }, (_, i) => `| ${i} | row ${i} |`);
    const md = ['## Build status', 'intro', '| PR | Note |', '|---|---|', ...rows, 'after', '```', 'a', 'b', 'c', 'd', '```', 'end'].join('\n');
    const s = docSections(md, 'Start', 4);
    expect(s[0]!.title).toBe('Build status');
    expect(s[1]!.title).toBe('Build status (2)');
    // the header and separator never part, and every later piece of the table starts with them
    expect(s[0]!.md).toContain('| PR | Note |\n|---|---|\n| 0 |');
    for (const p of s.filter((x) => /\| [1-9] \|/.test(x.md))) expect(p.md.startsWith('| PR | Note |\n|---|---|\n')).toBe(true);
    // every row is kept exactly once, and a code block is never cut
    expect(s.map((x) => x.md).join('').match(/\| \d \| row/g)).toHaveLength(10);
    expect(s.some((x) => x.md.includes('```\na\nb\nc\nd\n```'))).toBe(true);
  });

  it('lists the kept versions, one line per change, and reads one', async () => {
    const v = await docVersions(docs, 'BLUEPRINT.md');
    expect(v.map((x) => [x.id, x.committed, x.current])).toEqual([
      ['aaaaaaaaaaa3', '2026-10-31 10:00', true],
      ['aaaaaaaaaaa2', '2026-10-29 10:00', false],
    ]);
    expect(await readDocVersion(docs, 'BLUEPRINT.md', 'aaaaaaaaaaa2')).toContain('old words');
    expect(await readDocVersion(docs, 'BLUEPRINT.md', 'zzzz')).toBeNull();
    expect(await readDocVersion(docs, 'BLUEPRINT.md', 'aaaaaaaaaaa9')).toBeNull();
    expect((await docVersions(docs, 'owner/NOTE.md')).map((x) => x.committed)).toEqual(['2026-10-29 10:00']);
  });

  it('has no versions outside a server copy (the repository)', async () => {
    expect(await docVersions(join(base, 'aaaaaaaaaaa3', '..', 'nowhere'), 'BLUEPRINT.md')).toEqual([]);
  });
});
