// PR 148 — the order journey's rules without a database (BACKEND-ARCHITECTURE §6.5.6, §8.8): which order event starts
// which step, when a step's message is due (now, minutes later, or at a time of day some days later, in the store's
// time zone), the quiet hours, which steps count against the caps, whether a delayed step still fits the order when its
// time comes, the no-double-send key, and the words: a template's `{tokens}` filled in, the amount always the amount
// still due (SIM-F-001) and never shown for a fully paid order. PR 546 (SIM-F-013): a cancellation says why in plain
// words (`{cancelReason}`), and a duplicate names the order that goes ahead (`{keptOrderNumber}`, `{keptOrderLink}`).
// PR 542: an advance request from the order is its own message (`advanceRequest`), with `{advanceAmount}` and `{payLink}`.
// PR 148 follow-up (SIM-F-052/F-053): the refund paid (`{refundAmount}`), the exchange approved (`{exchangeOrderNumber}`,
// `{exchangeAmountLine}`), a failed delivery try and the late apology start their own notices.
import { phoneNormalizeBD } from '@extas/delivery/phone';
import type { Journey, JourneyStep, JourneyStepConfig, MessageChannel } from '@extas/settings';

export type { Journey, JourneyStep, JourneyStepConfig, MessageChannel };

/** An order timeline row as the planner reads it. */
export interface TimelineEvent {
  id: string;
  orderId: string;
  type: string;
  toStatus: string | null;
  createdAt: Date;
  /** PR 542: the row's data (an advance request names its channels there). */
  data?: unknown;
}

/**
 * PR 542 — an advance a person asked for from the order (or the owner's auto option): not a journey step (it follows a
 * press of Send, never the journey's switches or caps). The order service's `order.awaitAdvance` row with
 * `data.request` and its `order.advanceResend` row ("Send again") name the channels; each becomes one message with the
 * amount and the pay link (`{advanceAmount}`, `{payLink}`), keyed by that row so a "Send again" goes again.
 */
export const ADVANCE_REQUEST = 'advanceRequest';
export const ADVANCE_RESEND_EVENT = 'order.advanceResend';

const dataOf = (e: Pick<TimelineEvent, 'data'>): Record<string, unknown> => (e.data && typeof e.data === 'object' && !Array.isArray(e.data) ? (e.data as Record<string, unknown>) : {});

/** Whether a timeline row is a person's (or the auto option's) advance request or its "Send again". */
export const isAdvanceRequest = (e: Pick<TimelineEvent, 'type' | 'data'>): boolean =>
  e.type === ADVANCE_RESEND_EVENT || (e.type === 'order.awaitAdvance' && dataOf(e).request === true);

/** The message channels an advance request asked for (a call is the call queue's, never a message). */
export function advanceChannelsOf(e: Pick<TimelineEvent, 'type' | 'data'>): ('SMS' | 'WHATSAPP')[] {
  if (!isAdvanceRequest(e)) return [];
  const c = dataOf(e).channels;
  return Array.isArray(c) ? (['SMS', 'WHATSAPP'] as const).filter((x) => c.includes(x)) : [];
}

/** The no-double-send key of one advance request's message on one channel (each press is its own). */
export const advanceDedupeKey = (orderId: string, eventId: string, channel: string): string => `order:${orderId}:${ADVANCE_REQUEST}:${eventId}:${channel}`;

/**
 * S08 writes this timeline type when the courier reports the parcel out for delivery (a courier status, not an order
 * status); until then the out-for-delivery and delivery-day steps have nothing to start them.
 */
export const OUT_FOR_DELIVERY_EVENT = 'shipment.outForDelivery';

/** Follow-up 287: the timeline row of a refused cancel request (the order's status does not change). */
export const CANCEL_REFUSED_EVENT = 'order.refuseCancelRequest';

/**
 * PR 148 follow-up (SIM-F-052/F-053) — the timeline rows that start the later notices: the refund paid out
 * (@extas/payments `refund.completed`, its `amountMinor`), an exchange approved (@extas/orders `exchange.approved`, its
 * `newOrderId`), and two the courier tracking writes (@extas/shipping): a failed delivery try and a parcel past its
 * promise. None of them changes the order's status.
 */
