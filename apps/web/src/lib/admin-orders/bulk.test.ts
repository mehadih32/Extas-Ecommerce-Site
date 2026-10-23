// S05 · PR 152 — the bulk status change without a database: each ticked order is planned by the order machine itself
// (only what may run now, the rest skipped with the reason), each one is sent on its own with its own key and its own
// version, one after another, and every order gets its own result; every reason has words in both languages.
import { describe, expect, it, vi } from 'vitest';
import bn from '../../../messages/admin-orders.bn.json';
import en from '../../../messages/admin-orders.en.json';
import { t, type Dict } from '../i18n';
import { BULK_COMMANDS, BULK_PERM, BULK_WHY, bulkBody, bulkPlan, runBulk, whyText, type BulkRow } from './bulk';
import type { CommandAnswer } from './commands';
import type { BulkFacts } from './list';

const facts = (over: Partial<BulkFacts> = {}): BulkFacts => ({ status: 'PLACED', version: 1, cancelRequested: false, cancelPending: false, inReview: false, booked: false, ...over });
const row = (n: number, over: Partial<BulkFacts> = {}): BulkRow => ({ id: `id-${n}`, number: `EX-${n}`, facts: facts(over) });

describe('which ticked orders a bulk command runs on', () => {
  const rows = [row(1), row(2, { status: 'CONFIRMED' }), row(3, { cancelRequested: true }), row(4, { inReview: true }), row(5, { status: 'CONFIRMED' }), row(6, { status: 'ON_HOLD' })];

  it('Confirm: only new orders with no cancel request and no open review; the rest grouped by reason', () => {
    const p = bulkPlan('confirm', rows);
    expect(p.run.map((r) => r.number)).toEqual(['EX-1']);
    expect(p.reasons).toEqual([
      { why: { status: 'CONFIRMED' }, n: 2 },
      { why: { code: 'CANCEL_REQUESTED' }, n: 1 },
      { why: { code: 'IN_REVIEW' }, n: 1 },
      { why: { status: 'ON_HOLD' }, n: 1 },
    ]);
    expect(p.skipped).toHaveLength(5);
  });

  it('Hold: new and confirmed orders; Release: held ones only', () => {
    expect(bulkPlan('hold', rows).run.map((r) => r.number)).toEqual(['EX-1', 'EX-2', 'EX-3', 'EX-4', 'EX-5']);
    expect(bulkPlan('release', rows).run.map((r) => r.number)).toEqual(['EX-6']);
    expect(bulkPlan('confirm', []).run).toEqual([]);
  });

  it('each command needs its own key; no command moves money', () => {
    expect(BULK_COMMANDS).toEqual(['confirm', 'hold', 'release']);
    expect(BULK_PERM).toEqual({ confirm: 'orders.confirm', hold: 'orders.hold', release: 'orders.hold' });
  });
});

describe('the run', () => {
  it("one order after another, each with its own key and the version it was ticked at, each with its own result", async () => {
    const seen: { url: string; body: Record<string, unknown>; key: string }[] = [];
    let open = 0;
    const sender = vi.fn(async (url: string, body: Record<string, unknown>, key: string): Promise<CommandAnswer> => {
      open += 1;
      expect(open).toBe(1); // never two at once
      seen.push({ url, body, key });
      await Promise.resolve();
      open -= 1;
      return url.includes('id-2') ? { ok: false, code: 'STALE', status: 409 } : { ok: true, body: { ok: true } };
    });
    const progress = vi.fn();
    const out = await runBulk('hold', [row(1, { version: 4 }), row(2, { version: 7 })], { reasonKey: 'call-back', note: ' ' }, progress, sender);
    expect(out).toEqual([
      { id: 'id-1', number: 'EX-1', ok: true },
      { id: 'id-2', number: 'EX-2', ok: false, code: 'STALE' },
    ]);
    expect(seen.map((s) => s.url)).toEqual(['/api/admin/orders/id-1/hold', '/api/admin/orders/id-2/hold']);
    expect(seen.map((s) => s.body)).toEqual([
      { reasonKey: 'call-back', version: 4 },
      { reasonKey: 'call-back', version: 7 },
    ]);
    expect(seen[0]!.key).not.toBe(seen[1]!.key);
    expect(progress).toHaveBeenCalledTimes(2);
  });

  it('the body: trimmed fields, empty ones left out, and the version', () => {
    expect(bulkBody(row(1, { version: 9 }), {})).toEqual({ version: 9 });
    expect(bulkBody(row(1, { version: 9 }), { note: ' late ' })).toEqual({ note: 'late', version: 9 });
  });
});

describe('the words', () => {
  it('every command and every reason or failure has words in both languages', () => {
    for (const d of [en, bn] as Dict[]) {
      for (const c of BULK_COMMANDS) for (const k of [`orders.bulk.cmd.${c}`, `orders.bulk.title.${c}`, `orders.bulk.ok.${c}`]) expect(t(d, k), k).not.toBe(k);
      for (const code of [...BULK_WHY, 'other']) {
        const k = whyText({ failed: code }).key;
        expect(t(d, k), k).not.toBe(k);
      }
    }
    expect(whyText({ failed: 'SOMETHING_NEW' }).key).toBe('orders.bulk.why.other');
    expect(whyText({ status: 'CONFIRMED' }).key).toBe('orders.st.CONFIRMED');
    expect(whyText({ code: 'IN_REVIEW' }).key).toBe('orders.bulk.why.IN_REVIEW');
  });
});
