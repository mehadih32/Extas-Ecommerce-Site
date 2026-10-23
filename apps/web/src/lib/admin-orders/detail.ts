// PR 141 — ORD-07 one order for the admin on the server (docs/BACKEND-ARCHITECTURE.md §5.3, demo V12.3
// #/admin/orders/:id): everything the page draws, read through @extas/orders with the person's keys (getOrder, the
// row's courier and return/refund facts, the customer's history by account or phone, the staff names of the
// timeline), and the command buttons: only a command the order service says is open now (`allowed`) AND the person's
// keys allow, each with its "what will happen" lines and the fields it needs. Nothing moves money, changes a price, a
// discount or COD, or blocks anyone; a paid order's cancel says it records a refund REQUEST for the owner, nothing more.
import type { PermissionKey } from '@extas/auth';
import * as od from '@extas/orders';
import { targetOf, type OrderCommand, type OrderState } from '@extas/orders/pure';
import { formatMoney, formatNumber, moneyOf } from '@/components/admin/products/model';
import type { AdminView } from '../admin-page';
import { t } from '../i18n';
import { KNOWN_ERRORS, commandUrl, reviewUrl, type CommandId } from './commands';
import { ageText, flagChips, phoneText, statusChips, type Chip } from './list';
import { ORDER_TONE, orderHref, type Tone } from './model';
import type { CommandSpec, CommandTexts, FieldOption, FieldSpec } from './spec';

/** The key each command asks for (the admin API's own, lib/orders-api.ts). */
export const COMMAND_PERM: Readonly<Record<CommandId, PermissionKey>> = {
  confirm: 'orders.confirm',
  hold: 'orders.hold',
  release: 'orders.hold',
  cancel: 'orders.cancel',
  approveCancelRequest: 'orders.cancelRequests',
  refuseCancelRequest: 'orders.cancelRequests',
  cancelAfterBooking: 'orders.cancelAfterBooking',
  courierCancel: 'orders.cancelAfterBooking',
  flags: 'orders.notes',
  notes: 'orders.notes',
};

/** The key a button (by its spec id, the `?do=` deep link) needs: a link to a command the person may not use shows "no access". */
export const DO_PERM: Readonly<Record<string, PermissionKey>> = {
  confirm: 'orders.confirm',
  hold: 'orders.hold',
  release: 'orders.hold',
  cancel: 'orders.cancel',
  cancelAfterBooking: 'orders.cancelAfterBooking',
  courierYes: 'orders.cancelAfterBooking',
  courierNo: 'orders.cancelAfterBooking',
  approveRequest: 'orders.cancelRequests',
  refuseRequest: 'orders.cancelRequests',
  flags: 'orders.notes',
};

/** How many of the customer's other orders the page lists (the counts cover all of them). */
export const HISTORY_SHOWN = 5;

export interface Row2 {
  label: string;
  value: string;
  strong?: boolean;
  mono?: boolean;
}

export interface TimelineItem {
  id: string;
  title: string;
  detail: string | null;
  at: string;
  who: string;
  tone: '' | 'warn' | 'bad' | 'mute';
}

export interface ReviewCard {
  id: string;
  open: boolean;
  severity: string;
  matched: { number: string; href: string; status: string; tone: Tone }[];
  at: string;
  specs: CommandSpec[];
}

export interface OrderDetailView {
  id: string;
  number: string;
  name: string;
  total: string;
  placed: string;
  source: string;
  chips: Chip[];
  flags: Chip[];
  items: { id: string; name: string; sub: string; qty: string; total: string; removed: boolean }[];
  units: string;
  totals: Row2[];
  customer: Row2[];
  history: { line: string; recent: { number: string; href: string; status: string; tone: Tone; total: string; placed: string }[] };
  courier: { chip: Chip; rows: Row2[] };
  money: { chip: Chip; rows: { title: string; sub: string; at: string; tone: Tone }[]; empty: string };
  reviews: ReviewCard[];
  notes: { id: string; body: string; who: string; at: string; archiveUrl: string | null }[];
  timeline: TimelineItem[];
  bands: { kind: 'stale' | 'locked' | 'bad' | 'off'; text: string; specs: CommandSpec[]; id: string }[];
  primary: CommandSpec[];
  more: CommandSpec[];
  canNote: boolean;
  noteMax: number;
  noteUrl: string;
}