export const REFUND_DONE_EVENT = 'refund.completed';
export const EXCHANGE_APPROVED_EVENT = 'exchange.approved';
export const ATTEMPT_FAILED_EVENT = 'shipment.attemptFailed';
export const LATE_EVENT = 'shipment.late';
/** The timeline types (beside the status changes) that start a step; the planner reads only these. */
export const STEP_EVENT_TYPES = ['order.placed', OUT_FOR_DELIVERY_EVENT, CANCEL_REFUSED_EVENT, REFUND_DONE_EVENT, EXCHANGE_APPROVED_EVENT, ATTEMPT_FAILED_EVENT, LATE_EVENT] as const;

/** The steps an order event starts. */
export function stepsOf(e: Pick<TimelineEvent, 'type' | 'toStatus'>): JourneyStep[] {
  if (e.type === 'order.placed') return ['placed', 'selfConfirm'];
  if (e.type === OUT_FOR_DELIVERY_EVENT) return ['outForDelivery', 'deliveryDay'];
  if (e.type === CANCEL_REFUSED_EVENT) return ['cancelRefused'];
  if (e.type === REFUND_DONE_EVENT) return ['refunded'];
  if (e.type === EXCHANGE_APPROVED_EVENT) return ['exchangeApproved'];
  if (e.type === ATTEMPT_FAILED_EVENT) return ['attemptFailed'];
  if (e.type === LATE_EVENT) return ['lateApology'];
  switch (e.toStatus) {
    case 'CONFIRMED':
      return ['confirmed'];
    case 'PROCESSING':
    case 'PACKED':
      return ['packed'];
    // PR 184: the courier's pick-up (IN_TRANSIT) is the hand-over when nobody pressed it (the dedupe key sends each step once)
    case 'HANDED_OVER':
    case 'IN_TRANSIT':
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
    // PR 148 follow-up: like a refused cancel, a failed try or a late parcel says nothing once the order arrived, came
    // back or was cancelled
    case 'cancelRefused':
    case 'attemptFailed':
    case 'lateApology':
      return !DONE.includes(status) && !DELIVERED.includes(status);
    // the money went back, the exchange was approved: true whatever the order did since (a cancel, a return)
    case 'refunded':
    case 'exchangeApproved':
      return true;
    case 'onHold':
      return status === 'ON_HOLD';
    case 'advanceRequested':
    case ADVANCE_REQUEST:
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
/** PR 546 — the tokens of the order that goes ahead when a duplicate is cancelled: never filled with nothing either. */
export const KEPT_TOKENS: ReadonlySet<string> = new Set(['keptOrderNumber', 'keptOrderLink']);
/**
 * PR 542 — the advance asked (`{advanceAmount}`: what is still to pay of it, never shown once it is paid) and its pay
 * link (`{payLink}`: never filled with nothing).
 */
export const ADVANCE_TOKENS: ReadonlySet<string> = new Set(['advanceAmount', 'payLink']);

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
  /** PR 546 — a cancellation's reason in plain words in the message's language ('' = no words for that reason). */
  cancelReason?: string;
  /** PR 546 — the order that goes ahead when this one was cancelled as its duplicate (its number and its own page). */
  kept?: { number: string; link: string | null } | null;
  /** PR 542 — the advance still to pay (asked − paid) and its pay link, when the order waits for one. */
  advance?: { amountMinor: number; link: string | null } | null;
  /** PR 148 follow-up — the refund paid out, from its timeline row (the `refunded` notice). */
  refundMinor?: number | null;
  /** PR 148 follow-up — the exchange's new parcel: its order number and what the rider collects for it (0: nothing). */
  exchange?: { number: string; collectMinor: number } | null;
}

export type Rendered = { ok: true; text: string; subject: string | null } | { ok: false; reason: 'AMOUNT_RULE' | 'NO_LINK' | 'NO_KEPT_ORDER' | 'NO_EVENT' | 'UNKNOWN_TOKEN'; field: string };

/** PR 148 follow-up — the tokens that read the timeline row that started the message (never filled with nothing). */
export const EVENT_TOKENS: ReadonlySet<string> = new Set(['refundAmount', 'exchangeOrderNumber', 'exchangeAmountLine']);

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
    if (KEPT_TOKENS.has(t) && !v.kept) return { ok: false, reason: 'NO_KEPT_ORDER', field: t };
    if (t === 'keptOrderLink' && !v.kept?.link) return { ok: false, reason: 'NO_LINK', field: t };
    if (t === 'advanceAmount' && !(v.advance && v.advance.amountMinor > 0)) return { ok: false, reason: 'AMOUNT_RULE', field: t };
    if (t === 'payLink' && !v.advance?.link) return { ok: false, reason: 'NO_LINK', field: t };
    if (t === 'refundAmount' && !(v.refundMinor && v.refundMinor > 0)) return { ok: false, reason: 'NO_EVENT', field: t };
    if ((t === 'exchangeOrderNumber' || t === 'exchangeAmountLine') && !v.exchange) return { ok: false, reason: 'NO_EVENT', field: t };
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
    cancelReason: v.cancelReason ?? '',
    keptOrderNumber: v.kept?.number ?? '',
    keptOrderLink: v.kept?.link ?? '',
    advanceAmount: v.advance ? formatAmount(Math.max(0, v.advance.amountMinor), v.currency) : '',
    payLink: v.advance?.link ?? '',
    refundAmount: v.refundMinor ? formatAmount(v.refundMinor, v.currency) : '',
    exchangeOrderNumber: v.exchange?.number ?? '',
    // what the rider collects for the new parcel, in the amount line's words; nothing to collect: no line
    exchangeAmountLine: v.exchange && v.exchange.collectMinor > 0 ? fill(v.amountLine, { amount: formatAmount(v.exchange.collectMinor, v.currency) }) : '',
  };
  for (const t of all) if (!(t in vars)) return { ok: false, reason: 'UNKNOWN_TOKEN', field: t };
  return { ok: true, text: tidy(fill(body, vars)), subject: subject === null ? null : tidy(fill(subject, vars)) };
}

