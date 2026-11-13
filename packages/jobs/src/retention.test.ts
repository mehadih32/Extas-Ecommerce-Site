// S14 · PR 302 (Blueprint B5.6 V2, §59 answer 50) — customers are never removed on their own. A source guard: no code
// in the repo deletes a customer row, the only code that erases a customer's details is the owner's step of PR 382
// (@extas/customers erasure.ts, called from Settings › Privacy & data), and nothing in the background worker reaches
// it. Only the IP and the location expire (pii.ts, PR 159 and 302).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const SKIP = new Set(['node_modules', '.next', 'dist', 'generated', 'coverage']);

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

const packageSources = readdirSync(join(ROOT, 'packages')).flatMap((pkg) => {
  const src = join(ROOT, 'packages', pkg, 'src');
  try {
    return statSync(src).isDirectory() ? sources(src) : [];
  } catch {
    return [];
  }
});
const all = [...packageSources, ...sources(join(ROOT, 'apps', 'web', 'src'))];
const rel = (p: string) => relative(ROOT, p).split('\\').join('/');
const using = (re: RegExp) => all.filter((p) => re.test(readFileSync(p, 'utf8'))).map(rel).sort();

describe('PR 302 · customers are never auto-deleted', () => {
  it('reads the sources (the guard is not empty)', () => {
    expect(all.length).toBeGreaterThan(100);
    expect(all.map(rel)).toContain('packages/jobs/src/pii.ts');
  });

  it('no code deletes a customer row', () => {
    expect(using(/\bcustomer\.delete(Many)?\s*\(/)).toEqual([]);
    expect(using(/DELETE\s+FROM\s+"?Customer"?(?![A-Za-z])/i)).toEqual([]);
  });

  it("erasing a customer's details is only the owner's step on Settings › Privacy & data", () => {
    expect(using(/\bcarryOutErasure\b/)).toEqual(['apps/web/src/lib/admin-privacy/service.ts', 'packages/customers/src/erasure.ts']);
    expect(using(/erasedAt:\s*now\b/)).toEqual(['packages/customers/src/erasure.ts']);
  });

  it('the background worker never reaches the erasure', () => {
    const worker = all.filter((p) => rel(p).startsWith('packages/jobs/src/'));
    expect(worker.length).toBeGreaterThan(5);
    for (const p of worker) expect(readFileSync(p, 'utf8'), rel(p)).not.toMatch(/\b(carryOutErasure|requestErasure|erasure)\b/);
  });

  it("PR 706: the one removal of customers is the owner's Start fresh, a database function that refuses any run the owner did not make; the worker only calls it", () => {
    const src = readFileSync(join(ROOT, 'packages/jobs/src/start-fresh-purge.ts'), 'utf8');
    expect(src).toContain('extas_start_fresh_purge');
    expect(src).not.toMatch(/\.(delete|deleteMany)\s*\(/);
    expect(src).toContain("status: 'PARTIAL', purgedAt: null");
  });
});
