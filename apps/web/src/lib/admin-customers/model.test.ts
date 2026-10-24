// S14 · PR 285 — the Customers list's address: read from the page's search params (unknown views, sorts and pages left
// out) and written back without the defaults, so a link opens the same list.
import { describe, expect, it } from 'vitest';
import { customersHref, parseCustomerQuery, share } from './model';

describe('the Customers list address (PR 285)', () => {
  it('reads only what it knows', () => {
    expect(parseCustomerQuery({})).toEqual({});
    expect(parseCustomerQuery({ view: 'atrisk', q: ' rahim ', source: 'WEBSITE', sort: 'spend', page: '3' })).toEqual({ view: 'atrisk', q: 'rahim', source: 'WEBSITE', sort: 'spend', page: 3 });
    expect(parseCustomerQuery({ view: 'everyone', sort: 'phone', page: '0' })).toEqual({});
    expect(parseCustomerQuery({ view: ['returning', 'vip'], page: '1.5' })).toEqual({ view: 'returning' });
    expect(parseCustomerQuery({ view: 'all', sort: 'last', page: '1' })).toEqual({});
  });
  it('writes a clean link, with parts changed or dropped', () => {
    expect(customersHref({})).toBe('/admin/customers');
    const q = { view: 'refused' as const, q: '01712', sort: 'name' as const, page: 2 };
    expect(customersHref(q)).toBe('/admin/customers?view=refused&q=01712&sort=name&page=2');
    expect(customersHref(q, { page: undefined })).toBe('/admin/customers?view=refused&q=01712&sort=name');
    expect(customersHref(q, { view: 'all' })).toBe('/admin/customers?q=01712&sort=name&page=2');
  });
  it('a share is a whole percent, or nothing when there is nothing to share', () => {
    expect(share(1, 3)).toBe(33);
    expect(share(0, 0)).toBeNull();
  });
});