// ---- PR 291 · SMS parts ----

/** The GSM 03.38 basic set: one unit each in a plain SMS. */
const GSM_BASIC = new Set([...'@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà']);
/** The GSM extension table: two units each (an escape and the character). */
const GSM_EXTENDED = new Set([...'^{}\\[~]|€']);

export interface SmsParts {
  /** Needs the unicode form (Bengali, emoji …): 70 characters in one part, 67 in each of several. */
  unicode: boolean;
  /** Characters as the gateway counts them (an extension character is two in a plain SMS). */
  units: number;
  /** How many SMS parts the gateway sends (and charges) for it; 0 for an empty text. */
  parts: number;
  /** What one part holds in this form. */
  perPart: number;
}

/** How an SMS text is split into parts (each part is one SMS on the gateway's bill). */
export function smsParts(text: string): SmsParts {
  const chars = [...text];
  const unicode = chars.some((c) => !GSM_BASIC.has(c) && !GSM_EXTENDED.has(c));
  // in the unicode form a character outside the basic plane (an emoji) takes two units
  const units = unicode ? chars.reduce((n, c) => n + (c.codePointAt(0)! > 0xffff ? 2 : 1), 0) : chars.reduce((n, c) => n + (GSM_EXTENDED.has(c) ? 2 : 1), 0);
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  const parts = units === 0 ? 0 : units <= single ? 1 : Math.ceil(units / multi);
  return { unicode, units, parts, perPart: parts > 1 ? multi : single };
}

/** The shop's masking name, when the owner marked it approved and wants it used (else the gateway's own number). */
export function maskingSender(m: { senderName: string; state: string; useWhenApproved: boolean } | null): string | null {
  return m && m.state === 'approved' && m.useWhenApproved && m.senderName.trim() ? m.senderName.trim() : null;
}

