// S14 · PR 285 — the Customers list's address (`/admin/customers?view=&q=&source=&sort=&page=&segment=&district=`), read from the page's
// search params and written back for every link, so a link opens the same list. No database, no React (the page, the
// filters and the tests share it).
import { CUSTOMER_SORTS, CUSTOMER_VIEWS, type CustomerSort, type CustomerView } from '@extas/customers/pure';

export const CUSTOMERS_BASE = '/admin/customers';

export interface CustomerQuery {
  view?: CustomerView;
  q?: string;
  source?: string;
  sort?: CustomerSort;
  page?: number;
  /** PR 287: a saved segment's id. */
  segment?: string;
  /** Follow-up 473: a district's id (the person's latest order with a resolved place is in it). */
  district?: string;
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? '';

/** The query as the page's address gives it (anything unknown is left out). */
export function parseCustomerQuery(sp: Record<string, string | string[] | undefined>): CustomerQuery {
  const view = one(sp.view);
  const sort = one(sp.sort);
  const page = Number(one(sp.page));
  return {
    ...((CUSTOMER_VIEWS as readonly string[]).includes(view) && view !== 'all' ? { view: view as CustomerView } : {}),
    ...(one(sp.q) ? { q: one(sp.q).slice(0, 100) } : {}),
    ...(one(sp.source) ? { source: one(sp.source).slice(0, 60) } : {}),
    ...((CUSTOMER_SORTS as readonly string[]).includes(sort) && sort !== 'last' ? { sort: sort as CustomerSort } : {}),
    ...(Number.isInteger(page) && page > 1 ? { page } : {}),
    ...(/^[0-9a-f-]{36}$/i.test(one(sp.segment)) ? { segment: one(sp.segment) } : {}),
    ...(/^[0-9a-f-]{36}$/i.test(one(sp.district)) ? { district: one(sp.district) } : {}),
  };
}

/** The list's address for a query, with some parts changed (`undefined` drops a part). */
export function customersHref(q: CustomerQuery, change: Partial<Record<keyof CustomerQuery, CustomerQuery[keyof CustomerQuery] | undefined>> = {}): string {
  const m = { ...q, ...change } as CustomerQuery;
  const sp = new URLSearchParams();
  if (m.view && m.view !== 'all') sp.set('view', m.view);
  if (m.q) sp.set('q', m.q);
  if (m.source) sp.set('source', m.source);
  if (m.sort && m.sort !== 'last') sp.set('sort', m.sort);
  if (m.page && m.page > 1) sp.set('page', String(m.page));
  if (m.segment) sp.set('segment', m.segment);
  if (m.district) sp.set('district', m.district);
  const s = sp.toString();
  return s ? `${CUSTOMERS_BASE}?${s}` : CUSTOMERS_BASE;
}

/** A share as a whole percent (`null` when there is nothing to share). */
export const share = (part: number, whole: number): number | null => (whole > 0 ? Math.round((part / whole) * 100) : null);

/** Follow-up 702 (PR 636, LUMEN-SPEC §3 item 4): the list a customer's page was opened from, carried in one `list`
 *  part of his page's address (the list's own query, as `customersHref` writes it), so the list beside him, Previous /
 *  Next and the way back keep the same view, words, filters and page. Nothing (the default list) when there is none. */
export function listOf(sp: Record<string, string | string[] | undefined>): CustomerQuery {
  const raw = one(sp.list);
  if (!raw) return {};
  return parseCustomerQuery(Object.fromEntries(new URLSearchParams(raw)));
}

/** The `list` part for a query: the list address's own query string ('' for the default list). */
export function listParam(q: CustomerQuery): string {
  const href = customersHref(q);
  const at = href.indexOf('?');
  return at < 0 ? '' : href.slice(at + 1);
}

/** One customer's page address, at one of its tabs and pages, remembering the list he was opened from. */
export function customerHref(id: string, list: CustomerQuery = {}, at: { tab?: string; page?: number; from?: string } = {}): string {
  const sp = new URLSearchParams();
  if (at.tab && at.tab !== 'overview') sp.set('tab', at.tab);
  if (at.page && at.page > 1) sp.set('page', String(at.page));
  if (at.from) sp.set('from', at.from);
  const l = listParam(list);
  if (l) sp.set('list', l);
  const s = sp.toString();
  return `${CUSTOMERS_BASE}/${encodeURIComponent(id)}${s ? `?${s}` : ''}`;
}

/** Where a customer sits in the list beside him: his place (1-based) and the people before and after him on this page
 *  of the list; null when he is not on it (a deep link, or a list that has moved on). */
export function placeIn(ids: readonly string[], id: string): { n: number; of: number; prev: string | null; next: string | null } | null {
  const i = ids.indexOf(id);
  if (i < 0) return null;
  return { n: i + 1, of: ids.length, prev: ids[i - 1] ?? null, next: ids[i + 1] ?? null };
}
