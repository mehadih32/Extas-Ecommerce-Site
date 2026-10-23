// PR 88 — the page and image weight check (tools/page-weight.mjs) and its budgets (docs/qa/page-weight.json).
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { budgetFor, checkDir, judge, pagePath, weightsOf } from './page-weight.mjs';

const { budgets } = JSON.parse(readFileSync(new URL('../docs/qa/page-weight.json', import.meta.url), 'utf8'));
const KB = 1024;
const lhr = (url, total, images = []) => ({
  requestedUrl: url,
  audits: {
    'total-byte-weight': { numericValue: total },
    'network-requests': { details: { items: [{ resourceType: 'Document', url, transferSize: 30 * KB }, ...images.map(([u, b]) => ({ resourceType: 'Image', url: u, transferSize: b }))] } },
  },
});
const dirs = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('page weight', () => {
  it('reads the page kind from the path, in both languages', () => {
    expect(pagePath('http://127.0.0.1:3000/bn/collections/polos')).toBe('/collections/polos');
    expect(budgetFor(budgets, 'http://127.0.0.1:3000/bn/collections/polos')?.id).toBe('category');
    expect(budgetFor(budgets, 'http://127.0.0.1:3000/search?q=polo')?.id).toBe('search');
    expect(budgetFor(budgets, 'http://127.0.0.1:3000/p/essential-pique-polo')?.id).toBe('product');
    expect(budgetFor(budgets, 'http://127.0.0.1:3000/')).toBeNull();
  });

  it('holds the register targets: a category page under 1 MB, a category image under 40 KB, a product main image under 150 KB', () => {
    const cat = budgets.find((b) => b.id === 'category');
    expect(cat.pageBytes).toBe(1024 * KB);
    expect(cat.imageBytes).toBe(40 * KB);
    expect(budgets.find((b) => b.id === 'product').imageBytes).toBe(150 * KB);
  });

  it('judges the median run: a heavy page and a heavy image are named, a light one passes', () => {
    const cat = budgetFor(budgets, 'http://x/collections/polos');
    const ok = weightsOf(lhr('http://x/collections/polos', 600 * KB, [['http://x/m/a.avif', 30 * KB]]));
    const heavy = weightsOf(lhr('http://x/collections/polos', 1200 * KB, [['http://x/m/b.avif', 55 * KB]]));
    expect(judge(cat, 'http://x/collections/polos', [ok])).toEqual([]);
    const p = judge(cat, 'http://x/collections/polos', [heavy, heavy, ok]);
    expect(p).toHaveLength(2);
    expect(p[0]).toMatch(/loads 1200 KB, over its 1024 KB budget/);
    expect(p[1]).toMatch(/b\.avif is 55 KB, over the 40 KB budget/);
  });

  it('checks a folder of reports and finds nothing over on light pages', () => {
    const d = mkdtempSync(join(tmpdir(), 'weight-'));
    dirs.push(d);
    writeFileSync(join(d, 'lhr-1.json'), JSON.stringify(lhr('http://x/bn/collections/new-in', 400 * KB)));
    writeFileSync(join(d, 'lhr-2.json'), JSON.stringify(lhr('http://x/p/essential-pique-polo', 500 * KB, [['http://x/m/main.avif', 120 * KB]])));
    writeFileSync(join(d, '127_0_0_1-_search-2026-10-23_10_00_00.report.json'), JSON.stringify(lhr('http://x/search?q=polo', 450 * KB)));
    writeFileSync(join(d, 'manifest.json'), '[]');
    const r = checkDir(d, budgets);
    expect(r.pages).toBe(3);
    expect(r.problems).toEqual([]);
  });
});
