// PR 138, 144, 153 — the order commands, each one call of `execute()` (service.ts) with its permission, its input and
// its effects. Staff commands check the permission in the store first (B6.5); the hooks for S06–S08 (advance,
// fulfilment, courier events) take who acts from their caller, which checks its own permission.
//
// Never here: moving money, a refund payout, a COD, price or discount change, or blocking anyone (CLAUDE.md rule 6). A
// paid order's cancel records a refund REQUEST for the owner (F-041), nothing more.
import { z } from 'zod';
import { allow, parse, setting, type OrdersDeps, type Tx, type Who } from './context';
import { OrdersError } from './errors';
import { CANCEL_CODES, NOT_A_RISK_SIGNAL, NOTE_REQUIRED, type CancelCode, type OrderCommand } from './pure';
import { cancelEffects, execute, queueErpOrder, staffBy, type By, type CommandOptions, type CommandResult, type LockedOrder, type OrderFacts } from './service';

const NOTE_MAX = 2_000;
const note = z.string().trim().max(NOTE_MAX).optional();

const ref = (who: Who, orderId: string) => {
  if (!z.uuid().safeParse(orderId).success) throw new OrdersError('NOT_FOUND', 'no such order', ['orderId']);
  return { storeId: who.storeId, orderId };
};

// ---------------------------------------------------------------------------------------------------------------------
// Reason lists (the owner's settings; the codes of a cancel are fixed, their words are his)
// ---------------------------------------------------------------------------------------------------------------------

export interface ReasonOption {
  key: string;
  en: string;
  bn: string;
  /** A note is needed with this reason. */
  noteRequired: boolean;
}

export interface ReasonLists {
  cancel: ReasonOption[];
  hold: ReasonOption[];
  customerCancel: ReasonOption[];
  flags: { key: string; en: string; bn: string }[];
  /** PR 142: why the team edits an order, and where the customer asked. */
  edit: ReasonOption[];
  channels: { key: string; en: string; bn: string }[];
  /** PR 142 (SIM-F-038): why a parcel was refused at the door. */
  refusal: ReasonOption[];
}

/** Every reason list of the order screens, from the store's settings. */
export async function reasonLists(deps: OrdersDeps, storeId: number): Promise<ReasonLists> {
  const [cancel, hold, customer, flags, edit, channels, refusal] = await Promise.all([
    setting(deps, storeId, 'orders.cancel.reasons'),
    setting(deps, storeId, 'orders.hold.reasons'),
    setting(deps, storeId, 'orders.cancel.customerReasons'),
    setting(deps, storeId, 'orders.flags.list'),
    setting(deps, storeId, 'orders.edit.reasons'),
    setting(deps, storeId, 'orders.edit.channels'),
    setting(deps, storeId, 'orders.refusal.reasons'),
  ]);
  return {
    cancel: cancel.map((r) => ({ key: r.code, en: r.en, bn: r.bn, noteRequired: NOTE_REQUIRED.has(r.code) })),
    hold: hold.map((r) => ({ ...r, noteRequired: r.key === OTHER_KEY })),
    customerCancel: customer.map((r) => ({ ...r, noteRequired: false })),
    flags,
    edit: edit.map((r) => ({ ...r, noteRequired: r.key === OTHER_KEY })),
    channels,
    refusal: refusal.map((r) => ({ ...r, noteRequired: r.key === OTHER_KEY })),
  };
}

/** The key of a list's "other" entry: a note is needed with it. */
export const OTHER_KEY = 'other';

/**
 * A cancel code with its words. Staff pick from the owner's list (and give the note a reason needs); a code the system
 * sets itself (the customer's cancel, a duplicate decline) is fixed and only takes its words from the list when it is there.
 */
async function cancelReason(deps: OrdersDeps, storeId: number, code: string, text: string | undefined, picked = true): Promise<{ code: CancelCode; en: string; bn: string }> {
  if (!(CANCEL_CODES as readonly string[]).includes(code)) throw new OrdersError('REASON_REQUIRED', 'pick a cancel reason from the list', ['reasonCode']);
  const list = await setting(deps, storeId, 'orders.cancel.reasons');
  const r = list.find((x) => x.code === code);
  if (!picked) return { code: code as CancelCode, en: r?.en ?? code, bn: r?.bn ?? code };
  if (!r) throw new OrdersError('REASON_REQUIRED', 'pick a cancel reason from the list', ['reasonCode']);
  if (NOTE_REQUIRED.has(r.code) && !text) throw new OrdersError('REASON_REQUIRED', 'this reason needs a note', ['note']);
  return { code: r.code, en: r.en, bn: r.bn };
}

