// PR 148 — the order journey's rules without a database (BACKEND-ARCHITECTURE §6.5.6, §8.8): which order event starts
// which step, when a step's message is due (now, minutes later, or at a time of day some days later, in the store's
// time zone), the quiet hours, which steps count against the caps, whether a delayed step still fits the order when its
// time comes, the no-double-send key, and the words: a template's `{tokens}` filled in, the amount always the amount
// still due (SIM-F-001) and never shown for a fully paid order.
import type { Journey, JourneyStep, JourneyStepConfig, MessageChannel } from '@extas/settings';

export type { Journey, JourneyStep, JourneyStepConfig, MessageChannel };

/** An order timeline row as the planner reads it. */
export interface TimelineEvent {
  id: string;
  orderId: string;
  type: string;
  toStatus: string | null;
  createdAt: Date;
}

/**
 * S08 writes this timeline type when the courier reports the parcel out for delivery (a courier status, not an order
 * status); until then the out-for-delivery and delivery-day steps have nothing to start them.
 */
export const OUT_FOR_DELIVERY_EVENT = 'shipment.outForDelivery';

/** The steps an order event starts. */
export function stepsOf(e: Pick<TimelineEvent, 'type' | 'toStatus'>): JourneyStep[] {
  if (e.type === 'order.placed') return ['placed', 'selfConfirm'];
  if (e.type === OUT_FOR_DELIVERY_EVENT) return ['outForDelivery', 'deliveryDay'];
  switch (e.toStatus) {
    case 'CONFIRMED':
      return ['confirmed'];
    case 'PROCESSING':
    case 'PACKED':
      return ['packed'];
    case 'HANDED_OVER':
      return ['booked', 'giftReceiver'];
    case 'DELIVERED':
    case 'PARTIALLY_DELIVERED':
      return ['delivered', 'day1Care', 'day3Review'];
    case 'CANCELLED':
      return ['cancelled'];
    case 'ON_HOLD':
      return ['onHold'];
    case 'AWAITING_ADVANCE':
      return ['advanceRequested'];
    default:
      return [];
  }
}

/** The order journey itself (received → delivered): these count against the caps per order (Doot D09). */
export const CAPPED_STEPS: ReadonlySet<JourneyStep> = new Set(['placed', 'selfConfirm', 'confirmed', 'packed', 'booked', 'outForDelivery', 'deliveryDay', 'delivered']);

/** Whether a step counts against the caps; the self-confirm only when it is the order's one WhatsApp (setting). */
export const isCapped = (step: string, selfConfirmCounts: boolean): boolean =>
  step === 'selfConfirm' ? selfConfirmCounts : CAPPED_STEPS.has(step as JourneyStep);

const DONE = ['CANCELLED', 'RETURNED'];
const DELIVERED = ['DELIVERED', 'PARTIALLY_DELIVERED'];

/** Whether a step still fits the order when its time comes (a delayed message never contradicts what happened since). */
export function stillFits(step: string, status: string): boolean {
  switch (step) {
    case 'placed':
      return status !== 'CANCELLED';
    case 'selfConfirm':
      return status === 'PLACED';
    case 'delivered':
    case 'day1Care':
    case 'day3Review':
      return DELIVERED.includes(status);
    case 'cancelled':
      return status === 'CANCELLED';
    case 'onHold':
      return status === 'ON_HOLD';
    case 'advanceRequested':
      return status === 'AWAITING_ADVANCE';
    default:
      return !DONE.includes(status);
  }
}

/** The no-double-send key of one step on one channel of one order (NotificationLog @@unique([storeId, dedupeKey])). */
export const dedupeKey = (orderId: string, step: string, channel: MessageChannel): string => `order:${orderId}:${step}:${channel}`;

// ---- time in the store's zone ----

interface Parts {
  y: number;
  m: number;
  d: number;
  h: number;
  mi: number;
}

/** The wall-clock date and time of an instant in a time zone. */
export function zoned(at: Date, timeZone: string): Parts {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour), mi: Number(p.minute) };
}