/** An SMS's cost from the owner's part prices (null when that price is not known). */
export function smsCostMinor(parts: number, rates: { maskedMinor: number | null; nonMaskedMinor: number | null } | null, masked: boolean): number | null {
  const rate = rates ? (masked ? rates.maskedMinor : rates.nonMaskedMinor) : null;
  return rate === null ? null : rate * parts;
}

/**
 * The language of a message: always Bengali or English when the owner says so; "customer" (as shipped, PR 505 follow-up,
 * SIM-F-025/F-047) the language the customer ordered in (`orderLang`); otherwise, or when the order has none, the store's
 * own language (`bn-BD` → `bn`).
 */
export function messageLocale(setting: 'customer' | 'store' | 'bn' | 'en', storeLocale: string, orderLang?: string | null): 'bn' | 'en' {
  if (setting === 'bn' || setting === 'en') return setting;
  if (setting === 'customer' && (orderLang === 'bn' || orderLang === 'en')) return orderLang;
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

/** PR 542 — an advance's pay link on the shop, in the message's language (the shop serves Bengali under `/bn`). */
export const payLink = (host: string | null, token: string | null, lang: 'bn' | 'en'): string | null => (host && token ? `https://${host}${lang === 'bn' ? '/bn' : ''}/pay/${encodeURIComponent(token)}` : null);

/** PR 292 — a template's name with WhatsApp: its key in lower case, the dots as underscores (`order.placed` → `order_placed`). */
export const waTemplateName = (key: string): string =>
  key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .toLowerCase()
    .replace(/^_+|_+$/g, '')
    .slice(0, 512);

/** PR 292 — the body WhatsApp approves: each `{token}` in turn as {{1}}, {{2}} …, and the tokens in that order. */
export function metaBody(body: string): { text: string; tokens: string[] } {
  const tokens: string[] = [];
  const text = body.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (_m, k: string) => {
    tokens.push(k);
    return `{{${tokens.length}}}`;
  });
  return { text, tokens };
}

/** PR 292, 298 — a customer's reply as the shop reads it: Bengali digits as Western ones, spaces squeezed, upper case. */
export const replyWords = (text: string): string =>
  text
    .replace(/[০-৯]/g, (d) => String(d.charCodeAt(0) - 0x09e6))
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

/** PR 292 — a self-confirm answer in a reply ("1", " ১ ", "1." …), or null for anything else. */
export function selfConfirmAnswerOf(text: string): SelfConfirmAnswer | null {
  const m = /^([123])[.)!]?$/.exec(replyWords(text));
  return m ? (Number(m[1]) as SelfConfirmAnswer) : null;
}

/**
 * PR 292 — the values of an approved WhatsApp template, in the order `metaBody` numbered its tokens: each token filled
 * as the message would fill it. WhatsApp refuses an empty value, so a token with nothing to say is sent as a dash.
 */
export function templateValues(body: string, v: RenderInput): string[] {
  return tokensIn(body).map((tok) => {
    const r = render(`{${tok}}`, null, v);
    return r.ok && r.text ? r.text : '-';
  });
}

/** PR 292 — why WhatsApp would refuse a body for approval: a value first or last, two values side by side. */
export const WA_BODY_PROBLEMS = ['STARTS_WITH_VALUE', 'ENDS_WITH_VALUE', 'VALUES_TOUCH', 'TOO_LONG'] as const;
export type WaBodyProblem = (typeof WA_BODY_PROBLEMS)[number];

/** The provider's rules for a template body (Meta: at most 1,024 characters; no value at either end or next to another). */
export function waBodyProblems(body: string): WaBodyProblem[] {
  const text = metaBody(body).text.trim();
  const out: WaBodyProblem[] = [];
  if (/^\{\{\d+\}\}/.test(text)) out.push('STARTS_WITH_VALUE');
  if (/\{\{\d+\}\}[.!?।]?$/.test(text)) out.push('ENDS_WITH_VALUE');
  if (/\{\{\d+\}\}\s*\{\{\d+\}\}/.test(text)) out.push('VALUES_TOUCH');
  if ([...text].length > 1_024) out.push('TOO_LONG');
  return out;
}

