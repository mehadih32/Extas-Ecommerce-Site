#!/usr/bin/env node
// readme-guard (owner, 20 Oct, CN-011 enforcement; scope on PR 594). README.md is the live front page, so every pull
// request into main must bring it up to date. The guard fails the PR when:
//   (a) a register PR number in the PR title ("PR 123, 124–126: …") has no row in README's "PR log";
//   (b) README's "All 28 stages" table (done / total per stage, and the total row) disagrees with the register: done =
//       rows of the register's Build status table in state merged or live, total = the register's stage table;
//   (c) a stage the PR touches (its title's PR numbers) is still "Not started" in README's "Features by area".
// It reads only README.md and docs/MASTER-REGISTER.md and prints what differs in plain words.
//   PR_TITLE="PR 40, 41: …" node tools/readme-guard.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Links count as their text: the stage-page generator (pnpm docs:stages) links stage names and PR numbers.
const plain = (s) =>
  s.replace(/~~[^~]*~~/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\*\*/g, '').replace(/`/g, '');
const cellsOf = (line) => line.split('|').slice(1, -1).map((c) => c.trim());

/** "40–88, 501, 595-600" → [40, 41, …, 88, 501, 595, …, 600]. Change-note numbers (CN-010) and #refs are ignored. */
export function expandNumbers(text) {
  const t = plain(text).replace(/\bCN-\d+/gi, ' ').replace(/#\d+/g, ' ').replace(/`[^`]*`/g, ' ');
  const out = [];
  for (const m of t.matchAll(/(\d+)\s*(?:[–-]\s*(\d+))?/g)) {
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    if (b < a || b - a > 200) continue;
    for (let n = a; n <= b; n++) out.push(n);
  }
  return out;
}

/** Register PR numbers in a PR title: the part before the first ":" that starts with "PR". "Status: …" has none. */
export function titleNumbers(title) {
  const head = String(title ?? '').split(':')[0];
  return /^\s*PR\b/i.test(head) ? [...new Set(expandNumbers(head.replace(/^\s*PRs?\b/i, '')))].filter((n) => n > 0) : [];
}

