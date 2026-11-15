// PR 786 (lane D1): the Orders date bar (prototype `dateBar`): Any date, Today, Yesterday, 7 days, This month, Last month and Custom;
// each preset is a link carrying its own from/to, and the chip that matches the current range is marked.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import en from '../../../../messages/admin-orders.en.json';
import { DateBar } from './OrderListPage';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

const view = { dict: en, timeZone: 'UTC', locale: 'en', lang: 'en' } as never;
const draw = (query: Record<string, unknown>) => renderToStaticMarkup(<DateBar view={view} page="all" query={{ view: 'all', ...query } as never} />);

describe('DateBar', () => {
  it('draws every chip of the prototype in order', () => {
    const h = draw({});
    const order = ['Any date', 'Today', 'Yesterday', '7 days', 'This month', 'Last month'].map((x) => h.indexOf(x));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
  it('with no range "Any date" is the current chip, and the presets link to a range', () => {
    const h = draw({});
    expect(h).toMatch(/a2-view on"[^>]*aria-current="page"[^>]*>Any date/);
    expect(h).toContain('from=');
    expect(h).toContain('to=');
  });
  it('a custom range marks Custom, not Any date', () => {
    const h = draw({ from: '2020-01-02', to: '2020-01-05' });
    expect(h).not.toMatch(/aria-current="page"[^>]*>Any date/);
    expect(h).toMatch(/a2-view on" aria-hidden="true">Custom/);
  });
});
