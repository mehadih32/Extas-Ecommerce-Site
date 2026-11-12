// CN-045 job 3 — the CI backlog watcher. GitHub's own concurrent-hosted-job limit queues most of a busy day's runs,
// and a stuck run never clears itself once its PR is merged/closed or a newer run on the same branch has replaced
// it. This script (run every 10 minutes by .github/workflows/ci-watch.yml, GitHub-hosted, never the VM) finds every
// `queued`/`in_progress` run on a GitHub-hosted workflow that has sat for over `--stale-minutes` (default 30), then:
//   - cancels it when it is stale/superseded (a newer run already exists on the same branch+workflow, or its pull
//     request is merged or closed) — nothing useful would come from letting it finish;
//   - otherwise leaves it running and lists it in the report, for the next owner update to mention in Bengali.
// Self-hosted workflows (the VM runner, label extas-vm) are never touched: one VM running one job at a time is by
// design, not a backlog to fix (CN-003). `hostedWorkflowPaths` reads which workflow files use a self-hosted runner,
// so nothing here is hardcoded to "ci.yml" by name — it adapts as workflows are added or moved.
//   node tools/ci-watch.mjs --out=docs/reports/ci-watch/latest [--stale-minutes=30] [--dry-run]
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ACTIVE = new Set(['queued', 'in_progress', 'waiting', 'pending', 'requested']);

/** Workflow files (relative, e.g. ".github/workflows/ci.yml") that have no self-hosted job — a plain text scan is
 * enough (ShellCheck-style; infra's own workflow files are small and simple), so no YAML parser is needed here. */
export function hostedWorkflowPaths(workflowsDir, readDir = readdirSync, readFile = readFileSync) {
  const out = new Set();
  for (const f of readDir(workflowsDir)) {
    if (!f.endsWith('.yml') && !f.endsWith('.yaml')) continue;
    const text = readFile(join(workflowsDir, f), 'utf8');
    if (!text.includes('self-hosted')) out.add(`.github/workflows/${f}`);
  }
  return out;
}

/** True once a run still active has been sitting for at least `staleMs`. */
export function isStale(run, nowMs, staleMs) {
  if (!ACTIVE.has(run.status)) return false;
  const started = Date.parse(run.run_started_at || run.created_at);
  return Number.isFinite(started) && nowMs - started >= staleMs;
}

/** One run → "cancel" (with why) or "surface" (still genuinely waiting its turn). `latestRunNumberByKey` maps
 * "<workflow_id>:<head_branch>" to the highest run_number seen for that branch+workflow; `prState` maps a pull
 * request number to "open" | "closed" | "merged". */
export function decideAction(run, { latestRunNumberByKey, prState } = {}) {
  const key = `${run.workflow_id}:${run.head_branch}`;
  const latest = latestRunNumberByKey?.get(key);
  if (latest != null && latest > run.run_number) return { action: 'cancel', reason: 'a newer run on this branch already exists' };
  for (const pr of run.pull_requests ?? []) {
    const st = prState?.get(pr.number);
    if (st === 'merged') return { action: 'cancel', reason: `its pull request #${pr.number} is already merged` };
    if (st === 'closed') return { action: 'cancel', reason: `its pull request #${pr.number} is already closed` };
  }
  return { action: 'surface', reason: 'still waiting (no newer run, no closed/merged pull request)' };
}

const minutes = (ms) => Math.round(ms / 60_000);