/** More work a caller does in the same transaction as the command (a review decided with it, a request recorded). */
export type Also = (tx: Tx, o: LockedOrder, now: Date) => Promise<Record<string, unknown> | void>;

// ---------------------------------------------------------------------------------------------------------------------
// Confirm (PR 138)
// ---------------------------------------------------------------------------------------------------------------------

/** PLACED → CONFIRMED. Refused while a duplicate/risk review or a customer's cancel request is open. D6: the order goes to the ERP now. */
export async function confirmOrder(deps: OrdersDeps, who: Who, orderId: string, opts: CommandOptions = {}): Promise<CommandResult> {
  await allow(deps, who, 'orders.confirm');
  return execute(deps, ref(who, orderId), staffBy(who.actor, who.ctx), {
    command: 'confirm',
    effect: async (tx, o, _f, { now }) => {
      const pushId = await queueErpOrder(deps, tx, o);
      return { data: { confirmedAt: now }, eventData: { erpPushId: pushId } };
    },
  }, opts);
}

// ---------------------------------------------------------------------------------------------------------------------
// Hold and release (PR 153): the reason is visible to support on the order; a held order keeps its stock
// ---------------------------------------------------------------------------------------------------------------------

export const holdInput = z.object({ reasonKey: z.string().trim().min(1).max(60), note }).strict();

export async function holdOrder(deps: OrdersDeps, who: Who, orderId: string, input: unknown, opts: CommandOptions = {}): Promise<CommandResult> {
  await allow(deps, who, 'orders.hold');
  const d = parse(holdInput, input, 'hold');
  return holdWith(deps, ref(who, orderId), staffBy(who.actor, who.ctx), d.reasonKey, d.note, opts);
}

/** The hold itself, also for the duplicate check's auto-hold (the system acts). */
export async function holdWith(
  deps: OrdersDeps,
  r: { storeId: number; orderId: string },
  by: By,
  reasonKey: string,
  text: string | undefined,
  opts: CommandOptions & { also?: Also } = {},
): Promise<CommandResult> {
  const list = await setting(deps, r.storeId, 'orders.hold.reasons');
  const reason = list.find((x) => x.key === reasonKey);
  if (!reason) throw new OrdersError('REASON_REQUIRED', 'pick a hold reason from the list', ['reasonKey']);
  if (reason.key === OTHER_KEY && !text) throw new OrdersError('REASON_REQUIRED', 'this reason needs a note', ['note']);
  return execute(deps, r, by, {
    command: 'hold',
    input: { reasonKey, note: text ?? null },
    effect: async (tx, o, _f, { from, now }) => {
      const more = (await opts.also?.(tx, o, now)) ?? {};
      return {
        data: { holdFromStatus: from, holdReasonCode: reason.key, holdReason: text || null, onHoldSince: now },
        reasonCode: reason.key,
        message: text ?? null,
        eventData: { reason: { en: reason.en, bn: reason.bn }, ...more },
      };
    },
  }, opts);
}

/** ON_HOLD → back to where it was held from (PLACED or CONFIRMED). */
export async function releaseOrder(deps: OrdersDeps, who: Who, orderId: string, input: unknown = {}, opts: CommandOptions = {}): Promise<CommandResult> {
  await allow(deps, who, 'orders.hold');
  const d = parse(z.object({ note }).strict(), input, 'release');
  return execute(deps, ref(who, orderId), staffBy(who.actor, who.ctx), {
    command: 'release',
    input: { note: d.note ?? null },
    effect: async (_tx, o, _f, { now }) => ({
      data: { holdFromStatus: null, holdReasonCode: null, holdReason: null, onHoldSince: null },
      reasonCode: o.holdReasonCode,
      message: d.note ?? null,
      eventData: { heldMinutes: o.onHoldSince ? Math.round((now.getTime() - o.onHoldSince.getTime()) / 60_000) : null, heldFor: o.holdReason },
    }),
  }, opts);
}

// ---------------------------------------------------------------------------------------------------------------------
// Cancel (PR 144)
// ---------------------------------------------------------------------------------------------------------------------

export const cancelInput = z.object({ reasonCode: z.string().trim().min(1).max(60), note }).strict();

