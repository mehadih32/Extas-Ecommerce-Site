// PR 138 — "no state is written by hand anywhere": a source scan of every app and package. Outside @extas/orders, no
// code may write Order.status (an order.update / updateMany / upsert whose data sets `status`, or raw SQL that sets
// "status" on "Order"). The checkout creates an order in its first state (create, not update) and stays allowed. A new
// writer fails this test; it has to become an order command instead.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SKIP = new Set(['node_modules', '.next', 'generated', 'dist', 'coverage', 'migrations']);

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(ts|tsx|mjs)$/.test(name) && !/\.test\.(ts|tsx|mjs)$/.test(name) && !/(^|\/)testing\.ts$/.test(p)) yield p;
  }
}

/** The text of each `.order.update(…)`-like call: from the call to its closing parenthesis. */
function calls(src: string): string[] {
  const out: string[] = [];
  const re = /\.order\.(update|updateMany|upsert)\(/g;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    let depth = 1;
    let i = m.index + m[0].length;
    for (; i < src.length && depth > 0; i++) depth += src[i] === '(' ? 1 : src[i] === ')' ? -1 : 0;
    out.push(src.slice(m.index, i));
  }
  return out;
}

describe('one writer of Order.status (PR 138)', () => {
  it('no code outside @extas/orders writes an order status', () => {
    const offenders: string[] = [];
    for (const top of ['apps', 'packages']) {
      for (const p of files(join(ROOT, top))) {
        const rel = relative(ROOT, p);
        if (rel.startsWith('packages/orders/')) continue;
        const src = readFileSync(p, 'utf8');
        for (const c of calls(src)) if (/\bstatus\s*:/.test(c.replace(/where\s*:\s*\{[^}]*\}/g, ''))) offenders.push(`${rel}: ${c.slice(0, 80)}`);
        if (/UPDATE\s+"Order"\s+SET[^;]*"status"/i.test(src)) offenders.push(`${rel}: raw UPDATE "Order" … "status"`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the scan sees a writer when there is one', () => {
    expect(calls('await tx.order.update({ where: { id }, data: { status: "CONFIRMED" } });').some((c) => /\bstatus\s*:/.test(c.replace(/where\s*:\s*\{[^}]*\}/g, '')))).toBe(true);
    expect(calls('await tx.order.update({ where: { id, status: "PLACED" }, data: { note } });').some((c) => /\bstatus\s*:/.test(c.replace(/where\s*:\s*\{[^}]*\}/g, '')))).toBe(false);
  });
});
