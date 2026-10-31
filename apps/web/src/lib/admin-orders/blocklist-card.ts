// S06 · PR 162 — the words and the screen of the "Blocklist" card on Orders › Risk rules (under the Advance request card),
// and the timeline line of a marked order. Worked out on the server in the admin's language (the phone shown the local
// way, the dates in the shop's time zone) and handed to the client card; the API checks every value again. Listing a
// number never cancels an order or tells the customer: while the switch is on, a listed number's new order is marked,
// or held for a person to decide.
// PR 523: the numbers proposed for the list (a person blocks one or says "Not now", each with a reason), the newest decided
// proposals, and "What we know" on every listing and proposal: the numbers, names and addresses given, and every product
// ordered with its date.
import type { BlocklistView, BlockProposalRow, BlockRow, RegisterFacts } from '@extas/orders';
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
  /** PR 523 */
  propH: string;
  propD: string;
  propNone: string;
  propFrom: string;
  propBlock: string;
  propBlockWhy: string;
  propBlockOk: string;
  propBlocked: string;
  propDismiss: string;
  propDismissWhy: string;
  propDismissOk: string;
  propDismissed: string;
  propNoBlock: string;
  decidedH: string;
  factsH: string;
  factsPhones: string;
  factsNames: string;
  factsAddresses: string;
  factsOrders: string;
  factsNone: string;
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
    propH: k('propH', { n: '{n}' }),
    propD: k('propD'),
    propNone: k('propNone'),
    propFrom: k('propFrom', { n: '{n}' }),
    propBlock: k('propBlock'),
    propBlockWhy: k('propBlockWhy'),
    propBlockOk: k('propBlockOk'),
    propBlocked: k('propBlocked'),
    propDismiss: k('propDismiss'),
    propDismissWhy: k('propDismissWhy'),
    propDismissOk: k('propDismissOk'),
    propDismissed: k('propDismissed'),
    propNoBlock: k('propNoBlock'),
    decidedH: k('decidedH', { n: '{n}' }),
    factsH: k('factsH'),
    factsPhones: k('factsPhones'),
    factsNames: k('factsNames'),
    factsAddresses: k('factsAddresses'),
    factsOrders: k('factsOrders'),
    factsNone: k('factsNone'),
  };
}

/** PR 523: "What we know", in the admin's language (the phones the local way, each order's date, status and products). */
export interface FactsScreen {
  phones: string[];
  names: string[];
  addresses: string[];
  orders: { key: string; head: string; products: string }[];
}

/** PR 523: one number proposed for the list, or one decided. */
export interface ProposalScreen {
  id: string;
  phone: string;
  counts: string;
  order: { number: string; href: string } | null;
  identity: boolean;
  when: string;
  /** The reason the Block box starts with (the counts; a person edits it). */
  draft: string;
  facts: FactsScreen;
  decided: string | null;
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
  /** PR 523: null for a listing made before the register kept details. */
  facts: FactsScreen | null;
}

export interface BlocklistCardScreen {
  value: RiskBlocklist;
  reasons: { key: string; name: string }[];
  active: BlocklistRowScreen[];
  undone: BlocklistRowScreen[];
  proposals: ProposalScreen[];
  decided: ProposalScreen[];
  /** The shortest and longest reason (the API checks them again). */
  reasonLimits: { min: number; max: number };
}

/** The screen's data from the order service's view, in the admin's language. */
export function blocklistCardScreen(view: AdminView, v: BlocklistView): BlocklistCardScreen {
  const bn = view.lang === 'bn';
  const dt = new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: view.timeZone, numberingSystem: 'latn' });
  const someone = t(view.dict, 'orders.who.staff');
  const day = new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeZone: view.timeZone, numberingSystem: 'latn' });
  const facts = (f: RegisterFacts): FactsScreen => ({
    phones: f.phones.map((p) => phoneText(p) || p),
    names: f.names,
    addresses: f.addresses,
    orders: f.orders.map((o) => ({
      key: o.number,
      head: `${day.format(new Date(o.placedAt))} · ${o.number} · ${t(view.dict, `orders.st.${o.status}`)}`,
      products: o.lines.map((l) => `${l.name}${[l.colour, l.size].filter(Boolean).length ? ` (${[l.colour, l.size].filter(Boolean).join(', ')})` : ''} ×${l.qty}`).join(', '),
    })),
  });
  const counts = (p: BlockProposalRow) => t(view.dict, 'orders.rr.bl.propCounts', { n: String(p.rejections), refused: String(p.refused), declined: String(p.declined) });
  const proposal = (p: BlockProposalRow): ProposalScreen => ({
    id: p.id,
    phone: phoneText(p.phone) || p.phone,
    counts: counts(p),
    order: p.lastOrderId && p.lastOrderNumber ? { number: p.lastOrderNumber, href: orderHref(p.lastOrderId) } : null,
    identity: p.identity,
    when: dt.format(new Date(p.proposedAt)),
    draft: counts(p),
    facts: facts(p.facts),
    decided: p.state === 'PROPOSED' ? null : t(view.dict, 'orders.rr.bl.decidedBy', { state: t(view.dict, `orders.rr.bl.st.${p.state}`), who: p.decidedBy ?? someone, when: p.decidedAt ? dt.format(new Date(p.decidedAt)) : '', why: p.decisionReason ?? '' }),
  });
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
    facts: r.facts ? facts(r.facts) : null,
  });
  return {
    value: v.value,
    reasons: v.holdReasons.map((r) => ({ key: r.key, name: bn ? r.bn : r.en })),
    active: v.active.map(row),
    undone: v.undone.map(row),
    proposals: v.proposals.map(proposal),
    decided: v.decidedProposals.map(proposal),
    reasonLimits: v.reasonLimits,
  };
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
