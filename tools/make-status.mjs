// Builds the status page data from the repository's own records (no hand-kept copy):
//   docs/MASTER-REGISTER.md  → stages (stage table) and PR states (Build status table)
//   BLOCKED.md               → what is waiting for the owner
// Output: apps/web/src/generated/status.json (generated at build time, not committed).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const clean = (s) => s.replace(/~~[^~]*~~/g, '').replace(/\*\*/g, '').replace(/`/g, '').replace(/\s+/g, ' ').trim();

/** Rows of the first markdown table after a heading line that starts with `heading`. */
export function tableAfter(md, heading) {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => l.startsWith(heading));
  if (start < 0) return [];
  const rows = [];
  let inTable = false;
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('|')) {
      inTable = true;
      const cells = line.split('|').slice(1, -1).map((c) => c.trim());
      if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
      rows.push(cells);
    } else if (inTable) break;
    else if (line.startsWith('#')) break;
  }
  return rows.slice(1); // drop the header row
}

/** "1–10, 601, 604" → [1..10, 601, 604] */
export function expandRange(range) {
  const out = [];
  for (const part of range.split(',').map((p) => p.trim()).filter(Boolean)) {
    const m = part.match(/^(\d+)\s*[–-]\s*(\d+)$/);
    if (m) for (let i = Number(m[1]); i <= Number(m[2]); i++) out.push(i);
    else if (/^\d+$/.test(part)) out.push(Number(part));
  }
  return out;
}

export function buildStatus({ register, blocked, now = new Date().toISOString(), commit = '' }) {
  const states = new Map();
  for (const [pr, , state] of tableAfter(register, '## Build status')) {
    for (const n of expandRange(pr)) states.set(n, clean(state).toLowerCase());
  }
  const stages = tableAfter(register, '## The stage table')
    .filter((r) => /^S\d/.test(r[0]))
    .map(([id, name, count, range, status]) => {
      const prs = expandRange(range);
      const parked = /parked/i.test(status);
      const done = prs.filter((n) => ['merged', 'live'].includes(states.get(n))).length;
      const live = prs.filter((n) => states.get(n) === 'live').length;
      return { id, name: clean(name), total: parked ? 0 : Number(count) || prs.length, done, live, parked };
    });
  const active = stages.reduce((a, s) => a + s.total, 0);
  const done = stages.reduce((a, s) => a + s.done, 0);
  const waiting = tableAfter(blocked, '# BLOCKED')
    .filter((r) => r.length >= 4 && !/হয়ে গেছে|ব্লক নয়|done/i.test(r[3]))
    .map(([n, what, why, state]) => ({ n, what: clean(what), why: clean(why), state: clean(state) }));
  return { generatedAt: now, commit, totals: { active, done }, stages, waiting };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const status = buildStatus({
    register: read('docs/MASTER-REGISTER.md'),
    blocked: read('BLOCKED.md'),
    commit: process.env.GIT_SHA || process.env.GITHUB_SHA || '',
  });
  const out = join(root, 'apps/web/src/generated/status.json');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(status, null, 2) + '\n');
  console.log(`status: ${status.totals.done}/${status.totals.active} PRs, ${status.waiting.length} waiting for the owner`);
}
