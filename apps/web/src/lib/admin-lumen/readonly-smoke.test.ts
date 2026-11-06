// CN-016 / CN-036 guard (PR 633 and 634 follow-ups): the deploy's smoke test signs in with the server's read-only check
// account (packages/auth check-account: only the `*.read` / `*.view` keys and the report reads). A smoke check that waits
// for a Lumen page's ready mark ([data-lm-ready]) on a page guarded by any other permission sees only that page's
// no-access state, so that state must carry the same marks — else the deploy rolls back (batch 14: PR 632, then 633, 634).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHECK_PERMISSIONS } from '@extas/auth';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const APP = join(ROOT, 'apps/web/src/app');
const READ_ONLY: ReadonlySet<string> = new Set(CHECK_PERMISSIONS);

interface Check { pr: number; page?: string; selector?: string }

/** The page.tsx that answers an admin address (route groups and [param] folders included). */
function pageFile(address: string): string | null {
  const segs = (address.split(/[?#]/)[0] ?? '').split('/').filter(Boolean);
  const walk = (dir: string, i: number): string | null => {
    if (i === segs.length) return existsSync(join(dir, 'page.tsx')) ? join(dir, 'page.tsx') : null;
    const dirs = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
    const order = [...dirs.filter((d) => d === segs[i]), ...dirs.filter((d) => /^\[.*\]$/.test(d))];
    for (const d of order) {
      const r = walk(join(dir, d), i + 1);
      if (r) return r;
    }
    for (const d of dirs.filter((x) => /^\(.*\)$/.test(x))) {
      const r = walk(join(dir, d), i);
      if (r) return r;
    }
    return null;
  };
  return walk(APP, 0);
}

/** The permission the page asks for first (pageAccess('…') or a helper's perm: '…'). */
const gateOf = (src: string): string | null => src.match(/pageAccess\(\s*['"]([\w.]+)['"]|perm:\s*['"]([\w.]+)['"]/)?.slice(1).find(Boolean) ?? null;

/** The no-access branch of a page: from `access.kind === 'forbidden'` to the end of what it returns. */
const forbiddenBranch = (src: string): string | null => src.match(/kind === ['"]forbidden['"]\)[\s\S]*?(?:\/>;|\n\s*\);)/)?.[0] ?? null;

describe('smoke checks hold for the read-only check account', () => {
  const smoke = JSON.parse(readFileSync(join(ROOT, 'docs/qa/smoke.json'), 'utf8')) as { checks: Check[] };
  const lumen = smoke.checks.filter((c) => c.page?.startsWith('/admin') && c.selector?.includes('data-lm-ready'));

  it('finds the Lumen checks and their pages', () => {
    expect(lumen.length).toBeGreaterThan(50);
    for (const c of lumen) expect(pageFile(c.page!), c.page).not.toBeNull();
  });

  it('a page behind a permission the check account lacks draws its no-access state with the check`s marks', () => {
    const bad: string[] = [];
    for (const c of lumen) {
      const src = readFileSync(pageFile(c.page!)!, 'utf8');
      const gate = gateOf(src);
      if (!gate || READ_ONLY.has(gate)) continue;
      const branch = forbiddenBranch(src);
      const testId = c.selector!.match(/data-testid=["']?([\w-]+)/)?.[1];
      const ok = testId
        ? !!branch && branch.includes(`data-testid="${testId}"`) && branch.includes('data-lm-ready')
        : !!branch && /<AdminNotice\b[^>]*\bready\b/.test(branch) && !/h1\.ad-h1/.test(c.selector!);
      if (!ok) bad.push(`PR ${c.pr} ${c.page} (${gate}): ${c.selector}`);
    }
    expect(bad).toEqual([]);
  });
});
