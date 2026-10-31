// PR 140 — ORD-01 All orders and ORD-02 To confirm on the server (docs/BACKEND-ARCHITECTURE.md §5.3): the page's
// choices read from its address (only views, statuses, payment methods and channels the order service knows), one page
// of rows through @extas/orders (listOrders: the same filters, counts and permission check as the admin API) and their
// courier, pieces and return/refund facts (listExtras), turned into what the screen draws: the four separate status
// chips, the courier column, the flags, the age, the phone said back as 01XXX-XXXXXX, and the money in the store's
// currency. The words come from messages/admin-orders.<lang>.json; nothing here is a sample.
import * as od from '@extas/orders';
import { ORDER_STATES, type OrderState } from '@extas/orders/pure';
import { RISK_SECTIONS } from '@extas/settings';
import { formatMoney, formatNumber, moneyOf } from '@/components/admin/products/model';
import type { AdminView } from '../admin-page';
import { ageOf } from '../admin-shell/dashboard';
import type { ShellIconName } from '../admin-shell/icons';
import type { FieldOption } from './spec';
import { t } from '../i18n';
import { phoneNormalizeBD } from '../phone-bd';
import { LIST_PAGES, ORDER_TONE, orderHref, PAY_TONE, RET_TONE, SECTION_TONE, SHIP_TONE, UNBOOKED_SHIPMENT, type ListPageId, type ListQuery, type Tone } from './model';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const QUERY_MAX = 80;

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
const pick = <T extends string>(v: string | undefined, allowed: readonly T[]): T | undefined => (v && (allowed as readonly string[]).includes(v) ? (v as T) : undefined);

/** The statuses a person can filter by (every placed one; a draft is never in the list). */
export const FILTER_STATES: readonly OrderState[] = ORDER_STATES.filter((s) => s !== 'DRAFT');

/** The page's choices from its address; anything the order service does not know is dropped (never an error page). */
export function parseListQuery(page: ListPageId, sp: Search): ListQuery {
  const views = LIST_PAGES[page].views as readonly string[];
  const cursor = one(sp.cursor);
  return {
    view: pick(one(sp.view), views) ?? views[0]!,
    q: one(sp.q)?.slice(0, QUERY_MAX),
    status: pick(one(sp.status), FILTER_STATES),
    payment: pick(one(sp.payment), od.PAYMENT_METHODS),
    source: pick(one(sp.source), od.ORDER_SOURCES),
    // PR 541 (follow-up 295): a band key as the owner's bands write them, a section, the sort
    risk: one(sp.risk) && BAND_KEY.test(one(sp.risk)!) ? one(sp.risk) : undefined,
    section: pick(one(sp.section), RISK_SECTIONS),
    sort: pick(one(sp.sort), od.LIST_SORTS.filter((s) => s !== 'new')),
    cursor: cursor && UUID.test(cursor) ? cursor : undefined,
  };
}

const BAND_KEY = /^[a-z0-9][a-z0-9-]{0,59}$/;

export interface Chip {
  label: string;
  tone: Tone;
  icon?: ShellIconName;
  /** What the chip is (the courier's, the payment's …), read out and shown on hover. */
  title?: string;
}

/** What the bulk bar needs to know about a row to say whether a command can run on it (the service checks again). */
export interface BulkFacts {
  status: OrderState;
  version: number;
  cancelRequested: boolean;
  cancelPending: boolean;
  inReview: boolean;
  booked: boolean;
}

export interface OrderRowView {
  id: string;
  number: string;
  href: string;
  name: string;
  phone: string;
  age: string;
  placed: string;
  items: string;
  firstItem: string | null;
  total: string;
  method: string;
  chips: Chip[];
  courier: { name: string; tracking: string | null } | null;
  flags: Chip[];
  /** PR 541 (follow-up 295): the band with the score ("High · 72") and the section it was placed in (clear: none). */
  risk: { band: Chip | null; section: Chip | null };
  facts: BulkFacts;
}

export interface OrderListData {
  query: ListQuery;
  rows: OrderRowView[];
  counts: Record<string, number>;
  next: string | null;
  /** PR 152: the owner's hold reasons, for the bulk Hold. */
  holdOptions: FieldOption[];
  /** PR 541: the owner's risk bands, for the list's risk filter. */
  bands: FieldOption[];
}