/** The cancel itself (staff, the customer's one tap, an approved request, the duplicate decision). */
export async function cancelWith(
  deps: OrdersDeps,
  r: { storeId: number; orderId: string },
  by: By,
  code: string,
  text: string | undefined,
  opts: CommandOptions & { requireRequest?: boolean; picked?: boolean; extra?: Record<string, unknown>; check?: (o: LockedOrder, f: OrderFacts) => void; also?: Also } = {},
): Promise<CommandResult> {
  const reason = await cancelReason(deps, r.storeId, code, text, opts.picked ?? true);
  return execute(deps, r, by, {
    command: 'cancel',
    input: { reasonCode: reason.code, note: text ?? null, ...(opts.extra ?? {}) },
    check: (o, f) => {
      if (opts.requireRequest && !o.cancelRequestedAt) throw new OrdersError('NO_CANCEL_REQUEST', 'the customer did not ask to cancel', ['orderId']);
      opts.check?.(o, f);
    },
    effect: async (tx, o, _f, { now }) => {
      const more = (await opts.also?.(tx, o, now)) ?? {};
      const fx = await cancelEffects(deps, tx, o, by, reason.code, now);
      return {
        data: { cancelledAt: now, cancelReasonCode: reason.code, cancelNote: text || null, holdFromStatus: null, onHoldSince: null, cancelRequestedAt: null },
        reasonCode: reason.code,
        message: text ?? null,
        // PR 142 (SIM-F-038): "did not order" is never held against the phone (NOT_A_RISK_SIGNAL)
        eventData: { reason: { en: reason.en, bn: reason.bn }, riskSignal: !NOT_A_RISK_SIGNAL.has(reason.code), ...fx, ...(opts.extra ?? {}), ...more },
        refundRequestIds: fx.refundRequestIds,
      };
    },
  }, opts);
}

/** PLACED / AWAITING_ADVANCE / CONFIRMED / ON_HOLD (or picked or packed, but not booked) → CANCELLED, with a reason. */
export async function cancelOrder(deps: OrdersDeps, who: Who, orderId: string, input: unknown, opts: CommandOptions = {}): Promise<CommandResult> {
  await allow(deps, who, 'orders.cancel');
  const d = parse(cancelInput, input, 'cancel');
  return cancelWith(deps, ref(who, orderId), staffBy(who.actor, who.ctx), d.reasonCode, d.note, opts);
}

/** CN-020 (5): the team approves a customer's cancel request (reason "customer asked after confirming"). */
export async function approveCancelRequest(deps: OrdersDeps, who: Who, orderId: string, input: unknown = {}, opts: CommandOptions = {}): Promise<CommandResult> {
  await allow(deps, who, 'orders.cancelRequests');
  const d = parse(z.object({ note }).strict(), input, 'answer');
  return cancelWith(deps, ref(who, orderId), staffBy(who.actor, who.ctx), 'CUSTOMER_AFTER_CONFIRM', d.note, { ...opts, requireRequest: true, extra: { request: 'approved' } });
}

/** …or refuses it: the order goes on as it was; the request stays in the timeline. */
export async function refuseCancelRequest(deps: OrdersDeps, who: Who, orderId: string, input: unknown = {}, opts: CommandOptions = {}): Promise<CommandResult> {
  await allow(deps, who, 'orders.cancelRequests');
  const d = parse(z.object({ note }).strict(), input, 'answer');
  return execute(deps, ref(who, orderId), staffBy(who.actor, who.ctx), {
    command: 'refuseCancelRequest',
    input: { note: d.note ?? null },
    effect: async (_tx, o) => ({ data: { cancelRequestedAt: null, cancelRequestReason: null }, reasonCode: o.cancelRequestReason, message: d.note ?? null, eventData: { askedAt: o.cancelRequestedAt } }),
  }, opts);
}

// ---------------------------------------------------------------------------------------------------------------------
// Cancel after booking (§6.5.7, decision D5): never edited, never re-booked — cancelled with the courier's word
// ---------------------------------------------------------------------------------------------------------------------

export const cancelAfterBookingInput = z.object({ reasonCode: z.string().trim().min(1).max(60).default('CUSTOMER_CHANGE_AFTER_BOOKING'), note }).strict();

