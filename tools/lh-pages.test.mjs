import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  changedPackages,
  closureOf,
  expandPackages,
  handlerPath,
  importsOf,
  packageGraph,
  pageFor,
  rcChange,
  rcFor,
  resolveSpec,
  routeFilesOf,
  routeScore,
  routeSegments,
  selectPages,
  shardsOf,
} from './lh-pages.mjs';

const rc = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../lighthouserc.json'), 'utf8'));
const APP = 'apps/web/src/app';

// A small app on a fake disk: the shop's home, a category, the catch-all product page, an account page.
const disk = {
  [`${APP}/layout.tsx`]: "import './globals.css';\nimport { t } from '@/lib/i18n';\nimport dict from '../../messages/status.bn.json';",
  [`${APP}/globals.css`]: "@import '../styles/base.css';",
  'apps/web/src/styles/base.css': 'body{}',
  'apps/web/src/lib/i18n.ts': "export const t = 1;",
  'apps/web/messages/status.bn.json': '{}',
  [`${APP}/(shop)/(store)/layout.tsx`]: "import { Header } from '@/components/Header';",
  [`${APP}/(shop)/(store)/page.tsx`]: "import { Card } from '@/components/Card';",
  [`${APP}/(shop)/(store)/collections/[slug]/page.tsx`]: "import {\n  Card,\n  type CardProps,\n} from '@/components/Card';\nimport { list } from '@extas/catalogue';",
  [`${APP}/(shop)/(store)/[...slug]/page.tsx`]: "export { default } from './product.js';",
  [`${APP}/(shop)/(store)/[...slug]/product.tsx`]: "const Finder = () => import('@/components/Finder');\nfetch('/api/size-finder');",
  [`${APP}/(shop)/(store)/not-found.tsx`]: '',
  [`${APP}/(shop)/(store)/account/login/page.tsx`]: "import { Login } from '@/components/account';",
  [`${APP}/(shop)/(store)/account/[tab]/page.tsx`]: '',
  [`${APP}/api/size-finder/route.ts`]: '',
  [`${APP}/api/bag/[id]/route.ts`]: '',
  'apps/web/src/components/Header.tsx': "import { orders } from '@extas/orders/read';",
  'apps/web/src/components/Card.tsx': '',
  'apps/web/src/components/Finder.tsx': '',
  'apps/web/src/components/account/index.ts': "export * from './Login';",
  'apps/web/src/components/account/Login.tsx': '',
};
const io = { isFile: (f) => Object.hasOwn(disk, f), read: (f) => disk[f] ?? null };
const pages = Object.keys(disk).filter((f) => /\/page\.tsx$/.test(f));
const graph = packageGraph([
  { dir: 'packages/catalogue', json: { name: '@extas/catalogue', dependencies: { '@extas/db': 'workspace:*', zod: '1' } } },
  { dir: 'packages/orders', json: { name: '@extas/orders', dependencies: { '@extas/db': 'workspace:*' } } },
  { dir: 'packages/db', json: { name: '@extas/db' } },
]);
const depsOf = (u) => {
  const c = closureOf(routeFilesOf(pageFor(u, pages), io.isFile), io);
  return { files: c.files, pkgs: expandPackages(c.pkgs, graph), sources: () => [...c.files].map((f) => io.read(f) ?? '') };
};
const H = 'http://127.0.0.1:3000';
const all = [`${H}/`, `${H}/bn`, `${H}/collections/polos`, `${H}/p/essential-pique-polo`, `${H}/account/login`, `${H}/account/profile`];
const plan = (changed, extra = {}) => selectPages({ event: 'pull_request', all, core: ['/', '/bn'], changed, fullSetWhen: ['^pnpm-lock\\.yaml$'], depsOf, changedPkgs: changedPackages(changed ?? [], graph), ...extra });