// ---- PR 292, 505 · the sample order ----

/** The orders a preview is shown for: cash on delivery (all due), prepaid (nothing due) and part-paid (some due). */
export const SAMPLE_CASES = ['cod', 'prepaid', 'partPaid'] as const;
export type SampleCase = (typeof SAMPLE_CASES)[number];

/**
 * PR 292, 505 — the sample order a template's preview and its approval examples are filled with: sample data, never a
 * real customer (the amounts are only a sample's; nothing is charged or sent from them).
 */
export const SAMPLE_ORDER = {
  customerName: { bn: 'রহিম', en: 'Rahim' },
  senderName: { bn: 'করিম', en: 'Karim' },
  orderNumber: '100234',
  keptNumber: '100235',
  totalMinor: 249_000,
  paidMinor: { cod: 0, prepaid: 249_000, partPaid: 100_000 }, // hardcode-ok: a sample order's payments, never a price or a fee
  advanceMinor: 50_000,
  payToken: 'sample',
  // PR 148 follow-up: a sample refund and a sample exchange parcel (its number, and what its rider would collect)
  refundMinor: 120_000, // hardcode-ok: a sample refund for the preview, never a price or a fee
  exchangeNumber: '100236',
  exchangeCollectMinor: 10_000, // hardcode-ok: a sample exchange parcel's amount for the preview, never a fee
} as const;

export interface SampleSettings {
  storeName: string;
  /** The shop's address (null: links show as missing, as they would in a real message). */
  host: string | null;
  currency: string;
  amountLine: { bn: string; en: string };
  exactAmount: { due: { bn: string; en: string }; paid: { bn: string; en: string } } | null;
  /** A cancellation's reason in words (the first one the shop has), for `{cancelReason}`. */
  cancelReason?: { bn: string; en: string } | null;
}

/** The words a template is filled with for the sample order, in one language and one payment case. */
export function sampleInput(s: SampleSettings, lang: 'bn' | 'en', sample: SampleCase): RenderInput {
  const due = Math.max(0, SAMPLE_ORDER.totalMinor - SAMPLE_ORDER.paidMinor[sample]);
  return {
    storeName: s.storeName,
    customerName: SAMPLE_ORDER.customerName[lang],
    orderNumber: SAMPLE_ORDER.orderNumber,
    senderName: SAMPLE_ORDER.senderName[lang],
    currency: s.currency,
    dueMinor: due,
    link: orderLink(s.host, SAMPLE_ORDER.orderNumber),
    amountLine: s.amountLine[lang],
    exactAmount: s.exactAmount ? { due: s.exactAmount.due[lang], paid: s.exactAmount.paid[lang] } : null,
    cancelReason: s.cancelReason?.[lang] ?? '',
    kept: { number: SAMPLE_ORDER.keptNumber, link: orderLink(s.host, SAMPLE_ORDER.keptNumber) },
    advance: { amountMinor: SAMPLE_ORDER.advanceMinor, link: payLink(s.host, SAMPLE_ORDER.payToken, lang) },
    refundMinor: SAMPLE_ORDER.refundMinor,
    exchange: { number: SAMPLE_ORDER.exchangeNumber, collectMinor: SAMPLE_ORDER.exchangeCollectMinor },
  };
}

// ---- PR 148, 298 · phones and consent words ----

/** A phone for SMS and WhatsApp: a Bangladeshi number in any form, or any number already in +country form. */
export function phoneOf(s: string | null | undefined): string | null {
  if (!s) return null;
  const bd = phoneNormalizeBD(s);
  if (bd.ok) return bd.e164;
  const t = s.replace(/[\s-]/g, '');
  return /^\+[1-9]\d{7,14}$/.test(t) ? t : null;
}

/** PR 298 — a reply that is one of the stop or start words (any case; the whole reply, a final full stop allowed). */
export function consentWordOf(cfg: { stopWords: readonly string[]; startWords: readonly string[] }, text: string): 'stop' | 'start' | null {
  const w = replyWords(text).replace(/[.!।]+$/, '');
  if (!w) return null;
  if (cfg.stopWords.some((s) => replyWords(s) === w)) return 'stop';
  if (cfg.startWords.some((s) => replyWords(s) === w)) return 'start';
  return null;
}

