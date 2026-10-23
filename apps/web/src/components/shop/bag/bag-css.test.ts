// PR 107 — the bag keeps the demo's class names (bg-line, bg-ok …). Some of them are also Tailwind colour utilities
// (`bg-<theme colour>`, made because another page uses them). Every such name used by the bag must be reset in
// bag.css, or a bag line is painted in that colour (found in the V12.2 pixel check: grey bag lines).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = join(process.cwd(), 'src/components/shop/bag');
const globals = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');
const css = readFileSync(join(here, 'bag.css'), 'utf8');
const markup = readdirSync(here)
  .filter((f) => f.endsWith('.tsx'))
  .map((f) => readFileSync(join(here, f), 'utf8'))
  .join('\n');

describe('the bag and Tailwind colour utilities', () => {
  it('every bag class that is also a theme colour utility has a background reset in bag.css', () => {
    const colours = [...globals.matchAll(/--color-([a-z0-9-]+)\s*:/g)].map((m) => m[1]!);
    expect(colours.length).toBeGreaterThan(3);
    const used = colours.filter((c) => new RegExp(`["' ]bg-${c}["' ]`).test(markup));
    expect(used).toContain('line');
    const reset = /([^{}]*)\{\s*background-color:\s*transparent;\s*\}/g;
    const resetNames = [...css.matchAll(reset)].flatMap((m) => [...m[1]!.matchAll(/\.bg-([a-z0-9-]+)/g)].map((x) => x[1]!));
    for (const c of used) expect(resetNames, `bg-${c}`).toContain(c);
  });
});
