// PR 191 (S08; Blueprint C6 item 4; BACKEND-ARCHITECTURE §6.5.0, ORD-05) — refused-parcel handling and the exclusion
// list it feeds. A parcel refused at the door comes back as its return (PR 189: REFUSED_AT_DOOR with the refusal reason,
// or CHARGE_PAID_RETURN when the customer paid the delivery charge at the door and refused the rest). Here:
//   - the shop's own fault (one of the owner's `risk.history.ourFaultRefusals`, SIM-F-044) is marked on the return and
//     never counted against the customer;
//   - the refused-parcel list (Blueprint C6: the list ad audiences exclude, PR 264): when the owner switches it on
//     (`orders.refused.list`, off by default), a number whose counted refusals reach `minRefusals` is PROPOSED for the
//     list. A person decides every entry — on the list, dismissed, or taken off again with a note. A try-on (the owner's
//     re-ship reasons, PR 190), a refusal re-shipped in an exchange, or the shop's fault is not counted.
// Never here: blocking an order, turning Cash on Delivery off, asking for an advance or changing a price (CLAUDE.md rule
// 6; R5 "no auto-blocking"). The list only says which numbers ad audiences leave out, once a person put them there.
import { z } from 'zod';
import { phoneNormalizeBD } from '@extas/delivery';
import { allow, nowOf, parse, setting, TX, type Db, type OrdersDeps, type Tx, type Who } from './context';
import { OrdersError } from './errors';
import { phoneForms } from './phone-history';
import { auditRow, staffBy } from './service';

/** The one stored form of a number on the list (E.164 for a BD mobile, else the text as typed). */
export function listPhoneOf(phone: string): string {
  const p = phoneNormalizeBD(phone);
  return p.ok ? p.e164 : phone.trim();
}

/** Whether a refusal reason is the shop's own fault (`risk.history.ourFaultRefusals`). */
export async function ourFaultRefusal(deps: Pick<OrdersDeps, 'settings'>, storeId: number, refusalKey: string | null): Promise<boolean> {
  if (!refusalKey) return false;
  return (await setting(deps, storeId, 'risk.history')).ourFaultRefusals.includes(refusalKey);
}

/**
 * The number's refusals that count: refused parcels (their returns) not the shop's fault, not a try-on (one of the
 * owner's re-ship reasons, `orders.exchange.charge.reshipRefusals`: the size did not fit at the door, SIM-F-021) and not
 * re-shipped in an exchange. `current` is the order refused right now: it turns RETURNED only after this step's effect.
 */
async function countedRefusals(db: Db, storeId: number, phone: string, current: string, tryOn: readonly string[]): Promise<number> {
  const forms = phoneForms(phone);
  if (!forms.length) return 0;
  const orders = await db.order.findMany({ where: { storeId, phone: { in: forms }, OR: [{ status: 'RETURNED' }, { id: current }] }, select: { id: true } });
  if (!orders.length) return 0;
  const ids = orders.map((o) => o.id);
  const [refused, reshipped] = await Promise.all([
    db.returnRecord.findMany({ where: { storeId, orderId: { in: ids }, kind: { in: ['REFUSED_AT_DOOR', 'CHARGE_PAID_RETURN'] }, ourFault: false, OR: [{ reasonCode: null }, { reasonCode: { notIn: [...tryOn] } }] }, select: { orderId: true } }),
    db.exchange.findMany({ where: { storeId, orderId: { in: ids }, status: { notIn: ['REJECTED', 'CANCELLED'] } }, select: { orderId: true } }),
  ]);
  const skip = new Set(reshipped.map((x) => x.orderId));
  return new Set(refused.map((r) => r.orderId).filter((id) => !skip.has(id))).size;
}

/**
 * After a refused parcel's return is written (in the same transaction): proposes the number for the refused-parcel
 * list once its counted refusals reach the owner's `minRefusals`. Off → nothing. An entry a person put on the list stays;
 * one dismissed or taken off is proposed again on a new refusal (a person decides again). Returns the entry's id.
 */
export async function proposeRefused(deps: Pick<OrdersDeps, 'settings'>, tx: Tx, o: { id: string; storeId: number; phone: string | null; customerId: string | null }, x: { refusalKey: string | null; ourFault: boolean; now: Date }): Promise<string | null> {
  if (x.ourFault || !o.phone) return null;
  const cfg = await setting(deps, o.storeId, 'orders.refused.list');
  if (!cfg.enabled) return null;
  const tryOn = (await setting(deps, o.storeId, 'orders.exchange.charge')).reshipRefusals;
  if (x.refusalKey && tryOn.includes(x.refusalKey)) return null;
  const refusals = await countedRefusals(tx, o.storeId, o.phone, o.id, tryOn);
  if (refusals < cfg.minRefusals) return null;
  const phone = listPhoneOf(o.phone);
  const was = await tx.refusedParcelEntry.findUnique({ where: { storeId_phone: { storeId: o.storeId, phone } }, select: { id: true, state: true } });
  const facts = { refusals, lastOrderId: o.id, lastReasonCode: x.refusalKey, lastRefusedAt: x.now, customerId: o.customerId };
  if (!was) {
    const e = await tx.refusedParcelEntry.create({ data: { storeId: o.storeId, phone, state: 'PROPOSED', ...facts }, select: { id: true } });
    return e.id;
  }
  await tx.refusedParcelEntry.update({ where: { id: was.id }, data: { ...facts, ...(was.state === 'LISTED' || was.state === 'PROPOSED' ? {} : { state: 'PROPOSED' }), version: { increment: 1 } } });
  return was.id;
}