interface OrderFields {
  status: OrderState;
  version: number;
  placedAt: Date;
  source: string;
  customerId: string | null;
  customerName: string | null;
  phone: string | null;
  email: string | null;
  shippingAddressText: string | null;
  addressUnclear: boolean | null;
  subtotalMinor: number;
  discountMinor: number;
  deliveryChargeMinor: number;
  walletAppliedMinor: number;
  totalMinor: number;
  codAmountMinor: number | null;
  currency: string;
  paymentMethod: string | null;
  note: string | null;
  holdReasonCode: string | null;
  holdReason: string | null;
  holdFromStatus: OrderState | null;
  onHoldSince: Date | null;
  cancelReasonCode: string | null;
  cancelNote: string | null;
  cancelRequestReason: string | null;
  cancelRequestedAt: Date | null;
  cancelPending: boolean;
  customerWantsChange: boolean;
  internalFlags: string[];
  flags: string[];
  orderGroupId: string | null;
  cancelRequested: boolean;
  inReview: boolean;
  booked: boolean;
}

/** The dialogs' shared words. */
export function commandTexts(view: AdminView): CommandTexts {
  const d = view.dict;
  return {
    cancel: t(d, 'orders.dlg.cancel'),
    close: t(d, 'orders.dlg.close'),
    willHappen: t(d, 'orders.dlg.willHappen'),
    stale: t(d, 'orders.err.STALE'),
    working: t(d, 'orders.dlg.working'),
    required: t(d, 'orders.dlg.required'),
    errors: Object.fromEntries([...KNOWN_ERRORS, 'other'].map((c) => [c, t(d, `orders.err.${c}`)])),
  };
}

const may = (perms: ReadonlySet<string>, c: CommandId) => perms.has(COMMAND_PERM[c]);

/** The name of a list entry in the admin's language. */
const nameOf = (view: AdminView, x: { en: string; bn: string }) => (view.lang === 'bn' ? x.bn || x.en : x.en);