describe('lh-pages: routes', () => {
  it('drops route groups and parallel slots from a folder', () => {
    expect(routeSegments('(shop)/(store)/collections/[slug]')).toEqual(['collections', '[slug]']);
    expect(routeSegments('admin/@modal/x')).toEqual(['admin', 'x']);
  });

  it('matches like Next.js: static before dynamic before catch-all', () => {
    expect(routeScore(['account', 'login'], ['account', 'login'])).toEqual([3, 3]);
    expect(routeScore(['account', '[tab]'], ['account', 'login'])).toEqual([3, 2]);
    expect(routeScore(['[...slug]'], ['p', 'x'])).toEqual([1]);
    expect(routeScore(['[...slug]'], [])).toBeNull();
    expect(routeScore(['[[...slug]]'], [])).toEqual([0]);
    expect(routeScore(['a'], ['a', 'b'])).toBeNull();
    expect(pageFor(`${H}/account/login`, pages)).toBe(`${APP}/(shop)/(store)/account/login/page.tsx`);
    expect(pageFor(`${H}/account/profile`, pages)).toBe(`${APP}/(shop)/(store)/account/[tab]/page.tsx`);
    expect(pageFor(`${H}/bn/p/essential-pique-polo`, pages)).toBe(`${APP}/(shop)/(store)/[...slug]/page.tsx`);
    expect(pageFor(`${H}/bn`, pages)).toBe(`${APP}/(shop)/(store)/page.tsx`);
    expect(pageFor(`${H}/collections/polos?sort=new`, pages)).toBe(`${APP}/(shop)/(store)/collections/[slug]/page.tsx`);
  });

  it('takes the layouts and special files of every folder up to the app root', () => {
    const files = routeFilesOf(`${APP}/(shop)/(store)/collections/[slug]/page.tsx`, io.isFile);
    expect(files).toEqual([
      `${APP}/(shop)/(store)/collections/[slug]/page.tsx`,
      `${APP}/(shop)/(store)/layout.tsx`,
      `${APP}/(shop)/(store)/not-found.tsx`,
      `${APP}/layout.tsx`,
    ]);
  });

  it('names the fixed start of a route handler', () => {
    expect(handlerPath(`${APP}/api/size-finder/route.ts`)).toBe('/api/size-finder');
    expect(handlerPath(`${APP}/api/bag/[id]/route.ts`)).toBe('/api/bag');
    expect(handlerPath(`${APP}/(shop)/(store)/search/suggest/route.ts`)).toBe('/search/suggest');
    expect(handlerPath(`${APP}/(shop)/(store)/page.tsx`)).toBeNull();
  });
});

describe('lh-pages: imports', () => {
  it('reads static, multi-line, type, side-effect, dynamic, re-export, require and CSS imports', () => {
    const src = [
      "import a from './a';",
      "import {\n  b,\n  type C,\n} from '@/lib/b';",
      "import type { D } from '../d';",
      "import './x.css';",
      "export * from './e';",
      "export { f as g } from './f';",
      "const h = await import('@/h');",
      "const i = require('./i');",
      "@import url('./j.css');",
      "import { k } from 'react';",
    ].join('\n');
    expect(importsOf(src)).toEqual(['./a', '@/lib/b', '../d', './x.css', './e', './f', '@/h', './i', './j.css', 'react']);
  });

  it('resolves the alias, relative paths with extensions and index files, and workspace packages', () => {
    const from = 'apps/web/src/components/Header.tsx';
    expect(resolveSpec('@/components/account', from, io.isFile)).toEqual({ file: 'apps/web/src/components/account/index.ts' });
    expect(resolveSpec('./Card', from, io.isFile)).toEqual({ file: 'apps/web/src/components/Card.tsx' });
    expect(resolveSpec('./product.js', `${APP}/(shop)/(store)/[...slug]/page.tsx`, io.isFile)).toEqual({ file: `${APP}/(shop)/(store)/[...slug]/product.tsx` });
    expect(resolveSpec('@extas/orders/read', from, io.isFile)).toEqual({ pkg: '@extas/orders' });
    expect(resolveSpec('react', from, io.isFile)).toBeNull();
    expect(resolveSpec('./missing', from, io.isFile)).toBeNull();
  });

  it('follows imports through files, CSS and JSON, and collects the packages with their dependencies', () => {
    const d = depsOf(`${H}/collections/polos`);
    for (const f of ['apps/web/src/styles/base.css', 'apps/web/messages/status.bn.json', 'apps/web/src/components/Header.tsx', 'apps/web/src/components/Card.tsx']) expect(d.files.has(f)).toBe(true);
    expect(d.files.has('apps/web/src/components/Finder.tsx')).toBe(false);
    expect([...d.pkgs].sort()).toEqual(['@extas/catalogue', '@extas/db', '@extas/orders']);
    expect(depsOf(`${H}/p/x`).files.has('apps/web/src/components/Finder.tsx')).toBe(true);
  });
});

