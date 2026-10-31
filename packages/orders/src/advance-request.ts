// S06 · PR 542 — the one-click advance request from the order (CN-018 (2); SIM-F-016). A person opens the order, presses
// "Request advance", checks what is asked (the delivery charge, a part, the whole amount, or "no cash on delivery for
// this order") and the ways (SMS, WhatsApp, a call), and presses Send. In ONE order command (`awaitAdvance`, its timeline
// row and audit row):
//   - the order waits for its advance (AWAITING_ADVANCE; the deadline `orders.advance.waitHours`, never a cancel);
//   - the pay link is made: a payment row for exactly that amount with a random token (`/pay/<token>`), on the payment
//     service of `orders.advanceRequest.provider` (its practice gateway until the owner's keys pass, A1.3); an earlier
//     link of the order that was never paid is closed (REPLACED), so one link is live;
//   - with "Call", one call task in the queue (an open one is reused).
// The SMS/WhatsApp itself is the message engine's (PR 148, @extas/messages): it reads this timeline row (`request`,
// `channels`) and sends the `order.advanceRequest` words with `{advanceAmount}` and `{payLink}` — and only because a
// person pressed Send here (or the owner turned on `orders.advanceRequest.auto`, which runs the same command after a risk
// level proposes an ask). "Send again" (`advanceResend`) sends the same link again, with a fresh try when the last one
// failed. When the money comes in, the payments service's hook moves the order back to PLACED (`recordAdvance`).
//
// Never here: moving money, a refund, changing COD, a price, a discount or a charge, or blocking anyone (rule 6).
import { randomBytes } from 'node:crypto';
import { ADVANCE_CHANNELS, type AdvanceChannel, type AdvanceProvider } from '@extas/settings';
import { z } from 'zod';
import { allow, parse, setting, type OrdersDeps, type Tx, type Who } from './context';
import { OrdersError } from './errors';
import { ADVANCE_KINDS, advanceAmountOf, advanceAmounts, advancePurposeOf, defaultAdvanceKind, type AdvanceAmount, type AdvanceRequestKind } from './advance-plan';
import { execute, staffBy, type By, type CommandOptions, type CommandResult, type LockedOrder } from './service';

/** Why the team calls (CallTask.reason) when an advance request ticks "Call". */
export const ADVANCE_CALL_REASON = 'ADVANCE_REQUEST';
/** The failure code of a link that a newer request replaced (never paid, closed without money). */
export const ADVANCE_REPLACED = 'REPLACED';
/** The shop's page of a pay link (the shop adds its `/bn` for Bengali). */
export const payLinkPath = (token: string): string => `/pay/${encodeURIComponent(token)}`;

/** The payment method a link's service is stored with. */
const METHOD_OF: Record<AdvanceProvider, 'BKASH' | 'NAGAD' | 'ROCKET' | 'UPAY' | 'ONLINE'> = { bkash: 'BKASH', nagad: 'NAGAD', rocket: 'ROCKET', upay: 'UPAY', online: 'ONLINE' };

const NOTE_MAX = 500;
const channelsInput = z.array(z.enum(ADVANCE_CHANNELS)).max(ADVANCE_CHANNELS.length);

export const advanceRequestInput = z
  .object({
    kind: z.enum(ADVANCE_KINDS),
    channels: channelsInput,
    note: z.string().trim().max(NOTE_MAX).optional(),
    version: z.int().min(0).optional(),
  })
  .strict();

export const advanceResendInput = z.object({ channels: channelsInput, note: z.string().trim().max(NOTE_MAX).optional(), version: z.int().min(0).optional() }).strict();

const uniq = (c: readonly AdvanceChannel[]): AdvanceChannel[] => ADVANCE_CHANNELS.filter((x) => c.includes(x));

const ref = (who: Who, orderId: string) => {
  if (!z.uuid().safeParse(orderId).success) throw new OrdersError('NOT_FOUND', 'no such order', ['orderId']);
  return { storeId: who.storeId, orderId };
};

/** One call task for the advance (an open one is reused). */
async function callTaskOf(tx: Tx, o: LockedOrder, notes: string): Promise<string> {
  const open = await tx.callTask.findFirst({ where: { storeId: o.storeId, orderId: o.id, reason: ADVANCE_CALL_REASON, status: { in: ['OPEN', 'IN_PROGRESS'] } }, select: { id: true } });
  return (open ?? (await tx.callTask.create({ data: { storeId: o.storeId, orderId: o.id, customerId: o.customerId, reason: ADVANCE_CALL_REASON, notes: notes.slice(0, 1_000) }, select: { id: true } }))).id;
}