/** Every command button of one order: the primary ones, the bands', the "More actions" menu. */
export function commandSpecs(
  view: AdminView,
  o: { id: string; number: string; version: number; status: OrderState; holdFromStatus: OrderState | null; cancelRequested: boolean; cancelPending: boolean; booked: boolean; internalFlags: string[]; paidMinor: number; currency: string },
  allowed: readonly OrderCommand[],
  perms: ReadonlySet<string>,
  reasons: od.ReasonLists,
): { primary: CommandSpec[]; more: CommandSpec[]; courier: CommandSpec[]; request: CommandSpec[] } {
  const d = view.dict;
  const tt = (k: string, v?: Record<string, string>) => t(d, `orders.cmd.${k}`, v);
  const st = (s: OrderState) => t(d, `orders.st.${s}`);
  const to = (c: OrderCommand) => {
    const s = targetOf(c, o.status, o.holdFromStatus);
    return s && s !== o.status ? [t(d, 'orders.eff.to', { st: st(s) })] : [];
  };
  const opts = (list: od.ReasonOption[]): FieldOption[] => list.map((r) => ({ value: r.key, label: nameOf(view, r), ...(r.noteRequired ? { noteRequired: true } : {}) }));
  const note = (required = false, noteFor?: string): FieldSpec => ({ name: 'note', kind: 'textarea', label: t(d, required ? 'orders.dlg.reasonRequired' : 'orders.dlg.noteOptional'), required, ...(noteFor ? { noteFor, labelNeeded: t(d, 'orders.dlg.note') } : {}), maxLength: 2000, placeholder: t(d, 'orders.dlg.notePh') });
  const paid = o.paidMinor;
  const refund = paid > 0 ? [t(d, 'orders.eff.refundReq', { amount: formatMoney(paid, moneyOf(o.currency, view.locale)) })] : [];
  const cancelFx = [...to('cancel'), t(d, 'orders.eff.cancelStock'), t(d, 'orders.eff.cancelPay'), ...refund];
  const base = (id: CommandId, k: string, extra: Partial<CommandSpec>): CommandSpec => ({
    id: k,
    label: tt(`${k}.label`),
    url: commandUrl(o.id, id),
    version: o.version,
    title: tt(`${k}.title`, { n: o.number }),
    effects: [],
    fields: [],
    ok: tt(`${k}.ok`),
    okTone: 'pri',
    done: tt(`${k}.done`, { n: o.number }),
    ...extra,
  });
  const has = (c: OrderCommand) => allowed.includes(c);
  const primary: CommandSpec[] = [];
  const more: CommandSpec[] = [];
  const courier: CommandSpec[] = [];
  const request: CommandSpec[] = [];

  if (has('confirm') && may(perms, 'confirm')) primary.push(base('confirm', 'confirm', { tone: 'pri', icon: 'check', effects: [...to('confirm'), t(d, 'orders.eff.confirmNext')] }));
  if (has('release') && may(perms, 'release')) primary.push(base('release', 'release', { tone: 'pri', icon: 'refresh', effects: to('release'), fields: [note()] }));
  if (has('courierCancelConfirmed') && may(perms, 'courierCancel')) {
    const who: FieldSpec[] = [
      { name: 'courierPerson', kind: 'text', label: t(d, 'orders.dlg.courierPerson'), maxLength: 120 },
      { name: 'courierRef', kind: 'text', label: t(d, 'orders.dlg.courierRef'), maxLength: 120 },
      note(),
    ];
    courier.push(base('courierCancel', 'courierYes', { tone: 'pri', fixed: { answer: 'confirmed' }, effects: cancelFx, fields: who }));
    courier.push(base('courierCancel', 'courierNo', { fixed: { answer: 'refused' }, effects: [t(d, 'orders.eff.refusedGoesOn'), t(d, 'orders.eff.noRisk')], fields: who, okTone: 'pri' }));
  }
  if (o.cancelRequested && may(perms, 'approveCancelRequest')) {
    if (has('cancel')) request.push(base('approveCancelRequest', 'approveRequest', { tone: 'badf', effects: cancelFx, fields: [note()], okTone: 'badf', doneRefund: tt('approveRequest.doneRefund', { n: '{n}' }) }));
    if (has('refuseCancelRequest')) request.push(base('refuseCancelRequest', 'refuseRequest', { effects: [t(d, 'orders.eff.refuseKeep')], fields: [note()] }));
  }
  if (has('hold') && may(perms, 'hold')) more.push(base('hold', 'hold', { icon: 'clock', effects: [...to('hold'), t(d, 'orders.eff.holdStock')], fields: [{ name: 'reasonKey', kind: 'select', label: t(d, 'orders.dlg.reason'), options: opts(reasons.hold) }, note(false, 'reasonKey')] }));
  if (has('cancel') && !o.cancelRequested && may(perms, 'cancel'))
    more.push(base('cancel', 'cancel', { icon: 'x', tone: 'bad', effects: cancelFx, fields: [{ name: 'reasonCode', kind: 'select', label: t(d, 'orders.dlg.reason'), options: opts(reasons.cancel) }, note(false, 'reasonCode')], okTone: 'badf', doneRefund: tt('cancel.doneRefund', { n: '{n}' }) }));
  if (has('cancelAfterBooking') && may(perms, 'cancelAfterBooking'))
    more.push(base('cancelAfterBooking', 'cancelAfterBooking', { icon: 'uturn', tone: 'bad', effects: [t(d, 'orders.eff.cabParcel'), t(d, 'orders.eff.cabPending'), t(d, 'orders.eff.cabNext')], fields: [{ name: 'reasonCode', kind: 'select', label: t(d, 'orders.dlg.reason'), options: opts(reasons.cancel), value: reasons.cancel.some((r) => r.key === 'CUSTOMER_CHANGE_AFTER_BOOKING') ? 'CUSTOMER_CHANGE_AFTER_BOOKING' : undefined }, note(false, 'reasonCode')], okTone: 'badf' }));
  if (has('setFlags') && may(perms, 'flags') && reasons.flags.length)
    more.push(base('flags', 'flags', { icon: 'flag', fields: [{ name: 'flags', kind: 'checks', label: t(d, 'orders.dlg.flags'), options: reasons.flags.map((f) => ({ value: f.key, label: nameOf(view, f) })), value: o.internalFlags }] }));
  return { primary, more, courier, request };
}

