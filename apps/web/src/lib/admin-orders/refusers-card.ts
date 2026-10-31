// S06 · PR 163 — the words and the screen of the "Repeat refusers" card on Orders › Risk rules (under the Blocklist card),
// and the timeline line of an order that carries a number's terms. Worked out on the server in the admin's language (the
// phone the local way, the dates in the shop's time zone) and handed to the client card; the API checks every value
// again. The terms are the owner's choice per case and only become a proposal on a new order, which a person sends.
import type { RefuserTermRow, RefusersView } from '@extas/orders';
import type { RefuserTerms, RiskRefusers } from '@extas/settings';
import type { AdminView } from '../admin-page';
import { t } from '../i18n';
import { phoneText } from './list';
import { REFUSER_TERM_CHOICES } from './refusers-draft';

export interface RefusersCardTexts {
  h: string;
  d: string;
  master: string;
  masterHelp: string;
  offNote: string;
  min: string;
  minPh: string;
  minHelp: string;
  minBad: string;
  never: string;
  terms: Record<RefuserTerms, string>;
  termsShort: Record<RefuserTerms, string>;
  listH: string;
  listUnset: string;
  listNone: string;
  counts: string;
  last: string;
  now: string;
  choose: string;
  activeH: string;
  activeNone: string;
  chosenBy: string;
  identity: string;
  end: string;
  endWhy: string;
  endOk: string;
  ended: string;
  endedH: string;
  endedBy: string;
  otherH: string;
  phone: string;
  phonePh: string;
  termsLabel: string;
  why: string;
  whyPh: string;
  whyHelp: string;
  saveTerms: string;
  termsSaved: string;
  cancel: string;
  noDecide: string;
  save: string;
  saving: string;
  saved: string;
  unsaved: string;
  discard: string;
  readOnly: string;
  err: Record<string, string>;
}

const ERRORS = ['INVALID_INPUT', 'NOTHING_CHANGED', 'NOT_FOUND', 'FORBIDDEN', 'UNAUTHENTICATED', 'network', 'other'] as const;

export function refusersCardTexts(view: AdminView): RefusersCardTexts {
  const d = view.dict;
  const k = (x: string, v?: Record<string, string>) => t(d, `orders.rr.rf.${x}`, v);
  const r = (x: string) => t(d, `orders.rr.${x}`);
  const byTerms = (prefix: string) => Object.fromEntries(REFUSER_TERM_CHOICES.map((c) => [c, k(`${prefix}.${c}`)])) as Record<RefuserTerms, string>;
  return {
    h: k('h'),
    d: k('d'),
    master: k('master'),
    masterHelp: k('masterHelp'),
    offNote: k('offNote'),
    min: k('min'),
    minPh: k('minPh'),
    minHelp: k('minHelp'),
    minBad: k('minBad'),
    never: k('never'),
    terms: byTerms('terms'),
    termsShort: byTerms('short'),
    listH: k('listH', { n: '{n}' }),
    listUnset: k('listUnset'),
    listNone: k('listNone'),
    counts: k('counts', { refused: '{refused}', delivered: '{delivered}', orders: '{orders}' }),
    last: k('last', { when: '{when}' }),
    now: k('now', { terms: '{terms}' }),
    choose: k('choose'),
    activeH: k('activeH', { n: '{n}' }),
    activeNone: k('activeNone'),
    chosenBy: k('chosenBy', { who: '{who}', when: '{when}', n: '{n}' }),
    identity: k('identity'),
    end: k('end'),
    endWhy: k('endWhy'),
    endOk: k('endOk'),
    ended: k('ended'),
    endedH: k('endedH', { n: '{n}' }),
    endedBy: k('endedBy', { who: '{who}', when: '{when}', why: '{why}' }),
    otherH: k('otherH'),
    phone: t(d, 'orders.rr.bl.phone'),
    phonePh: t(d, 'orders.rr.bl.phonePh'),
    termsLabel: k('termsLabel'),
    why: t(d, 'orders.rr.bl.why'),
    whyPh: k('whyPh'),
    whyHelp: t(d, 'orders.rr.bl.whyHelp', { min: '{min}' }),
    saveTerms: k('saveTerms'),
    termsSaved: k('termsSaved'),
    cancel: t(d, 'orders.rr.bl.cancel'),
    noDecide: k('noDecide'),
    save: r('save'),
    saving: r('saving'),
    saved: r('saved'),
    unsaved: r('unsaved'),
    discard: r('discard'),
    readOnly: k('readOnly'),
    err: Object.fromEntries(ERRORS.map((e) => [e, k(`err.${e}`)])),
  };
}

