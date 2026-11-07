// S14 · PR 285 — the Customers list's address: read from the page's search params (unknown views, sorts and pages left
// out) and written back without the defaults, so a link opens the same list.
import { describe, expect, it } from 'vitest';
import { customerHref, customersHref, listOf, listParam, parseCustomerQuery, placeIn, share } from './model';

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
  it('PR 287: keeps a segment id, never anything else in its place', () => {
    const seg = '01963f6e-1111-7000-8000-000000000287';
    expect(parseCustomerQuery({ segment: seg })).toEqual({ segment: seg });
    expect(parseCustomerQuery({ segment: 'everyone' })).toEqual({});
    expect(customersHref({ segment: seg }, { view: 'new' })).toBe(`/admin/customers?view=new&segment=${seg}`);
  });
  it('follow-up 473: keeps a district id, never anything else in its place', () => {
    const dist = '01963f6e-2222-7000-8000-000000000473';
    expect(parseCustomerQuery({ district: dist })).toEqual({ district: dist });
    expect(parseCustomerQuery({ district: 'Bogura' })).toEqual({});
    expect(customersHref({ district: dist, source: 'WEBSITE' }, { page: 2 })).toBe(`/admin/customers?source=WEBSITE&page=2&district=${dist}`);
  });
  it('a share is a whole percent, or nothing when there is nothing to share', () => {
    expect(share(1, 3)).toBe(33);
    expect(share(0, 0)).toBeNull();
  });
});

describe('the customer page remembers the list it was opened from (follow-up 702, PR 636)', () => {
  it('reads the list back from the page address, and only what the list knows', () => {
    expect(listOf({})).toEqual({});
    expect(listOf({ list: 'view=atrisk&q=rahim&page=2', tab: 'orders', page: '3' })).toEqual({ view: 'atrisk', q: 'rahim', page: 2 });
    expect(listOf({ list: 'view=nobody&sort=phone' })).toEqual({});
    expect(listParam({})).toBe('');
    expect(listParam({ view: 'refused', q: 'a&b' })).toBe('view=refused&q=a%26b');
    expect(listOf({ list: listParam({ view: 'refused', q: 'a&b' }) })).toEqual({ view: 'refused', q: 'a&b' });
  });
  it('writes his page address with the tab, page, merged-from and list', () => {
    expect(customerHref('c1')).toBe('/admin/customers/c1');
    expect(customerHref('c1', {}, { tab: 'overview', page: 1 })).toBe('/admin/customers/c1');
    expect(customerHref('c1', { view: 'atrisk' }, { tab: 'orders', page: 2 })).toBe('/admin/customers/c1?tab=orders&page=2&list=view%3Datrisk');
    expect(customerHref('c 1', {}, { from: 'c0' })).toBe('/admin/customers/c%201?from=c0');
  });
  it('finds his place, the one before and the one after', () => {
    expect(placeIn(['a', 'b', 'c'], 'b')).toEqual({ n: 2, of: 3, prev: 'a', next: 'c' });
    expect(placeIn(['a', 'b', 'c'], 'a')).toEqual({ n: 1, of: 3, prev: null, next: 'b' });
    expect(placeIn(['a', 'b', 'c'], 'c')).toEqual({ n: 3, of: 3, prev: 'b', next: null });
    expect(placeIn(['a'], 'z')).toBeNull();
  });
});