/** The instant a wall-clock time in a zone is (the zone's offset at that moment; twice for a change of offset). */
export function fromZoned(p: Parts, timeZone: string): Date {
  const wall = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
  let t = wall;
  for (let i = 0; i < 2; i++) {
    const z = zoned(new Date(t), timeZone);
    t = wall - (Date.UTC(z.y, z.m - 1, z.d, z.h, z.mi) - t);
  }
  return new Date(t);
}

const MINUTE = 60_000;

/** When a step's message is due after its event. "at" a time `days` later; a time already past on that day is the next day. */
export function dueAt(when: JourneyStepConfig['when'], eventAt: Date, timeZone: string): Date {
  if (when.kind === 'now') return eventAt;
  if (when.kind === 'after') return new Date(eventAt.getTime() + when.minutes * MINUTE);
  const z = zoned(eventAt, timeZone);
  const day = new Date(Date.UTC(z.y, z.m - 1, z.d + when.days));
  let at = fromZoned({ y: day.getUTCFullYear(), m: day.getUTCMonth() + 1, d: day.getUTCDate(), h: when.hour, mi: when.minute }, timeZone);
  if (at.getTime() < eventAt.getTime()) {
    const next = new Date(Date.UTC(z.y, z.m - 1, z.d + when.days + 1));
    at = fromZoned({ y: next.getUTCFullYear(), m: next.getUTCMonth() + 1, d: next.getUTCDate(), h: when.hour, mi: when.minute }, timeZone);
  }
  return at;
}

/** Quiet hours: null when `at` is outside them, else the moment they end. Hours may wrap midnight (22 → 8). */
export function quietUntil(q: { on: boolean; fromHour: number; toHour: number }, at: Date, timeZone: string): Date | null {
  if (!q.on) return null;
  const z = zoned(at, timeZone);
  const inside = q.fromHour < q.toHour ? z.h >= q.fromHour && z.h < q.toHour : z.h >= q.fromHour || z.h < q.toHour;
  if (!inside) return null;
  const nextDay = q.fromHour > q.toHour && z.h >= q.fromHour;
  const day = new Date(Date.UTC(z.y, z.m - 1, z.d + (nextDay ? 1 : 0)));
  return fromZoned({ y: day.getUTCFullYear(), m: day.getUTCMonth() + 1, d: day.getUTCDate(), h: q.toHour, mi: 0 }, timeZone);
}

/** The answer to a self-confirm reply: not a journey step of its own (it follows the customer's reply, never the caps). */
export const SELF_CONFIRM_ANSWER = 'selfConfirmAnswer';

/**
 * What each self-confirm reply means (CN-014 idea 5). 1 is his yes: it is written on the timeline for the team, the
 * order is never confirmed by it (the shop confirms). 2 and 3 put the order in the call queue; nothing is changed or
 * cancelled without a person. The template keys name the answer's words (default pack, editable).
 */
export const SELF_CONFIRM_ANSWERS = {
  1: { code: 'YES', template: 'order.selfConfirmed', callReason: null },
  2: { code: 'CHANGE', template: 'order.selfConfirmChange', callReason: 'SELF_CONFIRM_CHANGE' },
  3: { code: 'CANCEL', template: 'order.selfConfirmCancel', callReason: 'SELF_CONFIRM_CANCEL' },
} as const;
export type SelfConfirmAnswer = keyof typeof SELF_CONFIRM_ANSWERS;
export type SelfConfirmCode = (typeof SELF_CONFIRM_ANSWERS)[SelfConfirmAnswer]['code'];

/** The answer's template for a reply code (the reply's timeline row keeps the code). */
export const answerTemplate = (code: string | null): string | null => Object.values(SELF_CONFIRM_ANSWERS).find((a) => a.code === code)?.template ?? null;

/** Steps that never wait for the quiet hours: the customer has just acted and is looking at his phone. */
export const NEVER_QUIET: ReadonlySet<string> = new Set(['placed', 'selfConfirm', SELF_CONFIRM_ANSWER]);

// ---- the words ----

/** Money as a message writes it: the currency's symbol tight to the amount, grouping commas, Western digits. */
export function formatAmount(minor: number, currency: string): string {
  const major = minor / 100;
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: Number.isInteger(major) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(major);
}

export const tokensIn = (text: string): string[] => [...text.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g)].map((m) => m[1]!);