export interface RefuserCandidateScreen {
  phone: string;
  /** The number as the form sends it back (E.164). */
  raw: string;
  refused: number;
  delivered: number;
  orders: number;
  last: string | null;
  terms: RefuserTerms | null;
}

export interface RefuserTermScreen {
  id: string;
  phone: string;
  terms: RefuserTerms;
  reason: string;
  refusedAtDecision: number;
  identity: boolean;
  who: string;
  when: string;
  endedWho: string | null;
  endedWhen: string | null;
  endReason: string | null;
}

export interface RefusersCardScreen {
  value: RiskRefusers;
  candidates: RefuserCandidateScreen[];
  active: RefuserTermScreen[];
  ended: RefuserTermScreen[];
  reasonLimits: { min: number; max: number };
}

/** The screen's data from the order service's view, in the admin's language. */
export function refusersCardScreen(view: AdminView, v: RefusersView): RefusersCardScreen {
  const dt = new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: view.timeZone, numberingSystem: 'latn' });
  const day = new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeZone: view.timeZone, numberingSystem: 'latn' });
  const someone = t(view.dict, 'orders.who.staff');
  const row = (r: RefuserTermRow): RefuserTermScreen => ({
    id: r.id,
    phone: phoneText(r.phone) || r.phone,
    terms: r.terms,
    reason: r.reason,
    refusedAtDecision: r.refusedAtDecision,
    identity: r.identity,
    who: r.decidedBy ?? someone,
    when: dt.format(new Date(r.decidedAt)),
    endedWho: r.endedAt ? (r.endedBy ?? someone) : null,
    endedWhen: r.endedAt ? dt.format(new Date(r.endedAt)) : null,
    endReason: r.endReason,
  });
  return {
    value: v.value,
    candidates: v.candidates.map((c) => ({ phone: phoneText(c.phone) || c.phone, raw: c.phone, refused: c.refused, delivered: c.delivered, orders: c.orders, last: c.lastAt ? day.format(new Date(c.lastAt)) : null, terms: c.terms })),
    active: v.active.map(row),
    ended: v.ended.map(row),
    reasonLimits: v.reasonLimits,
  };
}

/** The timeline line of an order that carries a number's terms: the terms, why, and whether it was the same person. */
export function refuserSummary(view: AdminView, data: unknown): string | null {
  const x = (data ?? {}) as { terms?: unknown; via?: unknown; reason?: unknown; refused?: unknown };
  const d = view.dict;
  const parts: string[] = [];
  if (typeof x.terms === 'string' && (REFUSER_TERM_CHOICES as readonly string[]).includes(x.terms)) parts.push(t(d, `orders.rr.rf.terms.${x.terms}`));
  if (typeof x.refused === 'number') parts.push(t(d, 'orders.ev.refuserCount', { n: String(x.refused) }));
  if (typeof x.reason === 'string' && x.reason) parts.push(t(d, 'orders.ev.refuserWhy', { why: x.reason }));
  if (x.via === 'identity') parts.push(t(d, 'orders.ev.blocklistIdentity'));
  parts.push(t(d, 'orders.ev.refuserProposal'));
  return parts.join(' · ');
}