/** PR 541: a row's band with its score, in the owner's words and colour, and its section (none while clear). */
export function riskChips(view: AdminView, r: Pick<od.OrderRow, 'riskBand' | 'riskScore' | 'riskSection'>, bands: readonly { key: string; en: string; bn: string; tone: Tone }[]): OrderRowView['risk'] {
  const b = r.riskBand ? bands.find((x) => x.key === r.riskBand) : undefined;
  const name = b ? (view.lang === 'bn' ? b.bn || b.en : b.en) : r.riskBand;
  const band: Chip | null = name && r.riskScore !== null ? { label: `${name} · ${formatNumber(r.riskScore, view.locale)}`, tone: b?.tone ?? 'line', title: t(view.dict, 'orders.list.cols.risk') } : null;
  const section: Chip | null = r.riskSection && r.riskSection !== 'clear' ? { label: t(view.dict, `orders.section.${r.riskSection}`), tone: SECTION_TONE[r.riskSection] ?? 'line', title: t(view.dict, 'orders.list.section') } : null;
  return { band, section };
}

export interface ListLabels {
  holdReasons: Map<string, string>;
  flags: Map<string, string>;
}

/** How long ago, in the admin's words (the Dashboard's units). */
export function ageText(view: AdminView, at: Date, now: Date): string {
  const a = ageOf(at.toISOString(), now);
  if (!a || a.unit === 'now') return t(view.dict, 'dash.age.now');
  return t(view.dict, `dash.age.${a.unit}`, { n: formatNumber(a.n, view.locale) });
}

/** The phone as the team reads it back (01712-345678); anything else as it was stored. */
export const phoneText = (raw: string | null) => (raw ? phoneNormalizeBD(raw).nice || raw : '');

/** The four separate chips: order, courier, payment, return/refund (§6.5.0; never one combined status). */
export function statusChips(view: AdminView, o: { status: OrderState; cancelPending: boolean; payment: od.PaymentPill }, x: od.RowExtras | undefined): Chip[] {
  const d = view.dict;
  const ship = x?.shipment?.status ?? 'NONE';
  const out: Chip[] = [{ label: t(d, `orders.st.${o.status}`), tone: ORDER_TONE[o.status] }];
  if (o.cancelPending) out.push({ label: t(d, 'orders.chip.cancelPending'), tone: 'warn' });
  out.push({ label: t(d, `orders.ship.${ship}`), tone: SHIP_TONE[ship] ?? 'line', icon: 'truck', title: t(d, 'orders.chip.courier') });
  out.push({ label: t(d, `orders.pay.${o.payment}`), tone: PAY_TONE[o.payment], icon: 'wallet', title: t(d, 'orders.chip.payment') });
  if (x?.returnRefund) out.push({ label: t(d, `orders.ret.${x.returnRefund}`), tone: RET_TONE[x.returnRefund] ?? 'warn', icon: 'uturn', title: t(d, 'orders.chip.return') });
  return out;
}

/** The flags column: what the team should notice (a cancel request, a review, a hold's reason, the channel, the team's own flags). */
export function flagChips(view: AdminView, r: od.OrderRow, labels: ListLabels): Chip[] {
  const d = view.dict;
  const out: Chip[] = [];
  if (r.cancelRequested) out.push({ label: t(d, 'orders.flag.cancelRequest'), tone: 'bad' });
  if (r.inReview) out.push({ label: t(d, 'orders.flag.inReview'), tone: 'warn' });
  if (r.status === 'ON_HOLD' && r.holdReasonCode) out.push({ label: t(d, 'orders.flag.hold', { reason: labels.holdReasons.get(r.holdReasonCode) ?? r.holdReasonCode }), tone: 'mute' });
  if (r.customerWantsChange) out.push({ label: t(d, 'orders.flag.wantsChange'), tone: 'warn' });
  // PR 146 (demo 02-core.js): the same piece in two sizes — to ask, or the family's "for someone else" (SIM-F-036)
  if (r.flags.includes('TWO_SIZES')) out.push({ label: t(d, 'orders.flag.twoSizes'), tone: 'warn' });
  if (r.flags.includes('TWO_SIZES_OTHER')) out.push({ label: t(d, 'orders.flag.twoSizesOther'), tone: 'mute' });
  // PR 161: the watch mark a risk level put on the order
  if (r.flags.includes(od.RISK_WATCH_FLAG)) out.push({ label: t(d, 'orders.flag.riskWatch'), tone: 'warn' });
  // PR 162: the number (or the same person) is on the blocklist; a person decides, nothing was cancelled
  if (r.flags.includes(od.BLOCKLIST_FLAG)) out.push({ label: t(d, 'orders.flag.blocklist'), tone: 'bad' });
  // PR 163: the owner chose terms for this number (a proposal on the order, a person sends it)
  if (r.flags.includes(od.REFUSER_FLAG)) out.push({ label: t(d, 'orders.flag.refuser'), tone: 'warn' });
  // PR 522: the same person's other open orders to this address could go in one parcel (a person presses "One parcel")
  if (r.flags.includes(od.BUNDLE_FLAG) && !r.orderGroupId) out.push({ label: t(d, 'orders.flag.bundle'), tone: 'info' });
  // PR 523: the number was proposed for the blocklist (a person decides; the order goes on)
  if (r.flags.includes(od.BLOCK_PROPOSED_FLAG) && !r.flags.includes(od.BLOCKLIST_FLAG)) out.push({ label: t(d, 'orders.flag.blockProposal'), tone: 'warn' });
  // PR 524: the good-customer override kept the engine from holding it (a review may still wait for a person)
  if (r.flags.includes(od.GOOD_CUSTOMER_FLAG)) out.push({ label: t(d, 'orders.flag.goodCustomer'), tone: 'ok' });
  // PR 540: the gate turned the engine's hold into a proposal (a person holds it or lets it go)
  if (r.flags.includes(od.HOLD_PROPOSED_FLAG) && od.HOLDABLE_PROPOSALS.includes(r.status)) out.push({ label: t(d, 'orders.flag.holdProposed'), tone: 'warn' });
  // PR 545: a customer with no earlier order anywhere: one call (never a hold)
  if (r.flags.includes(od.NEW_CUSTOMER_FLAG)) out.push({ label: t(d, 'orders.flag.newCustomer'), tone: 'info' });
  if (r.orderGroupId) out.push({ label: t(d, 'orders.flag.merged'), tone: 'info' });
  for (const f of r.internalFlags) out.push({ label: labels.flags.get(f) ?? f, tone: 'gold' });
  if (r.source !== 'WEBSITE') out.push({ label: t(d, `orders.source.${r.source}`), tone: 'line' });
  return out;
}

