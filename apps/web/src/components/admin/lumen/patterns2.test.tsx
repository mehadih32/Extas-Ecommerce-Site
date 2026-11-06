// PR 628 (CN-036, LUMEN-SPEC §3 items 2–4, §5) — the queue, the list + filter + bulk and the list + detail split as the
// server draws them: one clear button per row; a reversible action is a one-tap button and "do all" appears only
// when every row's action is reversible; a guarded one (refund, COD, price …) only links to its own page; chips with
// counts, the first `pageStep` rows and "Show N more"; the split's list, detail and Previous / Next.
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import en from '../../../../messages/admin-shell.en.json';
import type { Dict } from '@/lib/i18n';
import { LumenProvider } from './context';
import { hrefWithIds, ListView, type ListRow } from './ListView';
import { Queue, type QueueRow } from './Queue';
import { SplitView } from './SplitView';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {}, push() {} }) }));

const draw = (el: ReactElement, pageStep = 12) => renderToStaticMarkup(<LumenProvider value={{ dict: en as Dict, undoSeconds: 5, pageStep }}>{el}</LumenProvider>);
const confirm = (id: string): QueueRow => ({ id, title: `Order ${id}`, act: { kind: 'order.confirm', label: 'Confirm', call: { method: 'POST', url: `/api/admin/orders/${id}/confirm` }, undo: { method: 'POST', url: `/api/admin/orders/${id}/unconfirm` } } });
const refund = (id: string): QueueRow => ({ id, title: `Return ${id}`, act: { kind: 'refund', label: 'Refund', call: { method: 'POST', url: `/api/admin/refund/${id}` }, undo: { method: 'POST', url: `/api/admin/refund/${id}/undo` }, href: `/admin/orders/${id}?refund=1` } });
const empty = { title: 'All caught up', text: 'Nothing waits.' };

describe('queue', () => {
  it('shows the count, one button per row and "do all" when every action is reversible', () => {
    const html = draw(<Queue title="Confirm these" rows={[confirm('1'), confirm('2')]} doAll={{ label: 'Confirm all', done: '{n} confirmed' }} empty={empty} />);
    expect(html).toContain('<div class="lm-ban-n" aria-hidden="true">2</div>');
    expect(html).toContain('2 waiting for you');
    expect(html.match(/data-testid="lm-queue-row"/g)).toHaveLength(2);
    expect(html).toContain('data-testid="lm-queue-all"');
  });

  it('never offers one tap or "do all" for a refund: it only opens its own page', () => {
    const html = draw(<Queue title="Returns" rows={[confirm('1'), refund('9')]} doAll={{ label: 'Do all', done: '{n}' }} empty={empty} />);
    expect(html).not.toContain('lm-queue-all');
    expect(html).toContain('href="/admin/orders/9?refund=1"');
    expect(html).not.toContain('/api/admin/refund');
  });

  it('says all is caught up when nothing waits', () => {
    expect(draw(<Queue title="Confirm these" rows={[]} empty={empty} />)).toContain('All caught up');
  });
});

describe('list + filter + bulk', () => {
  const rows: ListRow[] = Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, chips: i % 3 ? ['new'] : ['packed'], text: `EX-${1000 + i}`, cells: <span>EX-{1000 + i}</span>, detail: i === 0 ? <p>detail</p> : undefined, href: `/admin/orders/${i}` }));

  it('draws chips with counts, the first step of rows and "Show more"', () => {
    const html = draw(<ListView rows={rows} chips={[{ key: 'new', label: 'New' }, { key: 'packed', label: 'Packed' }]} allLabel="All" searchLabel="Search orders" empty={empty} />);
    expect(html).toMatch(/All<i>30<\/i>/);
    expect(html).toMatch(/New<i>20<\/i>/);
    expect(html).toMatch(/Packed<i>10<\/i>/);
    expect(html.match(/data-testid="lm-list-row"/g)).toHaveLength(12);
    expect(html).toContain('Show 12 more');
    expect(html).toContain('placeholder="Search orders"');
    expect(html).toContain('aria-label="Open r0"');
  });

  it('follows the page step setting', () => {
    const html = draw(<ListView rows={rows} chips={[]} allLabel="All" searchLabel="Search" empty={empty} />, 25);
    expect(html.match(/data-testid="lm-list-row"/g)).toHaveLength(25);
    expect(html).toContain('Show 5 more');
  });

  it('adds the ticked ids to a guarded action’s own page', () => {
    expect(hrefWithIds('/admin/orders/print', ['a', 'b c'])).toBe('/admin/orders/print?ids=a,b%20c');
    expect(hrefWithIds('/admin/orders?x=1', ['a'])).toBe('/admin/orders?x=1&ids=a');
  });

  it('shows the empty state when nothing matches', () => {
    expect(draw(<ListView rows={[]} chips={[]} allLabel="All" searchLabel="Search" empty={{ title: 'No orders' }} />)).toContain('No orders');
  });
});

describe('list + detail split', () => {
  it('lists the items and shows the first one with Previous off and Next on', () => {
    const items = ['A', 'B', 'C'].map((x) => ({ id: x, title: `Customer ${x}`, sub: 'Dhaka', detail: <p>About {x}</p> }));
    const html = draw(<SplitView items={items} listLabel="Customers" empty={empty} />);
    expect(html.match(/data-testid="lm-split-item"/g)).toHaveLength(3);
    expect(html).toContain('About A');
    expect(html).toMatch(/<button type="button" class="lm-btn sm" disabled=""[^>]*data-testid="lm-split-prev"/);
    expect(html).toMatch(/<button type="button" class="lm-btn sm"[^>]*data-testid="lm-split-next"/);
    expect(html).toContain('1 of 3');
  });
});
