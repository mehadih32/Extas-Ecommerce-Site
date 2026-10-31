// PR 141 — ORD-07 one order for the admin on the server (docs/BACKEND-ARCHITECTURE.md §5.3, demo V12.3
// #/admin/orders/:id): everything the page draws, read through @extas/orders with the person's keys (getOrder, the
// row's courier and return/refund facts, the customer's history by account or phone, the staff names of the
// timeline), and the command buttons: only a command the order service says is open now (`allowed`) AND the person's
// keys allow, each with its "what will happen" lines and the fields it needs. Nothing moves money, changes a price, a
// discount or COD, or blocks anyone; a paid order's cancel says it records a refund REQUEST for the owner, nothing more.
import type { PermissionKey } from '@extas/auth';
import * as od from '@extas/orders';
import { openCheckOf, returnReasonOf } from '@extas/shipping';
import { targetOf, type OrderCommand, type OrderState } from '@extas/orders/pure';
import { formatMoney, formatNumber, moneyOf } from '@/components/admin/products/model';
import type { AdminView } from '../admin-page';
import { t } from '../i18n';
import { KNOWN_ERRORS, commandUrl, reviewUrl, type CommandId } from './commands';
import { ageText, flagChips, phoneText, statusChips, type Chip } from './list';
import { ORDER_TONE, invoiceHref, orderHref, type Tone } from './model';
import type { CommandSpec, CommandTexts, FieldOption, FieldSpec } from './spec';
import { alertExplainView, duplicateCheckSummary, type AlertExplainView } from './alert';
import { identitySummary } from './identity';
import { blocklistSummary } from './blocklist-card';
import { levelSummary, riskSummary } from './risk';
import { advanceBand, advanceSpecs, advanceSummary } from './advance';

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
  edit: 'orders.edit',
  twoSize: 'orders.edit',
  deliveryArea: 'orders.edit',
  riskAssess: 'orders.risk.decide',
  advanceRequest: 'orders.advance.request',
  advanceResend: 'orders.advance.request',
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
  edit: 'orders.edit',
  phone: 'orders.edit',
  deliveryArea: 'orders.edit',
  riskAssess: 'orders.risk.decide',
  advanceRequest: 'orders.advance.request',
  advanceResend: 'orders.advance.request',
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
  /** PR 541: "Possible duplicate" for a duplicate review, "Risk review · High risk" for one a risk section opened. */
  title: string;
  /** PR 541: why a risk section asked for a person (the signals' words); empty for a duplicate. */
  why: string;
  /** PR 541: "the decision is yours" under a risk review. */
  never: string | null;
  open: boolean;
  severity: string;
  matched: { number: string; href: string; status: string; tone: Tone }[];
  at: string;
  specs: CommandSpec[];
  /** PR 521: why the alert fired, what matched, what the riders wrote, his history and the options (one click opens it). */
  explain: AlertExplainView | null;
}

