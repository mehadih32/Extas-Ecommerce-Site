// README status check (CLAUDE.md "How to report"; owner audit, 20 Oct). README.md is the repository's front page and
// shows the build status in its "Stages" row. It must agree with the one source of truth, the progress line of
// docs/MASTER-REGISTER.md (`**Progress: S0A 12/12 · S00 19/19 · … · total 70/598**`): the same stages with the same
// counts, and the same total. A stage README shows at 0/n (started, nothing merged) may be missing from the register
// line. Fails (exit 1) and says what differs; CI runs it on every pull request and merge.
//   node tools/readme-status.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareLaunch, launchCount, launchLabel } from './launch-status.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const plain = (s) => s.replace(/~~[^~]*~~/g, '').replace(/\*\*/g, '').replace(/`/g, '');

/** "S0A 12/12 · S01 19/22 · S09 next · total 50/598" → { stages: { S0A: '12/12', S01: '19/22' }, total: '50/598' } */
export function parseCounts(text) {
  const t = plain(text);
  const stages = {};
  for (const m of t.matchAll(/\b(S\d+[A-Z]?)\s+(\d+)\s*\/\s*(\d+)/g)) stages[m[1]] = `${m[2]}/${m[3]}`;
  const total = t.match(/\btotal\s+(\d+)\s*\/\s*(\d+)/i);
  return { stages, total: total ? `${total[1]}/${total[2]}` : null };
}

/** The register's progress line (the text after "Progress:"), or null. */
export function registerProgress(register) {
  const line = register.split('\n').find((l) => /^\*\*Progress:/.test(l.trim()));
  return line ? plain(line).replace(/^\s*Progress:\s*/, '').trim() : null;
}

/** The README's status row: the "Stages" row of the table under "## Status", or null. */
export function readmeStages(readme) {
  const lines = readme.split('\n');
  const start = lines.findIndex((l) => /^##\s+Status\b/.test(l));
  if (start < 0) return null;
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line)) break;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length >= 2 && /^stages$/i.test(plain(cells[0]))) return cells[1];
  }
  return null;
}

/** Differences between the README and the register, in plain words; empty = they agree. */
export function compare({ readme, register }) {
  const want = registerProgress(register);
  if (!want) return ['docs/MASTER-REGISTER.md has no "**Progress: …**" line'];
  const have = readmeStages(readme);
  if (!have) return ['README.md has no "Stages" row in its "## Status" table'];
  const w = parseCounts(want);
  const h = parseCounts(have);
  const problems = [];
  if (!w.total) problems.push('the register progress line has no "total N/M"');
  if (w.total && h.total !== w.total) problems.push(`total: README says ${h.total ?? '(none)'}, the register says ${w.total}`);
  for (const [stage, count] of Object.entries(w.stages)) {
    if (!(stage in h.stages)) problems.push(`${stage}: README does not show it, the register says ${count}`);
    else if (h.stages[stage] !== count) problems.push(`${stage}: README says ${h.stages[stage]}, the register says ${count}`);
  }
  // A stage that has started but has nothing merged yet may be shown in README only ("S02 0/58"); with any PR done it
  // must be on the register progress line too.
  for (const [stage, count] of Object.entries(h.stages)) {
    if (!(stage in w.stages) && !count.startsWith('0/')) problems.push(`${stage}: README says ${count}, the register progress line has no ${stage}`);
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const read = (p) => readFileSync(join(root, p), 'utf8');
  const [readme, register, track] = [read('README.md'), read('docs/MASTER-REGISTER.md'), read('docs/LAUNCH-TRACK.md')];
  // CN-027: README's "Launch X/N" row too (docs/LAUNCH-TRACK.md's Launch list against the register's states).
  const problems = [...compare({ readme, register }), ...compareLaunch({ readme, track, register })];
  if (problems.length) {
    console.error('README status disagrees with docs/MASTER-REGISTER.md (its "**Progress: …**" line is the truth):');
    for (const p of problems) console.error(`  - ${p}`);
    console.error('Fix: copy the register progress counts into the "Stages" row of README.md, and `node tools/launch-status.mjs` into its "Launch" row.');
  } else {
    console.log(`README status matches the register: ${registerProgress(register)} · ${launchLabel(launchCount({ track, register }))}`);
  }
  process.exitCode = problems.length > 0 ? 1 : 0;
}
