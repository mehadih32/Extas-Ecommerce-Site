#!/usr/bin/env node
// One register PR = one commit (owner's morning audit, 20 Oct). Every commit a pull request adds must be either one
// register PR ("PR 123: what it does", exactly one number), an owner change note ("CN-012: …"), or a status-only
// commit ("Status: …" — README, PROGRESS, BLOCKED, reports). PRs are merged with "rebase", so each of these commits
// lands on main as it is and the history reads one register PR per commit.
//   node tools/check-commits.mjs <base-sha> <head-sha>
import { execFileSync } from 'node:child_process';

const [base, head] = process.argv.slice(2);
if (!base || !head) {
  console.error('usage: check-commits.mjs <base-sha> <head-sha>');
  process.exit(2);
}
const ok = /^(PR \d+|CN-\d{3}|Status): \S/;
const log = execFileSync('git', ['log', '--no-merges', '--format=%h %s', `${base}..${head}`], { encoding: 'utf8' }).trim();
const bad = log ? log.split('\n').filter((line) => !ok.test(line.slice(line.indexOf(' ') + 1))) : [];
for (const line of bad) console.error(`commit ${line}\n  → one register PR per commit: "PR <number>: what it does" (or "CN-###: …", "Status: …")`);
console.log(`commits: ${log ? log.split('\n').length : 0} checked, ${bad.length} not one-PR-per-commit`);
process.exit(bad.length ? 1 : 0);
