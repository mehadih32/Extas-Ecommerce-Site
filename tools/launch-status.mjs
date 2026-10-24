// Launch progress (CN-027, owner 24 Oct). docs/LAUNCH-TRACK.md lists the PRs needed to go live (its "## Launch"
// section, the rows still to build and the "already built" table under it); the register's Build status table says
// which of them are merged. "Launch X/N" is shown in README's Status table and on the /status page, and CI fails when
// README's "Launch" row disagrees with the count worked out here.
//   node tools/launch-status.mjs          prints the count
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expandRange, tableAfter } from './make-status.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const plain = (s) => s.replace(/~~[^~]*~~/g, '').replace(/\*\*/g, '').replace(/`/g, '').trim();

/** The register PR numbers of the track's Launch list (both of its tables), in order, each once. */
export function launchPrs(track) {
  const lines = track.split('\n');
  const start = lines.findIndex((l) => /^##\s+Launch\s*$/.test(l));
  if (start < 0) return [];
  const prs = [];
  let col = -1;
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line)) break;
    if (!line.startsWith('|')) {
      col = -1;
      continue;
    }
    const cells = line.split('|').slice(1, -1).map((c) => plain(c));
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
    if (col < 0) {
      col = cells.findIndex((c) => /^PR$/i.test(c));
      continue;
    }
    const n = /^\d+$/.test(cells[col] ?? '') ? Number(cells[col]) : null;
    if (n !== null && !prs.includes(n)) prs.push(n);
  }
  return prs;
}

/** Each register PR's state from the Build status table ("merged", "live", …). */
export function registerStates(register) {
  const states = new Map();
  for (const [pr, , state] of tableAfter(register, '## Build status')) {
    for (const n of expandRange(pr)) states.set(n, plain(state).toLowerCase());
  }
  return states;
}

/** { done, total, left } of the Launch list: done = merged or live in the register. */
export function launchCount({ track, register }) {
  const prs = launchPrs(track);
  const states = registerStates(register);
  const done = prs.filter((n) => ['merged', 'live'].includes(states.get(n) ?? '')).length;
  return { done, total: prs.length, left: prs.length - done };
}

/** "Launch 208/291" */
export const launchLabel = ({ done, total }) => `Launch ${done}/${total}`;

/** The README's "Launch" row value in the "## Status" table, or null. */
export function readmeLaunch(readme) {
  const lines = readme.split('\n');
  const start = lines.findIndex((l) => /^##\s+Status\b/.test(l));
  if (start < 0) return null;
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line)) break;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length >= 2 && /^launch$/i.test(plain(cells[0]))) return plain(cells[1]);
  }
  return null;
}

/** Problems with README's Launch row, in plain words; empty = it agrees. */
export function compareLaunch({ readme, track, register }) {
  const want = launchLabel(launchCount({ track, register }));
  const have = readmeLaunch(readme);
  if (have === null) return [`README.md has no "Launch" row in its "## Status" table (it should start with "${want}")`];
  const m = have.match(/\bLaunch\s+(\d+)\s*\/\s*(\d+)/i);
  if (!m) return [`README's Launch row does not start with "Launch X/N" (the count is ${want})`];
  return `Launch ${m[1]}/${m[2]}` === want ? [] : [`Launch: README says "Launch ${m[1]}/${m[2]}", the track and the register say "${want}"`];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const read = (p) => readFileSync(join(root, p), 'utf8');
  const c = launchCount({ track: read('docs/LAUNCH-TRACK.md'), register: read('docs/MASTER-REGISTER.md') });
  console.log(`${launchLabel(c)} (${c.left} left)`);
}
