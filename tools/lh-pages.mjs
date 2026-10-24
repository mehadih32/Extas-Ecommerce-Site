#!/usr/bin/env node
// PR 17 (CN-023) — which pages one CI run measures with Lighthouse, and how they are spread over parallel runners.
// There is one page list: lighthouserc.json (ci.collect.url, the budget in ci.assert); the device gate opens it too.
//   plan  On a pull request: the core set (lighthouserc.json `plan.core`) plus every listed page whose route or
//         component files the diff touches — the page file, the layouts and other special files of its folders, every
//         file they import (followed through `@/…`, relative imports and CSS @import), the workspace packages they use
//         (with those packages' own workspace dependencies), and a route handler whose path the page's files name.
//         A change to a file matching `plan.fullSetWhen` (the lockfile, the fonts, the Next config, this tool …), a
//         changed budget, or a diff that cannot be read measures the full set; pages added to the list are measured.
//         On a push to main, on the nightly schedule and by hand: always the full set (a push to main is what deploys,
//         so the full set still blocks the deploy). Writes the job matrix (round-robin shards of at most
//         `plan.shardSize` pages, at most `plan.maxShards`) to $GITHUB_OUTPUT and the pages with their reasons to
//         $GITHUB_STEP_SUMMARY.
//   rc    The Lighthouse CI config of one shard: its pages (JSON array in $LH_URLS, each one of the list), everything
//         else copied from lighthouserc.json, so every shard has exactly the same budget.
// usage: node tools/lh-pages.mjs plan --event=<github.event_name> [--base=<git rev> --head=<git rev>]
//        LH_URLS='["http://127.0.0.1:3000/"]' node tools/lh-pages.mjs rc --out=<file>
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pagePath } from './page-weight.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = 'apps/web/src/app';
const WEB_SRC = 'apps/web/src';
/** Files of a route folder that wrap or stand in for its page (Next.js app router). */
export const SPECIAL = ['layout', 'template', 'loading', 'error', 'not-found', 'default', 'global-error', 'forbidden', 'unauthorized'];
const CODE = ['.tsx', '.ts', '.jsx', '.js', '.mjs'];
const RESOLVE = [...CODE, '.json', '.css'];

/** A route folder's URL segments: route groups `(x)` and parallel slots `@x` take no segment. */
export function routeSegments(dir) {
  return dir.split('/').filter((s) => s && !/^\(.*\)$/.test(s) && !s.startsWith('@'));
}

/**
 * How specifically a route's segments match a path's: one rank per segment (3 static, 2 dynamic, 1 catch-all,
 * 0 optional catch-all), compared left to right like Next.js does; null when the route does not match.
 */
export function routeScore(routeSegs, pathSegs) {
  const score = [];
  for (let i = 0; i < routeSegs.length; i++) {
    const r = routeSegs[i];
    const last = i === routeSegs.length - 1;
    if (r.startsWith('[[...')) return last && pathSegs.length >= i ? [...score, 0] : null;
    if (r.startsWith('[...')) return last && pathSegs.length > i ? [...score, 1] : null;
    if (i >= pathSegs.length) return null;
    if (r.startsWith('[')) score.push(2);
    else if (r === pathSegs[i]) score.push(3);
    else return null;
  }
  return pathSegs.length === routeSegs.length ? score : null;
}

const better = (a, b) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? -1) !== (b[i] ?? -1)) return (a[i] ?? -1) > (b[i] ?? -1);
  return false;
};

/** The page file (repository path) that serves a URL, from the app's page files; null when none matches. */
export function pageFor(url, pageFiles) {
  const segs = pagePath(url).split('/').filter(Boolean);
  let best = null;
  for (const file of pageFiles) {
    const s = routeScore(routeSegments(posix.dirname(posix.relative(APP, file))), segs);
    if (s && (!best || better(s, best.score))) best = { file, score: s };
  }
  return best?.file ?? null;
}