// ---- PR 505 · the template editor ----

/**
 * The `{tokens}` a template may use: exactly what `render` fills (the default pack checks the same list, @extas/seed
 * `TEMPLATE_TOKENS`). A token outside it would go out as written, so the editor refuses it.
 */
export const MESSAGE_TOKENS = ['storeName', 'customerName', 'orderNumber', 'total', 'amountDue', 'amountLine', 'exactAmountLine', 'trackingLink', 'orderLink', 'senderName', 'cancelReason', 'keptOrderNumber', 'keptOrderLink', 'advanceAmount', 'payLink', 'refundAmount', 'exchangeOrderNumber', 'exchangeAmountLine'] as const;
export type MessageToken = (typeof MESSAGE_TOKENS)[number];

/** The longest body and subject a template keeps (the default pack's own limits). */
export const TEMPLATE_LIMITS = { body: 2_000, subject: 200 } as const;

/**
 * What the editor says about a template's words. EMPTY, UNKNOWN_TOKEN, NO_SUBJECT and TOO_LONG refuse a save; the rest
 * are warnings: NOT_BENGALI (a Bengali template with no Bengali letter: SIM-F-025, the journey half English),
 * AMOUNT_ON_PAID (`{total}` / `{amountDue}`: a fully paid order skips the whole message — `{amountLine}` drops only its
 * line, SIM-F-001) and LINK_PROMISE (a link the shop cannot make yet: the message is skipped, never sent with an empty
 * link, SIM-F-031). A WhatsApp template also gets its approval problems (`waBodyProblems`).
 */
export const TEMPLATE_PROBLEMS = ['EMPTY', 'UNKNOWN_TOKEN', 'NO_SUBJECT', 'TOO_LONG', 'NOT_BENGALI', 'AMOUNT_ON_PAID', 'LINK_PROMISE'] as const;
export type TemplateProblem = (typeof TEMPLATE_PROBLEMS)[number];
export const BLOCKING_PROBLEMS: ReadonlySet<TemplateProblem> = new Set(['EMPTY', 'UNKNOWN_TOKEN', 'NO_SUBJECT', 'TOO_LONG']);

const BENGALI_LETTER = /[ঀ-৿]/;
const LINKS_OF_SHOP: ReadonlySet<string> = new Set([...LINK_TOKENS, 'keptOrderLink', 'payLink', 'exactAmountLine']);

export interface TemplateWords {
  channel: MessageChannel;
  locale: string;
  body: string;
  subject: string | null;
}

/** The tokens of a template's words that `render` does not know. */
export const unknownTokens = (t: Pick<TemplateWords, 'body' | 'subject'>): string[] =>
  [...new Set([...tokensIn(t.body), ...tokensIn(t.subject ?? '')])].filter((k) => !(MESSAGE_TOKENS as readonly string[]).includes(k));

/** Everything the editor says about a template's words (`hasHost`: the shop's address is known, so links can be made). */
export function templateProblems(t: TemplateWords, hasHost: boolean): TemplateProblem[] {
  const out: TemplateProblem[] = [];
  const all = [...tokensIn(t.body), ...tokensIn(t.subject ?? '')];
  if (!t.body.trim()) out.push('EMPTY');
  if (unknownTokens(t).length) out.push('UNKNOWN_TOKEN');
  if (t.channel === 'EMAIL' && !t.subject?.trim()) out.push('NO_SUBJECT');
  if ([...t.body].length > TEMPLATE_LIMITS.body || [...(t.subject ?? '')].length > TEMPLATE_LIMITS.subject) out.push('TOO_LONG');
  const words = `${t.body} ${t.subject ?? ''}`.replace(/\{[A-Za-z][A-Za-z0-9]*\}/g, '');
  if (t.locale === 'bn' && t.body.trim() && !BENGALI_LETTER.test(words)) out.push('NOT_BENGALI');
  if (all.some((k) => AMOUNT_TOKENS.has(k))) out.push('AMOUNT_ON_PAID');
  if (!hasHost && all.some((k) => LINKS_OF_SHOP.has(k))) out.push('LINK_PROMISE');
  return out;
}