export function buildReport(decisions, now) {
  const cancelled = decisions.filter((d) => d.action === 'cancel');
  const surfaced = decisions.filter((d) => d.action === 'surface');
  const row = (d) => `| [${d.run.name || d.run.workflow_id}](${d.run.html_url}) | \`${d.run.head_branch}\` | ${d.run.status} | ${minutes(now - Date.parse(d.run.run_started_at || d.run.created_at))} min | ${d.reason} |`;
  return [
    `# CI backlog watch — ${new Date(now).toISOString()}`,
    '',
    `Checked ${decisions.length} run(s) stuck 30+ minutes on a GitHub-hosted workflow. Cancelled ${cancelled.length} (stale/superseded), ${surfaced.length} still genuinely queued/running — mention these in the next owner update.`,
    '',
    surfaced.length ? ['## Still waiting (not our runner\'s fault — GitHub has no free hosted job slot yet)', '', '| run | branch | status | age | why kept |', '|---|---|---|---|---|', ...surfaced.map(row)].join('\n') : '## Still waiting\n\nNone.',
    '',
    cancelled.length ? ['## Cancelled (stale/superseded)', '', '| run | branch | status | age | reason |', '|---|---|---|---|---|', ...cancelled.map(row)].join('\n') : '## Cancelled\n\nNone.',
    '',
  ].join('\n');
}

async function gh(path, token, init = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28', // hardcode-ok: the GitHub REST API's own version header, not a calendar date
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok && res.status !== 204) throw new Error(`GitHub API ${init.method ?? 'GET'} ${path} → ${res.status} ${await res.text().catch(() => '')}`);
  return res.status === 204 ? null : res.json();
}

async function listActiveRuns(repo, token) {
  const runs = [];
  for (const status of ['queued', 'in_progress']) {
    for (let page = 1; page <= 10; page++) {
      const data = await gh(`/repos/${repo}/actions/runs?status=${status}&per_page=100&page=${page}`, token);
      runs.push(...(data.workflow_runs ?? []));
      if (!data.workflow_runs || data.workflow_runs.length < 100) break;
    }
  }
  return runs;
}

async function latestRunNumber(repo, workflowId, branch, token) {
  const data = await gh(`/repos/${repo}/actions/workflows/${workflowId}/runs?branch=${encodeURIComponent(branch)}&per_page=1`, token);
  return data.workflow_runs?.[0]?.run_number ?? null;
}

async function prState(repo, number, token) {
  const pr = await gh(`/repos/${repo}/pulls/${number}`, token);
  return pr.merged_at ? 'merged' : pr.state; // "open" | "closed" (unmerged)
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  const staleMs = (Number(args['stale-minutes']) || 30) * 60_000;
  const dryRun = 'dry-run' in args;
  const out = args.out ? join(root, args.out) : join(root, 'docs/reports/ci-watch/latest');
  if (!repo || !token) {
    console.error('ci-watch: GITHUB_REPOSITORY and GH_TOKEN (or GITHUB_TOKEN) are required');
    process.exit(2);
  }

  const hosted = hostedWorkflowPaths(join(root, '.github/workflows'));
  const now = Date.now();
  const allRuns = await listActiveRuns(repo, token);
  const candidates = allRuns.filter((r) => hosted.has(r.path) && isStale(r, now, staleMs));

  const latestRunNumberByKey = new Map();
  for (const r of candidates) {
    const key = `${r.workflow_id}:${r.head_branch}`;
    if (!latestRunNumberByKey.has(key)) latestRunNumberByKey.set(key, await latestRunNumber(repo, r.workflow_id, r.head_branch, token));
  }
  const prNumbers = new Set(candidates.flatMap((r) => (r.pull_requests ?? []).map((p) => p.number)));
  const prStateByNumber = new Map();
  for (const n of prNumbers) prStateByNumber.set(n, await prState(repo, n, token));

  const decisions = candidates.map((run) => ({ run, ...decideAction(run, { latestRunNumberByKey, prState: prStateByNumber }) }));

  if (!dryRun) {
    for (const d of decisions) {
      if (d.action !== 'cancel') continue;
      try {
        await gh(`/repos/${repo}/actions/runs/${d.run.id}/cancel`, token, { method: 'POST' });
      } catch (e) {
        console.error(`ci-watch: could not cancel run ${d.run.id}: ${String(e).split('\n')[0]}`);
        d.action = 'surface';
        d.reason = 'kept — the cancel call itself failed, see the job log';
      }
    }
  }

  const report = buildReport(decisions, now);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(`${out}.md`, report);
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, report, { flag: 'a' });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(e); process.exit(1); });
