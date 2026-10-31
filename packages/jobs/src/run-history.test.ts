// S21 · PR 419 — reading a smoke test or journeys run into the history: one finding per failed page × screen or step,
// severity by where it failed, the same source key for the full result and its kept summary.
import { describe, expect, it } from 'vitest';
import { journeySeverity, journeysRunInput, MAX_FINDINGS, runSourceKey, smokeRunInput, smokeSeverity } from './run-history';

const at = new Date('2026-10-31T13:10:00Z');

describe('run history inputs (PR 419)', () => {
  it('judges severity: money pages and server errors are urgent, UI-only findings can wait', () => {
    expect(smokeSeverity('/checkout', 200, ['/checkout: console error'])).toBe('URGENT');
    expect(smokeSeverity('/bag?x=1', 200, [])).toBe('URGENT');
    expect(smokeSeverity('/about', 502, [])).toBe('URGENT');
    expect(smokeSeverity('/about', 200, ['/about: UI TAP-TOO-SMALL: a.link'])).toBe('CAN_WAIT');
    expect(smokeSeverity('/admin/orders', 200, ['/admin/orders: request failed'])).toBe('IMPORTANT');
    expect(journeySeverity('customer', ['open /checkout: timeout'])).toBe('URGENT');
    expect(journeySeverity('customer', ['UI IMAGE-NOT-LOADED: img.hero'])).toBe('CAN_WAIT');
    expect(journeySeverity('warehouse', ['missing .pick-list'])).toBe('IMPORTANT');
  });

  it('reads a smoke run with rows: one finding per failed page and screen', () => {
    const result = { at: '2026-10-31 19:10 (Asia/Dhaka)', kind: 'after deploy', sha: 'abc123', ok: false, pages: 6, failed: 2, rolledBack: true, problems: ['/checkout: answered 500 (phone)', '/x: y (desktop)'] };
    const rows = {
      rows: [
        { path: '/', screen: 'phone', status: 200, ok: true, problems: [] },
        { path: '/checkout', screen: 'phone', status: 500, ok: false, problems: ['/checkout: answered 500'] },
        { path: '/admin/orders', screen: 'desktop', status: 200, ok: false, problems: ['/admin/orders: console error: boom'] },
      ],
    };
    const r = smokeRunInput(result, rows, at)!;
    expect(r).toMatchObject({ tool: 'smoke', sourceKey: runSourceKey('smoke', result.at, 'after deploy', 'abc123'), ok: false, passed: 4, failed: 2, startedAt: at });
    expect(r.summary).toMatchObject({ rolledBack: true, hasRows: true, total: 6 });
    expect(r.findings).toEqual([
      { page: '/checkout', device: 'phone', severity: 'URGENT', title: 'answered 500', reproduce: 'open /checkout · phone' },
      { page: '/admin/orders', device: 'desktop', severity: 'IMPORTANT', title: 'console error: boom', reproduce: 'open /admin/orders · desktop' },
    ]);
  });

  it('reads a smoke run without rows from its problem lines, and one that did not finish', () => {
    const r = smokeRunInput({ at: 'x', kind: 'nightly', sha: '', ok: false, pages: 4, failed: 1, problems: ['/shop: answered 404 (desktop)'] }, null, at)!;
    expect(r.findings).toEqual([{ page: '/shop', device: 'desktop', severity: 'IMPORTANT', title: '/shop: answered 404 (desktop)', reproduce: null }]);
    const stuck = smokeRunInput({ at: 'x', kind: 'nightly', ok: false, pages: 0, failed: 0, problems: ['the smoke test did not finish (exit 124)'] }, { rows: [] }, at)!;
    expect(stuck.findings).toEqual([{ page: null, device: null, severity: 'URGENT', title: 'the smoke test did not finish (exit 124)', reproduce: null }]);
    expect(smokeRunInput({ kind: 'x' }, null, at)).toBeNull();
    expect(smokeRunInput('junk', null, at)).toBeNull();
  });

  it('reads a journeys run: the full result and its kept summary have the same key', () => {
    const full = {
      at: '2026-10-31 08:00 (Asia/Dhaka)',
      kind: 'scheduled',
      sha: 'abc123',
      ok: false,
      journeys: 4,
      failed: 1,
      steps: 30,
      skipped: 2,
      ui: { kinds: ['layout'], issues: 1 },
      problems: ['customer (phone) step 3 open /checkout: timeout'],
      rows: [
        { journey: 'customer', screen: 'phone', ok: false, steps: [{ n: 1, what: 'open /', ok: true, problems: [] }, { n: 3, what: 'open /checkout', ok: false, problems: ['timeout'] }] },
        { journey: 'admin', screen: 'desktop', ok: true, steps: [{ n: 1, what: 'click orders', ok: false, problems: ['UI TAP-COVERED: button'] }] },
      ],
    };
    const r = journeysRunInput(full, at)!;
    expect(r).toMatchObject({ tool: 'journeys', ok: false, passed: 3, failed: 1 });
    expect(r.summary).toMatchObject({ steps: 30, skipped: 2, ui: { kinds: ['layout'], issues: 1 }, hasRows: true });
    expect(r.findings).toEqual([
      { page: '/checkout', device: 'phone', severity: 'URGENT', title: 'timeout', reproduce: 'customer · phone · step 3: open /checkout' },
      { page: null, device: 'desktop', severity: 'CAN_WAIT', title: 'UI TAP-COVERED: button', reproduce: 'admin · desktop · step 1: click orders' },
    ]);
    const { rows: _rows, ...summary } = full;
    const kept = journeysRunInput(summary, at)!;
    expect(kept.sourceKey).toBe(r.sourceKey);
    expect(kept.findings).toEqual([{ page: '/checkout', device: 'phone', severity: 'URGENT', title: 'timeout', reproduce: 'customer · phone · step 3: open /checkout' }]);
    expect(kept.summary).toMatchObject({ hasRows: false });
  });

  it('reads the problem lines of a kept journeys summary: page, screen, step and severity', () => {
    const kept = journeysRunInput(
      {
        at: 'y',
        kind: 'scheduled',
        ok: false,
        journeys: 8,
        failed: 2,
        problems: ['warehouse (desktop) step 2 open /admin/orders/packing: UI TAP-TOO-SMALL: a.a2-b (32px)', 'admin (phone) step 4 click save: missing .toast', 'a line the tool did not write this way'],
      },
      at,
    )!;
    expect(kept.findings).toEqual([
      { page: '/admin/orders/packing', device: 'desktop', severity: 'CAN_WAIT', title: 'UI TAP-TOO-SMALL: a.a2-b (32px)', reproduce: 'warehouse · desktop · step 2: open /admin/orders/packing' },
      { page: null, device: 'phone', severity: 'IMPORTANT', title: 'missing .toast', reproduce: 'admin · phone · step 4: click save' },
      { page: null, device: null, severity: 'IMPORTANT', title: 'a line the tool did not write this way', reproduce: null },
    ]);
  });

  it('keeps at most MAX_FINDINGS findings', () => {
    const rows = { rows: Array.from({ length: MAX_FINDINGS + 20 }, (_, i) => ({ path: `/p${i}`, screen: 'phone', status: 200, ok: false, problems: ['x'] })) };
    expect(smokeRunInput({ at: 'x', kind: 'nightly', ok: false, pages: 1, failed: 1, problems: [] }, rows, at)!.findings).toHaveLength(MAX_FINDINGS);
  });
});