export type SamplePreview = { sample: SampleCase; ok: true; text: string; subject: string | null; smsParts: number | null } | { sample: SampleCase; ok: false; reason: string; field: string };

/** A template filled for each sample order (cash on delivery, prepaid, part-paid), as the engine would fill it. */
export function previewTemplate(t: TemplateWords, s: SampleSettings): SamplePreview[] {
  const lang = t.locale === 'en' ? 'en' : 'bn';
  return SAMPLE_CASES.map((sample): SamplePreview => {
    const r = render(t.body, t.channel === 'EMAIL' ? (t.subject ?? '') : null, sampleInput(s, lang, sample));
    return r.ok ? { sample, ok: true, text: r.text, subject: r.subject, smsParts: t.channel === 'SMS' ? smsParts(r.text).parts : null } : { sample, ok: false, reason: r.reason, field: r.field };
  });
}

/** Where a template is used: a journey step (with its channels and whether it is on), or another of the engine's messages. */
export interface TemplateUse {
  /** A journey step, `selfConfirmAnswer`, `advanceRequest`, `consentReply`, `autoReply` or `cancelDuplicate`. */
  use: string;
  channels: MessageChannel[];
  on: boolean;
}

export interface TemplateUseSettings {
  journey: Journey;
  duplicateTemplate: string;
  advance: { template: string; channels: { SMS: boolean; WHATSAPP: boolean } };
  consentTemplates: readonly string[];
  consentReplyOn: boolean;
  autoReply: { enabled: boolean; template: string };
}

const stepChannels = (s: JourneyStepConfig): MessageChannel[] => [...new Set<MessageChannel>([s.channel, ...(s.fallback !== 'NONE' ? [s.fallback] : []), ...(s.email ? (['EMAIL'] as const) : [])])];

/** Which message sends which template, on which channels (the template editor's "used by"). */
export function templateUses(c: TemplateUseSettings): Map<string, TemplateUse[]> {
  const out = new Map<string, TemplateUse[]>();
  const add = (key: string, u: TemplateUse) => out.set(key, [...(out.get(key) ?? []), u]);
  for (const [step, s] of Object.entries(c.journey) as [JourneyStep, JourneyStepConfig][]) add(s.template, { use: step, channels: stepChannels(s), on: s.on });
  const cancelled = c.journey.cancelled;
  add(c.duplicateTemplate, { use: 'cancelDuplicate', channels: stepChannels(cancelled), on: cancelled.on });
  const sc = c.journey.selfConfirm;
  for (const a of Object.values(SELF_CONFIRM_ANSWERS)) add(a.template, { use: SELF_CONFIRM_ANSWER, channels: stepChannels(sc), on: sc.on });
  const adv = (['SMS', 'WHATSAPP'] as const).filter((ch) => c.advance.channels[ch]);
  add(c.advance.template, { use: 'advanceRequest', channels: adv, on: adv.length > 0 });
  for (const k of c.consentTemplates) add(k, { use: 'consentReply', channels: ['SMS', 'WHATSAPP'], on: c.consentReplyOn });
  add(c.autoReply.template, { use: 'autoReply', channels: ['WHATSAPP'], on: c.autoReply.enabled });
  return out;
}

/** PR 505 — an auto-reply's no-repeat key: one per number in each window of `hours` (counted from the epoch). */
export const autoReplyKey = (phone: string, at: Date, hours: number): string => `autoReply:${phone}:${Math.floor(at.getTime() / (Math.max(1, hours) * 3_600_000))}`;

/** PR 505 — is `at` inside the shop's open hours (in its time zone)? `open` = `close` never happens (the setting refuses it). */
export function withinHours(at: Date, timeZone: string, openHour: number, closeHour: number): boolean {
  const h = zoned(at, timeZone).h;
  return openHour < closeHour ? h >= openHour && h < closeHour : h >= openHour || h < closeHour;
}
