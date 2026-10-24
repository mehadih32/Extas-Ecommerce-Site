// PR 140 — the admin's order screens without a database or React (client-safe: the browser parts import it too). The
// four statuses of an order (§6.5.0) are four separate chips, each with its own colour from the demo V12.3 (97m
// A2_OST, A2_SHIP, A2_PAY, A2_RET); the words are in messages/admin-orders.<lang>.json. The list's views are the order
// service's own (`@extas/orders` ORDER_VIEWS): a page shows only views the backend really has.
import type { OrderState, PaymentPill } from '@extas/orders/pure';

/** A chip's colour (the demo's `a2-pill` classes; `mute` is the plain grey one). */
export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'g' | 'gold' | 'line' | 'mute';

export const ORDER_TONE: Readonly<Record<OrderState, Tone>> = {
  DRAFT: 'line',
  PLACED: 'warn',
  AWAITING_ADVANCE: 'warn',
  CONFIRMED: 'info',
  ON_HOLD: 'mute',
  PROCESSING: 'info',
  PACKED: 'info',
  HANDED_OVER: 'g',
  IN_TRANSIT: 'g',
  DELIVERED: 'ok',
  PARTIALLY_DELIVERED: 'ok',
  RETURNED: 'bad',
  CANCELLED: 'mute',
};

/** The courier's status (Shipment.status, or NONE when the order was never booked). */
export const SHIP_TONE: Readonly<Record<string, Tone>> = {
  NONE: 'line',
  BOOKING: 'info',
  BOOKING_FAILED: 'bad',
  IN_REVIEW: 'info',
  PENDING_PICKUP: 'info',
  PICKED_UP: 'g',
  IN_TRANSIT: 'g',
  OUT_FOR_DELIVERY: 'g',
  DELIVERED: 'ok',
  PARTIALLY_DELIVERED: 'ok',
  RETURNING: 'warn',
  RETURNED: 'warn',
  CANCEL_REQUESTED: 'warn',
  CANCELLED: 'mute',
};

export const PAY_TONE: Readonly<Record<PaymentPill, Tone>> = {
  UNPAID: 'line',
  PARTLY_PAID: 'info',
  PAID: 'ok',
  OWED_BACK: 'bad',
  COD_TO_COLLECT: 'warn',
  COD_COLLECTED: 'info',
  // PR 165/166: the courier paid the COD money to us
  COD_SETTLED: 'ok',
};

export const RET_TONE: Readonly<Record<string, Tone>> = {
  REFUND_APPROVED: 'bad',
  REFUND_REQUESTED: 'warn',
  RETURN_EXPECTED: 'warn',
  RETURN_RECEIVED: 'warn',
  REFUND_DONE: 'ok',
};

/** A courier booking that no longer holds the parcel (the order is not "booked", D5). */
export const UNBOOKED_SHIPMENT: ReadonlySet<string> = new Set(['BOOKING_FAILED', 'CANCELLED']);

/**
 * The list pages of the Orders section and the views each shows (in this order; the first is the default). PR 541
 * (SIM-F-020): "Prepaid" — paid orders nothing flagged, confirmed without a call — beside the call queue.
 */
export const LIST_PAGES = {
  all: { base: '/admin/orders', views: ['all', 'toConfirm', 'prepaid', 'awaitingAdvance', 'onHold', 'cancelRequests', 'cancelPending', 'inReview', 'open', 'finished'] },
  confirm: { base: '/admin/orders/confirm', views: ['toConfirm', 'prepaid', 'cancelRequests', 'awaitingAdvance'] },
} as const;

/**
 * PR 541: each section's colour (the demo's ORD-03 sections; a duplicate or a re-order to look at, a new identity or a
 * high risk to decide, a band to watch, prepaid, clear).
 */
export const SECTION_TONE: Readonly<Record<string, Tone>> = { duplicate: 'warn', reorder: 'warn', identity: 'bad', high: 'bad', watch: 'warn', prepaid: 'info', clear: 'ok' };
export type ListPageId = keyof typeof LIST_PAGES;

/** What a list page is showing: the view, the search and the filters (all optional but the view). */
export interface ListQuery {
  view: string;
  q?: string;
  status?: string;
  payment?: string;
  source?: string;
  /** PR 541 (follow-up 295): the risk band, the section, and the sort ("risk": highest score first). */
  risk?: string;
  section?: string;
  sort?: string;
  cursor?: string;
}

/** The address of a list page with these choices; a choice equal to its default is left out (a clean, shareable link). */
export function listHref(page: ListPageId, cur: ListQuery, change: Partial<ListQuery> = {}): string {
  const p = LIST_PAGES[page];
  const next: ListQuery = { ...cur, cursor: undefined, ...change };
  const sp = new URLSearchParams();
  if (next.view && next.view !== p.views[0]) sp.set('view', next.view);
  for (const k of ['q', 'status', 'payment', 'source', 'risk', 'section', 'sort', 'cursor'] as const) {
    const v = next[k];
    if (v) sp.set(k, v);
  }
  const qs = sp.toString();
  return qs ? `${p.base}?${qs}` : p.base;
}

/** Bengali digits as Latin ones (a search typed in Bengali finds the same orders). */
export const latinDigits = (s: string) => s.replace(/[০-৯]/g, (c) => String(c.charCodeAt(0) - 0x09e6));

/** One order's address in the admin. */
export const orderHref = (id: string) => `/admin/orders/${id}`;

/** One order's invoice (PR 136; the staff open it with `orders.invoice`, follow-up 180). */
export const invoiceHref = (number: string) => `/account/orders/${encodeURIComponent(number)}/invoice`;
