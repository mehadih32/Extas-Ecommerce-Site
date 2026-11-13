// CN-045 job 3 — the CI backlog watcher's decision logic: which workflow files count as GitHub-hosted (never the
// VM runner), which stuck runs are genuinely still waiting, and which are stale/superseded and safe to cancel.
import { expect, it } from 'vitest';
import { buildReport, decideAction, hostedWorkflowPaths, isStale } from './ci-watch.mjs';

const run = (over = {}) => ({
  id: 1,
  name: 'ci',
  html_url: 'https://github.com/x/y/actions/runs/1',
  status: 'queued',
  created_at: '2026-11-12T10:00:00Z',
  run_started_at: '2026-11-12T10:00:00Z',
  head_branch: 'pr-446-x',
  run_number: 5,
  workflow_id: 9,
  path: '.github/workflows/ci.yml',
  pull_requests: [{ number: 446 }],
  ...over,
});

it('only counts a workflow file with no self-hosted job as GitHub-hosted', () => {
  const files = {
    'ci.yml': 'jobs:\n  build:\n    runs-on: ubuntu-24.04\n',
    'deploy.yml': 'jobs:\n  deploy:\n    runs-on: [self-hosted, extas-vm]\n',
    'nightly.yml': 'jobs:\n  ci:\n    uses: ./.github/workflows/ci.yml\n',
  };
  const paths = hostedWorkflowPaths('irrelevant', () => Object.keys(files), (p) => files[p.split('/').pop()]);
  expect(paths).toEqual(new Set(['.github/workflows/ci.yml', '.github/workflows/nightly.yml']));
});

it('is stale only once an active run has sat for at least the given minutes', () => {
  const now = Date.parse('2026-11-12T10:31:00Z');
  expect(isStale(run(), now, 30 * 60_000)).toBe(true);
  expect(isStale(run(), Date.parse('2026-11-12T10:29:00Z'), 30 * 60_000)).toBe(false);
  expect(isStale(run({ status: 'completed' }), now, 30 * 60_000)).toBe(false);
});

it('cancels a run once a newer run exists on the same branch and workflow', () => {
  const d = decideAction(run(), { latestRunNumberByKey: new Map([['9:pr-446-x', 6]]), prState: new Map() });
  expect(d).toEqual({ action: 'cancel', reason: 'a newer run on this branch already exists' });
});

it('cancels a run whose pull request is already merged or closed', () => {
  expect(decideAction(run(), { latestRunNumberByKey: new Map(), prState: new Map([[446, 'merged']]) }).action).toBe('cancel');
  expect(decideAction(run(), { latestRunNumberByKey: new Map(), prState: new Map([[446, 'closed']]) }).action).toBe('cancel');
});

it('surfaces a run that is simply still waiting its turn — no newer run, no closed pull request', () => {
  const d = decideAction(run(), { latestRunNumberByKey: new Map([['9:pr-446-x', 5]]), prState: new Map([[446, 'open']]) });
  expect(d.action).toBe('surface');
});

it('a run from a workflow_dispatch / push has no pull_requests entry and is still judged only on "newer run"', () => {
  const pushRun = run({ pull_requests: [], head_branch: 'main' });
  expect(decideAction(pushRun, { latestRunNumberByKey: new Map(), prState: new Map() }).action).toBe('surface');
  expect(decideAction(pushRun, { latestRunNumberByKey: new Map([['9:main', 6]]), prState: new Map() }).action).toBe('cancel');
});

it('the report counts cancelled and surfaced runs separately and names each one', () => {
  const now = Date.parse('2026-11-12T10:45:00Z');
  const text = buildReport(
    [
      { run: run({ id: 1 }), action: 'surface', reason: 'still genuinely queued' },
      { run: run({ id: 2, head_branch: 'pr-100' }), action: 'cancel', reason: 'its pull request #446 is already merged' },
    ],
    now,
  );
  expect(text).toContain('Checked 2 run(s)');
  expect(text).toContain('Cancelled 1');
  expect(text).toContain('still genuinely queued');
  expect(text).toContain('already merged');
});
