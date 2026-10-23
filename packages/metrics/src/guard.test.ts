// PR 155 (CN-022) — the guard: no report view, dashboard or API adds up order money on its own. Every Sales or Ordered
// value number goes through @extas/metrics, so the two figures mean the same on every screen. This test reads the source
// of every package and the web app (tests excluded) and fails on an ad-hoc sum of order or line money, or on a read of
// the PR 603 report views (`mv_…`, which bucket by the placed day) outside this package. A file that must add up money
// for another reason (the order being placed, a simulation) is listed below with its reason.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const MONEY = '(?:totalMinor|subtotalMinor|lineTotalMinor|paidMinor|codAmountMinor)';

/** What counts as computing revenue another way. */
export const RULES: { name: string; re: RegExp }[] = [
  { name: 'Prisma aggregate of order money (_sum)', re: new RegExp(`_sum:\\s*\\{[^}]*\\b${MONEY}\\b`) },
  { name: 'SQL sum of order money', re: new RegExp(`\\bsum\\(\\s*(?:\\w+\\.)?"?${MONEY}"?`, 'i') },
  { name: 'reduce over order money', re: new RegExp(`\\.reduce\\([^;]*\\.${MONEY}\\b`) },
  { name: 'running total of order money', re: new RegExp(`\\+=\\s*[\\w.!?]*\\.${MONEY}\\b`) },
  { name: 'read of a report view (mv_…) outside the metrics package', re: /\bmv_(?:sales|style|ad|district|kpi)_\w+/ },
];

/** Files that add up money for a reason other than a sales figure. Each needs its reason. */
export const ALLOWED: Record<string, string> = {
  'packages/rules/src/simulate-service.ts': 'a discount simulation adds up its own before/after quotes for the orders it replays, not a sales figure',
  'packages/seed/src/sample.ts': 'builds one sample order’s own subtotal from its sample lines (sample data, not a report)',
};

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.(ts|tsx|mjs)$/.test(name) && !/\.test\.(ts|tsx|mjs)$/.test(name) && !name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

function scanned(): string[] {
  const dirs = [join(ROOT, 'apps/web/src'), ...readdirSync(join(ROOT, 'packages')).map((p) => join(ROOT, 'packages', p, 'src'))];
  return dirs.filter((d) => {
    try {
      return statSync(d).isDirectory();
    } catch {
      return false;
    }
  }).flatMap((d) => sources(d));
}

/** Findings in one file's text: "<rule> at line <n>". */
export function findings(text: string): string[] {
  const out: string[] = [];
  text.split('\n').forEach((line, i) => {
    if (/^\s*(\/\/|\*)/.test(line)) return; // comments may name the fields
    for (const r of RULES) if (r.re.test(line)) out.push(`${r.name} at line ${i + 1}`);
  });
  return out;
}

describe('PR 155 guard: every money figure goes through @extas/metrics', () => {
  it('catches the ways a view could compute revenue on its own', () => {
    expect(findings('const r = await db.order.aggregate({ _sum: { totalMinor: true } });')).toHaveLength(1);
    expect(findings('SELECT sum(o."totalMinor") FROM "Order" o')).toHaveLength(1);
    expect(findings('revenueMinor: items.reduce((s, i) => s + i.lineTotalMinor, 0),')).toHaveLength(1);
    expect(findings('    r.salesMinor += l.lineTotalMinor;')).toHaveLength(1);
    expect(findings('SELECT * FROM "mv_sales_daily"')).toHaveLength(1);
    expect(findings('SELECT * FROM "mv_kpi_daily"')).toHaveLength(1);
    expect(findings('FROM mv_kpi_lines_monthly')).toHaveLength(1);
    // Not money of orders: a bag's quantities, a comment.
    expect(findings('_sum: { quantity: true }')).toEqual([]);
    expect(findings('// sums lineTotalMinor in metrics')).toEqual([]);
  });

  it('no package or the web app adds up order money outside @extas/metrics', () => {
    const files = scanned();
    expect(files.length).toBeGreaterThan(50);
    const bad: string[] = [];
    for (const f of files) {
      const rel = relative(ROOT, f).split('\\').join('/');
      if (rel.startsWith('packages/metrics/') || ALLOWED[rel]) continue;
      for (const hit of findings(readFileSync(f, 'utf8'))) bad.push(`${rel}: ${hit}`);
    }
    expect(bad, 'use @extas/metrics (kpi, kpiByDay, lines + sumLines) instead of adding up order money here').toEqual([]);
  });

  it('every allowed file still exists and still needs its exception', () => {
    for (const [rel, reason] of Object.entries(ALLOWED)) {
      expect(reason.length).toBeGreaterThan(20);
      expect(findings(readFileSync(join(ROOT, rel), 'utf8')).length, `${rel} no longer needs its exception: remove it`).toBeGreaterThan(0);
    }
  });
});
