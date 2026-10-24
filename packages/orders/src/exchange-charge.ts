// PR 190 (S08; CN-018 (5); BACKEND-ARCHITECTURE §5.3 ORD-05) — who pays the second delivery, decided by a person:
//   - Waive: staff with `returns.waive` take the exchange delivery charge off, with a reason that is logged (the
//     timeline and the audit row keep who, when, why and the amount);
//   - "Your mistake" claim: the customer says the shop sent the wrong size (or item); staff record it with his note and
//     a photo (`orders.exchange.charge.claimPhoto`), and a person with `returns.claims.decide` approves it (no charge)
//     or refuses it with a reason. The customer's own claim from his account comes with PR 186.
// Both happen while the exchange is only requested: the money box is changed before the linked exchange order exists,
// so the new parcel is booked at the right amount and nothing on a booked parcel changes. Never here: money moving, a
// refund, a price, a discount or COD changed in any other way (CLAUDE.md rule 6; the owner's written rule is CN-018 (5)).
import { z } from 'zod';
import { allow, parse, setting, type OrdersDeps, type Tx, type Who } from './context';
import { OrdersError } from './errors';
import { decideExchange, type DecideOptions, type LockedExchange } from './exchange';

const reasonText = z.string().trim().min(1).max(1_000);

/** Only a requested exchange's charge changes (the new parcel does not exist yet). */
function requestedOnly(ex: LockedExchange, what: string): void {
  if (ex.status !== 'REQUESTED') throw new OrdersError('EXCHANGE_STATE', `${what} only before the exchange is approved`, ['status'], { status: ex.status });
}

/** The money box without the delivery charge (it is the shop's now). */
async function chargeOff(tx: Tx, ex: LockedExchange, state: 'WAIVED' | 'CLAIM_ACCEPTED', data: Record<string, unknown>): Promise<{ chargeMinor: number; codMinor: number }> {
  const codMinor = Math.max(0, ex.codToCollectMinor - ex.deliveryChargeMinor);
  await tx.exchange.update({ where: { id: ex.id }, data: { deliveryChargeMinor: 0, codToCollectMinor: codMinor, chargeState: state, chargePayer: 'STORE', ...data } }); // hardcode-ok: the shop pays the charge (a neutral zero)
  return { chargeMinor: ex.deliveryChargeMinor, codMinor };
}

export const waiveInput = z.object({ reason: reasonText }).strict();

export interface ChargeChange {
  exchangeId: string;
  chargeState: string;
  /** The charge that was taken off. */
  waivedMinor: number;
  /** What the rider collects for the new parcel now. */
  codMinor: number;
}

/** Waives the exchange delivery charge with a reason that is logged. Needs `returns.waive`. */
export async function waiveExchangeCharge(deps: OrdersDeps, who: Who, id: string, input: unknown, opts: DecideOptions = {}): Promise<ChargeChange> {
  await allow(deps, who, 'returns.waive');
  const d = parse(waiveInput, input, 'waiver');
  return decideExchange(deps, who, id, opts, async (tx, ex, now) => {
    requestedOnly(ex, 'the charge is waived');
    if (ex.isOurMistake || ex.chargeState === 'WAIVED' || ex.chargeState === 'CLAIM_ACCEPTED' || ex.chargeState === 'STORE' || ex.chargeState === 'FREE_OUR_MISTAKE') throw new OrdersError('NOTHING_CHANGED', 'the customer pays no charge on this exchange', ['chargeState'], { chargeState: ex.chargeState });
    const c = await chargeOff(tx, ex, 'WAIVED', { waiveReason: d.reason, waivedById: who.actor.staffUserId, waivedAt: now });
    return { action: 'waived', message: d.reason, after: { chargeState: 'WAIVED', waivedMinor: c.chargeMinor, codMinor: c.codMinor }, result: { exchangeId: ex.id, chargeState: 'WAIVED', waivedMinor: c.chargeMinor, codMinor: c.codMinor } };
  });
}

export const claimInput = z.object({ note: reasonText, photoAssetIds: z.array(z.uuid()).max(10).optional() }).strict();