/** The duplicate review's decisions (PR 145): each needs its own key; decline cancels, so it needs the cancel key too. */
export function reviewSpecs(view: AdminView, alertId: string, number: string, matched: { id: string; number: string }[], perms: ReadonlySet<string>, reasons: od.ReasonLists, paid: string | null): CommandSpec[] {
  if (!perms.has('orders.risk.decide')) return [];
  const d = view.dict;
  const tt = (k: string) => t(d, `orders.review.${k}`, { n: number });
  const spec = (decision: string, extra: Partial<CommandSpec>): CommandSpec => ({
    id: `review-${decision}`,
    label: tt(`${decision}.label`),
    url: reviewUrl(alertId),
    version: null,
    fixed: { decision },
    title: tt(`${decision}.title`),
    effects: [],
    fields: [{ name: 'note', kind: 'textarea', label: t(d, 'orders.dlg.noteOptional'), maxLength: 2000 }],
    ok: tt(`${decision}.ok`),
    okTone: 'pri',
    done: tt(`${decision}.done`),
    ...extra,
  });
  const out = [spec('approve', { tone: 'pri', effects: [t(d, 'orders.eff.reviewApprove')] })];
  if (perms.has('orders.hold')) out.push(spec('hold', { effects: [t(d, 'orders.eff.to', { st: t(d, 'orders.st.ON_HOLD') })], fields: [{ name: 'holdReasonKey', kind: 'select', label: t(d, 'orders.dlg.reason'), options: reasons.hold.map((r) => ({ value: r.key, label: nameOf(view, r), ...(r.noteRequired ? { noteRequired: true } : {}) })), value: reasons.hold.some((r) => r.key === 'possible-duplicate') ? 'possible-duplicate' : undefined }, { name: 'note', kind: 'textarea', label: t(d, 'orders.dlg.noteOptional'), labelNeeded: t(d, 'orders.dlg.note'), noteFor: 'holdReasonKey', maxLength: 2000 }] }));
  out.push(spec('ask', { effects: [t(d, 'orders.eff.reviewAsk')] }));
  if (perms.has('orders.merge') && matched.length) out.push(spec('merge', { effects: [t(d, 'orders.eff.merge')], fields: [{ name: 'mergeWith', kind: 'select', label: t(d, 'orders.dlg.mergeWith'), options: matched.map((m) => ({ value: m.id, label: m.number })) }, { name: 'note', kind: 'textarea', label: t(d, 'orders.dlg.noteOptional'), maxLength: 2000 }] }));
  if (perms.has('orders.cancel')) out.push(spec('decline', { tone: 'bad', okTone: 'badf', effects: [t(d, 'orders.eff.to', { st: t(d, 'orders.st.CANCELLED') }), t(d, 'orders.eff.cancelStock'), ...(paid ? [t(d, 'orders.eff.refundReq', { amount: paid })] : [])] }));
  return out;
}

const EVENT_TONE: Readonly<Record<string, TimelineItem['tone']>> = {
  'order.cancel': 'bad',
  'order.courierCancelConfirmed': 'bad',
  'order.returned': 'bad',
  'order.hold': 'warn',
  'order.cancelAfterBooking': 'warn',
  'order.requestCancel': 'warn',
  'order.duplicateCheck': 'warn',
  'order.note': 'mute',
  'order.note.archived': 'mute',
  'order.setFlags': 'mute',
};

