// Follow-up 223 (PR 140) — a cheap order row: the server draws the rows with no per-row handler, hook or prefetching
// Link; the order number is a plain link the picker routes, the tick boxes are the browser's own, and the one client
// part (OrderPicker) wraps the whole table once. The row keeps what the device gate and the smoke test look for.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import en from '../../../../messages/admin-orders.en.json';
import type { OrderRowView } from '@/lib/admin-orders/list';
import type { Dict } from '@/lib/i18n';
import { OrderTable } from './OrderTable';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const row = (id: string, n: string): OrderRowView => ({
  id,
  number: n,
  href: `/admin/orders/${id}`,
  name: 'Rahim',
  phone: '017•••••678',
  age: '2 h',
  placed: '7 Nov 10:00',
  items: '2 items',
  firstItem: 'Polo · M',
  total: '৳ 1,700',
  method: 'COD',
  chips: [{ label: 'New', tone: 'b' as never }],
  courier: null,
  flags: [],
  docs: [],
  risk: { band: null, section: null },
  facts: { status: 'PENDING' } as never,
});

describe('the order list table (follow-up 223)', () => {
  const rows = [row('a', 'EX-1001'), row('b', 'EX-1002')];

  it('draws plain rows the picker reads: data-href, a plain order link, unbound tick boxes', () => {
    const html = renderToStaticMarkup(<OrderTable dict={en as Dict} rows={rows} bulk={{ commands: ['confirm'], holdOptions: [] }} />);
    expect(html.match(/data-testid="order-row"/g)).toHaveLength(2);
    expect(html).toContain('data-href="/admin/orders/a"');
    expect(html).toMatch(/<a href="\/admin\/orders\/a" class="a2-b" data-row-link=""/);
    expect(html).toContain('data-pick="b"');
    expect(html).toContain('data-pick-all=""');
    expect(html).not.toContain('checked');
    expect(html.match(/class="a2-tblw"/g)).toHaveLength(1);
    expect(html).not.toContain('a2-bulk');
  });

  it('draws no tick boxes for a person without a bulk command', () => {
    const html = renderToStaticMarkup(<OrderTable dict={en as Dict} rows={rows} bulk={null} />);
    expect(html).not.toContain('data-pick');
    expect(html).toContain('data-testid="orders-table"');
  });
});