/** Lines of the section that starts with a heading matching `re`, up to the next heading of the same or higher level. */
function section(text, re) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => re.test(l));
  if (start < 0) return [];
  const level = lines[start].match(/^#+/)[0].length;
  const end = lines.findIndex((l, i) => i > start && /^#+\s/.test(l) && l.match(/^#+/)[0].length <= level);
  return lines.slice(start + 1, end < 0 ? undefined : end);
}

/** Numbers in "PR …" lists of a text: "PR 197–200, 202–207 (+ PR 17 fix)" → 197…200, 202…207, 17. */
export function prListNumbers(text) {
  const out = [];
  const list = /\bPRs?\s+((?:\d+(?:\s*[–-]\s*\d+)?(?:\s*(?:,|\/|\band\b|\+|&)\s*(?=\d))?)+)/gi;
  for (const m of plain(text).matchAll(list)) out.push(...expandNumbers(m[1]));
  return out;
}

/** Every register PR number named in README's PR log table (second column). */
export function prLogNumbers(readme) {
  const nums = new Set();
  for (const line of section(readme, /^##\s+PR log\b/)) {
    const c = cellsOf(line);
    if (c.length >= 2 && !/^-+$/.test(c[0]) && !/^GitHub$/i.test(c[0])) for (const n of prListNumbers(c[1])) nums.add(n);
  }
  return nums;
}

/** Register stage table: stage → { total, numbers }. */
export function registerStages(register) {
  const stages = {};
  for (const line of section(register, /^##\s+The stage table\b/)) {
    const c = cellsOf(line);
    if (c.length >= 4 && /^S\d+[A-Z]?$/.test(c[0]) && /^\d+$/.test(c[2])) stages[c[0]] = { total: Number(c[2]), numbers: expandNumbers(c[3]) };
  }
  return stages;
}

/** Register Build status table: stage → count of PRs in state merged or live. */
export function registerDone(register) {
  const done = {};
  for (const line of section(register, /^##\s+Build status\b/)) {
    const c = cellsOf(line);
    if (c.length >= 3 && /^\d+$/.test(c[0]) && /^S\d+[A-Z]?$/.test(c[1]) && /^(merged|live)$/i.test(plain(c[2]))) done[c[1]] = (done[c[1]] ?? 0) + 1;
  }
  return done;
}

/** README "All 28 stages" table: stage → { done, total } (done null for "—"), plus the total row. */
export function readmeStageTable(readme) {
  const stages = {};
  let total = null;
  for (const line of section(readme, /^###\s+All \d+ stages\b/)) {
    const c = cellsOf(line).map(plain);
    if (c.length < 6) continue;
    const m = plain(c[4]).match(/(\d+|—|-)\s*\/\s*(\d+)/);
    if (/^S\d+[A-Z]?$/.test(c[0]) && m) stages[c[0]] = { done: /^\d+$/.test(m[1]) ? Number(m[1]) : null, total: Number(m[2]) };
    if (!c[0] && /total/i.test(plain(c[1])) && m) total = { done: Number(m[1]), total: Number(m[2]) };
  }
  return { stages, total };
}

/** README "Features by area": stage → its heading state ("Done", "In progress", "Not started", "Parked"). */
export function readmeFeatureStates(readme) {
  const states = {};
  for (const line of section(readme, /^##\s+Features by area\b/)) {
    const m = line.match(/^###\s+(S\d+[A-Z]?)\s+·.*—\s*(.+)$/);
    if (m) states[m[1]] = plain(m[2]).trim();
  }
  return states;
}

/** Everything the guard finds wrong, in plain words; empty = README is up to date for this PR. */
export function guard({ readme, register, title }) {
  const problems = [];
  const numbers = titleNumbers(title);
  // (a) every PR in the title has a PR log row
  const logged = prLogNumbers(readme);
  const missing = numbers.filter((n) => !logged.has(n));
  if (missing.length) problems.push(`README "PR log" has no row naming PR ${missing.join(', ')} (from the PR title) — add the row at the top`);
  // (b) the stage counts agree with the register's statuses
  const reg = registerStages(register);
  const done = registerDone(register);
  const table = readmeStageTable(readme);
  let activeTotal = 0;
  let doneTotal = 0;
  for (const [stage, { total }] of Object.entries(reg)) {
    const want = done[stage] ?? 0;
    const have = table.stages[stage];
    if (!have) {
      problems.push(`README "All 28 stages" has no row for ${stage}`);
      continue;
    }
    if (have.total !== total) problems.push(`${stage}: README total ${have.total}, the register stage table says ${total}`);
    if (have.done !== null && have.done !== want) problems.push(`${stage}: README done ${have.done}, the register Build status has ${want} merged/live`);
    if (have.done === null && want > 0) problems.push(`${stage}: README shows "—" but the register has ${want} merged/live`);
    if (have.done !== null) {
      activeTotal += total;
      doneTotal += want;
    }
  }
  if (!table.total) problems.push('README "All 28 stages" has no Total row');
  else if (table.total.done !== doneTotal || table.total.total !== activeTotal) {
    problems.push(`Total: README ${table.total.done} / ${table.total.total}, the register gives ${doneTotal} / ${activeTotal}`);
  }
  // (c) a stage this PR touches is not "Not started"
  const states = readmeFeatureStates(readme);
  const touched = new Set();
  for (const n of numbers) for (const [stage, s] of Object.entries(reg)) if (s.numbers.includes(n)) touched.add(stage);
  for (const stage of touched) {
    if (/not started/i.test(states[stage] ?? '')) problems.push(`${stage}: this PR touches it, but README "Features by area" still says "Not started"`);
  }
  return problems;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const problems = guard({
    readme: readFileSync(join(root, 'README.md'), 'utf8'),
    register: readFileSync(join(root, 'docs/MASTER-REGISTER.md'), 'utf8'),
    title: process.env.PR_TITLE ?? '',
  });
  for (const p of problems) console.error(`readme-guard: ${p}`);
  console.log(`readme-guard: ${problems.length ? `${problems.length} problem(s)` : 'README is up to date'} (title: ${process.env.PR_TITLE ? 'checked' : 'none'})`);
  process.exit(problems.length ? 1 : 0);
}