describe('lh-pages: which pages a run measures', () => {
  it('measures every page on a push to main, at night and by hand', () => {
    for (const event of ['push', 'schedule', 'workflow_dispatch']) {
      const r = selectPages({ event, all, core: ['/'], changed: [], depsOf });
      expect(r.mode).toBe('full');
      expect(r.urls).toEqual(all);
    }
  });

  it('on a pull request: the core set, plus the pages whose files the diff touches', () => {
    expect(plan([]).urls).toEqual([`${H}/`, `${H}/bn`]);
    expect(plan(['docs/README.md', 'apps/web/src/components/Card.test.ts']).urls).toEqual([`${H}/`, `${H}/bn`]);
    const login = plan(['apps/web/src/components/account/Login.tsx']);
    expect(login.urls).toEqual([`${H}/`, `${H}/bn`, `${H}/account/login`]);
    expect(login.why.get(`${H}/account/login`)).toBe('apps/web/src/components/account/Login.tsx');
    expect(plan(['apps/web/src/components/Finder.tsx']).urls).toEqual([`${H}/`, `${H}/bn`, `${H}/p/essential-pique-polo`]);
    // the shared header is in every shop layout: every page under it
    expect(plan(['apps/web/src/components/Header.tsx']).urls).toEqual(all);
    // a page's own folder
    expect(plan([`${APP}/(shop)/(store)/account/[tab]/page.tsx`]).urls).toEqual([`${H}/`, `${H}/bn`, `${H}/account/profile`]);
  });

  it('counts a workspace package for the pages that use it, also through another package', () => {
    expect(plan(['packages/catalogue/src/list.ts']).urls).toEqual([`${H}/`, `${H}/bn`, `${H}/collections/polos`]);
    expect(plan(['packages/db/prisma/schema.prisma']).urls).toEqual(all);
    expect(plan(['packages/catalogue/src/list.test.ts', 'packages/catalogue/README.md']).urls).toEqual([`${H}/`, `${H}/bn`]);
  });

  it('counts a route handler for the pages whose files name its path', () => {
    const r = plan([`${APP}/api/size-finder/route.ts`]);
    expect(r.urls).toEqual([`${H}/`, `${H}/bn`, `${H}/p/essential-pique-polo`]);
    expect(r.why.get(`${H}/p/essential-pique-polo`)).toMatch(/\/api\/size-finder/);
    expect(plan([`${APP}/api/bag/[id]/route.ts`]).urls).toEqual([`${H}/`, `${H}/bn`]);
  });

  it('measures every page when a shared file changes or the diff cannot be read', () => {
    expect(plan(['pnpm-lock.yaml']).mode).toBe('full');
    expect(plan(['pnpm-lock.yaml']).reason).toMatch(/pnpm-lock\.yaml changed/);
    expect(plan(null).urls).toEqual(all);
  });

  it('a change to lighthouserc.json: added pages only, or every page when the budget changed', () => {
    const base = { plan: { core: ['/'] }, ci: { collect: { url: [`${H}/`], numberOfRuns: 3 }, assert: { assertions: { a: 1 } } } };
    const added = { ...base, ci: { ...base.ci, collect: { ...base.ci.collect, url: [`${H}/`, `${H}/account/login`] } } };
    expect(rcChange(base, added)).toEqual({ full: false, added: [`${H}/account/login`] });
    expect(rcChange(base, { ...base, $comment: 'new words' })).toEqual({ full: false, added: [] });
    expect(rcChange(base, { ...base, ci: { ...base.ci, assert: { assertions: { a: 2 } } } }).full).toBe(true);
    expect(rcChange(base, { ...base, ci: { ...base.ci, collect: { ...base.ci.collect, numberOfRuns: 1 } } }).full).toBe(true);
    expect(rcChange(base, { ...base, plan: { core: [] } }).full).toBe(true);
    expect(rcChange(null, base).full).toBe(true);
    expect(plan(['lighthouserc.json'], { rc: { full: false, added: [`${H}/account/login`] } }).urls).toEqual([`${H}/`, `${H}/bn`, `${H}/account/login`]);
    expect(plan(['lighthouserc.json'], { rc: { full: true, added: [] } }).mode).toBe('full');
  });
});

