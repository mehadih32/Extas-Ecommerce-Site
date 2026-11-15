// PR 727, PR 762 — the section's tab bar is the same on every page of the section, and it sits in the same place.
// PR 727: each page drew its own bar (`SectionTabs`, `SystemTabs`), so some pages drew none. PR 762: the SHELL draws the
// bar once (components/admin/shell/ShellTabBar.tsx, at the top of <main> in AdminShell.tsx, above the page), from the
// address alone; `SectionTabs` / `SystemTabs` draw nothing any more (the ~245 calls stay, harmless). This pure test (menu
// table + sources + messages, no database, no browser) fails when
//   1. the shell does not draw the bar above the page, or a page helper draws one again (the bar's place would then follow
//      the page's own heading above it);
//   2. a page of the menu has no place for the shell to draw its bar from (`locate(address)` is not its own section and
//      tab), or a tab or page of the menu has no label in the shell's words (the bar would show a key);
//   3. a page hands the head of its page no place (`<PageHead place={null}>`: no guide button);
//   4. the key a page gives its tab bar leads to another tab than its own address does;
// tools/nav-audit.mjs checks the same on the running app (every page at 1366 and 390 px, by clicking, and that the bar's
// Y is the same on every page of a section).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { adminDicts } from '../admin-i18n';
import { locate, locateKey, SHELL_SECTIONS } from './sections';

const SRC = resolve(__dirname, '../..');
const APP = join(SRC, 'app');

/** Pages that only redirect (no screen of their own), so they draw no bar. */
const REDIRECT_ONLY = ['/admin/delivery/courier-360', '/admin/money/couriers'];
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

const get = (o: unknown, path: string): unknown => path.split('.').reduce<unknown>((a, k) => (a && typeof a === 'object' ? (a as Record<string, unknown>)[k] : undefined), o);

describe('the section tab bar is drawn once by the shell, in the same place on every page (PR 727, PR 762)', () => {
  it('the shell draws it at the top of <main>, above the page', () => {
    const shell = file(join(SRC, 'components/admin/shell/AdminShell.tsx'));
    const main = /<main [^>]*id="main"[^>]*>([\s\S]*?)<\/main>/.exec(shell)?.[1] ?? '';
    expect(main, 'the shell must mount <ShellTabBar …/> inside <main>').toContain('<ShellTabBar');
    expect(main.indexOf('<ShellTabBar'), 'the bar comes before {children}').toBeLessThan(main.indexOf('{children}'));
    expect(file(join(SRC, 'app/admin/layout.tsx')), "the shell's dictionary carries the page names (nav.*)").toContain('nav: view.dict.nav');
  });

  it('no page helper draws a bar of its own any more (SectionTabs and SystemTabs draw nothing)', () => {
    expect(file(join(SRC, 'components/admin/shell/ShellParts.tsx'))).toMatch(/export function SectionTabs\([^)]*\) \{\s*return null;\s*\}/);
    expect(file(join(SRC, 'components/admin/AdminFrame.tsx'))).toContain('return <SectionTabs view={view} current={current} />');
    const own = pagesUnder(join(APP, 'admin')).filter((p) => /className="a2-tabs"|data-testid="a2-tabs"/.test(file(p)));
    expect(own.map((p) => p.slice(APP.length))).toEqual([]);
  });

  it("every page of the menu has its own section and tab as its place (the shell's bar is made from it)", () => {
    const bad = registry
      .filter((r) => !REDIRECT_ONLY.includes(r.href))
      .filter((r) => {
        const p = locate(r.href);
        return !p || p.section.id !== r.section || p.tab?.id !== r.tab || p.page?.href !== r.href;
      })
      .map((r) => `${r.section} › ${r.tab}: ${r.href}`);
    expect(bad).toEqual([]);
  });

  it("every tab and page of the menu has its words in both languages (the bar would show a key)", () => {
    const bad: string[] = [];
    for (const lang of ['en', 'bn'] as const) {
      const d = adminDicts[lang];
      for (const s of SHELL_SECTIONS.filter((x) => !x.folded)) {
        for (const tab of s.tabs) {
          if (typeof get(d, `shell.tab.${s.id}.${tab.id}`) !== 'string') bad.push(`${lang}: shell.tab.${s.id}.${tab.id}`);
          // the chips (a tab with more than one page) are named by `nav.<first key>`
          if (tab.pages.length > 1) for (const p of tab.pages) if (typeof get(d, `nav.${p.keys[0]}`) !== 'string') bad.push(`${lang}: nav.${p.keys[0]}`);
        }
      }
    }
    expect(bad).toEqual([]);
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