/** One page of a list page's orders, ready to draw. */
export async function loadOrderList(deps: od.OrdersDeps, who: od.Who, view: AdminView, page: ListPageId, query: ListQuery): Promise<OrderListData> {
  const list = await od.listOrders(deps, who, {
    view: query.view,
    ...(query.q ? { q: query.q } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.payment ? { payment: query.payment } : {}),
    ...(query.source ? { source: query.source } : {}),
    ...(query.risk ? { risk: query.risk } : {}),
    ...(query.section ? { section: query.section } : {}),
    ...(query.sort ? { sort: query.sort } : {}),
    ...(query.cursor ? { cursor: query.cursor } : {}),
  });
  const [extras, reasons, riskBands] = await Promise.all([od.listExtras(deps, who, list.rows.map((r) => r.id)), od.reasonLists(deps, who.storeId), od.setting(deps, who.storeId, 'risk.bands')]);
  const name = (x: { en: string; bn: string }) => (view.lang === 'bn' ? x.bn || x.en : x.en);
  const labels: ListLabels = { holdReasons: new Map(reasons.hold.map((r) => [r.key, name(r)])), flags: new Map(reasons.flags.map((f) => [f.key, name(f)])) };
  const now = (deps.now ?? (() => new Date()))();
  const d = view.dict;
  const placedFmt = new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: view.timeZone, numberingSystem: 'latn' });
  const rows = list.rows.map((r): OrderRowView => {
    const x = extras[r.id];
    const money = moneyOf(r.currency, view.locale);
    const units = x?.units ?? 0;
    const flags = flagChips(view, r, labels);
    return {
      id: r.id,
      number: r.number,
      href: orderHref(r.id),
      name: r.customerName ?? '',
      phone: phoneText(r.phone),
      age: ageText(view, r.placedAt, now),
      placed: placedFmt.format(r.placedAt),
      items: t(d, units === 1 ? 'orders.list.pc' : 'orders.list.pcs', { n: formatNumber(units, view.locale) }),
      firstItem: x?.firstItem ? (x.lines > 1 ? t(d, 'orders.list.firstMore', { name: x.firstItem, n: formatNumber(x.lines - 1, view.locale) }) : x.firstItem) : null,
      total: formatMoney(r.totalMinor, money),
      method: r.paymentMethod ? t(d, `orders.method.${r.paymentMethod}`) : '',
      chips: statusChips(view, r, x),
      courier: x?.shipment && !UNBOOKED_SHIPMENT.has(x.shipment.status) ? { name: x.shipment.courierName, tracking: x.shipment.trackingCode } : null,
      flags,
      risk: riskChips(view, r, riskBands),
      facts: {
        status: r.status,
        version: r.version,
        cancelRequested: r.cancelRequested,
        cancelPending: r.cancelPending,
        inReview: r.inReview,
        booked: !!x?.shipment && !UNBOOKED_SHIPMENT.has(x.shipment.status),
      },
    };
  });
  const holdOptions = reasons.hold.map((r) => ({ value: r.key, label: name(r), ...(r.noteRequired ? { noteRequired: true } : {}) }));
  const bands = riskBands.map((b) => ({ value: b.key, label: name(b) }));
  return { query, rows, counts: list.counts, next: list.next, holdOptions, bands };
}