describe('lh-pages: shards and their configs', () => {
  it('spreads the pages round-robin over at most maxShards runners of about shardSize pages', () => {
    const urls = Array.from({ length: 13 }, (_, i) => `u${i}`);
    const s = shardsOf(urls, 6, 10);
    expect(s.map((x) => x.shard)).toEqual(['1/3', '2/3', '3/3']);
    expect(s.map((x) => x.urls.length)).toEqual([5, 4, 4]);
    expect(s.flatMap((x) => x.urls).sort()).toEqual([...urls].sort());
    expect(s.map((x) => x.id)).toEqual([1, 2, 3]);
    expect(shardsOf(urls, 1, 4).map((x) => x.urls.length)).toEqual([4, 3, 3, 3]);
    expect(shardsOf(['a'], 6, 10)).toEqual([{ id: 1, shard: '1/1', urls: ['a'] }]);
  });

  it("writes a shard's config with the list's settings and budget exactly as they are", () => {
    const urls = rc.ci.collect.url.slice(0, 2);
    const shard = rcFor(rc, urls);
    expect(shard.ci.collect.url).toEqual(urls);
    expect(shard.ci.assert).toEqual(rc.ci.assert);
    expect(shard.ci.collect.settings).toEqual(rc.ci.collect.settings);
    expect(shard.ci.collect.numberOfRuns).toBe(rc.ci.collect.numberOfRuns);
    expect(shard.ci.upload).toEqual(rc.ci.upload);
    expect(() => rcFor(rc, [`${H}/not-listed`])).toThrow(/not in lighthouserc/);
    expect(() => rcFor(rc, [])).toThrow(/at least one page/);
  });
});

describe('lh-pages: the one page list (CN-023)', () => {
  const paths = rc.ci.collect.url.map((u) => new URL(u).pathname + new URL(u).search);

  it('lists each page once, on the server CI starts', () => {
    expect(new Set(rc.ci.collect.url).size).toBe(rc.ci.collect.url.length);
    expect(rc.ci.collect.url.every((u) => u.startsWith('http://127.0.0.1:3000/'))).toBe(true);
    expect(rc.ci.collect.startServerCommand).toBeUndefined();
  });

  it('keeps the budget: performance and accessibility 0.9, LCP 2.5 s, CLS 0.1, TBT 200 ms, server 600 ms, median of 3', () => {
    const a = rc.ci.assert.assertions;
    expect(rc.ci.collect.numberOfRuns).toBe(3);
    expect(rc.ci.collect.settings.throttlingMethod).toBe('devtools');
    expect(a['categories:performance'][1].minScore).toBe(0.9);
    expect(a['categories:accessibility'][1].minScore).toBe(0.9);
    expect(a['largest-contentful-paint'][1].maxNumericValue).toBe(2500);
    expect(a['cumulative-layout-shift'][1].maxNumericValue).toBe(0.1);
    expect(a['total-blocking-time'][1].maxNumericValue).toBe(200);
    expect(a['server-response-time'][1].maxNumericValue).toBe(600);
    for (const v of Object.values(a)) expect(v).toEqual(['error', expect.objectContaining({ aggregationMethod: 'median-run' })]);
  });

  it('has the core set (home, a category, a product, a combo, bag, checkout; English and Bengali) in the list', () => {
    for (const p of rc.plan.core) expect(paths).toContain(p);
    for (const kind of [/^\/(bn)?$/, /^(\/bn)?\/collections\//, /^(\/bn)?\/p\//, /^(\/bn)?\/combo\//, /^(\/bn)?\/bag$/, /^(\/bn)?\/checkout$/]) {
      expect(rc.plan.core.filter((p) => kind.test(p)).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('still has the pages both old lists measured (storefront on the sample data, the admin and the status page)', () => {
    for (const p of ['/status', '/admin/login', '/admin/orders', '/checkout/thanks/0', '/p/contrast-collar-polo', '/bn/p/contrast-collar-polo', '/bn/combos', '/bn/account/orders/0/invoice', '/search?q=polo']) {
      expect(paths).toContain(p);
    }
    expect(paths.length).toBeGreaterThanOrEqual(55);
  });
});
