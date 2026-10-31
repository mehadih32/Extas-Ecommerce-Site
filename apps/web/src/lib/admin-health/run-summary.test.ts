// S21 · PR 422 — "What this run says" by rules: a passed run, a run that did not finish, a site that was down, a new
// version that broke a page (or was rolled back), money pages first, admin-only / one-screen / looks-only failures,
// and a streak of failed runs.
import { describe, expect, it } from 'vitest';
import { summariseRun, type SummaryInput } from './run-summary';

const f = (page: string, device: string, severity: 'URGENT' | 'IMPORTANT' | 'CAN_WAIT' = 'IMPORTANT', title = 'console error', isNew = true) => ({ page, device, severity, title, isNew });
const base = (o: Partial<SummaryInput>): SummaryInput => ({ ok: false, passed: 8, failed: 2, sha: 'bbb', summary: { total: 10 }, findings: [], previous: null, streak: 1, ...o });
const keys = (o: Partial<SummaryInput>) => summariseRun(base(o)).causes.map((c) => c.key);

describe('run summary by rules (PR 422)', () => {
  it('a passed run: its count, and "fixed since" after a failed one', () => {
    expect(summariseRun(base({ ok: true, passed: 30, failed: 0, streak: 0 }))).toEqual({ headline: { key: 'headOk', vars: { passed: 30 } }, causes: [] });
    expect(keys({ ok: true, previous: { ok: false, sha: 'aaa' }, streak: 0 })).toEqual(['recovered']);
  });

  it('a run that did not finish says nothing about the shop', () => {
    expect(summariseRun(base({ passed: 0, failed: 0, summary: { total: 0, problems: ['the smoke test did not finish (exit 124)'] } }))).toEqual({ headline: { key: 'headStuck' }, causes: [{ key: 'stuck' }] });
  });

  it('counts by severity and puts the telling causes first', () => {
    const r = summariseRun(base({ passed: 1, failed: 9, findings: [f('/checkout', 'phone', 'URGENT', 'answered 502'), f('/', 'phone', 'URGENT', 'answered 502'), f('/about', 'phone')] }));
    expect(r.headline).toEqual({ key: 'headFailed', vars: { urgent: 2, important: 1, canWait: 0 } });
    expect(r.causes).toEqual([{ key: 'down', vars: { failed: 9, total: 10 } }, { key: 'serverErrors', vars: { n: 2 } }, { key: 'money', vars: { n: 1 } }, { key: 'shopOnly' }]);
  });

  it('a new version after a passed run, or one that was rolled back', () => {
    expect(keys({ previous: { ok: true, sha: 'aaa' }, findings: [f('/admin/orders', 'desktop')] })).toEqual(['newVersion', 'adminOnly', 'oneScreen']);
    expect(summariseRun(base({ summary: { total: 10, rolledBack: true }, previous: { ok: true, sha: 'aaa' }, findings: [f('/admin/orders', 'desktop')] })).causes[0]).toEqual({ key: 'rolledBack', vars: { sha: 'bbb' } });
    // the same version as before says nothing about versions
    expect(keys({ sha: 'aaa', previous: { ok: true, sha: 'aaa' }, findings: [f('/a', 'phone'), f('/admin', 'desktop')] })).toEqual(['few']);
  });

  it('looks-only failures, one screen, and the same problems as before', () => {
    expect(keys({ findings: [f('/a', 'phone', 'CAN_WAIT', 'UI TAP-TOO-SMALL: a', false)], previous: { ok: false, sha: 'bbb' }, streak: 2 })).toEqual(['shopOnly', 'oneScreen', 'looksOnly', 'same']);
  });

  it('a streak of failed runs is said from three on', () => {
    expect(keys({ findings: [f('/a', 'phone'), f('/admin', 'desktop')], streak: 3 })).toEqual(['streak']);
    expect(summariseRun(base({ findings: [f('/a', 'phone'), f('/admin', 'desktop')], streak: 5 })).causes).toEqual([{ key: 'streak', vars: { n: 5 } }]);
  });
});
