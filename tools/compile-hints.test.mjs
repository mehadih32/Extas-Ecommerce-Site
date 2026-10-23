// PR 88 — the compile hint step of the web build (tools/compile-hints.mjs).
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { HINT, hintChunks, shiftMap, withHint } from './compile-hints.mjs';

const dirs = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('compile hints', () => {
  it('puts the hint on the first line once', () => {
    const once = withHint('(()=>{})();');
    expect(once.split('\n')[0]).toBe(HINT);
    expect(withHint(once)).toBe(once);
  });

  it('moves a plain source map and an index map one line down', () => {
    expect(JSON.parse(shiftMap(JSON.stringify({ version: 3, mappings: 'AAAA;AACA' }))).mappings).toBe(';AAAA;AACA');
    const idx = JSON.parse(shiftMap(JSON.stringify({ version: 3, sections: [{ offset: { line: 0, column: 0 }, map: {} }, { offset: { line: 4, column: 2 }, map: {} }] })));
    expect(idx.sections.map((s) => s.offset)).toEqual([
      { line: 1, column: 0 },
      { line: 5, column: 2 },
    ]);
  });

  it('marks every script under the folder, leaves other files, and a second run changes nothing', () => {
    const d = mkdtempSync(join(tmpdir(), 'hints-'));
    dirs.push(d);
    mkdirSync(join(d, 'sub'));
    writeFileSync(join(d, 'a.js'), 'var a=1;\n//# sourceMappingURL=a.js.map');
    writeFileSync(join(d, 'a.js.map'), JSON.stringify({ version: 3, mappings: 'AAAA' }));
    writeFileSync(join(d, 'sub', 'b.js'), 'var b=2;');
    writeFileSync(join(d, 'c.css'), 'a{}');
    expect(hintChunks(d)).toBe(2);
    expect(readFileSync(join(d, 'a.js'), 'utf8').startsWith(`${HINT}\nvar a=1;`)).toBe(true);
    expect(readFileSync(join(d, 'sub', 'b.js'), 'utf8')).toBe(`${HINT}\nvar b=2;`);
    expect(JSON.parse(readFileSync(join(d, 'a.js.map'), 'utf8')).mappings).toBe(';AAAA');
    expect(readFileSync(join(d, 'c.css'), 'utf8')).toBe('a{}');
    expect(hintChunks(d)).toBe(0);
    expect(JSON.parse(readFileSync(join(d, 'a.js.map'), 'utf8')).mappings).toBe(';AAAA');
  });
});

describe('the web build', () => {
  it('marks the chunks right after next build (CI, the device gate and the image all use this script)', () => {
    const pkg = JSON.parse(readFileSync(new URL('../apps/web/package.json', import.meta.url), 'utf8'));
    expect(pkg.scripts.build).toMatch(/^next build && node \.\.\/\.\.\/tools\/compile-hints\.mjs \.next\/static\/chunks$/);
  });
});
