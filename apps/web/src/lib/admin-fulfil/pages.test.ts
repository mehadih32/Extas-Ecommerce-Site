// S08 · PR 554, 179–181 — the courier and packing pages are server pages: a function handed to one of their client parts
// (`done={(a) => …}`) builds and passes every unit test, then breaks the page with a 500 the moment that part is drawn
// (a courier with an area list). Each such part takes words or ids instead and keeps its own function (ReadNow,
// HandoverDone), and this test keeps it that way.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const APP = join(__dirname, '../../app/admin');
const DIRS = ['delivery/couriers', 'orders/packing'];

function pages(dir: string): string[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names.flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return pages(p);
    return n === 'page.tsx' ? [p] : [];
  });
}

/** A JSX attribute whose value is an arrow function: `name={(a) => …}` or `name={a => …}`. */
const FUNCTION_PROP = /\s[a-zA-Z]+=\{\s*(?:\([^()]*\)|[a-zA-Z_$][\w$]*)\s*=>/g;

describe('the courier and packing pages hand no function to a client part', () => {
  const files = DIRS.flatMap((d) => pages(join(APP, d)));

  it('finds the pages', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => [f.slice(APP.length + 1), f]))('%s', (_name, file) => {
    const src = readFileSync(file, 'utf8');
    expect(src.match(FUNCTION_PROP) ?? []).toEqual([]);
  });

  it('the check sees one', () => {
    expect(' done={(a) => a.now}'.match(FUNCTION_PROP)).toHaveLength(1);
    expect(' done={a => a.now}'.match(FUNCTION_PROP)).toHaveLength(1);
    expect('{rows.map((r) => r.id)}'.match(FUNCTION_PROP)).toBeNull();
  });
});
