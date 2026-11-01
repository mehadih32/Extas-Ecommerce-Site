// S14 · PR 285 — the Customers list's address (`/admin/customers?view=&q=&source=&sort=&page=`), read from the page's
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
  const s = sp.toString();
  return s ? `${CUSTOMERS_BASE}?${s}` : CUSTOMERS_BASE;
}

/** A share as a whole percent (`null` when there is nothing to share). */
export const share = (part: number, whole: number): number | null => (whole > 0 ? Math.round((part / whole) * 100) : null);