const token = () => randomBytes(18).toString('base64url');

export interface AdvanceRequestResult {
  command: CommandResult;
  kind: AdvanceRequestKind;
  amountMinor: number;
  paymentId: string;
  token: string;
  channels: AdvanceChannel[];
  callTaskId: string | null;
}

/**
 * The request itself, for a caller that checked its own permission (the admin route via `requestAdvance`, the risk
 * level's auto option as the system). Refused: no way picked (NO_CHANNEL), nothing due (NOTHING_DUE), no delivery
 * charge on the order (NO_CHARGE), a part without the owner's percent (PARTIAL_UNSET), an order that cannot wait for an
 * advance now (ILLEGAL_TRANSITION: confirmed into packing, already waiting, cancelled …).
 */
export async function requestAdvanceWith(deps: OrdersDeps, r: { storeId: number; orderId: string }, by: By, input: unknown, opts: CommandOptions = {}): Promise<AdvanceRequestResult> {
  const d = parse(advanceRequestInput, input, 'advance request');
  const channels = uniq(d.channels);
  if (!channels.length) throw new OrdersError('NO_CHANNEL', 'pick at least one way to reach the customer', ['channels']);
  const [cfg, levels, hours] = await Promise.all([setting(deps, r.storeId, 'orders.advanceRequest'), setting(deps, r.storeId, 'risk.levels'), setting(deps, r.storeId, 'orders.advance.waitHours')]);
  const box: { made: Omit<AdvanceRequestResult, 'command'> | null } = { made: null };
  const command = await execute(
    deps,
    r,
    by,
    {
      command: 'awaitAdvance',
      input: { kind: d.kind, channels, note: d.note ?? null },
      effect: async (tx, o, _f, { now }) => {
        const a = advanceAmountOf(d.kind, o, levels.partialPercent);
        if (!a.ok) throw new OrdersError(a.code, `this advance cannot be asked: ${a.code}`, ['kind']);
        // one live link per order: an earlier link that was never paid is closed (no money moved)
        await tx.payment.updateMany({ where: { storeId: o.storeId, orderId: o.id, linkToken: { not: null }, status: { in: ['INITIATED', 'PENDING'] } }, data: { status: 'CANCELLED', failureCode: ADVANCE_REPLACED, statusAt: now } });
        const t = token();
        const pay = await tx.payment.create({
          data: { storeId: o.storeId, orderId: o.id, method: METHOD_OF[cfg.provider], provider: cfg.provider, purpose: advancePurposeOf(d.kind), status: 'INITIATED', amountMinor: a.amountMinor, currency: o.currency, idempotencyKey: `advance:${t}:1`, attempt: 1, linkToken: t, statusAt: now },
          select: { id: true },
        });
        const callTaskId = channels.includes('CALL') ? await callTaskOf(tx, o, `Ask for the advance (${d.kind}, ${a.amountMinor / 100} ${o.currency}) and send the pay link.${d.note ? ` ${d.note}` : ''}`) : null;
        const requiredMinor = o.paidMinor + a.amountMinor;
        box.made = { kind: d.kind, amountMinor: a.amountMinor, paymentId: pay.id, token: t, channels, callTaskId };
        return {
          data: { advanceRequiredMinor: requiredMinor, advanceDueAt: hours > 0 ? new Date(now.getTime() + hours * 3_600_000) : null },
          reasonCode: d.kind,
          message: d.note ?? null,
          eventData: { request: true, kind: d.kind, amountMinor: a.amountMinor, requiredMinor, waitHours: hours, paymentId: pay.id, provider: cfg.provider, channels, callTaskId },
          audit: { before: { advanceRequiredMinor: o.advanceRequiredMinor }, after: { advanceRequiredMinor: requiredMinor, paymentId: pay.id } },
        };
      },
    },
    { ...opts, ...(d.version !== undefined ? { version: d.version } : {}) },
  );
  if (!box.made) {
    // a repeat of the same press (idempotency key): the first answer's link
    const p = await deps.db.payment.findFirst({ where: { storeId: r.storeId, orderId: r.orderId, linkToken: { not: null } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true, amountMinor: true, linkToken: true } });
    if (!p?.linkToken) throw new OrdersError('NOT_FOUND', 'the advance request has no link', ['orderId']);
    return { command, kind: d.kind, amountMinor: p.amountMinor, paymentId: p.id, token: p.linkToken, channels, callTaskId: null };
  }
  return { command, ...box.made };
}

