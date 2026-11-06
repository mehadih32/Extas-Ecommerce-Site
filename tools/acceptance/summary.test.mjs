// Tests for the acceptance run's summary (PR 393 follow-up, CN-036). The parts run on the VM (infra/deploy/acceptance.sh;
// .github/workflows/acceptance.yml, by hand only); this only reads their own reports.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { acceptanceMarkdown, acceptanceResult, PARTS, partResult, writeAcceptance } from './summary.mjs';

// the shapes of the parts' own result.json files (docs/reports/*/latest/result.json, 6 Nov 2026)
const OWN = {
  smoke: { ok: true, pages: 440, failed: 0 },
  journeys: { ok: true, journeys: 4, steps: 60, failed: 0, skipped: 4 },
  'gate-orders': { ok: true, scenarios: 18, passed: 14, failed: 0, skipped: 4, orders: 24, cleanup: { ok: true } },
  'gate-c360': { ok: true, steps: 150, pass: 122, fail: 0, skip: 28 },
};

it('runs the four existing go-live runs in order: every page, the journeys, the test orders, the customer 360°', () => {
  expect(PARTS.map((p) => p.key)).toEqual(['smoke', 'journeys', 'gate-orders', 'gate-c360']);
  for (const p of PARTS) expect(p.report).toMatch(/^docs\/reports\/.+\/latest\/$/);
});

it('reads each part from its own report: ok only when the report says ok and the script ended 0', () => {
  expect(partResult('smoke', OWN.smoke, 0)).toMatchObject({ ok: true, line: '440 page views, 0 failed' });
  expect(partResult('journeys', OWN.journeys, 0).line).toBe('4 journeys, 60 steps: 0 failed, 4 skipped');
  expect(partResult('gate-orders', OWN['gate-orders'], 0).line).toBe('18 scenarios: 14 passed, 0 failed, 4 skipped; 24 test orders, clean-up done');
  expect(partResult('gate-c360', OWN['gate-c360'], 0).line).toBe('150 steps: 122 pass, 0 fail, 28 skip');
  expect(partResult('gate-orders', OWN['gate-orders'], 1)).toMatchObject({ ok: false, line: expect.stringContaining('the script ended 1') });
  expect(partResult('smoke', { ...OWN.smoke, ok: false, failed: 2 }, 1)).toMatchObject({ ok: false, line: '440 page views, 2 failed' });
  expect(partResult('gate-c360', null, 2)).toMatchObject({ ran: false, ok: false, line: expect.stringContaining('no report') });
});

it('passes only when all four parts passed; the Bengali line names what did not', () => {
  const all = PARTS.map((p) => partResult(p.key, OWN[p.key], 0));
  const r = acceptanceResult(all, { at: 'x', iso: '2026-11-06T23:00:00+06:00', sha: 'abc' });
  expect(r).toMatchObject({ kind: 'acceptance', ok: true, passed: 4, total: 4 });
  expect(acceptanceMarkdown(r)).toContain('**সারকথা:** 4টা অংশের সবগুলো পাস।');
  const bad = acceptanceResult([...all.slice(0, 3), partResult('gate-c360', null, 1)], { at: 'x', iso: 'y' });
  expect(bad.ok).toBe(false);
  const md = acceptanceMarkdown(bad);
  expect(md).toContain('4টা অংশের 3টা পাস; 1টা পাস হয়নি: কাস্টমারের পুরো যাত্রা (360°)।');
  expect(md).toContain('❌ did not run');
  expect(md).toContain('[docs/reports/gate-c360/latest/](../../../../docs/reports/gate-c360/latest/README.md)');
  expect(md).toMatch(/নিশ্চিত করা \(Confirm\) একজন মানুষের কাজ/);
});

it('writes README.md and result.json from the parts in the run folder', () => {
  const dir = mkdtempSync(join(tmpdir(), 'acc-'));
  try {
    for (const p of ['smoke', 'journeys', 'gate-orders']) {
      mkdirSync(join(dir, p));
      writeFileSync(join(dir, p, 'result.json'), JSON.stringify(OWN[p]));
    }
    writeFileSync(join(dir, 'exits.json'), JSON.stringify({ smoke: 0, journeys: 0, 'gate-orders': 0, 'gate-c360': 2 }));
    const r = writeAcceptance(dir, { at: 'now', iso: '2026-11-06T23:00:00+06:00', sha: 'abc' });
    expect(r).toMatchObject({ ok: false, passed: 3 });
    expect(JSON.parse(readFileSync(join(dir, 'result.json'), 'utf8')).parts.map((p) => p.ok)).toEqual([true, true, true, false]);
    expect(readFileSync(join(dir, 'README.md'), 'utf8')).toMatch(/^# The acceptance run on the preview site/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