// ---------------------------------------------------------------------------------------------------------------------
// The list, read and decided by a person
// ---------------------------------------------------------------------------------------------------------------------

export const REFUSED_LIST_STATES = ['PROPOSED', 'LISTED', 'DISMISSED', 'REMOVED'] as const;
export type RefusedListStateName = (typeof REFUSED_LIST_STATES)[number];

export interface RefusedEntryView {
  id: string;
  phone: string;
  /** The number as the team reads it (01712-345678). */
  phoneNice: string;
  state: string;
  refusals: number;
  lastOrderId: string | null;
  lastOrderNumber: string | null;
  lastReasonCode: string | null;
  lastRefusedAt: string;
  decidedAt: string | null;
  decisionNote: string | null;
  version: number;
}

export const refusedListInput = z.object({ state: z.array(z.enum(REFUSED_LIST_STATES)).max(4).optional(), limit: z.int().min(1).max(500).optional() }).strict();

/** The refused-parcel list, the newest refusal first (by state). Needs `returns.view`. */
export async function listRefusedEntries(deps: OrdersDeps, who: Who, input: unknown = {}): Promise<RefusedEntryView[]> {
  await allow(deps, who, 'returns.view');
  const d = parse(refusedListInput, input, 'refused list');
  const rows = await deps.db.refusedParcelEntry.findMany({ where: { storeId: who.storeId, ...(d.state ? { state: { in: d.state } } : {}) }, orderBy: [{ lastRefusedAt: 'desc' }, { id: 'desc' }], take: d.limit ?? 200 });
  const orders = new Map((await deps.db.order.findMany({ where: { id: { in: rows.map((r) => r.lastOrderId).filter((x): x is string => !!x) } }, select: { id: true, number: true } })).map((o) => [o.id, o.number]));
  return rows.map((r) => {
    const p = phoneNormalizeBD(r.phone);
    return {
      id: r.id,
      phone: r.phone,
      phoneNice: p.ok ? p.nice : r.phone,
      state: r.state,
      refusals: r.refusals,
      lastOrderId: r.lastOrderId,
      lastOrderNumber: r.lastOrderId ? (orders.get(r.lastOrderId) ?? null) : null,
      lastReasonCode: r.lastReasonCode,
      lastRefusedAt: r.lastRefusedAt.toISOString(),
      decidedAt: r.decidedAt?.toISOString() ?? null,
      decisionNote: r.decisionNote,
      version: r.version,
    };
  });
}

export const refusedDecisionInput = z.object({ state: z.enum(['LISTED', 'DISMISSED', 'REMOVED']), note: z.string().trim().min(1).max(1_000).optional() }).strict();

/** Which decision may follow which: a proposal is listed or dismissed; a listed number taken off; a decision undone. */
const NEXT: Readonly<Record<RefusedListStateName, readonly string[]>> = { PROPOSED: ['LISTED', 'DISMISSED'], LISTED: ['REMOVED'], DISMISSED: ['LISTED'], REMOVED: ['LISTED'] };

/**
 * A person decides one entry: LISTED (ad audiences leave the number out), DISMISSED (not listed), REMOVED (taken off
 * the list; needs a note). The audit row keeps who, when and why. Needs `returns.decide`.
 */
export async function decideRefusedEntry(deps: OrdersDeps, who: Who, id: string, input: unknown, opts: { version?: number } = {}): Promise<{ id: string; state: string }> {
  await allow(deps, who, 'returns.decide');
  const d = parse(refusedDecisionInput, input, 'list decision');
  if (d.state === 'REMOVED' && !d.note) throw new OrdersError('INVALID_INPUT', 'taking a number off the list needs a note', ['note']);
  if (!z.uuid().safeParse(id).success) throw new OrdersError('NOT_FOUND', 'no such entry', ['id']);
  const by = staffBy(who.actor, who.ctx);
  const now = nowOf(deps);
  return deps.db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id"::text AS id FROM "RefusedParcelEntry" WHERE "id" = ${id}::uuid AND "storeId" = ${who.storeId} FOR UPDATE`;
    if (!rows.length) throw new OrdersError('NOT_FOUND', 'no such entry', ['id']);
    const e = await tx.refusedParcelEntry.findUniqueOrThrow({ where: { id } });
    if (opts.version !== undefined && opts.version !== e.version) throw new OrdersError('STALE', 'the entry changed since it was read', ['version'], { version: e.version, state: e.state });
    if (!NEXT[e.state as RefusedListStateName].includes(d.state)) throw new OrdersError('RETURN_STATE', 'that decision does not follow from where the entry is', ['state'], { state: e.state });
    const after = await tx.refusedParcelEntry.update({ where: { id }, data: { state: d.state, decidedById: who.actor.staffUserId, decidedAt: now, decisionNote: d.note ?? null, version: { increment: 1 } }, select: { state: true, version: true } });
    await auditRow(tx, by, { storeId: who.storeId, action: `refused.${d.state.toLowerCase()}`, entityType: 'RefusedParcelEntry', entityId: id, before: { state: e.state, version: e.version }, after: { ...after, note: d.note ?? null, refusals: e.refusals } });
    return { id, state: after.state };
  }, TX);
}

/**
 * The numbers on the list — what ad audiences leave out (PR 264 reads it). Only numbers a person LISTED; nothing else
 * about the customer leaves the shop.
 */
export async function refusedExclusionPhones(db: Db, storeId: number): Promise<string[]> {
  return (await db.refusedParcelEntry.findMany({ where: { storeId, state: 'LISTED' }, orderBy: { phone: 'asc' }, select: { phone: true } })).map((r) => r.phone);
}
