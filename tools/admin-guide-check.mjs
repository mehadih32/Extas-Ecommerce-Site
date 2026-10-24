// PR 594 (CN-026 (5)) — "never stale": fails when a built admin page has no Bengali page guide, or a guide is not in
// the fixed six-part shape. Reads the app's own table of page guides (apps/web/src/lib/admin-shell/help-pages.json, the
// same one the admin's guide panel uses) and every app/admin/**/page.tsx, so a new admin page without a row, a row
// whose page is gone, a missing guide file, a missing part, a section without its overview, or an overview that does
// not list one of its pages each fail CI (`checks` job). The layout and the six parts are written down in
// docs/admin-guide/README.md.
//   node tools/admin-guide-check.mjs            prints the findings, exit 1 when there is one
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const TABLE = 'apps/web/src/lib/admin-shell/help-pages.json';
export const APP_ADMIN = 'apps/web/src/app/admin';
export const GUIDES = 'docs/admin-guide/pages';
const SECTIONS_FILE = 'packages/settings/src/registry-admin-shell.ts';

/** The six parts of every page guide, in this order (CN-026 (1)). */
export const PARTS = ['এটা কী', 'কেন দরকার', 'কীভাবে করবেন', 'প্রতিটা বোতাম আর ঘরের মানে', 'সাধারণ ভুল', 'এরপর কী হয়'];

/** Every admin route that has a page file: `/admin/orders/[id]` for app/admin/orders/[id]/page.tsx (route groups dropped). */
export function adminRoutes(root = ROOT) {
  const base = join(root, APP_ADMIN);
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name === 'page.tsx') {
        const rel = relative(base, dir).split(sep).filter((s) => s && !/^\(.*\)$/.test(s));
        out.push(['/admin', ...rel].join('/'));
      }
    }
  };
  walk(base);
  return out.sort();
}

/** The 14 sections' ids, in order (the settings' list the shell is built from). */
export function sectionIds(src) {
  const m = /ADMIN_SECTIONS\s*=\s*\[([\s\S]*?)\]/.exec(src);
  return m ? [...m[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]) : [];
}

/** A guide's parts: the `## ` headings with the text under each (HTML comments dropped). */
export function guideParts(md) {
  const text = md.replace(/<!--[\s\S]*?-->/g, '');
  const title = /^#\s+\S.*$/m.exec(text);
  const parts = [];
  let cur = null;
  for (const line of text.split(/\r?\n/)) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) {
      cur = { name: h[1], body: [] };
      parts.push(cur);
    } else if (cur) cur.body.push(line);
  }
  return { title: title ? title[0].replace(/^#\s+/, '').trim() : null, parts: parts.map((p) => ({ name: p.name, body: p.body.join('\n').trim() })) };
}

/** What is wrong with one page guide's shape (an empty list when nothing is). */
export function shapeProblems(id, md) {
  const { title, parts } = guideParts(md);
  const out = [];
  if (!title) out.push(`${id}: no title (a "# " heading on the first line)`);
  const names = parts.map((p) => p.name);
  if (names.join('|') !== PARTS.join('|')) out.push(`${id}: the parts must be exactly, in order: ${PARTS.join(' · ')} (found: ${names.join(' · ') || 'none'})`);
  for (const p of parts) if (PARTS.includes(p.name) && !p.body) out.push(`${id}: the part "${p.name}" is empty`);
  const why = parts.find((p) => p.name === PARTS[1]);
  if (why?.body && !/^>\s*\[!NOTE\]/m.test(why.body)) out.push(`${id}: "${PARTS[1]}" needs a real example from this shop in an Example box (> [!NOTE])`);
  const how = parts.find((p) => p.name === PARTS[2]);
  if (how?.body && !/^\s*1[.)]\s+\S/m.test(how.body)) out.push(`${id}: "${PARTS[2]}" needs numbered steps (1. …)`);
  const fields = parts.find((p) => p.name === PARTS[3]);
  if (fields?.body && !/^\s*[-*]\s+\*\*[^*]+\*\*/m.test(fields.body)) out.push(`${id}: "${PARTS[3]}" lists each button and field as "- **its label** — what it means"`);
  return out;
}

/** Every finding for the repository at `root`. */
export function check(root = ROOT) {
  const out = [];
  const table = JSON.parse(readFileSync(join(root, TABLE), 'utf8'));
  const pages = table.pages ?? [];
  const known = new Map([...pages.map((p) => [p.route, p.id]), ...(table.notGuided ?? []).map((n) => [n.route, null])]);
  const routes = adminRoutes(root);
  for (const r of routes) if (!known.has(r)) out.push(`PAGE-NO-GUIDE ${r}: a built admin page with no guide — add its row to ${TABLE} and write docs/admin-guide/pages/<section>/<page>.md`);
  for (const [r] of known) if (!routes.includes(r)) out.push(`STALE-ROW ${r}: ${TABLE} names a page that is not built`);
  const ids = new Set();
  for (const p of pages) {
    if (ids.has(p.id)) out.push(`DUPLICATE ${p.id}: two pages share one guide`);
    ids.add(p.id);
    if (!/^[a-z][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/.test(p.id) || p.id.endsWith('/index')) {
      out.push(`BAD-ID ${p.id}: a guide id is <section>/<page> (lower case, not "index")`);
      continue;
    }
    const file = join(root, GUIDES, `${p.id}.md`);
    if (!existsSync(file)) {
      out.push(`GUIDE-MISSING ${p.id}: ${relative(root, file)} does not exist`);
      continue;
    }
    for (const x of shapeProblems(p.id, readFileSync(file, 'utf8'))) out.push(`GUIDE-SHAPE ${x}`);
  }
  const sections = sectionIds(readFileSync(join(root, SECTIONS_FILE), 'utf8'));
  for (const p of pages) if (!sections.includes(p.id.split('/')[0])) out.push(`BAD-SECTION ${p.id}: no such admin section`);
  for (const s of sections) {
    const file = join(root, GUIDES, s, 'index.md');
    if (!existsSync(file)) {
      out.push(`OVERVIEW-MISSING ${s}: ${relative(root, file)} does not exist (every section has its short overview)`);
      continue;
    }
    const md = readFileSync(file, 'utf8');
    if (!guideParts(md).title) out.push(`OVERVIEW-SHAPE ${s}: no title (a "# " heading)`);
    for (const p of pages.filter((x) => x.id.startsWith(`${s}/`))) {
      const page = p.id.split('/')[1];
      if (!md.includes(`](${page}.md)`)) out.push(`OVERVIEW-LIST ${s}: the overview does not list its page ${p.id} (a link "](${page}.md)")`);
    }
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const found = check();
  for (const f of found) console.log(f);
  console.log(found.length ? `admin-guide-check: ${found.length} finding(s)` : 'admin-guide-check: every built admin page has its guide in the six-part shape');
  process.exitCode = found.length ? 1 : 0;
}