/** The page file plus the special files (layout, not-found …) of its folder and of every folder above it. */
export function routeFilesOf(pageFile, isFile) {
  const out = [];
  let dir = posix.dirname(pageFile);
  for (;;) {
    for (const name of SPECIAL) for (const ext of CODE) if (isFile(`${dir}/${name}${ext}`)) out.push(`${dir}/${name}${ext}`);
    if (dir === APP || !dir.startsWith(APP)) break;
    dir = posix.dirname(dir);
  }
  return [pageFile, ...out];
}

const SPEC_RE =
  /\bimport\s*(?:type\s+)?(?:[\w$*{}\s,]+?\s*from\s*)?['"]([^'"\n]+)['"]|\bexport\s+(?:type\s+)?(?:\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s*from\s*['"]([^'"\n]+)['"]|\bimport\(\s*['"]([^'"\n]+)['"]\s*\)|\brequire\(\s*['"]([^'"\n]+)['"]\s*\)|@import\s+(?:url\(\s*)?['"]([^'"\n]+)['"]/g;

/** The module specifiers a source file names (static and dynamic imports, re-exports, require, CSS @import). */
export function importsOf(src) {
  const out = [];
  for (const m of src.matchAll(SPEC_RE)) out.push(m.slice(1).find(Boolean));
  return out;
}

/** Where a specifier points: `{ pkg }` for a workspace package, `{ file }` for a file of this repository, else null. */
export function resolveSpec(spec, fromFile, isFile) {
  if (spec.startsWith('@extas/')) return { pkg: spec.split('/').slice(0, 2).join('/') };
  let base;
  if (spec.startsWith('@/')) base = posix.join(WEB_SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = posix.join(posix.dirname(fromFile), spec);
  else return null;
  const tries = [base, ...RESOLVE.map((e) => base + e), ...CODE.map((e) => `${base}/index${e}`)];
  if (/\.(m?js|jsx)$/.test(base)) tries.push(base.replace(/\.(m?js|jsx)$/, '.ts'), base.replace(/\.(m?js|jsx)$/, '.tsx'));
  const file = tries.find((f) => isFile(f));
  return file ? { file } : null;
}

/** Every repository file reachable by imports from `entries`, and the workspace packages they name. */
export function closureOf(entries, io) {
  const files = new Set();
  const pkgs = new Set();
  const queue = [...entries];
  while (queue.length) {
    const f = queue.pop();
    if (files.has(f)) continue;
    files.add(f);
    const src = io.read(f);
    if (src == null || f.endsWith('.json')) continue;
    for (const spec of importsOf(src)) {
      const r = resolveSpec(spec, f, io.isFile);
      if (r?.pkg) pkgs.add(r.pkg);
      else if (r?.file && !files.has(r.file)) queue.push(r.file);
    }
  }
  return { files, pkgs };
}

/** The workspace packages: name → { dir, deps (their workspace dependencies) }. */
export function packageGraph(manifests) {
  const g = new Map();
  for (const { dir, json } of manifests) {
    const deps = Object.keys({ ...json.dependencies, ...json.peerDependencies }).filter((d) => d.startsWith('@extas/'));
    g.set(json.name, { dir, deps });
  }
  return g;
}

/** The packages named plus every workspace package they depend on, all the way down. */
export function expandPackages(pkgs, graph) {
  const out = new Set();
  const queue = [...pkgs];
  while (queue.length) {
    const p = queue.pop();
    if (out.has(p)) continue;
    out.add(p);
    queue.push(...(graph.get(p)?.deps ?? []));
  }
  return out;
}

const isTest = (f) => /\.test\.[cm]?[jt]sx?$|(^|\/)(test|tests|__tests__)\//.test(f) || /\.md$/.test(f);

/** The workspace packages a diff changes (their own files; tests and notes left out). */
export function changedPackages(changed, graph) {
  const byDir = new Map([...graph].map(([name, v]) => [v.dir, name]));
  const out = new Set();
  for (const f of changed) {
    const m = /^(packages\/[^/]+)\//.exec(f);
    if (m && byDir.has(m[1]) && !isTest(f)) out.add(byDir.get(m[1]));
  }
  return out;
}

/** The fixed start of a route handler's URL (`app/api/bag/[id]/route.ts` → `/api/bag`), or null. */
export function handlerPath(file) {
  const m = new RegExp(`^${APP}/(.+)/route\\.[cm]?[jt]sx?$`).exec(file);
  if (!m) return null;
  const segs = [];
  for (const s of routeSegments(m[1])) {
    if (s.startsWith('[')) break;
    segs.push(s);
  }
  return segs.length ? `/${segs.join('/')}` : null;
}

/**
 * What a change to lighthouserc.json means: `full` when anything but the page list changed (the budget, the
 * settings, the plan), otherwise the pages it added.
 */
export function rcChange(baseRc, headRc) {
  if (!baseRc) return { full: true, added: [] };
  const strip = (rc) => JSON.stringify({ ...rc, $comment: undefined, plan: { ...rc.plan, $comment: undefined }, ci: { ...rc.ci, collect: { ...rc.ci?.collect, url: undefined } } });
  if (strip(baseRc) !== strip(headRc)) return { full: true, added: [] };
  const before = new Set(baseRc.ci?.collect?.url ?? []);
  return { full: false, added: (headRc.ci?.collect?.url ?? []).filter((u) => !before.has(u)) };
}

/**
 * The pages of one run. `depsOf(url)` gives a page's files, packages and sources; `changed` is the diff's file list
 * (null when it could not be read); `rc` the meaning of a lighthouserc.json change (rcChange), if it changed.
 */
export function selectPages({ event, all, core, changed, fullSetWhen = [], depsOf, changedPkgs = new Set(), rc = null }) {
  const full = (reason) => ({ mode: 'full', reason, urls: [...all], why: new Map(all.map((u) => [u, reason])) });
  if (event !== 'pull_request') return full(`${event}: every page`);
  if (!changed) return full('the diff could not be read: every page');
  const global = changed.find((f) => fullSetWhen.some((re) => new RegExp(re).test(f)));
  if (global) return full(`${global} changed: every page`);
  if (rc?.full) return full('the Lighthouse budget or plan changed: every page');
  const why = new Map();
  const add = (u, reason) => why.has(u) || why.set(u, reason);
  const corePaths = new Set(core);
  for (const u of all) if (corePaths.has(new URL(u).pathname + new URL(u).search)) add(u, 'core set');
  for (const u of rc?.added ?? []) add(u, 'added to the list');
  const handlers = changed.map((f) => [f, handlerPath(f)]).filter(([, p]) => p);
  const code = changed.filter((f) => !isTest(f));
  for (const u of all) {
    if (why.has(u)) continue;
    const d = depsOf(u);
    const file = code.find((f) => d.files.has(f));
    if (file) {
      add(u, `${file}`);
      continue;
    }
    const pkg = [...changedPkgs].find((p) => d.pkgs.has(p));
    if (pkg) {
      add(u, `${pkg}`);
      continue;
    }
    const h = handlers.find(([, p]) => d.sources().some((src) => src.includes(p)));
    if (h) add(u, `${h[0]} (${h[1]})`);
  }
  return { mode: 'pull request', reason: 'the core set and the pages this pull request touches', urls: all.filter((u) => why.has(u)), why };
}

/** Round-robin shards of at most `size` pages (more when `max` shards are not enough), numbered for the matrix. */
export function shardsOf(urls, size, max) {
  const n = Math.max(1, Math.min(max, Math.ceil(urls.length / Math.max(1, size))));
  const lists = Array.from({ length: n }, () => []);
  urls.forEach((u, i) => lists[i % n].push(u));
  return lists.filter((l) => l.length).map((l, i, all) => ({ id: i + 1, shard: `${i + 1}/${all.length}`, urls: l }));
}

/** One shard's Lighthouse CI config: its pages, and lighthouserc.json's settings, budget and upload as they are. */
export function rcFor(rc, urls) {
  const known = new Set(rc.ci.collect.url);
  const unknown = urls.filter((u) => !known.has(u));
  if (!urls.length) throw new Error('lh-pages: a shard needs at least one page');
  if (unknown.length) throw new Error(`lh-pages: not in lighthouserc.json: ${unknown.join(', ')}`);
  return { ci: { ...rc.ci, collect: { ...rc.ci.collect, url: [...urls] } } };
}

/* ---------- the CLI: reads the repository and git ---------- */

function repoIo() {
  const cache = new Map();
  const isFile = (f) => {
    try {
      return statSync(join(root, f)).isFile();
    } catch {
      return false;
    }
  };
  const read = (f) => {
    if (!cache.has(f)) cache.set(f, isFile(f) ? readFileSync(join(root, f), 'utf8') : null);
    return cache.get(f);
  };
  return { isFile, read };
}

function walk(dir, out = []) {
  for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(p, out);
    else if (/^page\.[cm]?[jt]sx?$/.test(e.name)) out.push(p);
  }
  return out;
}

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 });
}

