// CN-029 Phase 3 qa-gate I2, I4, I5 (PR 619; docs/RETAIL-ERP-MODEL.md §8) — the ERP account's hold, said truly where
// the admin looks: the hold stops new orders (the ERP takes none; checkout pauses while `erp.hold.pauseCheckout` is on),
// never payments (I5); it is on the dashboard's "What needs a look" card first and in the "To do" drawer under Urgent
// (I4); and the guides of the Stock page and the dashboard explain it (I2), in the words the pages show.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { problemsOf } from '@/components/admin/look/dashboard/A';
import { t, type Dict } from '@/lib/i18n';
import erpBn from '../../../messages/admin-erp-link.bn.json';
import erpEn from '../../../messages/admin-erp-link.en.json';
import ordBn from '../../../messages/admin-erp-orders.bn.json';
import shellBn from '../../../messages/admin-shell.bn.json';
import shellEn from '../../../messages/admin-shell.en.json';
import { QUEUES, type QueueRow } from './queues';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const guide = (p: string) => readFileSync(join(root, 'docs/admin-guide/pages', p), 'utf8');

describe('the ERP hold, said truly where the admin looks', () => {
  it('I5: the ERP link card says the hold stops new orders, not payments', () => {
    const en = t(erpEn as unknown as Dict, 'erpLink.balance.onHold');
    const bn = t(erpBn as unknown as Dict, 'erpLink.balance.onHold');
    expect(en).toMatch(/new orders/i);
    expect(en).not.toMatch(/payment/i);
    expect(bn).toContain('নতুন অর্ডার');
    expect(bn).not.toMatch(/টাকা|পেমেন্ট/);
  });

  it('I4: the hold has its words in both languages and comes first on the dashboard card', () => {
    for (const d of [shellEn, shellBn] as unknown as Dict[]) expect(t(d, 'dash.queue.erpHold')).not.toBe('dash.queue.erpHold');
    expect(t(shellEn as unknown as Dict, 'dash.queue.erpHold')).toMatch(/new orders/i);
    const def = (id: string) => QUEUES.find((q) => q.id === id)!;
    const rows: QueueRow[] = [
      { id: 'lowStock', n: 3, oldest: null, def: def('lowStock') },
      { id: 'ordersCancelRequests', n: 1, oldest: null, def: def('ordersCancelRequests') },
      { id: 'erpHold', n: 1, oldest: '2026-10-30T04:00:00.000Z', def: def('erpHold') },
    ];
    const f = { t: (k: string) => k, n: (x: number) => String(x), ago: () => '3 h' };
    const out = problemsOf({ data: { queues: rows }, f } as unknown as Parameters<typeof problemsOf>[0]);
    expect(out[0]).toMatchObject({ title: 'dash.queue.erpHold', tone: 'bad', href: '/admin/money/books' });
    expect(out).toHaveLength(3);
  });

  it('I2: the Stock guide explains the "ERP account on hold" notice the Stock page shows; the dashboard guide names the row', () => {
    const stock = guide('products/stock.md');
    const onHold = t(ordBn as unknown as Dict, 'erpOrder.hold.on').split(':')[0]!;
    expect(stock).toContain(onHold);
    expect(stock).toContain(t(ordBn as unknown as Dict, 'erpOrder.title'));
    expect(stock).toMatch(/চেকআউট/);
    expect(guide('dashboard/home.md')).toContain(t(shellBn as unknown as Dict, 'dash.queue.erpHold'));
  });
});