/** The tokens that print an amount: never filled for a fully paid order (SIM-F-001). `{total}` is read as the amount due. */
export const AMOUNT_TOKENS: ReadonlySet<string> = new Set(['amountDue', 'total']);
/** The tokens that print a link to the shop: never filled with nothing (a promise of a link must hold one, SIM-F-031). */
export const LINK_TOKENS: ReadonlySet<string> = new Set(['trackingLink', 'orderLink']);

export interface RenderInput {
  storeName: string;
  customerName: string;
  orderNumber: string;
  senderName: string;
  currency: string;
  /** Amount still to pay: total − wallet − paid. */
  dueMinor: number;
  /** The order's page on the shop, or null when the shop's address is not known yet. */
  link: string | null;
  /** The `{amountLine}` words in the message's language ({amount}). */
  amountLine: string;
  /** The exact-amount words (null while `account.track.exactAmount` is off): when money is due, and when it is paid. */
  exactAmount: { due: string; paid: string } | null;
}

export type Rendered = { ok: true; text: string; subject: string | null } | { ok: false; reason: 'AMOUNT_RULE' | 'NO_LINK' | 'UNKNOWN_TOKEN'; field: string };

const fill = (text: string, vars: Record<string, string>) => text.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (m, k: string) => vars[k] ?? m);
const tidy = (text: string) =>
  text
    .split('\n')
    .map((l) => l.replace(/[ \t]{2,}/g, ' ').replace(/\s+([.,!?।])/g, '$1').trim())
    .join('\n')
    .trim();

/**
 * Fills a template. A template that prints an amount on a fully paid order, or a link the shop cannot make yet, is
 * refused (the message is skipped with that reason) rather than sent with a wrong amount or an empty link.
 */
export function render(body: string, subject: string | null, v: RenderInput): Rendered {
  const all = [...tokensIn(body), ...tokensIn(subject ?? '')];
  for (const t of all) {
    if (AMOUNT_TOKENS.has(t) && v.dueMinor <= 0) return { ok: false, reason: 'AMOUNT_RULE', field: t };
    if (LINK_TOKENS.has(t) && !v.link) return { ok: false, reason: 'NO_LINK', field: t };
  }
  const amount = formatAmount(Math.max(0, v.dueMinor), v.currency);
  const exactWords = v.exactAmount && all.includes('exactAmountLine') ? (v.dueMinor > 0 ? v.exactAmount.due : v.exactAmount.paid) : null;
  if (exactWords && !v.link && tokensIn(exactWords).includes('link')) return { ok: false, reason: 'NO_LINK', field: 'exactAmountLine' };
  const exact = exactWords ? fill(exactWords, { amount, link: v.link ?? '' }) : '';
  const vars: Record<string, string> = {
    storeName: v.storeName,
    customerName: v.customerName,
    orderNumber: v.orderNumber,
    senderName: v.senderName,
    total: amount,
    amountDue: amount,
    // the exact-amount words say it more precisely; with both in one template only those are written
    amountLine: v.dueMinor > 0 && !exact ? fill(v.amountLine, { amount }) : '',
    exactAmountLine: exact,
    trackingLink: v.link ?? '',
    orderLink: v.link ?? '',
  };
  for (const t of all) if (!(t in vars)) return { ok: false, reason: 'UNKNOWN_TOKEN', field: t };
  return { ok: true, text: tidy(fill(body, vars)), subject: subject === null ? null : tidy(fill(subject, vars)) };
}

/** The language of a message: the setting, or the store's own language (`bn-BD` → `bn`). */
export function messageLocale(setting: 'store' | 'bn' | 'en', storeLocale: string): 'bn' | 'en' {
  if (setting !== 'store') return setting;
  return storeLocale.toLowerCase().startsWith('bn') ? 'bn' : 'en';
}

/** Which orders a step is for: cash on delivery, prepaid, or all. */
export function audienceFits(who: JourneyStepConfig['who'], paymentMethod: string | null): boolean {
  if (who === 'all') return true;
  const cod = paymentMethod === 'COD';
  return who === 'cod' ? cod : !cod;
}

/** The order's own page on the shop, from the shop's address (a host name). */
export const orderLink = (host: string | null, number: string): string | null => (host ? `https://${host}/account/orders/${encodeURIComponent(number)}` : null);
