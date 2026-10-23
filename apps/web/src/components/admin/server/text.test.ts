// PR 6 — the Server page without a database: both languages carry the same keys and none overlaps another admin file,
// every verdict, status and job has its words, and the small text helpers.
import { describe, expect, it } from 'vitest';
import { JOBS, type WorkerState } from '@extas/jobs';
import adminBn from '../../../../messages/admin.bn.json';
import productsBn from '../../../../messages/admin-products.bn.json';
import toolsBn from '../../../../messages/admin-tools.bn.json';
import stockBn from '../../../../messages/admin-stock.bn.json';
import rulesBn from '../../../../messages/admin-rules.bn.json';
import combosBn from '../../../../messages/admin-combos.bn.json';
import bn from '../../../../messages/admin-server.bn.json';
import en from '../../../../messages/admin-server.en.json';
import { adminDicts } from '@/lib/admin-i18n';
import { ADMIN_PAGES } from '@/lib/admin-nav';
import { t, type Dict } from '@/lib/i18n';
import { beatAgo, failureText, jobName, nextTry } from './text';

function keys(d: Dict, prefix = ''): string[] {
  return Object.entries(d).flatMap(([k, v]) => (typeof v === 'string' ? [prefix + k] : keys(v, `${prefix}${k}.`)));
}

describe('Server page messages', () => {
  it('both languages have the same keys, none empty; English has no Bengali', () => {
    expect(keys(bn as Dict).sort()).toEqual(keys(en as Dict).sort());
    for (const k of keys(bn as Dict)) {
      expect(t(bn as Dict, k), k).not.toBe('');
      expect(/[ঀ-৿]/.test(t(en as Dict, k)), k).toBe(false);
    }
  });

  it('no key is also in another admin file (the merge would hide one)', () => {
    const taken = new Set([adminBn, productsBn, toolsBn, stockBn, rulesBn, combosBn].flatMap((o) => keys(o as Dict)));
    expect(keys(bn as Dict).filter((k) => taken.has(k))).toEqual([]);
  });

  it('every verdict, status, job and system page has its words in both languages', () => {
    const states: WorkerState[] = ['ok', 'stale', 'stopped', 'never'];
    for (const d of [adminDicts.bn, adminDicts.en]) {
      const has = (k: string) => expect(t(d, k), k).not.toBe(k);
      for (const s of states) for (const p of ['title', 'text']) has(`server.verdict.${s}.${p}`);
      for (const s of ['FAILED', 'DEAD_LETTERED']) has(`server.failed.status.${s}`);
      for (const k of JOBS.keys()) expect(jobName(d, k), k).not.toBe(k);
      for (const p of ADMIN_PAGES.filter((x) => x.group === 'system')) has(`nav.${p.key}`);
    }
  });
});

describe('Server page text helpers', () => {
  const now = new Date('2026-10-23T10:00:00Z');
  const d = adminDicts.en;
  it('a heartbeat: just now, seconds, minutes, then the date; never without one', () => {
    expect(beatAgo(d, null, now, 'en', 'Asia/Dhaka')).toBe(t(d, 'server.time.never'));
    expect(beatAgo(d, '2026-10-23T09:59:58Z', now, 'en', 'Asia/Dhaka')).toBe(t(d, 'server.time.justNow'));
    expect(beatAgo(d, '2026-10-23T09:59:20Z', now, 'en', 'Asia/Dhaka')).toBe(t(d, 'server.time.secondsAgo', { n: 40 }));
    expect(beatAgo(d, '2026-10-23T09:15:00Z', now, 'en', 'Asia/Dhaka')).toBe(t(d, 'server.time.minutesAgo', { n: 45 }));
    expect(beatAgo(d, '2026-10-22T09:15:00Z', now, 'en', 'Asia/Dhaka')).not.toContain('ago');
  });
  it('an unknown job keeps its key; a next try in the past reads "in a moment"', () => {
    expect(jobName(d, 'some.new.job')).toBe('some.new.job');
    expect(nextTry(d, null, now, 'en', 'Asia/Dhaka')).toBe(t(d, 'server.failed.nextSoon'));
    expect(nextTry(d, '2026-10-23T09:00:00Z', now, 'en', 'Asia/Dhaka')).toBe(t(d, 'server.failed.nextSoon'));
    expect(nextTry(d, '2026-10-23T10:05:00Z', now, 'en', 'Asia/Dhaka')).toContain(t(d, 'server.failed.next', { time: '' }).trim());
  });
  it("the worker's own failure codes read in words; any other line is shown as it is", () => {
    const b = adminDicts.bn;
    expect(failureText(b, 'WORKER_LOST: the worker stopped')).toBe(t(b, 'server.errors.WORKER_LOST'));
    expect(failureText(b, 'STALLED: job stalled more than allowable limit')).toBe(t(b, 'server.errors.STALLED'));
    expect(failureText(b, 'the ERP did not answer')).toBe('the ERP did not answer');
    expect(failureText(b, 'TIMEOUT 0: no answer')).toBe('TIMEOUT 0: no answer');
    expect(failureText(b, null)).toBeNull();
  });
});
