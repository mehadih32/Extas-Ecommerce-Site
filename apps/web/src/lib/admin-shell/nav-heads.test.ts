// PR 763 — every admin page uses the shell's own head (`PageHead`: title, the line under it, the guide button, the page's
// buttons on the right). Sixteen pages (Products: All products, Add product, Stock, Counts, Movements, Back in stock, Combos,
// Size charts, Queue, Import, ERP import, Audit; Rules: Hub, Smart rules, Offers, Notices) kept an older head of their own
// (a crumb row + `.ad-hd` / `.cb-hd` / `.rl-hd`), which made their tab bar sit lower than on the others. This pure test
// (sources only) fails when one of them draws the old head again, and when a page wrapper that is a flex column with a gap
// is missing from the CSS rule that takes the head's own margin off (the gap would be doubled, 28 or 30 px instead of 14).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '../..');
const file = (p: string) => (existsSync(p) ? readFileSync(p, 'utf8') : '');
const walk = (dir: string, ext: RegExp): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p, ext) : ext.test(n) ? [p] : []; });

/** The old pages that had their own crumb row and header; each now draws the shell's `PageHead`. */
const MIGRATED = [
  'app/admin/products/new/page.tsx',
  'app/admin/stock/page.tsx',
  'app/admin/stock/counts/page.tsx',
  'app/admin/stock/movements/page.tsx',
  'app/admin/products/back-in-stock/page.tsx',
  'app/admin/size-charts/page.tsx',
  'app/admin/products/queue/page.tsx',
  'app/admin/products/import/page.tsx',
  'app/admin/products/erp-import/page.tsx',
  'app/admin/products/audit/page.tsx',
  'app/admin/combos/page.tsx',
  'app/admin/rules/page.tsx',
  'app/admin/rules/smart/page.tsx',
  'app/admin/rules/offers/page.tsx',
  'app/admin/rules/notices/page.tsx',
  'components/admin/products/ProductListPage.tsx',
  'components/admin/combos/CombosScreen.tsx',
  'components/admin/rules/RulesHub.tsx',
  'components/admin/rules/RulesScreen.tsx',
  'components/admin/rules/OffersScreen.tsx',
  'components/admin/rules/PopupsHub.tsx',
];

/** Pages whose head is drawn by their screen component (listed there with PageHead), or passed to it as a prop. */
const HEAD_IN_SCREEN = /^app\/admin\/rules\/(.*\/)?page\.tsx$|CombosScreen/;

describe("every admin page draws the shell's head (PR 763)", () => {
  it("the pages that had their own crumb row and header use the shell's PageHead now", () => {
    const bad = MIGRATED.filter((f) => {
      const src = file(join(SRC, f));
      return /className="(ad-hd|cb-hd|rl-hd)\b|className="ad-eyebrow"/.test(src) || (!HEAD_IN_SCREEN.test(f) && !/<PageHead\b/.test(src));
    });
    expect(bad).toEqual([]);
    for (const f of MIGRATED.filter((x) => x.startsWith('app/admin/'))) expect(file(join(SRC, f)), f).toContain('crumb={false}');
  });

  it('a page wrapper that is a flex column with a gap takes the head\'s own margin off (no doubled gap under the head)', () => {
    const css = walk(join(SRC, 'app/admin'), /\.css$/).map((f) => file(f)).join('\n');
    const rule = /\[data-lm-look\] :is\(([^)]*)\) > \.a2-ph \{ margin-bottom: 0; \}/.exec(css)?.[1] ?? '';
    const listed = new Set(rule.split(',').map((x) => x.trim().replace(/^\./, '')));
    const pages = walk(join(SRC, 'app/admin'), /^page\.tsx$/).filter((p) => /<PageHead\b/.test(file(p)));
    const wrappers = new Set(pages.flatMap((p) => [...file(p).matchAll(/<div className="a2-z ([a-z0-9]+-page)"/g)].map((m) => m[1]!)));
    const gapped = (c: string) => new RegExp('\\.' + c + '\\b[^{}]*\\{[^}]*display: flex; flex-direction: column; gap').test(css);
    const bad = [...wrappers].filter(gapped).filter((c) => !listed.has(c));
    expect(bad).toEqual([]);
  });
});