function plan(args) {
  const rc = JSON.parse(readFileSync(join(root, 'lighthouserc.json'), 'utf8'));
  const all = rc.ci.collect.url;
  const { core, shardSize, maxShards, fullSetWhen } = rc.plan;
  const event = args.event || 'workflow_dispatch';
  let changed = null;
  let rcDiff = null;
  if (event === 'pull_request') {
    try {
      changed = git(['diff', '--name-only', '--no-renames', args.base, args.head]).split('\n').filter(Boolean);
    } catch {
      changed = null;
    }
    if (changed?.includes('lighthouserc.json')) {
      let baseRc = null;
      try {
        baseRc = JSON.parse(git(['show', `${args.base}:lighthouserc.json`]));
      } catch {
        baseRc = null;
      }
      rcDiff = rcChange(baseRc, rc);
    }
  }
  const io = repoIo();
  const pages = walk(APP);
  const manifests = readdirSync(join(root, 'packages'))
    .filter((d) => existsSync(join(root, 'packages', d, 'package.json')))
    .map((d) => ({ dir: `packages/${d}`, json: JSON.parse(readFileSync(join(root, 'packages', d, 'package.json'), 'utf8')) }));
  const graph = packageGraph(manifests);
  const depsOf = (u) => {
    const page = pageFor(u, pages);
    if (!page) return { files: new Set(), pkgs: new Set(), sources: () => [] };
    const c = closureOf(routeFilesOf(page, io.isFile), io);
    return { files: c.files, pkgs: expandPackages(c.pkgs, graph), sources: () => [...c.files].map((f) => io.read(f) ?? '') };
  };
  const picked = selectPages({ event, all, core, changed, fullSetWhen, depsOf, changedPkgs: changed ? changedPackages(changed, graph) : new Set(), rc: rcDiff });
  const shards = shardsOf(picked.urls, shardSize, maxShards);
  const lines = [
    `### Lighthouse pages: ${picked.urls.length} of ${all.length} (${picked.mode}), ${shards.length} runner(s)`,
    '',
    `${picked.reason}.`,
    '',
    '| Page | Why | Shard |',
    '|---|---|---|',
    ...picked.urls.map((u) => `| \`${new URL(u).pathname}${new URL(u).search}\` | ${picked.why.get(u)} | ${shards.find((s) => s.urls.includes(u)).shard} |`),
  ];
  console.log(lines.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `matrix=${JSON.stringify({ include: shards })}\npages=${picked.urls.length}\n`);
}

function shardRc(args) {
  const rc = JSON.parse(readFileSync(join(root, 'lighthouserc.json'), 'utf8'));
  const urls = JSON.parse(process.env.LH_URLS || '[]');
  if (!args.out) throw new Error('lh-pages rc: --out=<file> is required');
  writeFileSync(args.out, `${JSON.stringify(rcFor(rc, urls), null, 2)}\n`);
  console.log(`lh-pages: ${urls.length} page(s) → ${args.out}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = Object.fromEntries(rest.map((a) => /^--([^=]+)=(.*)$/.exec(a)).filter(Boolean).map((m) => [m[1], m[2]]));
  if (cmd === 'plan') plan(args);
  else if (cmd === 'rc') shardRc(args);
  else {
    console.error('usage: lh-pages.mjs plan --event=<event> [--base=<rev> --head=<rev>] | rc --out=<file>');
    process.exit(2);
  }
}
