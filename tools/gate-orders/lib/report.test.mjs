// Tests for the report of the gate's test orders (PR 414 follow-up, CN-013 phase 2).
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { bengaliLine, reportMarkdown, resultJson, scrub, scrubDeep, writeReport } from './report.mjs';

const secret = 'not-a-real-token-1234567890';
const run = {
  at: '2026-11-01T08:00:00Z',
  sha: 'abc123',
  host: 'preview.example.test',
  asked: 'all',
  providers: { live: [] },
  budget: { page: 2500, press: 600, source: 'lighthouserc.json ci.assert.assertions' },
  problems: [`a problem line with ${secret} in it`],
  rows: [
    { id: '1', title: 'One item', device: 'android-mid', network: '4g', verdict: 'PASS', orders: ['100500'], addresses: ['dhk-dhanmondi'], timings: { firstLoad: { ms: 1200 }, submit: { ms: 800 } }, over: [], checks: [{ id: 'placed', verdict: 'PASS', detail: 'order 100500' }], timed: [{ cls: 'phone', network: '4g', timings: { firstLoad: { ms: 1200 } } }] },
    { id: '16', title: 'Partial', device: 'android-mid', network: '4g', verdict: 'SKIP', orders: [], addresses: [], checks: [{ id: 'x', verdict: 'SKIP', detail: 'needs a delivered parcel' }], timed: [] },
  ],
  gateChecks: [{ id: '1', what: 'paid ahead', verdict: 'PASS', detail: 'collect 0' }],
  addressRows: [{ number: '100500', addressId: 'dhk-dhanmondi', quirk: '', phoneFormat: 'bengali', stages: { stored: {}, admin: {}, courier: {}, sticker: null }, diffs: [], place: 'OK', band: null, verdict: 'PASS' }],
  coverage: { divisions: ['dhaka'], outsideDistricts: [] },
  cleanup: { ok: true, cancelled: 1, alreadyClosed: 0, failed: [], productsArchived: 3, extrasArchived: 9, courierArchived: true, salesOk: true, salesDetail: '0 counted', tagged: '1 of 1', refundRequests: 1, notes: [] },
};

it('scrubs named secrets and anything shaped like a credential', () => {
  expect(scrub(`x ${secret} y`, [secret])).toBe('x [hidden] y');
  expect(scrub('postgresql://user:pw@db:5432/x')).toBe('[hidden]db:5432/x');
  expect(scrub('token: abc password=xyz')).toBe('[hidden] [hidden]');
  expect(scrub('cookie __Host-extas_c=abc; path=/')).toBe('cookie [hidden]; path=/');
  expect(scrub('short', ['ab'])).toBe('short');
  expect(scrubDeep({ a: [`${secret}`], b: { c: secret }, n: 1 }, [secret])).toEqual({ a: ['[hidden]'], b: { c: '[hidden]' }, n: 1 });
});

it('result.json: passed only with no failure and a finished clean-up', () => {
  const r = resultJson(run);
  expect(r).toMatchObject({ kind: 'gate-orders', ok: true, scenarios: 2, passed: 1, skipped: 1, failed: 0, orders: 1, started: false });
  // the scenario rows sit beside the count, never in its place (the Bengali line and the server's summary read the count)
  expect(r.rows.map((s) => s.id)).toEqual(run.rows.map((s) => s.id));
  expect(r.timings).toEqual([{ network: '4g', cls: 'phone', orders: 1, steps: expect.objectContaining({ firstLoad: 1200 }) }]);
  expect(resultJson({ ...run, cleanup: { ...run.cleanup, ok: false } }).ok).toBe(false);
  expect(resultJson({ ...run, cleanup: null }).ok).toBe(false);
});

it('the README opens with the Bengali summary and has every section', () => {
  const md = reportMarkdown(run);
  expect(md.split('\n')[2]).toMatch(/^\*\*সারকথা:\*\* 2টা পরীক্ষার 1টা পাস, 1টা বাদ, কোনো ফেল নেই।/);
  for (const h of ['## Scenarios', '## The six gate checks', '## Timings', '## Addresses', '## Clean-up (nothing deleted)']) expect(md).toContain(h);
  expect(md).toContain('every payment, courier, message and ERP connection is on its mock');
  expect(md).toContain('Refund requests');
  expect(bengaliLine({ scenarios: 0 }, null)).toMatch(/কোনো পরীক্ষা চলেনি/);
  expect(bengaliLine({ scenarios: 3, failed: 1, passed: 1, skipped: 1 }, { ok: false })).toMatch(/1টা ফেল.*পরিষ্কার পুরো হয়নি/);
});

it('writes both files without a secret in them', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gate-orders-'));
  try {
    writeReport(dir, run, [secret]);
    const md = readFileSync(join(dir, 'README.md'), 'utf8');
    const json = readFileSync(join(dir, 'result.json'), 'utf8');
    expect(md).not.toContain(secret);
    expect(json).not.toContain(secret);
    expect(JSON.parse(json).problems[0]).toMatch(/\[hidden\]/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('live run 2: a report written between scenarios says the run had not finished, and a failed row links its picture', () => {
  const part = { ...run, finished: false, rows: [{ ...run.rows[0], verdict: 'FAIL', shot: 'scenario-1.jpg', checks: [{ id: 'run', verdict: 'FAIL', detail: 'the scenario ran over its 10-minute budget and was stopped' }] }] };
  const md = reportMarkdown(part);
  expect(md).toContain('Written after scenario 1: the run had not finished yet');
  expect(md).toContain('([picture](scenario-1.jpg))');
  expect(resultJson(part).finished).toBe(false);
  expect(resultJson(part).rows[0].shot).toBe('scenario-1.jpg');
  expect(resultJson(run).finished).toBe(true);
  expect(reportMarkdown(run)).not.toContain('had not finished');
});
