// PR 727 — tools/nav-audit-routes.json is the admin menu as the audit tool (tools/nav-audit.mjs) walks it: every section,
// its tabs (More ones marked) and each tab's pages, made from sections.ts with nav-v5.ts applied. It must stay current:
// when this fails, regenerate it with `UPDATE_NAV_ROUTES=1 pnpm --filter @extas/web exec vitest run src/lib/admin-shell/nav-routes.test.ts`.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SHELL_SECTIONS } from './sections';

const FILE = join(__dirname, '../../../../../tools/nav-audit-routes.json');
const now = () => `${JSON.stringify(SHELL_SECTIONS.filter((s) => !s.folded).map((s) => ({ id: s.id, base: s.base, tabs: s.tabs.map((t) => ({ id: t.id, more: !!t.more, pages: t.pages.map((p) => ({ href: p.href, keys: p.keys })) })) })), null, 1)}\n`;

describe('tools/nav-audit-routes.json', () => {
  it('is the admin menu as it is built now', () => {
    if (process.env.UPDATE_NAV_ROUTES) writeFileSync(FILE, now());
    expect(readFileSync(FILE, 'utf8'), 'regenerate with UPDATE_NAV_ROUTES=1 (see the header of this test)').toBe(now());
  });
});