/** Step 2: the order is flagged cancel-pending and the shipment CANCEL_REQUESTED; staff phone the courier next. */
export async function cancelAfterBooking(deps: OrdersDeps, who: Who, orderId: string, input: unknown, opts: CommandOptions = {}): Promise<CommandResult> {
  await allow(deps, who, 'orders.cancelAfterBooking');
  const d = parse(cancelAfterBookingInput, input, 'cancel after booking');
  const reason = await cancelReason(deps, who.storeId, d.reasonCode, d.note);
  return execute(deps, ref(who, orderId), staffBy(who.actor, who.ctx), {
    command: 'cancelAfterBooking',
    input: { reasonCode: reason.code, note: d.note ?? null },
    effect: async (tx, _o, f, { now }) => {
      const s = f.shipment!;
      await tx.shipment.update({ where: { id: s.id }, data: { status: 'CANCEL_REQUESTED', cancelRequestedAt: now } });
      return {
        data: { cancelPending: true, cancelReasonCode: reason.code, cancelNote: d.note || null },
        reasonCode: reason.code,
        message: d.note ?? null,
        eventData: { reason: { en: reason.en, bn: reason.bn }, shipmentId: s.id, shipmentStatusBefore: s.status, riskSignal: !NOT_A_RISK_SIGNAL.has(reason.code) },
      };
    },
  }, opts);
}

export const courierAnswerInput = z.object({ courierPerson: z.string().trim().max(120).optional(), courierRef: z.string().trim().max(120).optional(), note }).strict();

/** Step 3a / 3b: the courier's answer, recorded as its own step (a phone call is never assumed). */
export async function recordCourierCancel(deps: OrdersDeps, who: Who, orderId: string, answer: 'confirmed' | 'refused', input: unknown = {}, opts: CommandOptions = {}): Promise<CommandResult> {
  await allow(deps, who, 'orders.cancelAfterBooking');
  const d = parse(courierAnswerInput, input, 'courier answer');
  const by = staffBy(who.actor, who.ctx);
  const r = ref(who, orderId);
  const courier = { courierPerson: d.courierPerson ?? null, courierRef: d.courierRef ?? null };
  if (answer === 'confirmed') {
    return execute(deps, r, by, {
      command: 'courierCancelConfirmed',
      input: { ...courier, note: d.note ?? null },
      effect: async (tx, o, f, { now }) => {
        const s = f.shipment!;
        await tx.shipment.update({ where: { id: s.id }, data: { status: 'CANCELLED', cancelConfirmedById: who.actor.staffUserId, cancelConfirmedAt: now, cancelRef: d.courierRef || null, cancelOutcome: 'CONFIRMED' } });
        const code = o.cancelReasonCode ?? 'CUSTOMER_CHANGE_AFTER_BOOKING';
        const fx = await cancelEffects(deps, tx, o, by, code, now);
        return {
          data: { cancelPending: false, cancelledAt: now, holdFromStatus: null, onHoldSince: null },
          reasonCode: code,
          message: d.note ?? null,
          eventData: { shipmentId: s.id, ...courier, ...fx },
          refundRequestIds: fx.refundRequestIds,
        };
      },
    }, opts);
  }
  return execute(deps, r, by, {
    command: 'courierCancelRefused',
    input: { ...courier, note: d.note ?? null },
    effect: async (tx, o, f, { now }) => {
      const s = f.shipment!;
      // the shipment goes back to the state it had before the cancel was asked (kept on that event)
      const asked = await tx.orderEvent.findFirst({ where: { storeId: o.storeId, orderId: o.id, type: 'order.cancelAfterBooking' }, orderBy: { createdAt: 'desc' }, select: { data: true } });
      const before = (asked?.data as { shipmentStatusBefore?: string } | null)?.shipmentStatusBefore;
      await tx.shipment.update({
        where: { id: s.id },
        data: { status: (before && before !== 'CANCEL_REQUESTED' ? before : 'IN_TRANSIT') as never, cancelConfirmedById: who.actor.staffUserId, cancelConfirmedAt: now, cancelRef: d.courierRef || null, cancelOutcome: 'REFUSED' },
      });
      // §6.5.7 3b: it comes back through the return flow; not a refusal, never a risk signal
      return { data: { cancelPending: false, customerWantsChange: true, cancelReasonCode: null, cancelNote: null }, reasonCode: o.cancelReasonCode, message: d.note ?? null, eventData: { shipmentId: s.id, ...courier, riskSignal: false } };
    },
  }, opts);
}

// ---------------------------------------------------------------------------------------------------------------------
// Hooks for the later stages (no admin route here): each still runs through execute() with its timeline and audit row
// ---------------------------------------------------------------------------------------------------------------------

export const advanceInput = z.object({ requiredMinor: z.int().min(1), level: z.string().trim().max(40).optional() }).strict();

/**
 * S06 / PR 542 / PR 605 — the order waits for an advance (a risk level or a gift). The amount is the caller's (the owner's
 * risk rules or gift settings decide it, never this code); the deadline is `orders.advance.waitHours` (0 = none). Past
 * it a person is asked to call (followUps); the order is never cancelled by itself (F-043).
 */