/** "Request advance" on the order page (`orders.advance.request`). */
export async function requestAdvance(deps: OrdersDeps, who: Who, orderId: string, input: unknown, opts: CommandOptions = {}): Promise<AdvanceRequestResult> {
  await allow(deps, who, 'orders.advance.request');
  return requestAdvanceWith(deps, ref(who, orderId), staffBy(who.actor, who.ctx), input, opts);
}

export interface AdvanceResendResult {
  command: CommandResult;
  paymentId: string;
  token: string;
  channels: AdvanceChannel[];
  callTaskId: string | null;
  /** A new try was made because the last one failed or was closed without money. */
  newTry: boolean;
}

/**
 * "Send again" (`orders.advance.request`) while the order waits for its advance: the same link by the ways picked, and a
 * fresh try of it when the last one failed (the same token: the customer's link keeps working).
 */
export async function resendAdvance(deps: OrdersDeps, who: Who, orderId: string, input: unknown, opts: CommandOptions = {}): Promise<AdvanceResendResult> {
  await allow(deps, who, 'orders.advance.request');
  const d = parse(advanceResendInput, input, 'advance request');
  const channels = uniq(d.channels);
  if (!channels.length) throw new OrdersError('NO_CHANNEL', 'pick at least one way to reach the customer', ['channels']);
  const box: { out: Omit<AdvanceResendResult, 'command'> | null } = { out: null };
  const command = await execute(
    deps,
    ref(who, orderId),
    staffBy(who.actor, who.ctx),
    {
      command: 'advanceResend',
      input: { channels, note: d.note ?? null },
      effect: async (tx, o, _f, { now }) => {
        const last = await tx.payment.findFirst({ where: { storeId: o.storeId, orderId: o.id, linkToken: { not: null } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
        if (!last?.linkToken) throw new OrdersError('NOT_FOUND', 'this order has no pay link to send again; request the advance first', ['orderId']);
        let paymentId = last.id;
        const closed = last.status === 'FAILED' || (last.status === 'CANCELLED' && last.failureCode !== ADVANCE_REPLACED);
        if (closed) {
          const next = last.attempt + 1;
          paymentId = (
            await tx.payment.create({
              data: { storeId: o.storeId, orderId: o.id, method: last.method, provider: last.provider, purpose: last.purpose, status: 'INITIATED', amountMinor: last.amountMinor, currency: last.currency, idempotencyKey: `advance:${last.linkToken}:${next}`, attempt: next, linkToken: last.linkToken, statusAt: now },
              select: { id: true },
            })
          ).id;
        }
        const callTaskId = channels.includes('CALL') ? await callTaskOf(tx, o, `Ask again for the advance (${last.amountMinor / 100} ${o.currency}) and send the pay link.${d.note ? ` ${d.note}` : ''}`) : null;
        box.out = { paymentId, token: last.linkToken, channels, callTaskId, newTry: closed };
        return { message: d.note ?? null, eventData: { resend: true, amountMinor: last.amountMinor, paymentId, channels, callTaskId, newTry: closed } };
      },
    },
    { ...opts, ...(d.version !== undefined ? { version: d.version } : {}) },
  );
  if (!box.out) {
    const p = await deps.db.payment.findFirst({ where: { storeId: who.storeId, orderId, linkToken: { not: null } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true, linkToken: true } });
    return { command, paymentId: p?.id ?? '', token: p?.linkToken ?? '', channels, callTaskId: null, newTry: false };
  }
  return { command, ...box.out };
}

// ---------------------------------------------------------------------------------------------------------------------
// What the order page shows (the dialog and the "waiting for the advance" band)
// ---------------------------------------------------------------------------------------------------------------------

/** The order's pay link now. */
export interface AdvanceLinkView {
  token: string;
  path: string;
  paymentId: string;
  amountMinor: number;
  currency: string;
  status: string;
  attempt: number;
  kind: AdvanceRequestKind;
  createdAt: Date;
}

export interface AdvanceRequestView {
  /** Each kind's amount for this order now (or why it cannot be asked). */
  amounts: Record<AdvanceRequestKind, AdvanceAmount>;
  /** The risk level's proposal, when it proposed an ask, or a repeat refuser's terms (PR 163). */
  proposed: AdvanceRequestKind | null;
  /** PR 163: who proposed it — the risk level, or the owner's terms for a repeat refuser. */
  proposedBy: 'level' | 'refuser' | null;
  /** The kind the dialog opens with. */
  defaultKind: AdvanceRequestKind;
  /** The ways ticked when it opens (`orders.advanceRequest.channels`). */
  channels: AdvanceChannel[];
  /** The order messages are switched on (`messages.enabled`): without it the SMS/WhatsApp is logged, not sent. */
  messagesOn: boolean;
  provider: AdvanceProvider;
  waitHours: number;
  auto: boolean;
  currency: string;
  /** The order's latest pay link, or null when none was made. */
  link: AdvanceLinkView | null;
}

const KIND_OF: Record<string, AdvanceRequestKind> = { ADVANCE_DELIVERY_CHARGE: 'delivery', PART_ADVANCE: 'partial', FULL_ADVANCE: 'full' };

/** The order's latest pay link (no permission check: the caller has read the order). */
export async function advanceLinkOf(deps: Pick<OrdersDeps, 'db'>, storeId: number, orderId: string): Promise<AdvanceLinkView | null> {
  const p = await deps.db.payment.findFirst({ where: { storeId, orderId, linkToken: { not: null } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
  if (!p?.linkToken) return null;
  const ev = await deps.db.orderEvent.findFirst({ where: { storeId, orderId, type: 'order.awaitAdvance' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { reasonCode: true } });
  const kind = ev?.reasonCode && (ADVANCE_KINDS as readonly string[]).includes(ev.reasonCode) ? (ev.reasonCode as AdvanceRequestKind) : (KIND_OF[p.purpose] ?? 'full');
  return { token: p.linkToken, path: payLinkPath(p.linkToken), paymentId: p.id, amountMinor: p.amountMinor, currency: p.currency, status: p.status, attempt: p.attempt, kind, createdAt: p.createdAt };
}

/** The request dialog's data for one order (no permission check: the caller has read the order). */
export async function advanceRequestView(deps: OrdersDeps, storeId: number, orderId: string): Promise<AdvanceRequestView | null> {
  const o = await deps.db.order.findFirst({ where: { id: orderId, storeId }, select: { totalMinor: true, walletAppliedMinor: true, paidMinor: true, deliveryChargeMinor: true, currency: true } });
  if (!o) return null;
  const [cfg, levels, hours, messagesOn, level, link] = await Promise.all([
    setting(deps, storeId, 'orders.advanceRequest'),
    setting(deps, storeId, 'risk.levels'),
    setting(deps, storeId, 'orders.advance.waitHours'),
    setting(deps, storeId, 'messages.enabled'),
    // PR 163: a repeat refuser's terms propose the same way; the newest of the two wins
    deps.db.orderEvent.findFirst({ where: { storeId, orderId, type: { in: ['order.riskLevel', 'order.refuserTerms'] } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { type: true, data: true } }),
    advanceLinkOf(deps, storeId, orderId),
  ]);
  const amounts = advanceAmounts(o, levels.partialPercent);
  // the risk level's proposal (risk-levels.ts writes it on the order's `order.riskLevel` row), or the repeat refuser's
  // terms (refusers.ts, `order.refuserTerms`)
  const ask = level?.data && typeof level.data === 'object' && !Array.isArray(level.data) ? (level.data as Record<string, unknown>).ask : null;
  const proposed = typeof ask === 'string' && (ADVANCE_KINDS as readonly string[]).includes(ask) ? (ask as AdvanceRequestKind) : null;
  return {
    amounts,
    proposed,
    proposedBy: proposed ? (level?.type === 'order.refuserTerms' ? 'refuser' : 'level') : null,
    defaultKind: defaultAdvanceKind(proposed, amounts),
    channels: ADVANCE_CHANNELS.filter((c) => cfg.channels[c]),
    messagesOn,
    provider: cfg.provider,
    waitHours: hours,
    auto: cfg.auto,
    currency: o.currency,
    link,
  };
}

/**
 * The owner's auto option (`orders.advanceRequest.auto`, off): right after a risk level proposes an ask, the same
 * request runs as the system with the ways ticked in the setting. Null when the option is off or the level asks
 * nothing; a refusal (nothing due, no charge, an order that cannot wait now) is returned as its code — never thrown, so a
 * score is never undone by it.
 */
export async function autoAdvance(deps: OrdersDeps, r: { storeId: number; orderId: string }, ask: string, key: string, by: By): Promise<AdvanceRequestResult | string | null> {
  if (ask === 'none' || !(ADVANCE_KINDS as readonly string[]).includes(ask)) return null;
  const cfg = await setting(deps, r.storeId, 'orders.advanceRequest');
  if (!cfg.auto) return null;
  const channels = ADVANCE_CHANNELS.filter((c) => cfg.channels[c]);
  try {
    return await requestAdvanceWith(deps, r, by, { kind: ask, channels }, { idempotencyKey: key });
  } catch (e) {
    if (e instanceof OrdersError) return e.code;
    throw e;
  }
}
