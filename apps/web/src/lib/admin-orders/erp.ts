// PR 610, 611 (CN-028, ERP contract v6) — the words of the ERP part of one order's admin page (/admin/orders/<id>):
// whether the ERP has the order (or why it waits: the account on hold, stock, a shop price, a short line), the account's
// hold band and warning, the ERP total and billing (the total and shop prices only for those who may read the ERP
// account), each piece with "From ERP return stock", a short line's decision (WAIT, REPLACE, CANCEL), the ERP's
// identification colour of a partial delivery, and the Partial delivery box. Pure: the server component reads the
// views (@extas/inventory erpOrderView, @extas/shipping partialBoxView) and draws what this returns.
import type { ErpOrderView } from '@extas/inventory';
import type { PartialBoxView } from '@extas/shipping';
import { formatMoney, moneyOf } from '@/components/admin/products/model';
import type { AdminView } from '../admin-page';
import { t } from '../i18n';

export type Tone = 'ok' | 'warn' | 'bad' | 'info';

export interface ErpPanelRow {
  label: string;
  value: string;
  mono?: boolean;
}

export interface ErpPanelLine {
  lineId: string;
  sku: string;
  price: string;
  shop: string | null;
  fromReturn: boolean;
  state: { text: string; tone: Tone };
  short: string | null;
  decided: string | null;
  /** The decision form shows (a short line and the person holds `orders.lines`). */
  decide: boolean;
}

export interface ErpPanelView {
  title: string;
  sub: string;
  chip: { text: string; tone: Tone };
  held: string | null;
  band: { text: string; tone: Tone } | null;
  rows: ErpPanelRow[];
  identification: { text: string; tone: Tone; code: string } | null;
  lines: ErpPanelLine[];
  linesTitle: string;
  fromReturnHelp: string;
  decideUrl: (lineId: string) => string;
  box: ErpBoxView | null;
}

export interface ErpBoxView {
  url: string;
  required: boolean;
  open: boolean;
  closed: string | null;
  courier: string | null;
  collected: string | null;
  lines: { lineId: string; sku: string; price: string; kept: boolean; fromReturn: boolean }[];
  /** The form's starting values in whole taka (the last saved box, else the courier's figure). */
  start: { kept: string[]; paid: number; discount: number; phone: boolean; note: string };
  last: string | null;
  digits: number;
}

const IDENT_TONE: Record<string, Tone> = { GREEN: 'ok', YELLOW: 'warn', ORANGE: 'bad' };
const STATE_TONE: Record<string, Tone> = { OPEN: 'ok', SHORT: 'warn', CANCELLED: 'bad', REMOVED: 'info' };

/** The panel's words; null when there is nothing to show (v5, or the order never went to the ERP). */
export function erpPanelView(view: AdminView, orderId: string, currency: string, erp: ErpOrderView | null, box: PartialBoxView | null): ErpPanelView | null {
  if (!erp) return null;
  const d = view.dict;
  const money = moneyOf(currency, view.locale);
  const amount = (minor: number | null) => (minor == null ? t(d, 'erpOrder.row.none') : formatMoney(minor, money));
  const dt = new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: view.timeZone, numberingSystem: 'latn' });
  const when = (iso: string | null) => (iso ? dt.format(new Date(iso)) : t(d, 'erpOrder.row.none'));
  const chip = erp.held ? { text: t(d, 'erpOrder.state.held'), tone: 'warn' as Tone } : erp.accepted ? { text: t(d, 'erpOrder.state.accepted'), tone: 'ok' as Tone } : erp.refusal ? { text: t(d, 'erpOrder.state.refused'), tone: 'bad' as Tone } : { text: t(d, 'erpOrder.state.waiting'), tone: 'info' as Tone };
  const h = erp.hold;
  const band = h?.onHold
    ? { text: t(d, h.checkoutPaused ? 'erpOrder.hold.on' : 'erpOrder.hold.onOpen'), tone: 'bad' as Tone }
    : h?.warn && h.holdsOn
      ? { text: t(d, 'erpOrder.hold.warn', { date: h.holdsOn, days: Math.max(0, h.daysLeft ?? 0) }), tone: 'warn' as Tone }
      : null;
  const rows: ErpPanelRow[] = [{ label: t(d, 'erpOrder.row.number'), value: erp.externalOrderId, mono: true }];
  if (erp.erpTotalMinor != null) rows.push({ label: t(d, 'erpOrder.row.total'), value: amount(erp.erpTotalMinor) });
  rows.push({ label: t(d, 'erpOrder.row.billed'), value: when(erp.billedAt) }, { label: t(d, 'erpOrder.row.picked'), value: when(erp.pickedUpAt) });
  if (erp.consignmentId) rows.push({ label: t(d, 'erpOrder.row.consignment'), value: erp.consignmentId, mono: true });
  const identification = erp.identification ? { code: erp.identification, text: t(d, `erpOrder.ident.${erp.identification}`), tone: IDENT_TONE[erp.identification] ?? 'info' } : null;
  const lines: ErpPanelLine[] = erp.lines.map((l) => ({
    lineId: l.lineId,
    sku: l.sku,
    price: amount(l.customerPriceMinor),
    shop: l.shopPriceMinor == null ? null : amount(l.shopPriceMinor),
    fromReturn: l.fromReturnStock,
    state: { text: t(d, `erpOrder.lines.state.${l.state}`), tone: STATE_TONE[l.state] ?? 'info' },
    short: l.state === 'SHORT' ? t(d, l.shortReason === 'RETURN_PIECE_FAILED_CHECK' ? 'erpOrder.lines.short.RETURN_PIECE_FAILED_CHECK' : 'erpOrder.lines.short.other') : null,
    decided: l.decision ? t(d, 'erpOrder.lines.decided', { action: `${t(d, `erpOrder.decide.${l.decision}`)}${l.decisionSku ? ` · ${l.decisionSku}` : ''}` }) : null,
    decide: erp.canDecide && l.state === 'SHORT',
  }));
  return {
    title: t(d, 'erpOrder.title'),
    sub: t(d, 'erpOrder.sub'),
    chip,
    held: erp.held ? t(d, `erpOrder.held.${erp.held.reason}`) : null,
    band,
    rows,
    identification,
    lines,
    linesTitle: t(d, 'erpOrder.lines.title'),
    fromReturnHelp: t(d, 'erpOrder.lines.fromReturnHelp'),
    decideUrl: (lineId) => `/api/admin/orders/${orderId}/erp/lines/${encodeURIComponent(lineId)}`,
    box: box ? boxView(view, orderId, box, money.digits, amount, when) : null,
  };
}

