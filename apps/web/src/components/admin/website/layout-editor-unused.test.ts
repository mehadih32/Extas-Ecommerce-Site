// S02 · PR 595 follow-up 693 — PR 76's LayoutEditor.tsx is kept (nothing deleted) but unused: Website › Page layouts
// draws the Lumen LayoutBuilder.tsx. This guard fails if any file starts importing the old list again.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', '..', '..');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

describe('LayoutEditor.tsx (PR 76, unused since PR 595)', () => {
  it('is still there, marked unused', () => {
    const own = readFileSync(join(__dirname, 'LayoutEditor.tsx'), 'utf8');
    expect(own).toContain('Unused since PR 595');
  });

  it('is imported by no file', () => {
    const users = files(SRC).filter((p) => !p.endsWith('LayoutEditor.tsx') && /from\s+['"][^'"]*\/LayoutEditor['"]/.test(readFileSync(p, 'utf8')));
    expect(users).toEqual([]);
  });
});