/**
 * Records the customer's "your mistake" claim (the shop sent the wrong size or item) with his note and photo — the
 * setting asks for a photo by default. Needs `returns.decide`; deciding it is a separate permission.
 */
export async function recordExchangeClaim(deps: OrdersDeps, who: Who, id: string, input: unknown, opts: DecideOptions = {}): Promise<{ exchangeId: string; claimState: string }> {
  await allow(deps, who, 'returns.decide');
  const d = parse(claimInput, input, 'claim');
  const rules = await setting(deps, who.storeId, 'orders.exchange.charge');
  if (rules.claimPhoto && !d.photoAssetIds?.length) throw new OrdersError('PHOTO_REQUIRED', 'a claim needs a photo', ['photoAssetIds']);
  return decideExchange(deps, who, id, opts, async (tx, ex) => {
    requestedOnly(ex, 'a claim is recorded');
    if (ex.isOurMistake || ex.chargeState === 'CLAIM_ACCEPTED') throw new OrdersError('NOTHING_CHANGED', 'this exchange is already free as our mistake', ['chargeState'], { chargeState: ex.chargeState });
    if (ex.claimState === 'PENDING') throw new OrdersError('EXCHANGE_STATE', 'a claim is already waiting for a decision', ['claimState'], { claimState: ex.claimState });
    await tx.exchange.update({ where: { id: ex.id }, data: { claimState: 'PENDING', claimNote: d.note, photoAssetIds: [...new Set([...ex.photoAssetIds, ...(d.photoAssetIds ?? [])])] } });
    return { action: 'claimed', message: d.note, after: { claimState: 'PENDING', photos: d.photoAssetIds?.length ?? 0 }, result: { exchangeId: ex.id, claimState: 'PENDING' } };
  });
}

export const claimDecisionInput = z
  .object({ accept: z.boolean(), note: reasonText.optional() })
  .strict()
  .superRefine((v, c) => {
    if (!v.accept && !v.note) c.addIssue({ code: 'custom', path: ['note'], message: 'a refused claim needs its reason' });
  });

/**
 * Decides a waiting claim: approved → the shop pays the charge (CLAIM_ACCEPTED); refused → the charge stays, with the
 * reason the customer is told. Needs `returns.claims.decide`.
 */
export async function decideExchangeClaim(deps: OrdersDeps, who: Who, id: string, input: unknown, opts: DecideOptions = {}): Promise<ChargeChange & { claimState: string }> {
  await allow(deps, who, 'returns.claims.decide');
  const d = parse(claimDecisionInput, input, 'claim decision');
  return decideExchange(deps, who, id, opts, async (tx, ex, now) => {
    requestedOnly(ex, 'a claim is decided');
    if (ex.claimState !== 'PENDING') throw new OrdersError('EXCHANGE_STATE', 'no claim is waiting', ['claimState'], { claimState: ex.claimState });
    const decided = { claimDecidedById: who.actor.staffUserId, claimDecidedAt: now };
    if (!d.accept) {
      await tx.exchange.update({ where: { id: ex.id }, data: { claimState: 'REFUSED', ...decided } });
      return { action: 'claimRefused', message: d.note ?? null, after: { claimState: 'REFUSED' }, result: { exchangeId: ex.id, claimState: 'REFUSED', chargeState: ex.chargeState ?? 'NOT_SET', waivedMinor: 0, codMinor: ex.codToCollectMinor } };
    }
    const c = await chargeOff(tx, ex, 'CLAIM_ACCEPTED', { claimState: 'ACCEPTED', ...decided });
    return { action: 'claimAccepted', message: d.note ?? null, after: { claimState: 'ACCEPTED', chargeState: 'CLAIM_ACCEPTED', waivedMinor: c.chargeMinor, codMinor: c.codMinor }, result: { exchangeId: ex.id, claimState: 'ACCEPTED', chargeState: 'CLAIM_ACCEPTED', waivedMinor: c.chargeMinor, codMinor: c.codMinor } };
  });
}
