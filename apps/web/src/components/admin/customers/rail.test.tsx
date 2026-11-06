// Follow-up 702 (PR 636, LUMEN-SPEC §3 item 4) — the list beside one customer's page as the server draws it: every
// person on this page of the list links to his own page with the same list kept, the open person is marked, the list's
// paging keeps him open, and "Previous" / "Next" step one person along the list (none past either end).
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { CustomerList as ListData } from '@extas/customers';
import en from '../../../../messages/admin-customers.en.json';
import type { AdminView } from '@/lib/admin-page';
import type { Dict } from '@/lib/i18n';
import { CustomerRail, CustomerSteps } from './CustomerRail';

vi.mock('next/link', () => ({ default: ({ href, children, scroll: _s, ...rest }: { href: string; children: unknown; scroll?: boolean }) => <a href={href} {...rest}>{children as never}</a> }));

const view = { dict: en as Dict, locale: 'en-GB', lang: 'en' } as unknown as AdminView;
const row = (id: string, name: string | null, orders: number) => ({ id, name, orders, phone: { text: '017•••••678' }, mark: null });
const data = (over: Partial<ListData> = {}) =>
  ({ query: { view: 'atrisk', page: 2 }, counts: { atrisk: 40 }, rows: [row('a', 'Rahim', 3), row('b', null, 1), row('c', 'Karim', 2)], hasMore: true, ...over }) as unknown as ListData;
const list = { view: 'atrisk' as const, page: 2 };

describe('the list beside a customer (follow-up 702)', () => {
  it('links each person with the list kept and marks the open one', () => {
    const html = renderToStaticMarkup(<CustomerRail view={view} data={data()} list={list} current="b" />);
    expect(html).toContain('data-testid="cus-rail"');
    expect(html).toContain('href="/admin/customers/a?list=view%3Datrisk%26page%3D2"');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/class="on"[^>]*aria-current="page"[^>]*data-id="b"/);
    expect(html).toContain('No name');
    expect(html).toContain('3 orders');
    expect(html).toContain('1 order<');
    expect(html).toContain('href="/admin/customers?view=atrisk&amp;page=2"');
  });

  it('pages the list while keeping the open person', () => {
    const html = renderToStaticMarkup(<CustomerRail view={view} data={data()} list={list} current="b" />);
    expect(html).toContain('href="/admin/customers/b?list=view%3Datrisk"');
    expect(html).toContain('href="/admin/customers/b?list=view%3Datrisk%26page%3D3"');
  });

  it('says so when nobody is in the list', () => {
    const html = renderToStaticMarkup(<CustomerRail view={view} data={data({ rows: [], hasMore: false, query: { view: 'atrisk', page: 1 } } as never)} list={{ view: 'atrisk' }} current="b" />);
    expect(html).toContain('No one in this list.');
    expect(html).not.toContain('cus-rail-more');
  });

  it('steps one person along the list, and not past either end', () => {
    const mid = renderToStaticMarkup(<CustomerSteps view={view} data={data()} list={list} current="b" />);
    expect(mid).toContain('2 of 3');
    expect(mid).toMatch(/href="\/admin\/customers\/a\?list=[^"]+"[^>]*data-testid="cus-prev"/);
    expect(mid).toMatch(/href="\/admin\/customers\/c\?list=[^"]+"[^>]*data-testid="cus-next"/);
    const first = renderToStaticMarkup(<CustomerSteps view={view} data={data()} list={list} current="a" />);
    expect(first).not.toContain('cus-prev');
    expect(first).toContain('cus-next');
    expect(renderToStaticMarkup(<CustomerSteps view={view} data={data()} list={list} current="z" />)).toBe('');
  });
});
