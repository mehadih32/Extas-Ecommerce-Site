import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { adminRoutes, check, guideParts, PARTS, sectionIds, shapeProblems } from './admin-guide-check.mjs';

const GOOD = [
  '# সব অর্ডার',
  '',
  `## ${PARTS[0]}`,
  'সব অর্ডারের তালিকা।',
  `## ${PARTS[1]}`,
  '> [!NOTE]',
  '> সকালে 40টা নতুন অর্ডার।',
  `## ${PARTS[2]}`,
  '1. **খুঁজুন** বক্সে ফোন লিখুন।',
  `## ${PARTS[3]}`,
  '- **খুঁজুন** (Search) — অর্ডার খোঁজে।',
  `## ${PARTS[4]}`,
  '- ভুল ফোন।',
  `## ${PARTS[5]}`,
  'অর্ডার কনফার্ম হয়।',
].join('\n');

let dirs = [];
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

/** A small repository on disk: the admin pages, the guide table, the sections, the guides. */
function repo(files) {
  const root = mkdtempSync(join(tmpdir(), 'guide-check-'));
  dirs.push(root);
  const all = {
    'packages/settings/src/registry-admin-shell.ts': "export const ADMIN_SECTIONS = [\n  'dashboard',\n  'orders',\n] as const;",
    ...files,
  };
  for (const [p, body] of Object.entries(all)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), body);
  }
  return root;
}

const table = (pages, notGuided = []) => JSON.stringify({ pages, notGuided });
const PAGE = 'export default function P() { return null; }';

describe('admin guide check', () => {
  it('reads the admin routes, the sections and a guide’s parts', () => {
    const root = repo({ 'apps/web/src/app/admin/page.tsx': PAGE, 'apps/web/src/app/admin/orders/[id]/page.tsx': PAGE, 'apps/web/src/app/admin/(x)/help/page.tsx': PAGE });
    expect(adminRoutes(root)).toEqual(['/admin', '/admin/help', '/admin/orders/[id]']);
    expect(sectionIds("const ADMIN_SECTIONS = ['dashboard', 'orders'];")).toEqual(['dashboard', 'orders']);
    const g = guideParts(GOOD);
    expect(g.title).toBe('সব অর্ডার');
    expect(g.parts.map((p) => p.name)).toEqual(PARTS);
    expect(shapeProblems('orders/all', GOOD)).toEqual([]);
  });

  it('a whole, well-shaped set passes', () => {
    const root = repo({
      'apps/web/src/app/admin/page.tsx': PAGE,
      'apps/web/src/app/admin/orders/page.tsx': PAGE,
      'apps/web/src/app/admin/login/page.tsx': PAGE,
      'apps/web/src/lib/admin-shell/help-pages.json': table(
        [
          { id: 'dashboard/home', route: '/admin' },
          { id: 'orders/all', route: '/admin/orders' },
        ],
        [{ route: '/admin/login', why: 'no shell' }],
      ),
      'docs/admin-guide/pages/dashboard/index.md': '# ড্যাশবোর্ড\n\n- [হোম](home.md)',
      'docs/admin-guide/pages/dashboard/home.md': GOOD,
      'docs/admin-guide/pages/orders/index.md': '# অর্ডার\n\n- [সব অর্ডার](all.md)',
      'docs/admin-guide/pages/orders/all.md': GOOD,
    });
    expect(check(root)).toEqual([]);
  });

  it('fails a new page with no guide, a stale row, a missing file, a bad shape and an incomplete overview', () => {
    const root = repo({
      'apps/web/src/app/admin/page.tsx': PAGE,
      'apps/web/src/app/admin/orders/page.tsx': PAGE,
      'apps/web/src/app/admin/orders/confirm/page.tsx': PAGE,
      'apps/web/src/lib/admin-shell/help-pages.json': table([
        { id: 'dashboard/home', route: '/admin' },
        { id: 'orders/all', route: '/admin/orders' },
        { id: 'orders/gone', route: '/admin/orders/gone' },
      ]),
      'docs/admin-guide/pages/dashboard/home.md': GOOD.replace(`## ${PARTS[4]}`, '## অন্য কিছু'),
      'docs/admin-guide/pages/orders/index.md': '# অর্ডার\n',
      'docs/admin-guide/pages/orders/all.md': GOOD.replace('> [!NOTE]\n', '').replace('1. ', '- '),
    });
    const found = check(root).join('\n');
    expect(found).toMatch(/PAGE-NO-GUIDE \/admin\/orders\/confirm/);
    expect(found).toMatch(/STALE-ROW \/admin\/orders\/gone/);
    expect(found).toMatch(/GUIDE-MISSING orders\/gone/);
    expect(found).toMatch(/GUIDE-SHAPE dashboard\/home: the parts must be exactly/);
    expect(found).toMatch(/GUIDE-SHAPE orders\/all: "কেন দরকার" needs a real example/);
    expect(found).toMatch(/GUIDE-SHAPE orders\/all: "কীভাবে করবেন" needs numbered steps/);
    expect(found).toMatch(/OVERVIEW-MISSING dashboard/);
    expect(found).toMatch(/OVERVIEW-LIST orders: the overview does not list its page orders\/all/);
  });

  it('the repository itself: every built admin page has its guide in the six-part shape', () => {
    expect(check()).toEqual([]);
  });
});
