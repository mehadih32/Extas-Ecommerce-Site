// PR 727 — the section's tab bar is the same on every page of the section. The bar is drawn by each page (`SectionTabs`,
// ShellParts.tsx, or `SystemTabs` in AdminFrame.tsx), so the owner met pages that drew none: Settings › People, Roles …,
// Marketing › Overview, Support › Saved replies, … — clicking one made the section's other tabs vanish. This pure test
// (menu table + page sources, no database, no browser) fails when
//   1. a page of the menu draws no tab bar (itself or in a component/helper it imports; the three Courier 360 shortcuts
//      only redirect, see REDIRECT_ONLY);
//   2. a page hands the head of its page no place (`<PageHead place={null}>`: no guide button, no crumb);
//   3. the key a page gives its tab bar leads to another tab than its own address does: the page's bar and the sidebar
//      would mark different tabs, or another section's bar would show (`locateKey(key)` against `locate(path)`).
// tools/nav-audit.mjs checks the same on the running app (every page at 1366 and 390 px, and by clicking).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { locate, locateKey, SHELL_SECTIONS } from './sections';

const SRC = resolve(__dirname, '../..');
const APP = join(SRC, 'app');

/** Pages that only redirect (no screen of their own), so they draw no bar. */
const REDIRECT_ONLY = ['/admin/delivery/courier-360', '/admin/money/couriers', '/admin/reports/couriers'];
/** Pages in a section that is opened from another's tab: the bar of the key is the tab the person came from (`?from=`). */
/** Pages that no menu tab lists (the map of all pages). */
const NOT_IN_MENU = ['/admin/map'];
const OPENED_FROM_ANOTHER = new Set(['moneyCouriers', 'reportsCouriers']);

const registry = SHELL_SECTIONS.filter((s) => !s.folded).flatMap((s) => s.tabs.flatMap((t) => t.pages.map((p) => ({ section: s.id, tab: t.id, href: p.href }))));
const file = (p: string) => (existsSync(p) ? readFileSync(p, 'utf8') : '');

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? join(SRC, spec.slice(2)) : spec.startsWith('.') ? resolve(join(from, '..'), spec) : null;
  if (!base) return null;
  for (const ext of ['.tsx', '.ts', '/index.tsx', '/index.ts']) if (existsSync(base + ext)) return base + ext;
  return null;
}

/** Whether a source file (or what it imports from the admin's own code, two levels down) draws the section's tab bar. */
function drawsTabs(path: string, depth = 1, seen = new Set<string>()): boolean {
  if (seen.has(path) || /(AdminFrame|ShellParts)\.tsx$/.test(path)) return false;
  seen.add(path);
  const src = file(path);
  if (/<(SectionTabs|SystemTabs)\b/.test(src)) return true;
  if (depth === 0) return false;
  for (const m of src.matchAll(/from ['"]([^'"]+)['"]/g)) {
    const r = resolveImport(path, m[1]!);
    if (r && /\/(components\/admin|lib\/admin|app\/admin)[^/]*\//.test(r) && drawsTabs(r, depth - 1, seen)) return true;
  }
  return false;
}

function pagesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? pagesUnder(p) : n === 'page.tsx' ? [p] : [];
  });
}

/** The keys a page file gives `SectionTabs` / `SystemTabs` (`current={KEY}`, `current="x"`), constants resolved. */
function tabKeys(src: string): string[] {
  const out = new Set<string>();
  for (const m of src.matchAll(/<(?:SectionTabs|SystemTabs)\b[^>]*?current=(?:\{([A-Za-z_]+)\}|"([^"]+)"|'([^']+)')/g)) {
    if (m[2] ?? m[3]) out.add((m[2] ?? m[3])!);
    else {
      const c = new RegExp(`const ${m[1]}\\s*(?::[^=]+)?=\\s*['"]([^'"]+)['"]`).exec(src);
      if (c) out.add(c[1]!);
    }
  }
  return [...out];
}

describe('the section tab bar is on every page of the menu (PR 727)', () => {
  it('every page of the menu draws it', () => {
    const missing = registry.filter((r) => !REDIRECT_ONLY.includes(r.href) && !drawsTabs(join(APP, r.href.replace(/^\//, ''), 'page.tsx'))).map((r) => `${r.section} › ${r.tab}: ${r.href}`);
    expect(missing, 'add <SectionTabs view={view} current={KEY} /> under the page head (see settings/people/page.tsx)').toEqual([]);
  });

  it('the redirect-only pages are what the list says (and nothing else hides there)', () => {
    for (const h of REDIRECT_ONLY) expect(file(join(APP, h.replace(/^\//, ''), 'page.tsx')), h).toContain('openDefaultCourier(');
  });

  it('no page hands its head no place (it would have no guide button)', () => {
    const bad = pagesUnder(join(APP, 'admin')).filter((p) => !NOT_IN_MENU.some((h) => p.startsWith(join(APP, h.replace(/^\//, ''), 'page'))) && /<PageHead\b[^>]*?place=\{null\}/s.test(file(p))).map((p) => p.slice(APP.length));
    expect(bad).toEqual([]);
  });

  it("a page's tab-bar key leads to its own tab, the one its address belongs to (the sidebar marks the same)", () => {
    const bad: string[] = [];
    for (const p of pagesUnder(join(APP, 'admin'))) {
      const route = '/' + p.slice(APP.length + 1, -'/page.tsx'.length).replace(/\[\.\.\.?[^\]]*\]/g, 'x').replace(/\[[^\]]+\]/g, 'x');
      for (const key of tabKeys(file(p))) {
        const byKey = locateKey(key);
        if (!byKey) {
          bad.push(`${route}: key "${key}" is in no menu page`);
          continue;
        }
        if (OPENED_FROM_ANOTHER.has(key)) continue;
        const byPath = locate(route);
        if (!byPath || byPath.section.id !== byKey.section.id || byPath.tab?.id !== byKey.tab?.id) bad.push(`${route}: key "${key}" is ${byKey.section.id}/${byKey.tab?.id}, the address is ${byPath?.section.id}/${byPath?.tab?.id}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("Courier 360 keeps the menu of the tab it was opened from (Finance, Reports), else Delivery's", () => {
    const at = (from?: string) => {
      const p = locate('/admin/delivery/couriers/0d8e1b52', from);
      return `${p?.section.id}/${p?.tab?.id}`;
    };
    expect(at()).toBe('delivery/courier360');
    expect(at('money')).toBe('money/couriers');
    expect(at('reports')).toBe('reports/couriers');
    expect(at('nonsense')).toBe('delivery/courier360');
    // its areas page stays under the Setup tab's list, as the page says
    expect(locate('/admin/delivery/couriers/0d8e1b52/areas')?.tab?.id).toBe('zones');
  });
});