function boxView(view: AdminView, orderId: string, box: PartialBoxView, digits: number, amount: (m: number | null) => string, when: (iso: string | null) => string): ErpBoxView | null {
  // Shown once a courier result is in (and then kept, closed, after the hand-back).
  if (!box.open && !box.handedBack) return null;
  const unit = 10 ** digits;
  const m = box.mark;
  return {
    url: `/api/admin/orders/${orderId}/erp/partial-delivery`,
    required: box.required,
    open: box.open,
    closed: box.handedBack ? t(view.dict, 'erpOrder.box.closed') : null,
    courier: box.courierStatus,
    collected: box.collectedMinor == null ? null : amount(box.collectedMinor),
    lines: box.lines.filter((l) => l.state !== 'CANCELLED').map((l) => ({ lineId: l.lineId, sku: l.sku, price: amount(l.customerPriceMinor), kept: l.kept, fromReturn: l.fromReturnStock })),
    start: m
      ? { kept: m.keptLineIds, paid: Math.round(m.paidMinor / unit), discount: Math.round(m.discountGivenMinor / unit), phone: m.phoneConfirmed, note: m.note ?? '' }
      : { kept: [], paid: Math.round((box.collectedMinor ?? 0) / unit), discount: 0, phone: false, note: '' }, // hardcode-ok: an empty form starts with no discount (the staff type the real one)
    last: m ? t(view.dict, 'erpOrder.box.last', { at: when(m.at) }) : null,
    digits,
  };
}

/** The box's words for the browser form. */
export function boxTexts(view: AdminView) {
  const k = (s: string) => t(view.dict, `erpOrder.box.${s}`);
  return {
    title: k('title'),
    sub: k('sub'),
    required: k('required'),
    courier: k('courier'),
    collected: k('collected'),
    kept: k('kept'),
    paid: k('paid'),
    discount: k('discount'),
    discountHint: k('discountHint'),
    phone: k('phone'),
    note: k('note'),
    save: k('save'),
    saved: k('saved'),
    money: k('money'),
    fromReturn: t(view.dict, 'erpOrder.lines.fromReturn'),
    errors: errorTexts(view),
  };
}

/** The decision form's words for the browser. */
export function decideTexts(view: AdminView) {
  const k = (s: string) => t(view.dict, `erpOrder.decide.${s}`);
  return { title: k('title'), WAIT: k('WAIT'), REPLACE: k('REPLACE'), CANCEL: k('CANCEL'), sku: k('sku'), skuHint: k('skuHint'), reason: k('reason'), send: k('send'), done: k('done'), errors: errorTexts(view) };
}

function errorTexts(view: AdminView): Record<string, string> {
  return Object.fromEntries(['FORBIDDEN', 'INVALID_INPUT', 'CONFLICT', 'NOT_FOUND', 'NOT_ACTIVE', 'network', 'other'].map((c) => [c, t(view.dict, `erpOrder.err.${c}`)]));
}

export type BoxTexts = ReturnType<typeof boxTexts>;
export type DecideTexts = ReturnType<typeof decideTexts>;
