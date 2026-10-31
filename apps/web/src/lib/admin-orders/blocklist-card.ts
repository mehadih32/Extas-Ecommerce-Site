// S06 · PR 162 — the words and the screen of the "Blocklist" card on Orders › Risk rules (under the Advance request card),
// and the timeline line of a marked order. Worked out on the server in the admin's language (the phone shown the local
// way, the dates in the shop's time zone) and handed to the client card; the API checks every value again. Listing a
// number never cancels an order or tells the customer: while the switch is on, a listed number's new order is marked,
// or held for a person to decide.
import type { BlocklistView, BlockRow } from '@extas/orders';
import type { RiskBlocklist, RiskBlocklistEffect } from '@extas/settings';
import type { AdminView } from '../admin-page';
import { t } from '../i18n';
import { phoneText } from './list';
import { orderHref } from './model';
import { BLOCKLIST_EFFECTS } from './blocklist-draft';

// the card's client-safe draft rules live in blocklist-draft.ts (this file reads the order lists' server helpers)
export { BLOCKLIST_EFFECTS, blocklistDraftProblem, sameBlocklist } from './blocklist-draft';

export interface BlocklistCardTexts {
  h: string;
  d: string;
  master: string;
  masterHelp: string;
  offNote: string;
  onOrder: string;
  on: Record<RiskBlocklistEffect, string>;
  reason: string;
  reasonHelp: string;
  never: string;
  addH: string;
  phone: string;
  phonePh: string;
  why: string;
  whyPh: string;
  whyHelp: string;
  add: string;
  adding: string;
  added: string;
  activeH: string;
  none: string;
  by: string;
  fromOrder: string;
  identity: string;
  undo: string;
  undoWhy: string;
  undoOk: string;
  undone: string;
  undoneH: string;
  undoneBy: string;
  cancel: string;
  save: string;
  saving: string;
  saved: string;
  unsaved: string;
  discard: string;
  readOnly: string;
  noBlock: string;
  err: Record<string, string>;
}


const ERRORS = ['INVALID_INPUT', 'ALREADY_LISTED', 'NOTHING_CHANGED', 'NOT_FOUND', 'FORBIDDEN', 'UNAUTHENTICATED', 'network', 'other'] as const;

export function blocklistCardTexts(view: AdminView): BlocklistCardTexts {
  const d = view.dict;
  const k = (x: string, v?: Record<string, string>) => t(d, `orders.rr.bl.${x}`, v);
  const r = (x: string) => t(d, `orders.rr.${x}`);
  return {
    h: k('h'),
    d: k('d'),
    master: k('master'),
    masterHelp: k('masterHelp'),
    offNote: k('offNote'),
    onOrder: k('onOrder'),
    on: Object.fromEntries(BLOCKLIST_EFFECTS.map((e) => [e, k(`on.${e}`)])) as Record<RiskBlocklistEffect, string>,
    reason: r('reason'),
    reasonHelp: k('reasonHelp'),
    never: k('never'),
    addH: k('addH'),
    phone: k('phone'),
    phonePh: k('phonePh'),
    why: k('why'),
    whyPh: k('whyPh'),
    whyHelp: k('whyHelp', { min: '{min}' }),
    add: k('add'),
    adding: k('adding'),
    added: k('added'),
    activeH: k('activeH', { n: '{n}' }),
    none: k('none'),
    by: k('by', { who: '{who}', when: '{when}' }),
    fromOrder: k('fromOrder', { n: '{n}' }),
    identity: k('identity'),
    undo: k('undo'),
    undoWhy: k('undoWhy'),
    undoOk: k('undoOk'),
    undone: k('undone'),
    undoneH: k('undoneH', { n: '{n}' }),
    undoneBy: k('undoneBy', { who: '{who}', when: '{when}', why: '{why}' }),
    cancel: k('cancel'),
    save: r('save'),
    saving: r('saving'),
    saved: r('saved'),
    unsaved: r('unsaved'),
    discard: r('discard'),
    readOnly: k('readOnly'),
    noBlock: k('noBlock'),
    err: Object.fromEntries(ERRORS.map((e) => [e, k(`err.${e}`)])),
  };
}

export interface BlocklistRowScreen {
  id: string;
  phone: string;
  reason: string;
  who: string;
  when: string;
  order: { number: string; href: string } | null;
  identity: boolean;
  undoneWho: string | null;
  undoneWhen: string | null;
  undoReason: string | null;
}

export interface BlocklistCardScreen {
  value: RiskBlocklist;
  reasons: { key: string; name: string }[];
  active: BlocklistRowScreen[];
  undone: BlocklistRowScreen[];
  /** The shortest and longest reason (the API checks them again). */
  reasonLimits: { min: number; max: number };
}

/** The screen's data from the order service's view, in the admin's language. */
export function blocklistCardScreen(view: AdminView, v: BlocklistView): BlocklistCardScreen {
  const bn = view.lang === 'bn';
  const dt = new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: view.timeZone, numberingSystem: 'latn' });
  const someone = t(view.dict, 'orders.who.staff');
  const row = (r: BlockRow): BlocklistRowScreen => ({
    id: r.id,
    phone: phoneText(r.phone) || r.phone,
    reason: r.reason,
    who: r.blockedBy ?? someone,
    when: dt.format(new Date(r.blockedAt)),
    order: r.orderId && r.orderNumber ? { number: r.orderNumber, href: orderHref(r.orderId) } : null,
    identity: r.identity,
    undoneWho: r.undoneAt ? (r.undoneBy ?? someone) : null,
    undoneWhen: r.undoneAt ? dt.format(new Date(r.undoneAt)) : null,
    undoReason: r.undoReason,
  });
  return { value: v.value, reasons: v.holdReasons.map((r) => ({ key: r.key, name: bn ? r.bn : r.en })), active: v.active.map(row), undone: v.undone.map(row), reasonLimits: v.reasonLimits };
}



/** The timeline line of a marked order: why the number was listed, whether it was the same person, and the hold. */
export function blocklistSummary(view: AdminView, data: unknown): string | null {
  const x = (data ?? {}) as { via?: unknown; reason?: unknown; hold?: unknown };
  const d = view.dict;
  const parts: string[] = [];
  if (typeof x.reason === 'string' && x.reason) parts.push(t(d, 'orders.ev.blocklistWhy', { why: x.reason }));
  if (x.via === 'identity') parts.push(t(d, 'orders.ev.blocklistIdentity'));
  if (x.hold === 'held') parts.push(t(d, 'orders.ev.blocklistHeld'));
  else if (typeof x.hold === 'string' && x.hold) parts.push(t(d, 'orders.ev.blocklistNotHeld'));
  return parts.length ? parts.join(' · ') : null;
}