export async function awaitAdvance(deps: OrdersDeps, r: { storeId: number; orderId: string }, by: By, input: unknown, opts: CommandOptions = {}): Promise<CommandResult> {
  const d = parse(advanceInput, input, 'advance');
  const hours = await setting(deps, r.storeId, 'orders.advance.waitHours');
  return execute(deps, r, by, {
    command: 'awaitAdvance',
    input: d,
    effect: async (_tx, _o, _f, { now }) => ({
      data: { advanceRequiredMinor: d.requiredMinor, advanceDueAt: hours > 0 ? new Date(now.getTime() + hours * 3_600_000) : null },
      reasonCode: d.level ?? null,
      eventData: { requiredMinor: d.requiredMinor, waitHours: hours },
    }),
  }, opts);
}

/** S07 — the advance is paid (the payments service has recorded the payment on the order): back to PLACED. */
export async function recordAdvance(deps: OrdersDeps, r: { storeId: number; orderId: string }, by: By, opts: CommandOptions = {}): Promise<CommandResult> {
  return execute(deps, r, by, {
    command: 'recordAdvance',
    effect: async (_tx, o) => ({ data: { advanceDueAt: null }, eventData: { paidMinor: o.paidMinor, requiredMinor: o.advanceRequiredMinor } }),
  }, opts);
}

/** The fulfilment and courier steps S08 drives (it adds its guards: the SKU scan, the packing photo, the shortage card). */
export type OrderStep = Extract<OrderCommand, 'startPicking' | 'pack' | 'handover' | 'courierPickedUp' | 'delivered' | 'partiallyDelivered' | 'returned'>;

const STEP_TIME: Partial<Record<OrderStep, keyof LockedOrder | 'packedAt' | 'handedOverAt' | 'deliveredAt' | 'returnedAt'>> = {
  pack: 'packedAt',
  handover: 'handedOverAt',
  delivered: 'deliveredAt',
  partiallyDelivered: 'deliveredAt',
  returned: 'returnedAt',
};

export const stepInput = z.object({ at: z.coerce.date().optional(), keptItemIds: z.array(z.uuid()).min(1).max(500).optional(), refusalKey: z.string().trim().min(1).max(60).optional(), note }).strict();

/**
 * One fulfilment or courier step (S08 hook). A partial delivery needs the list of kept lines (§6.5.0). A refused parcel
 * (returned, or the refused part of a partial delivery) may carry why, from the owner's `orders.refusal.reasons` (PR 142,
 * SIM-F-038: "bought elsewhere", "arrived after Eid" …), so the RTO reports count real reasons instead of "Other".
 */
export async function orderStep(deps: OrdersDeps, r: { storeId: number; orderId: string }, by: By, step: OrderStep, input: unknown = {}, opts: CommandOptions = {}): Promise<CommandResult> {
  const d = parse(stepInput, input, 'step');
  if (step === 'partiallyDelivered' && !d.keptItemIds) throw new OrdersError('INVALID_INPUT', 'a partial delivery names the kept lines', ['keptItemIds']);
  let refusal: { key: string; en: string; bn: string } | null = null;
  if (d.refusalKey) {
    if (step !== 'returned' && step !== 'partiallyDelivered') throw new OrdersError('INVALID_INPUT', 'only a refused parcel has a refusal reason', ['refusalKey']);
    refusal = (await setting(deps, r.storeId, 'orders.refusal.reasons')).find((x) => x.key === d.refusalKey) ?? null;
    if (!refusal) throw new OrdersError('REASON_REQUIRED', 'pick a refusal reason from the list', ['refusalKey']);
    if (refusal.key === OTHER_KEY && !d.note) throw new OrdersError('REASON_REQUIRED', 'this reason needs a note', ['note']);
  }
  return execute(deps, r, by, {
    command: step,
    input: { ...d, at: d.at?.toISOString() ?? null },
    effect: async (_tx, _o, _f, { now }) => {
      const field = STEP_TIME[step];
      const eventData = { ...(d.keptItemIds ? { keptItemIds: d.keptItemIds } : {}), ...(refusal ? { refusal: { en: refusal.en, bn: refusal.bn } } : {}) };
      return { data: field ? { [field]: d.at ?? now } : {}, reasonCode: refusal?.key ?? null, message: d.note ?? null, eventData: Object.keys(eventData).length ? eventData : undefined };
    },
  }, opts);
}
