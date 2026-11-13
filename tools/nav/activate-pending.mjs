#!/usr/bin/env node
// PR 659 (CN-048) — keeps apps/web/src/lib/admin-shell/nav-pending.json true: it lists the pending pages of nav-v5.ts
// whose page file is not in the app yet. Run it after merging the wave 4A, 4B, 5A and 5B branches: every page that has
// landed leaves the list and joins the menu at once.
//   node tools/nav/activate-pending.mjs          rewrite nav-pending.json
//   node tools/nav/activate-pending.mjs --check  only say whether it is current (exit 1 when not)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const shell = join(root, 'apps/web/src/lib/admin-shell');
const source = readFileSync(join(shell, 'nav-v5.ts'), 'utf8');
const entries = [...source.matchAll(/key: '([^']+)', pr: \d+,.*?page\('([^']+)'/g)].map((m) => ({ key: m[1], href: m[2] }));
if (!entries.length) {
  console.error('nav: no pending pages found in nav-v5.ts');
  process.exit(2);
}
const waiting = entries.filter((e) => !existsSync(join(root, 'apps/web/src/app', e.href.replace(/^\//, ''), 'page.tsx'))).map((e) => e.key);
const file = join(shell, 'nav-pending.json');
const text = `${JSON.stringify({ waiting }, null, 2)}\n`;
const same = existsSync(file) && readFileSync(file, 'utf8') === text;
if (process.argv.includes('--check')) {
  console.log(same ? `nav-pending.json is current (${waiting.length} waiting)` : 'nav-pending.json is stale: run node tools/nav/activate-pending.mjs');
  process.exit(same ? 0 : 1);
}
if (!same) writeFileSync(file, text);
console.log(`nav-pending.json: ${waiting.length} of ${entries.length} pages still waiting${same ? ' (unchanged)' : ''}`);
for (const e of entries) if (!waiting.includes(e.key)) console.log(`  in the menu now: ${e.key} ${e.href}`);
