// S18 · PR 381 — the dependency vulnerability gate: what fails, what an accepted advisory with a date lets through,
// and that the policy file in the repo is well formed (every acceptance has a reason and an end date).
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { auditProblems, findingsOf, validatePolicy } from './dep-audit.mjs';

const report = (advisories) => ({ advisories, metadata: { vulnerabilities: {} } });
const adv = (id, severity, ghsa, module = 'pkg') => ({
  id,
  severity,
  github_advisory_id: ghsa,
  module_name: module,
  title: `${module} problem`,
  url: `https://github.com/advisories/${ghsa}`,
  vulnerable_versions: '<2.0.0',
  patched_versions: '>=2.0.0',
  findings: [{ version: '1.0.0', paths: [`app>${module}`] }],
});
const policy = (accepted = []) => ({ failAt: { prod: 'high', dev: 'critical' }, accepted });

it('reads each advisory once with its severity, package, fix and where it comes from', () => {
  const f = findingsOf(report({ 1: adv(1, 'high', 'GHSA-aaaa-bbbb-cccc') }));
  expect(f).toEqual([{ ghsa: 'GHSA-aaaa-bbbb-cccc', severity: 'high', module: 'pkg', title: 'pkg problem', url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc', fix: '>=2.0.0', paths: ['app>pkg'] }]);
  expect(findingsOf({})).toEqual([]);
});

it('fails at the level set for the kind of dependency, and only there', () => {
  const r = report({ 1: adv(1, 'high', 'GHSA-1111-1111-1111'), 2: adv(2, 'moderate', 'GHSA-2222-2222-2222'), 3: adv(3, 'critical', 'GHSA-3333-3333-3333') });
  const prod = auditProblems({ prod: r }, policy(), '2026-11-01');
  expect(prod.failing.map((p) => p.ghsa).sort()).toEqual(['GHSA-1111-1111-1111', 'GHSA-3333-3333-3333']);
  expect(prod.reported.map((p) => p.ghsa)).toEqual(['GHSA-2222-2222-2222']);
  const dev = auditProblems({ dev: r }, policy(), '2026-11-01');
  expect(dev.failing.map((p) => p.ghsa)).toEqual(['GHSA-3333-3333-3333']);
});

it('an accepted advisory passes until its end date, then fails again; an unused acceptance is said', () => {
  const r = report({ 1: adv(1, 'high', 'GHSA-1111-1111-1111') });
  const ok = policy([{ ghsa: 'GHSA-1111-1111-1111', package: 'pkg', why: 'only the build reads it', until: '2026-12-31' }, { ghsa: 'GHSA-9999-9999-9999', package: 'old', why: 'gone', until: '2026-12-31' }]);
  const before = auditProblems({ prod: r }, ok, '2026-12-31');
  expect(before.failing).toEqual([]);
  expect(before.accepted.map((p) => p.ghsa)).toEqual(['GHSA-1111-1111-1111']);
  expect(before.unused).toEqual(['GHSA-9999-9999-9999']);
  const after = auditProblems({ prod: r }, ok, '2027-01-01');
  expect(after.failing.map((p) => p.ghsa)).toEqual(['GHSA-1111-1111-1111']);
  expect(after.failing[0].expired).toBe(true);
});

it('the policy refuses an acceptance with no reason, no end date or an end date more than 90 days ahead', () => {
  expect(validatePolicy(policy(), '2026-11-01')).toEqual([]);
  expect(validatePolicy({ failAt: { prod: 'loud' } }, '2026-11-01')).not.toEqual([]);
  expect(validatePolicy(policy([{ ghsa: 'GHSA-1111-1111-1111', package: 'p', why: '', until: '2026-12-01' }]), '2026-11-01')).not.toEqual([]);
  expect(validatePolicy(policy([{ ghsa: 'GHSA-1111-1111-1111', package: 'p', why: 'x', until: 'soon' }]), '2026-11-01')).not.toEqual([]);
  expect(validatePolicy(policy([{ ghsa: 'GHSA-1111-1111-1111', package: 'p', why: 'x', until: '2027-06-01' }]), '2026-11-01')).not.toEqual([]);
  expect(validatePolicy(policy([{ ghsa: 'GHSA-1111-1111-1111', package: 'p', why: 'x', since: '2026-01-01', until: '2026-06-01' }]), '2026-11-01')).not.toEqual([]);
  expect(validatePolicy(policy([{ ghsa: 'nope', package: 'p', why: 'x', until: '2026-12-01' }]), '2026-11-01')).not.toEqual([]);
});

it('the policy in the repo is well formed', () => {
  const p = JSON.parse(readFileSync(new URL('./dep-audit.json', import.meta.url), 'utf8'));
  // Every acceptance says when it was written; its end date counts from then, so this test never fails by the calendar
  // alone (the CI gate itself fails an expired acceptance).
  for (const a of p.accepted) expect(a.since, a.ghsa).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(validatePolicy(p, '2099-01-01')).toEqual([]);
});