export interface OrderDetailView {
  id: string;
  number: string;
  /** The order's currency (the risk card writes its amounts in it). */
  currency: string;
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
  /** Follow-up 180: the invoice, for those with `orders.invoice` (null: no button). */
  invoice: string | null;
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

/** PR 142 — what the edit dialog starts from: the order's contact and lines as stored, and each line's choices now. */
export interface EditStart {
  customerName: string | null;
  phone: string | null;
  address: string | null;
  note: string | null;
  lines: { id: string; label: string; size: string | null; colour: string | null }[];
  choices: od.EditChoice[];
  /** Review R1 (M2): the store's switched-on bands, offered only while the checkout left the charge unsettled. */
  bands?: { id: string; label: string }[];
}

/** PR 142 — "Edit items & address" and "Correct phone (logged)" (demo V12.3 a2o-edit, a2o-phone): one route, two dialogs. */
export function editSpecs(view: AdminView, o: { id: string; number: string; version: number }, start: EditStart, reasons: od.ReasonLists): CommandSpec[] {
  const d = view.dict;
  const tt = (k: string, v?: Record<string, string>) => t(d, `orders.cmd.${k}`, v);
  const reason = (fallback: string): FieldSpec => ({ name: 'reasonKey', kind: 'select', label: t(d, 'orders.dlg.reason'), options: reasons.edit.map((r) => ({ value: r.key, label: nameOf(view, r), ...(r.noteRequired ? { noteRequired: true } : {}) })), value: reasons.edit.some((r) => r.key === fallback) ? fallback : undefined });
  const channel: FieldSpec = { name: 'channel', kind: 'select', label: t(d, 'orders.dlg.channel'), options: reasons.channels.map((c) => ({ value: c.key, label: nameOf(view, c) })) };
  const note: FieldSpec = { name: 'note', kind: 'textarea', label: t(d, 'orders.dlg.noteOptional'), labelNeeded: t(d, 'orders.dlg.note'), noteFor: 'reasonKey', maxLength: 2000, placeholder: t(d, 'orders.dlg.notePh') };
  const phone: FieldSpec = { name: 'phone', kind: 'text', label: t(d, 'orders.dlg.phone'), value: phoneText(start.phone) || '', maxLength: 40, required: true };
  const choice = new Map(start.choices.map((c) => [c.lineId, c]));
  const lineFields: FieldSpec[] = start.lines.map((l) => {
    const c = choice.get(l.id);
    const options = [
      { value: 'keep', label: t(d, 'orders.dlg.lineKeep', { size: [l.colour, l.size].filter(Boolean).join(' · ') || '—' }) },
      ...(c?.swaps ?? []).map((s) => ({ value: s.variantId, label: t(d, 'orders.dlg.lineTo', { size: [s.colour, s.size].filter(Boolean).join(' · ') }) })),
      ...(c && c.removeRefusal === null ? [{ value: 'remove', label: t(d, 'orders.dlg.lineRemove') }] : []),
    ];
    return { name: `line:${l.id}`, kind: 'select', label: l.label, options, value: 'keep' };
  });
  const base = (k: string, extra: Partial<CommandSpec>): CommandSpec => ({
    id: k,
    label: tt(`${k}.label`),
    url: commandUrl(o.id, 'edit'),
    version: o.version,
    title: tt(`${k}.title`, { n: o.number }),
    effects: [],
    fields: [],
    ok: tt(`${k}.ok`),
    okTone: 'pri',
    done: tt(`${k}.done`, { n: o.number }),
    ...extra,
  });
  return [
    base('edit', {
      icon: 'edit',
      effects: [t(d, 'orders.eff.editLog'), t(d, 'orders.eff.editMoney'), t(d, 'orders.eff.editArea'), t(d, 'orders.eff.editStock'), t(d, 'orders.eff.editPaid')],
      fields: [
        reason('customer-asked'),
        channel,
        { name: 'customerName', kind: 'text', label: t(d, 'orders.dlg.name'), value: start.customerName ?? '', maxLength: 120 },
        phone,
        { name: 'address', kind: 'textarea', label: t(d, 'orders.dlg.address'), value: start.address ?? '', maxLength: 500 },
        { name: 'deliveryNote', kind: 'textarea', label: t(d, 'orders.dlg.deliveryNote'), value: start.note ?? '', maxLength: 500 },
        ...lineFields,
        note,
      ],
    }),
    base('phone', { icon: 'phone', effects: [t(d, 'orders.eff.editLog'), t(d, 'orders.eff.phoneNext')], fields: [phone, reason('wrong-phone'), channel, note] }),
    // review R1 (M2): "Set delivery area" — the band (its own charge from Delivery) of an address the checkout could not settle
    ...(start.bands?.length
      ? [
          base('deliveryArea', {
            icon: 'truck',
            url: commandUrl(o.id, 'deliveryArea'),
            effects: [t(d, 'orders.eff.areaCharge'), t(d, 'orders.eff.areaCall'), t(d, 'orders.eff.editLog')],
            fields: [{ name: 'bandId', kind: 'select', label: t(d, 'orders.dlg.band'), options: start.bands.map((b) => ({ value: b.id, label: b.label })), required: true }, reason('address-detail'), channel, note],
          }),
        ]
      : []),
  ];
}

/** Every command button of one order: the primary ones, the bands', the "More actions" menu. */
export function commandSpecs(
  view: AdminView,
  o: { id: string; number: string; version: number; status: OrderState; holdFromStatus: OrderState | null; cancelRequested: boolean; cancelPending: boolean; booked: boolean; internalFlags: string[]; paidMinor: number; currency: string; phone?: string | null },
  allowed: readonly OrderCommand[],
  perms: ReadonlySet<string>,
  reasons: od.ReasonLists,
  editStart: EditStart | null = null,
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
  if (has('edit') && may(perms, 'edit') && editStart) more.push(...editSpecs(view, o, editStart, reasons));
  if (has('hold') && may(perms, 'hold')) more.push(base('hold', 'hold', { icon: 'clock', effects: [...to('hold'), t(d, 'orders.eff.holdStock')], fields: [{ name: 'reasonKey', kind: 'select', label: t(d, 'orders.dlg.reason'), options: opts(reasons.hold) }, note(false, 'reasonKey')] }));
  if (has('cancel') && !o.cancelRequested && may(perms, 'cancel'))
    more.push(base('cancel', 'cancel', { icon: 'x', tone: 'bad', effects: cancelFx, fields: [{ name: 'reasonCode', kind: 'select', label: t(d, 'orders.dlg.reason'), options: opts(reasons.cancel) }, note(false, 'reasonCode')], okTone: 'badf', doneRefund: tt('cancel.doneRefund', { n: '{n}' }) }));
  if (has('cancelAfterBooking') && may(perms, 'cancelAfterBooking'))
    more.push(base('cancelAfterBooking', 'cancelAfterBooking', { icon: 'uturn', tone: 'bad', effects: [t(d, 'orders.eff.cabParcel'), t(d, 'orders.eff.cabPending'), t(d, 'orders.eff.cabNext')], fields: [{ name: 'reasonCode', kind: 'select', label: t(d, 'orders.dlg.reason'), options: opts(reasons.cancel), value: reasons.cancel.some((r) => r.key === 'CUSTOMER_CHANGE_AFTER_BOOKING') ? 'CUSTOMER_CHANGE_AFTER_BOOKING' : undefined }, note(false, 'reasonCode')], okTone: 'badf' }));
  if (has('setFlags') && may(perms, 'flags') && reasons.flags.length)
    more.push(base('flags', 'flags', { icon: 'flag', fields: [{ name: 'flags', kind: 'checks', label: t(d, 'orders.dlg.flags'), options: reasons.flags.map((f) => ({ value: f.key, label: nameOf(view, f) })), value: o.internalFlags }] }));
  // PR 162: list this order's number on the blocklist with a reason (`risk.block`); this order itself is not touched
  if (o.phone && perms.has('risk.block'))
    more.push({
      ...base('flags', 'blockNumber', { icon: 'shield', effects: [t(d, 'orders.eff.blockList', { phone: phoneText(o.phone) || o.phone }), t(d, 'orders.eff.blockNext'), t(d, 'orders.eff.blockNever')] }),
      url: BLOCKLIST_URL,
      version: null,
      fixed: { orderId: o.id },
      fields: [{ name: 'reason', kind: 'textarea', label: t(d, 'orders.dlg.blockWhy'), required: true, maxLength: od.BLOCK_REASON_MAX, placeholder: t(d, 'orders.dlg.blockWhyPh') }],
    });
  return { primary, more, courier, request };
}

/**
 * The review's decisions (PR 145; PR 541 for a review a risk section opened, with its own words): each needs its own
 * key; decline cancels, so it needs the cancel key too. A risk review's hold starts on the owner's first reason (the
 * service asks for one); "One parcel" shows only when earlier orders matched.
 */
/**
 * PR 525 — the true-delivery check's three answers (only with `delivery.outcomes`): really delivered, came back with the
 * charge paid, came back. A return asks why from the owner's refusal list. Nothing moves money or changes COD.
 */
export function deliveryCheckSpecs(view: AdminView, checkId: string, number: string, perms: ReadonlySet<string>, reasons: od.ReasonLists, collected: string | null): CommandSpec[] {
  if (!perms.has('delivery.outcomes')) return [];
  const d = view.dict;
  const tt = (k: string) => t(d, `orders.check.${k}`, { n: number, amount: collected ?? t(d, 'orders.list.none') });
  const note: FieldSpec = { name: 'note', kind: 'textarea', label: t(d, 'orders.dlg.noteOptional'), labelNeeded: t(d, 'orders.dlg.note'), noteFor: 'refusalKey', maxLength: 500, placeholder: t(d, 'orders.dlg.notePh') };
  // the reason starts empty: a return recorded without one keeps a reason recorded earlier (PR 526), never a guess
  const why: FieldSpec = { name: 'refusalKey', kind: 'select', label: t(d, 'orders.dlg.reason'), options: [{ value: '', label: t(d, 'orders.check.notKnown') }, ...reasons.refusal.map((r) => ({ value: r.key, label: nameOf(view, r), ...(r.noteRequired ? { noteRequired: true } : {}) }))] };
  const spec = (k: 'delivered' | 'chargePaid' | 'returned', outcome: string, extra: Partial<CommandSpec>): CommandSpec => ({
    id: `check-${k}`,
    label: tt(`${k}.label`),
    url: `/api/admin/delivery/checks/${checkId}/resolve`,
    version: null,
    fixed: { outcome },
    title: tt(`${k}.title`),
    effects: [],
    fields: [note],
    ok: tt(`${k}.ok`),
    okTone: 'pri',
    done: tt(`${k}.done`),
    ...extra,
  });
  return [
    spec('delivered', 'DELIVERED', { tone: 'pri', effects: [tt('eff.delivered'), t(d, 'orders.check.eff.noMoney')], fields: [{ name: 'note', kind: 'textarea', label: t(d, 'orders.dlg.noteOptional'), maxLength: 500 }] }),
    spec('chargePaid', 'CHARGE_PAID_RETURN', { effects: [tt('eff.returned'), tt('eff.charge'), t(d, 'orders.check.eff.noMoney')], fields: [why, note] }),
    spec('returned', 'RETURNED', { tone: 'bad', okTone: 'badf', effects: [tt('eff.returned'), t(d, 'orders.check.eff.noMoney')], fields: [why, note] }),
  ];
}

/**
 * PR 526: "Why it came back" on a parcel that came back — a reason from the owner's list and the rider's words (started
 * from the courier's note), on its own key (`delivery.outcomes`). Nothing moves money.
 */
export function returnReasonSpecs(view: AdminView, shipmentId: string, number: string, perms: ReadonlySet<string>, reasons: od.ReasonLists, riderNote: string | null): CommandSpec[] {
  if (!perms.has('delivery.outcomes') || !reasons.refusal.length) return [];
  const d = view.dict;
  const tt = (k: string) => t(d, `orders.retReason.${k}`, { n: number });
  return [
    {
      id: 'return-reason',
      label: tt('label'),
      tone: 'pri',
      url: `/api/admin/delivery/parcels/${shipmentId}/return-reason`,
      version: null,
      title: tt('title'),
      effects: [tt('eff.saved'), t(d, 'orders.check.eff.noMoney')],
      fields: [
        // starts on "pick one", so a reason is always a person's choice, never the list's first line
        { name: 'reasonKey', kind: 'select', label: t(d, 'orders.dlg.reason'), required: true, options: [{ value: '', label: t(d, 'orders.dlg.pickReason') }, ...reasons.refusal.map((r) => ({ value: r.key, label: nameOf(view, r), ...(r.noteRequired ? { noteRequired: true } : {}) }))] },
        { name: 'note', kind: 'textarea', label: tt('note'), labelNeeded: tt('noteNeeded'), noteFor: 'reasonKey', maxLength: 500, placeholder: tt('notePh'), ...(riderNote ? { value: riderNote } : {}) },
      ],
      ok: tt('ok'),
      okTone: 'pri',
      done: tt('done'),
    },
  ];
}

export function reviewSpecs(view: AdminView, alertId: string, number: string, matched: { id: string; number: string }[], perms: ReadonlySet<string>, reasons: od.ReasonLists, paid: string | null, risk = false): CommandSpec[] {
  if (!perms.has('orders.risk.decide')) return [];
  const d = view.dict;
  const tt = (k: string) => t(d, `orders.${risk ? 'riskReview' : 'review'}.${k}`, { n: number });
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
  if (perms.has('orders.hold')) out.push(spec('hold', { effects: [t(d, 'orders.eff.to', { st: t(d, 'orders.st.ON_HOLD') })], fields: [{ name: 'holdReasonKey', kind: 'select', label: t(d, 'orders.dlg.reason'), options: reasons.hold.map((r) => ({ value: r.key, label: nameOf(view, r), ...(r.noteRequired ? { noteRequired: true } : {}) })), value: risk ? reasons.hold[0]?.key : reasons.hold.some((r) => r.key === 'possible-duplicate') ? 'possible-duplicate' : undefined }, { name: 'note', kind: 'textarea', label: t(d, 'orders.dlg.noteOptional'), labelNeeded: t(d, 'orders.dlg.note'), noteFor: 'holdReasonKey', maxLength: 2000 }] }));
  out.push(spec('ask', { effects: [t(d, 'orders.eff.reviewAsk')] }));
  if (perms.has('orders.merge') && matched.length) out.push(spec('merge', { effects: [t(d, 'orders.eff.merge')], fields: [{ name: 'mergeWith', kind: 'select', label: t(d, 'orders.dlg.mergeWith'), options: matched.map((m) => ({ value: m.id, label: m.number })) }, { name: 'note', kind: 'textarea', label: t(d, 'orders.dlg.noteOptional'), maxLength: 2000 }] }));
  if (perms.has('orders.cancel')) out.push(spec('decline', { tone: 'bad', okTone: 'badf', effects: [t(d, 'orders.eff.to', { st: t(d, 'orders.st.CANCELLED') }), ...(risk ? [t(d, 'orders.eff.reviewDecline')] : []), t(d, 'orders.eff.cancelStock'), ...(paid ? [t(d, 'orders.eff.refundReq', { amount: paid })] : [])] }));
  return out;
}

/** PR 162: where the order screen's "Add to blocklist" sends (the risk API; it checks `risk.block` again). */
const BLOCKLIST_URL = '/api/admin/risk/blocklist';

const EVENT_TONE: Readonly<Record<string, TimelineItem['tone']>> = {
  'order.cancel': 'bad',
  'order.courierCancelConfirmed': 'bad',
  'order.returned': 'bad',
  'shipment.outForDelivery': 'mute',
  'delivery.checkOpened': 'warn',
  'order.deliveryCorrected': 'bad',
  'return.reason': 'warn',
  'order.hold': 'warn',
  'order.cancelAfterBooking': 'warn',
  'order.requestCancel': 'warn',
  'order.duplicateCheck': 'warn',
  'order.riskSection': 'warn',
  'order.riskLevel': 'warn',
  'order.blocklistMatch': 'bad',
  'order.awaitAdvance': 'warn',
  'order.advanceResend': 'mute',
  'order.identityLinked': 'mute',
  'order.note': 'mute',
  'order.note.archived': 'mute',
  'order.setFlags': 'mute',
  'order.edit': 'warn',
  'order.twoSizeCheck': 'warn',
  'order.twoSizeAnswer': 'warn',
};

/** PR 146 — the two-size band's answers: keep all, or only one size (the other sizes' lines are taken out). */
export function twoSizeSpecs(view: AdminView, o: { id: string; number: string; version: number }, g: od.TwoSizeGroup, i: number, paid: boolean): CommandSpec[] {
  const d = view.dict;
  const all = g.sizes.map((s) => s.label).join(' + ');
  const note: FieldSpec = { name: 'note', kind: 'textarea', label: t(d, 'orders.dlg.noteOptional'), maxLength: 2000, placeholder: t(d, 'orders.dlg.notePh') };
  const close = t(d, 'orders.eff.twoSizeClose');
  const spec = (id: string, k: 'twoSizeAll' | 'twoSizeOne', keep: string, effects: string[], s = ''): CommandSpec => ({
    id,
    label: t(d, `orders.cmd.${k}.label`, { s }),
    tone: k === 'twoSizeAll' ? 'ghost' : '',
    url: commandUrl(o.id, 'twoSize'),
    version: o.version,
    fixed: { key: g.key, keep },
    title: t(d, `orders.cmd.${k}.title`, { n: o.number, s, product: g.product }),
    sub: `${g.product}${g.colour ? ` · ${g.colour}` : ''} · ${all}`,
    effects,
    fields: [note],
    ok: t(d, `orders.cmd.${k}.ok`),
    okTone: 'pri',
    done: t(d, `orders.cmd.${k}.done`, { n: o.number, s }),
  });
  return [
    spec(`twoSize-${i}-all`, 'twoSizeAll', 'all', [t(d, 'orders.eff.twoSizeAll'), close]),
    ...g.sizes.map((s) => {
      const others = g.sizes.filter((x) => x !== s).map((x) => x.label).join(' + ');
      return spec(`twoSize-${i}-${s.sizeId}`, 'twoSizeOne', s.sizeId, [t(d, 'orders.eff.twoSizeOut', { sizes: others }), t(d, 'orders.eff.twoSizeOffer'), ...(paid ? [t(d, 'orders.eff.editPaid')] : []), close], s.label);
    }),
  ];
}

/** PR 541 — a section's timeline line: "High risk · because: … · waits for a person · was Watch". */
export function sectionSummary(view: AdminView, data: unknown): string | null {
  const x = (data ?? {}) as { section?: string; previous?: string | null; because?: string[]; review?: boolean };
  if (!x.section) return null;
  const d = view.dict;
  const because = (x.because ?? []).map((k) => t(d, `orders.risk.sig.${k}`)).join(', ');
  return [
    t(d, `orders.section.${x.section}`),
    ...(because ? [t(d, 'orders.secNote.because', { why: because })] : []),
    ...(x.review ? [t(d, 'orders.secNote.review')] : []),
    ...(x.previous ? [t(d, 'orders.secNote.moved', { from: t(d, `orders.section.${x.previous}`) })] : []),
  ].join(' · ');
}

/** PR 146 — the two-size check's and answer's timeline line. */
export function twoSizeSummary(view: AdminView, type: string, data: unknown): string | null {
  const d = view.dict;
  const x = (data ?? {}) as { asked?: { product: string; sizes: { label: string }[] }[]; noted?: { product: string; sizes: { label: string }[] }[]; product?: string; sizes?: string[]; keep?: string; applied?: boolean; via?: string };
  const groups = (l: { product: string; sizes: { label: string }[] }[]) => l.map((g) => `${g.product} ${g.sizes.map((s) => s.label).join(' + ')}`).join('; ');
  if (type === 'order.twoSizeCheck')
    return [...(x.asked?.length ? [t(d, 'orders.ev.twoSizeAsked', { groups: groups(x.asked) })] : []), ...(x.noted?.length ? [t(d, 'orders.ev.twoSizeNoted', { groups: groups(x.noted) })] : [])].join(' · ') || null;
  return [
    t(d, 'orders.ev.twoSizeKeep', { product: x.product ?? '', sizes: (x.sizes ?? []).join(' + '), keep: x.keep === 'all' || !x.keep ? t(d, 'orders.ev.twoSizeEvery') : x.keep }),
    ...(x.applied === false ? [t(d, 'orders.ev.twoSizeTeam')] : []),
    ...(x.via === 'order-page' ? [t(d, 'orders.ev.editViaPage')] : []),
  ].join(' · ');
}

/** PR 142 — an edit's timeline line: each field and line before → after (the staff see exactly what changed). */
export function editSummary(view: AdminView, data: unknown): string | null {
  const x = (data ?? {}) as { fields?: { field: string; before: string | null; after: string | null }[]; lines?: { kind: string; label: string; toLabel?: string }[]; channel?: { en: string; bn: string } | null; via?: string };
  const d = view.dict;
  const show = (field: string, v: string | null) => (v ? (field === 'phone' ? phoneText(v) || v : v) : t(d, 'orders.list.none'));
  const parts = [
    ...(x.fields ?? []).map((f) => t(d, 'orders.ev.editField', { field: t(d, `orders.dlg.${f.field === 'customerName' ? 'name' : f.field}`), before: show(f.field, f.before), after: show(f.field, f.after) })),
    ...(x.lines ?? []).map((l) => (l.kind === 'remove' ? t(d, 'orders.ev.editRemoved', { line: l.label }) : t(d, 'orders.ev.editLine', { line: l.label, to: l.toLabel ?? '' }))),
    ...(x.channel ? [t(d, 'orders.ev.editVia', { via: nameOf(view, x.channel) })] : []),
    // PR 143: the customer's own edit from his order page
    ...(x.via === 'order-page' ? [t(d, 'orders.ev.editViaPage')] : []),
  ];
  return parts.length ? parts.join(' · ') : null;
}

/** PR 184: the courier's exception reason in words (a key the courier table does not know shows as itself). */
export function courierReason(view: AdminView, key: string): string {
  const k = `orders.courier.why.${key}`;
  const named = t(view.dict, k);
  return named === k ? key : named;
}

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
  const editable = detail.allowed.includes('edit') && perms.has('orders.edit');
  // PR 146: the two-size question, while it is open and the order may still change
  const askTwoSize = o.flags.includes('TWO_SIZES') && detail.allowed.includes('twoSizeAnswer') && perms.has('orders.edit');
  const [extras, history, reasons, names, matchedRows, noteMax, choices] = await Promise.all([
    od.listExtras(deps, who, [o.id]),
    od.orderHistory(deps, who, o.id, HISTORY_SHOWN),
    od.reasonLists(deps, who.storeId),
    od.staffNames(deps, who, [...detail.timeline.map((e) => (e.actorType === 'STAFF' ? e.actorId : null)), ...detail.notes.map((n) => n.authorId)]),
    od.orderNumbers(deps, who, matchedIds),
    deps.settings.value('orders.notes.maxChars', { storeId: who.storeId }) as Promise<number>,
    editable ? od.editChoices(deps, who, o.id) : Promise.resolve(null),
  ]);
  const twoSize = askTwoSize ? await od.twoSizeQuestions(deps, who, o.id) : [];
  // PR 525: an open true-delivery check (the courier said delivered, our records say it came back)
  const check = await openCheckOf(deps, who.storeId, o.id);
  // PR 526: why the parcel came back (its reason and the rider's note), once it did
  const back = await returnReasonOf(deps, who.storeId, o.id);
  // PR 521: each review explained (a reading aid: if one cannot be read, the card still shows everything else)
  const explained = perms.has('orders.risk.read')
    ? await Promise.all(detail.reviews.map((r) => od.alertSummary(deps, who, r.id).catch(() => null)))
    : detail.reviews.map(() => null);
  const x = extras[o.id];
  const holdName = new Map(reasons.hold.map((r) => [r.key, nameOf(view, r)]));
  const cancelName = new Map(reasons.cancel.map((r) => [r.key, nameOf(view, r)]));
  const editReason = new Map(reasons.edit.map((r) => [r.key, nameOf(view, r)]));
  const refusalName = new Map(reasons.refusal.map((r) => [r.key, nameOf(view, r)]));
  const ox = detail.order as unknown as { riskScore: number | null; riskBand: string | null; riskSection: string | null };
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
    riskScore: ox.riskScore ?? null,
    riskBand: ox.riskBand ?? null,
    riskSection: ox.riskSection ?? null,
  };
  const chips = statusChips(view, row, x);
  const flags = flagChips(view, row, { holdReasons: holdName, flags: new Map(reasons.flags.map((f) => [f.key, nameOf(view, f)])) });
  const editStart: EditStart | null = choices
    ? {
        customerName: o.customerName,
        phone: o.phone,
        address: o.shippingAddressText,
        note: o.note,
        lines: detail.items.filter((i) => i.status === 'ACTIVE').map((i) => ({ id: i.id, label: `${i.productName} × ${formatNumber(i.quantity, view.locale)}`, size: i.sizeLabel, colour: i.colourName })),
        choices,
        // review R1 (M2): an address or charge the checkout could not settle — the team sets the band after the call
        ...((detail.order as unknown as { chargeFixed?: boolean }).chargeFixed === false
          ? { bands: (await deps.db.deliveryBand.findMany({ where: { storeId: who.storeId, enabled: true, archivedAt: null }, orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }], select: { id: true, nameEn: true, nameBn: true, chargeMinor: true } })).map((b) => ({ id: b.id, label: `${view.locale.startsWith('bn') && b.nameBn ? b.nameBn : b.nameEn} · ${m(b.chargeMinor)}` })) }
          : {}),
      }
    : null;
  const specs = commandSpecs(view, { ...o, paidMinor: detail.money.paidMinor + detail.money.walletAppliedMinor }, detail.allowed, perms, reasons, editStart);
  // PR 542: "Request advance" (first when the risk level proposed one) and, while it waits, its band with "Send again"
  const adv = perms.has('orders.advance.request') || o.status === 'AWAITING_ADVANCE' ? await od.advanceRequestView(deps, who.storeId, o.id) : null;
  const advance = advanceSpecs(view, o, adv, detail.allowed, perms);
  if (advance.request) (adv?.proposed ? specs.primary : specs.more).push(advance.request);
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
          // PR 184: where the parcel is now, by the courier's last word (the order follows it through the order service)
          { label: t(d, 'orders.courier.now'), value: t(d, `orders.ship.${ship.status}`) + (ship.providerStatus ? ` · ${ship.providerStatus}` : ''), strong: true },
          ...(ship.exceptionKey ? [{ label: t(d, 'orders.courier.problem'), value: courierReason(view, ship.exceptionKey) }] : []),
          ...(ship.pickedAt ? [{ label: t(d, 'orders.courier.picked'), value: dt.format(ship.pickedAt) }] : []),
          ...(ship.deliveredAt ? [{ label: t(d, 'orders.courier.delivered'), value: dt.format(ship.deliveredAt) }] : []),
          ...(ship.returnedAt ? [{ label: t(d, 'orders.courier.returned'), value: dt.format(ship.returnedAt) }] : []),
          // PR 526: why it came back, and the rider's own words
          ...(back && back.shipmentId === ship.id
            ? [
                { label: t(d, 'orders.courier.whyBack'), value: back.reasonKey ? (refusalName.get(back.reasonKey) ?? back.reasonKey) : t(d, 'orders.courier.noReason') },
                ...(back.riderNote ? [{ label: t(d, 'orders.courier.riderNote'), value: back.riderNote }] : []),
              ]
            : []),
          { label: t(d, 'orders.courier.lastRead'), value: ship.lastTrackedAt ? dt.format(ship.lastTrackedAt) : t(d, 'orders.courier.notRead') },
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
  const reviews: ReviewCard[] = detail.reviews.map((r, i) => {
    const sum = explained[i];
    const matched = r.matchedOrderIds.map((mid) => numbers.get(mid)).filter((v): v is NonNullable<typeof v> => !!v);
    const why = r.because.map((k) => t(d, `orders.risk.sig.${k}`)).join(' · ');
    return {
      id: r.id,
      title: r.risk ? t(d, 'orders.riskReview.title', { section: t(d, `orders.section.${r.section}`) }) : t(d, 'orders.review.title'),
      why: r.risk && why ? t(d, 'orders.secNote.because', { why }) : '',
      never: r.risk ? t(d, 'orders.riskReview.never') : null,
      open: r.status === 'OPEN',
      severity: r.severity ? t(d, `orders.review.sev.${r.severity}`) : '',
      matched: matched.map((mm) => ({ number: mm.number, href: orderHref(mm.id), status: t(d, `orders.st.${mm.status}`), tone: ORDER_TONE[mm.status] })),
      at: dt.format(r.createdAt),
      specs: r.status === 'OPEN' ? reviewSpecs(view, r.id, o.number, matched, perms, reasons, paidText, r.risk) : [],
      explain: sum ? alertExplainView(view, sum, { money: (minor) => m(minor), date: (at) => dt.format(at) }) : null,
    };
  });

  const actor = (type: string, aid: string | null) => (type === 'STAFF' ? (aid && names[aid]) || t(d, 'orders.who.staff') : t(d, `orders.who.${type === 'CUSTOMER' ? 'customer' : type === 'COURIER' ? 'courier' : 'system'}`));
  // PR 161: a level's line names its band as the score stored it
  const scoredBands = detail.timeline.flatMap((e) => {
    const b = e.type === 'order.riskAssess' ? (e.data as { band?: { key?: unknown; en?: unknown; bn?: unknown } } | null)?.band : null;
    return b && typeof b.key === 'string' && typeof b.en === 'string' && typeof b.bn === 'string' ? [{ key: b.key, en: b.en, bn: b.bn }] : [];
  });
  const timeline: TimelineItem[] = detail.timeline
    .map((e): TimelineItem => {
      const key = `orders.ev.${e.type.replace(/\./g, '_')}`;
      const named = t(d, key);
      // PR 521: when the duplicate rules ran, their line replaces the bare reason code
      const ruled = e.type === 'order.duplicateCheck' ? duplicateCheckSummary(view, e.data) : null;
      const reason = e.type === 'order.riskAssess' || e.type === 'order.riskSection' || e.type === 'order.riskLevel' || e.type === 'order.awaitAdvance' || e.type === od.BLOCKLIST_EVENT || ruled ? null : e.reasonCode ? (holdName.get(e.reasonCode) ?? cancelName.get(e.reasonCode) ?? refusalName.get(e.reasonCode) ?? e.reasonCode) : null;
      const move = e.fromStatus && e.toStatus && e.fromStatus !== e.toStatus ? t(d, 'orders.ev.move', { from: t(d, `orders.st.${e.fromStatus}`), to: t(d, `orders.st.${e.toStatus}`) }) : null;
      const asked = e.type === 'order.awaitAdvance' || e.type === 'order.advanceResend' ? advanceSummary(view, e.type, e.data, o.currency) : null;
      const two = asked ?? (e.type === 'order.twoSizeCheck' || e.type === 'order.twoSizeAnswer' ? twoSizeSummary(view, e.type, e.data) : e.type === 'order.riskAssess' ? riskSummary(view, e.data) : e.type === 'order.riskSection' ? sectionSummary(view, e.data) : e.type === 'order.identityLinked' ? identitySummary(view, e.data) : e.type === 'order.riskLevel' ? levelSummary(view, e.data, scoredBands) : e.type === od.BLOCKLIST_EVENT ? blocklistSummary(view, e.data) : ruled);
      const detailText = [move, two, e.type === 'order.edit' ? (editReason.get(e.reasonCode ?? '') ?? (e.actorType === 'CUSTOMER' ? null : reason)) : reason, e.type === 'order.edit' ? editSummary(view, e.data) : null, e.message].filter(Boolean).join(' · ');
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
  twoSize.forEach((g, i) => bands.push({ id: `twoSize-${i}`, kind: 'stale', text: t(d, 'orders.band.twoSize', { product: `${g.product}${g.colour ? ` · ${g.colour}` : ''}`, sizes: g.sizes.map((s) => s.label).join(' + ') }), specs: twoSizeSpecs(view, o, g, i, !!paidText) }));
  const waits = advanceBand(view, adv, o.status, o.currency);
  if (waits) bands.push({ id: 'advance', kind: 'stale', text: waits, specs: advance.resend ? [advance.resend] : [] });
  if (check) {
    const signs = check.signals.map((sg) => t(d, `orders.check.sig.${sg}`)).join(' · ');
    const collected = check.collectedMinor !== null ? m(check.collectedMinor) : null;
    bands.push({ id: 'deliveryCheck', kind: 'bad', text: t(d, 'orders.band.deliveryCheck', { courier: x?.shipment?.courierName ?? t(d, 'orders.courier.theCourier'), signs }), specs: deliveryCheckSpecs(view, check.id, o.number, perms, reasons, collected) });
  }
  if (back && !back.reasonKey) {
    const asked = returnReasonSpecs(view, back.shipmentId, o.number, perms, reasons, back.riderNote);
    if (asked.length) bands.push({ id: 'returnReason', kind: 'stale', text: t(d, 'orders.band.returnReason', { courier: x?.shipment?.courierName ?? t(d, 'orders.courier.theCourier') }), specs: asked });
  }
  if (o.booked && !o.cancelPending && od.OPEN_STATES.includes(o.status)) bands.push({ id: 'locked', kind: 'locked', text: t(d, 'orders.band.locked', { courier: x?.shipment?.courierName ?? '', tracking: ship?.trackingCode ?? '' }), specs: [] });

  return {
    id: o.id,
    number: o.number,
    currency: o.currency,
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
    invoice: perms.has('orders.invoice') ? invoiceHref(o.number) : null,
    noteMax,
    noteUrl: commandUrl(o.id, 'notes'),
  };
}