/** Everything the order page draws, or null when there is no such order in this store. */
export async function loadOrderDetail(deps: od.OrdersDeps, who: od.Who, view: AdminView, id: string, perms: ReadonlySet<string>): Promise<OrderDetailView | null> {
  let detail: od.OrderDetail;
  try {
    detail = await od.getOrder(deps, who, id);
  } catch (e) {
    if (od.isOrdersError(e) && e.code === 'NOT_FOUND') return null;
    throw e;
  }
  const o = detail.order as unknown as OrderFields & { id: string; number: string };
  const d = view.dict;
  const now = (deps.now ?? (() => new Date()))();
  const money = moneyOf(o.currency, view.locale);
  const m = (n: number) => formatMoney(n, money);
  const dt = new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: view.timeZone, numberingSystem: 'latn' });
  const matchedIds = [...new Set(detail.reviews.flatMap((r) => r.matchedOrderIds))];
  const [extras, history, reasons, names, matchedRows, noteMax] = await Promise.all([
    od.listExtras(deps, who, [o.id]),
    od.orderHistory(deps, who, o.id, HISTORY_SHOWN),
    od.reasonLists(deps, who.storeId),
    od.staffNames(deps, who, [...detail.timeline.map((e) => (e.actorType === 'STAFF' ? e.actorId : null)), ...detail.notes.map((n) => n.authorId)]),
    od.orderNumbers(deps, who, matchedIds),
    deps.settings.value('orders.notes.maxChars', { storeId: who.storeId }) as Promise<number>,
  ]);
  const x = extras[o.id];
  const holdName = new Map(reasons.hold.map((r) => [r.key, nameOf(view, r)]));
  const cancelName = new Map(reasons.cancel.map((r) => [r.key, nameOf(view, r)]));
  const row: od.OrderRow = {
    id: o.id,
    number: o.number,
    status: o.status,
    version: o.version,
    placedAt: o.placedAt,
    customerName: o.customerName,
    phone: o.phone,
    itemCount: detail.items.length,
    totalMinor: o.totalMinor,
    dueMinor: detail.money.dueMinor,
    currency: o.currency,
    paymentMethod: o.paymentMethod,
    source: o.source,
    payment: detail.money.payment,
    holdReasonCode: o.holdReasonCode,
    cancelReasonCode: o.cancelReasonCode,
    cancelRequested: o.cancelRequested,
    cancelPending: o.cancelPending,
    customerWantsChange: o.customerWantsChange,
    inReview: o.inReview,
    flags: o.flags,
    internalFlags: o.internalFlags,
    orderGroupId: o.orderGroupId,
  };
  const chips = statusChips(view, row, x);
  const flags = flagChips(view, row, { holdReasons: holdName, flags: new Map(reasons.flags.map((f) => [f.key, nameOf(view, f)])) });
  const specs = commandSpecs(view, { ...o, paidMinor: detail.money.paidMinor + detail.money.walletAppliedMinor }, detail.allowed, perms, reasons);
  const active = detail.items.filter((i) => i.status === 'ACTIVE');
  const units = active.reduce((s, i) => s + i.quantity, 0);
  const n = (v: number) => formatNumber(v, view.locale);

  const totals: Row2[] = [
    { label: t(d, 'orders.tot.subtotal'), value: m(o.subtotalMinor) },
    ...(o.discountMinor ? [{ label: t(d, 'orders.tot.discount'), value: `− ${m(o.discountMinor)}` }] : []),
    { label: t(d, 'orders.tot.delivery'), value: o.deliveryChargeMinor ? m(o.deliveryChargeMinor) : t(d, 'orders.tot.free') },
    ...(o.walletAppliedMinor ? [{ label: t(d, 'orders.tot.wallet'), value: `− ${m(o.walletAppliedMinor)}` }] : []),
    { label: t(d, 'orders.tot.total'), value: m(o.totalMinor), strong: true },
    ...(detail.money.paidMinor ? [{ label: t(d, 'orders.tot.paid'), value: m(detail.money.paidMinor) }] : []),
    { label: t(d, o.paymentMethod === 'COD' ? 'orders.tot.dueCod' : 'orders.tot.due'), value: m(detail.money.dueMinor) },
  ];

  const c = history.counts;
  const histLine = !history.matchedBy || !c.orders ? t(d, 'orders.hist.new') : t(d, 'orders.hist.line', { n: n(c.orders), open: n(c.open), delivered: n(c.delivered), returned: n(c.returned), cancelled: n(c.cancelled) });
  const customer: Row2[] = [
    { label: t(d, 'orders.cust.name'), value: o.customerName ?? t(d, 'orders.list.none') },
    { label: t(d, 'orders.cust.phone'), value: phoneText(o.phone) || t(d, 'orders.list.none'), strong: true },
    ...(o.email ? [{ label: t(d, 'orders.cust.email'), value: o.email }] : []),
    { label: t(d, 'orders.cust.address'), value: o.shippingAddressText ?? t(d, 'orders.list.none') },
    ...(o.addressUnclear ? [{ label: t(d, 'orders.cust.check'), value: t(d, 'orders.cust.unclear') }] : []),
    ...(o.note ? [{ label: t(d, 'orders.cust.note'), value: o.note }] : []),
    { label: t(d, 'orders.cust.history'), value: histLine },
  ];

  const ship = detail.shipments[0];
  const shipState = ship?.status ?? 'NONE';
  const courier = {
    chip: chips.find((ch) => ch.icon === 'truck')!,
    rows: ship
      ? [
          { label: t(d, 'orders.courier.name'), value: x?.shipment?.courierName ?? t(d, 'orders.list.none') },
          { label: t(d, 'orders.courier.tracking'), value: ship.trackingCode ?? t(d, 'orders.list.none'), mono: true },
          { label: t(d, 'orders.courier.since'), value: dt.format(ship.createdAt) },
          ...(ship.cancelOutcome ? [{ label: t(d, 'orders.courier.cancelOutcome'), value: t(d, `orders.courier.outcome.${ship.cancelOutcome}`) }] : []),
        ]
      : [{ label: t(d, 'orders.courier.booking'), value: t(d, `orders.ship.${shipState}`) }],
  };

  const moneyRows = [
    ...detail.payments.map((p) => ({ title: t(d, 'orders.money.payment', { amount: m(p.amountMinor), method: p.method }), sub: t(d, `orders.money.pst.${p.status}`), at: dt.format(p.createdAt), tone: (p.status === 'PAID' ? 'ok' : 'line') as Tone })),
    ...detail.refundRequests.map((r) => ({ title: t(d, 'orders.money.refund', { amount: m(r.amountMinor) }), sub: t(d, `orders.money.rst.${r.status}`), at: dt.format(r.createdAt), tone: (r.status === 'COMPLETED' ? 'ok' : 'warn') as Tone })),
  ];

  const numbers = new Map(matchedRows.map((r) => [r.id, r]));
  const paidText = detail.money.paidMinor + detail.money.walletAppliedMinor > 0 ? m(detail.money.paidMinor + detail.money.walletAppliedMinor) : null;
  const reviews: ReviewCard[] = detail.reviews.map((r) => {
    const matched = r.matchedOrderIds.map((mid) => numbers.get(mid)).filter((v): v is NonNullable<typeof v> => !!v);
    return {
      id: r.id,
      open: r.status === 'OPEN',
      severity: r.severity ? t(d, `orders.review.sev.${r.severity}`) : '',
      matched: matched.map((mm) => ({ number: mm.number, href: orderHref(mm.id), status: t(d, `orders.st.${mm.status}`), tone: ORDER_TONE[mm.status] })),
      at: dt.format(r.createdAt),
      specs: r.status === 'OPEN' ? reviewSpecs(view, r.id, o.number, matched, perms, reasons, paidText) : [],
    };
  });

  const actor = (type: string, aid: string | null) => (type === 'STAFF' ? (aid && names[aid]) || t(d, 'orders.who.staff') : t(d, `orders.who.${type === 'CUSTOMER' ? 'customer' : 'system'}`));
  const timeline: TimelineItem[] = detail.timeline
    .map((e): TimelineItem => {
      const key = `orders.ev.${e.type.replace(/\./g, '_')}`;
      const named = t(d, key);
      const reason = e.reasonCode ? (holdName.get(e.reasonCode) ?? cancelName.get(e.reasonCode) ?? e.reasonCode) : null;
      const move = e.fromStatus && e.toStatus && e.fromStatus !== e.toStatus ? t(d, 'orders.ev.move', { from: t(d, `orders.st.${e.fromStatus}`), to: t(d, `orders.st.${e.toStatus}`) }) : null;
      const detailText = [move, reason, e.message].filter(Boolean).join(' · ');
      return { id: e.id, title: named === key ? e.type : named, detail: detailText || null, at: dt.format(e.createdAt), who: actor(e.actorType, e.actorId), tone: EVENT_TONE[e.type] ?? '' };
    })
    .reverse();

  const canNote = perms.has('orders.notes');
  const notes = detail.notes.map((nt) => ({ id: nt.id, body: nt.body, who: (nt.authorId && names[nt.authorId]) || nt.authorName || t(d, 'orders.who.staff'), at: dt.format(nt.createdAt), archiveUrl: canNote ? `${commandUrl(o.id, 'notes')}/${nt.id}/archive` : null }));

  const bands: OrderDetailView['bands'] = [];
  if (o.cancelPending) bands.push({ id: 'cancelPending', kind: 'stale', text: t(d, 'orders.band.cancelPending', { courier: x?.shipment?.courierName ?? t(d, 'orders.courier.theCourier') }), specs: specs.courier });
  if (o.cancelRequested && o.status !== 'CANCELLED') bands.push({ id: 'cancelRequest', kind: 'bad', text: t(d, 'orders.band.cancelRequest', { why: o.cancelRequestReason ?? t(d, 'orders.list.none'), age: o.cancelRequestedAt ? ageText(view, o.cancelRequestedAt, now) : '' }), specs: specs.request });
  if (o.status === 'ON_HOLD') bands.push({ id: 'hold', kind: 'off', text: t(d, 'orders.band.hold', { reason: (o.holdReasonCode && holdName.get(o.holdReasonCode)) || o.holdReasonCode || t(d, 'orders.list.none'), age: o.onHoldSince ? ageText(view, o.onHoldSince, now) : '' }) + (o.holdReason ? ` · ${o.holdReason}` : ''), specs: [] });
  if (o.status === 'CANCELLED') bands.push({ id: 'cancelled', kind: 'off', text: t(d, 'orders.band.cancelled', { reason: (o.cancelReasonCode && cancelName.get(o.cancelReasonCode)) || o.cancelReasonCode || t(d, 'orders.list.none') }) + (o.cancelNote ? ` · ${o.cancelNote}` : ''), specs: [] });
  if (o.booked && !o.cancelPending && od.OPEN_STATES.includes(o.status)) bands.push({ id: 'locked', kind: 'locked', text: t(d, 'orders.band.locked', { courier: x?.shipment?.courierName ?? '', tracking: ship?.trackingCode ?? '' }), specs: [] });

  return {
    id: o.id,
    number: o.number,
    name: o.customerName ?? '',
    total: m(o.totalMinor),
    placed: dt.format(o.placedAt),
    source: t(d, `orders.source.${o.source}`),
    chips,
    flags,
    items: detail.items.map((i) => ({
      id: i.id,
      name: i.productName,
      sub: [i.colourName, i.sizeLabel ? t(d, 'orders.items.size', { s: i.sizeLabel }) : null, t(d, 'orders.items.sku', { s: i.sku })].filter(Boolean).join(' · '),
      qty: `× ${n(i.quantity)}`,
      total: m(i.lineTotalMinor),
      removed: i.status !== 'ACTIVE',
    })),
    units: t(d, units === 1 ? 'orders.list.pc' : 'orders.list.pcs', { n: n(units) }),
    totals,
    customer,
    history: {
      line: histLine,
      recent: history.recent.map((h) => ({ number: h.number, href: orderHref(h.id), status: t(d, `orders.st.${h.status}`), tone: ORDER_TONE[h.status], total: formatMoney(h.totalMinor, moneyOf(h.currency, view.locale)), placed: dt.format(h.placedAt) })),
    },
    courier,
    money: { chip: chips.find((ch) => ch.icon === 'wallet')!, rows: moneyRows, empty: t(d, o.paymentMethod === 'COD' ? 'orders.money.codNone' : 'orders.money.none') },
    reviews,
    notes,
    timeline,
    bands,
    primary: specs.primary,
    more: specs.more,
    canNote,
    noteMax,
    noteUrl: commandUrl(o.id, 'notes'),
  };
}

