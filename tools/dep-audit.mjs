// S18 · PR 381 (B6.1) — dependency vulnerability scanning in CI. Runs `pnpm audit --json` for what ships (`--prod`)
// and for the build tools (`--dev`), and fails when an advisory reaches the level set in tools/dep-audit.json
// (`failAt`: high for what ships, critical for the build tools), unless it is accepted there with a reason and an end
// date (at most 90 days; after it the build fails again). Lower advisories are listed, never hidden. The result goes to
// the job summary (GITHUB_STEP_SUMMARY) when there is one.
//   node tools/dep-audit.mjs                      run pnpm audit (needs the registry) and check
//   node tools/dep-audit.mjs --prod-file=a.json [--dev-file=b.json]   check saved `pnpm audit --json` output
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SEVERITIES = ['info', 'low', 'moderate', 'high', 'critical'];
const GHSA = /^GHSA(-[23456789cfghjmpqrvwx]{4}){3}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ACCEPT_DAYS = 90;

/** Each advisory of a `pnpm audit --json` report once: id, severity, package, fix and the paths it comes in by. */
export function findingsOf(report) {
  return Object.values(report?.advisories ?? {}).map((a) => ({
    ghsa: a.github_advisory_id ?? String(a.id),
    severity: a.severity,
    module: a.module_name,
    title: a.title,
    url: a.url,
    fix: a.patched_versions,
    paths: [...new Set((a.findings ?? []).flatMap((f) => f.paths ?? []))],
  }));
}

const days = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** What is wrong with the policy file (an empty list when it is right); `today` stands in for a missing `since`. */
export function validatePolicy(policy, today) {
  const out = [];
  for (const kind of ['prod', 'dev']) {
    if (!SEVERITIES.includes(policy?.failAt?.[kind])) out.push(`failAt.${kind} must be one of ${SEVERITIES.join(', ')}`);
  }
  for (const a of policy?.accepted ?? []) {
    const name = a?.ghsa ?? '?';
    if (!GHSA.test(a?.ghsa ?? '')) out.push(`${name}: not a GHSA id`);
    if (!a?.package) out.push(`${name}: no package`);
    if (!a?.why || !String(a.why).trim()) out.push(`${name}: no reason (why)`);
    if (!DAY.test(a?.until ?? '')) out.push(`${name}: no end date (until, YYYY-MM-DD)`);
    else if (a.since !== undefined && !DAY.test(a.since)) out.push(`${name}: since must be YYYY-MM-DD`);
    else if (days(a.since ?? today, a.until) > MAX_ACCEPT_DAYS) out.push(`${name}: the end date is more than ${MAX_ACCEPT_DAYS} days after it was written`);
  }
  return out;
}

/**
 * The verdict for the reports of each kind: `failing` (at or over its kind's level, not accepted or accepted past its
 * end date), `accepted`, `reported` (under the level) and `unused` acceptances (no longer found: remove them).
 */
export function auditProblems(reports, policy, today) {
  const accepted = new Map((policy.accepted ?? []).map((a) => [a.ghsa, a]));
  const seen = new Set();
  const out = { failing: [], accepted: [], reported: [], unused: [] };
  for (const kind of ['prod', 'dev']) {
    if (!reports[kind]) continue;
    const level = SEVERITIES.indexOf(policy.failAt[kind]);
    for (const f of findingsOf(reports[kind])) {
      const row = { ...f, kind };
      if (SEVERITIES.indexOf(f.severity) < level) {
        out.reported.push(row);
        continue;
      }
      const a = accepted.get(f.ghsa);
      if (a) seen.add(f.ghsa);
      if (a && today <= a.until) out.accepted.push({ ...row, why: a.why, until: a.until });
      else out.failing.push(a ? { ...row, expired: true, until: a.until } : row);
    }
  }
  out.unused = [...accepted.keys()].filter((k) => !seen.has(k));
  return out;
}

function runAudit(kind) {
  try {
    return JSON.parse(execFileSync('pnpm', ['audit', '--json', `--${kind}`], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }));
  } catch (e) {
    // pnpm audit exits 1 when it finds anything; its JSON is still on stdout.
    if (e && typeof e.stdout === 'string' && e.stdout.trim().startsWith('{')) return JSON.parse(e.stdout);
    throw new Error(`pnpm audit --${kind} gave no report: ${String(e?.stderr ?? e).split('\n')[0]}`);
  }
}

const line = (f) => `- **${f.severity}** ${f.module} (${f.kind}) — ${f.title} · ${f.ghsa} · fixed in ${f.fix ?? '?'}${f.until ? ` · accepted until ${f.until}` : ''}${f.expired ? ' · ACCEPTANCE ENDED' : ''}\n  via ${f.paths.slice(0, 3).join(' ; ')}`;

function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
  const policy = JSON.parse(readFileSync(join(root, 'tools/dep-audit.json'), 'utf8'));
  const today = new Date().toISOString().slice(0, 10);
  // Each acceptance's 90 days count from the day it was written (`since`); one past its end date fails below.
  const policyErrors = validatePolicy(policy, today);
  if (policyErrors.length) {
    console.error(`dep-audit: tools/dep-audit.json is not right:\n  ${policyErrors.join('\n  ')}`);
    process.exit(1);
  }
  const reports = {};
  for (const kind of ['prod', 'dev']) {
    const file = args[`${kind}-file`];
    if (file) reports[kind] = JSON.parse(readFileSync(file, 'utf8'));
    else if (!args['prod-file'] && !args['dev-file']) reports[kind] = runAudit(kind);
  }
  const r = auditProblems(reports, policy, today);
  const text = [
    `## Dependency vulnerabilities (PR 381)`,
    `Fails at: ${policy.failAt.prod} and over for what ships, ${policy.failAt.dev} and over for the build tools.`,
    r.failing.length ? `### Failing (${r.failing.length})\n${r.failing.map(line).join('\n')}` : '### Failing: none',
    r.accepted.length ? `### Accepted for now (${r.accepted.length})\n${r.accepted.map(line).join('\n')}` : '',
    r.reported.length ? `### Below the level, listed (${r.reported.length})\n${r.reported.map(line).join('\n')}` : '',
    r.unused.length ? `### Acceptances no longer needed (remove them)\n${r.unused.map((g) => `- ${g}`).join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
  if (r.failing.length) {
    for (const f of r.failing) console.log(`::error::${f.severity} advisory ${f.ghsa} in ${f.module} (${f.kind}): update it, or accept it in tools/dep-audit.json with a reason and an end date`);
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
