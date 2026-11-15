// PR 851 — Settings › ERP connection as the prototype draws it: "Sync stock now" and "Import products" in the head, the Matching card,
// the Safety card with "Change ERP connection" (only the owner), the Sync status table with the prototype's words, and both languages
// having the same words.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import bn from '../../../messages/admin-erp-link.bn.json';
import en from '../../../messages/admin-erp-link.en.json';
import type { Dict } from '@/lib/i18n';
import type { SyncBoard } from '@/lib/erp-sync-board';
import { ErpHeadActions, ErpMatching, ErpSafety } from './ErpConnectionParts';
import { ErpSyncBoard } from './ErpSyncBoard';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => undefined }) }));

const dict = (m: unknown) => ({ erpLink: (m as { erpLink: unknown }).erpLink }) as unknown as Dict;
const board: SyncBoard = {
  streams: [
    { key: 'stock', dir: 'in', kind: 'stock', lastAt: '2026-11-15T10:00:00.000Z', nextAt: null, items: { what: 'sizes', n: 120 }, failed24: 0 },
    { key: 'order', dir: 'out', kind: 'order', lastAt: null, nextAt: null, items: { what: 'sentToday', n: 4 }, failed24: 2 },
  ],
  log: [{ at: '2026-11-15T10:00:00.000Z', kind: 'stock', ok: false, src: 'run', name: 'stock.pull', ref: null, status: 'FAILED', detail: 'timeout' }],
};

describe('ERP connection (PR 851)', () => {
  it('has Sync stock now and Import products in the head', () => {
    const html = renderToStaticMarkup(<ErpHeadActions dict={dict(en)} storeId={1} importHref="/admin/products/erp-import" />);
    expect(html).toContain('Sync stock now');
    expect(html).toContain('Import products');
    expect(html).toContain('href="/admin/products/erp-import"');
  });

  it('draws the Matching card with its four questions and a disabled Save until something changes', () => {
    const html = renderToStaticMarkup(<ErpMatching dict={dict(en)} storeId={1} canWrite warehouse="Nikunja Warehouse" accounts={{ cod: 'Courier cash', bkash: 'bKash merchant', erpPay: 'DBBL current account' }} suggestions={['Cash in hand']} />);
    for (const w of ['Matching', 'ERP warehouse for shop stock', 'Cash from couriers goes to', 'bKash payments go to', 'Payments to the ERP from', 'Save matching']) expect(html).toContain(w);
    expect(html).toContain('value="Nikunja Warehouse"');
    expect(html).toContain('<option value="Cash in hand"');
    expect(html).toMatch(/data-testid="erp-match-save"[^>]*disabled|disabled[^>]*data-testid="erp-match-save"/);
  });

  it('shows Change ERP connection to the owner only', () => {
    const lines = ['Nothing is ever deleted between the two.', 'If the ERP is down, orders wait.', 'Changing the ERP address needs your PIN.'];
    const owner = renderToStaticMarkup(<ErpSafety dict={dict(en)} storeId={1} lines={lines} isOwner mode="live" />);
    const other = renderToStaticMarkup(<ErpSafety dict={dict(en)} storeId={1} lines={lines} isOwner={false} mode="live" />);
    expect(owner).toContain('Safety');
    expect(owner).toContain('Change ERP connection');
    expect(other).not.toContain('Change ERP connection');
    expect(other).toContain('Changing the ERP address needs your PIN.');
  });

  it('draws the Sync status table with the prototype words and a Problems filter in the log', () => {
    const html = renderToStaticMarkup(<ErpSyncBoard dict={dict(en)} board={board} locale="en" side={<i data-testid="side" />} />);
    for (const w of ['Sync status', 'Last run', 'Next', 'Items', 'Problems (24 h)', 'Stock', 'Confirmed orders → sales orders', 'every hour by itself', 'right after confirm', '2 failed', 'Activity log', 'Problems', 'Bills', 'Buying price']) expect(html).toContain(w);
    expect(html).toContain('data-testid="side"');
    expect(html).toContain('120 sizes');
    expect(html).toContain('4 in last 24 h');
  });

  it('has the same words in both languages', () => {
    const keys = (o: unknown, p = ''): string[] => Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
    expect(keys(bn).sort()).toEqual(keys(en).sort());
  });
});
