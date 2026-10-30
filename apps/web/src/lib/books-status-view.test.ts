// CN-028 · PR 617 (qa-gate) — the Books status card never takes the Daily summary page down: a missing or failing
// `booksStatus`, or an answer of another shape, gives null ("not run yet"); a good answer is passed through.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as inv from '@extas/inventory';
import { loadBooksStatus } from './books-status-view';

const deps = {} as inv.InventoryDeps;
const who = { actor: { kind: 'system' }, storeId: 1 } as unknown as inv.Who;
const good = {
  model: 'v6',
  link: { id: 'l-1', epoch: 1, switchDate: '2026-11-01' },
  balanceMinor: 45_050,
  erpBalanceMinor: 45_050,
  waitingCheckMinor: null,
  exchangesAtRiskMinor: 0,
  open: { total: 1, byClass: { TIE_BROKEN: 1 }, byCheck: { TIES: 1 } },
  matchedDays: 5,
  totalDays: 6,
  partialChecks: ['ACCOUNT'],
  monthsClosed: 0,
  lastRun: { id: 'r-1', trigger: 'NIGHTLY', status: 'DONE', from: '2026-11-05', through: '2026-11-05', differences: 1, startedAt: '2026-11-06T19:30:00.000Z', finishedAt: '2026-11-06T19:31:00.000Z', error: null },
  closesChain: { ok: true, days: 5, periods: 0 },
};

describe('PR 617 · the Books status card data', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  afterEach(() => log.mockClear());

  it('absent → null', async () => {
    expect(await loadBooksStatus(deps, who, undefined)).toBeNull();
  });

  it('throws → null, logged on the server', async () => {
    expect(await loadBooksStatus(deps, who, async () => Promise.reject(new Error('database is down')))).toBeNull();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('database is down'));
  });

  it('another shape → null, logged', async () => {
    expect(await loadBooksStatus(deps, who, async () => ({ ...good, matchedDays: 'five' }))).toBeNull();
    expect(await loadBooksStatus(deps, who, async () => null)).toBeNull();
    expect(log).toHaveBeenCalledTimes(2);
  });

  it('valid → passed through', async () => {
    expect(await loadBooksStatus(deps, who, async () => good)).toEqual(good);
    expect(log).not.toHaveBeenCalled();
  });
});
