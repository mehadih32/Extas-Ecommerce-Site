// S28 · PR 671 (CN-048, admin prototype v5, GAP-MAP C-07; docs/demo/admin-proto-v5/courier-research.md) — a payout asked of a
// courier through the courier's OWN payment-request feature (Steadfast's `payment_request`; Pathao's is read only; RedX has none),
// never an "Ask for payment" of ours. Off as shipped (`delivery.courier.payouts.enabled`), and it never runs without the
// owner's say: asking needs `payments.settle` AND the owner's PIN (`verifyOwnerPin`, never stored or logged as typed).
//
//   payoutView(deps, who, courierId)          what the courier holds (the parcels a request would cover), its own figure when it
//                                             gives one, the open request and the latest ones (`payments.view`)
//   requestPayout(deps, who, courierId, in)   asks the courier to pay what the parcels it holds come to: {pin, requestKey}
//                                             (`payments.settle` + PIN). The row is saved first, so a request is never asked twice
//                                             (the same `requestKey` is the same request); a courier that did not answer leaves the
//                                             request open and unknown until a person checks and closes it (`closePayout`)
//   pollPayouts(deps, storeId, opts)          reads every open request back (REQUESTED → PROCESSING → PAID or REJECTED) and, when
//                                             the courier says PAID, settles the parcels it covers in the name of the person who
//                                             asked (their `payments.settle` is checked again). Run by the job and by "Check now"
//   settlePayout(deps, who, payoutId)         puts the covered parcels on an imported statement (`importSettlement`, the same
//                                             matching as a statement file), once; for a PAID request the poll could not settle
//
// A paid amount that differs from what the covered parcels come to is kept in `differenceMinor` and flagged, never
// corrected; a parcel the courier's request did not cover stays with the courier. Nothing here deletes anything.
import { minorToMajorText } from '@extas/adapters/money';
import { courierCapabilitiesOf, type CourierPayoutInfo, type PayoutRequestResult } from '@extas/adapters';
import { verifyOwnerPin, type PinPolicy } from '@extas/auth';
import type { Prisma } from '@extas/db/client';
import { z } from 'zod';
import { allow, KEY, nowOf, parse, setting, UUID, type PaymentsDeps, type Who } from './context';
import { importSettlement } from './cod';
import { PaymentsError } from './errors';
import { auditMoney } from './wallet';

export const PAYOUT_LATEST = 20;
const PIN_MAX_DIGITS = 12;
const OPEN = ['REQUESTED', 'PROCESSING'] as const;
const DELIVERED = ['DELIVERED', 'PARTIALLY_DELIVERED'] as const;

export interface PayoutRow {
  id: string;
  state: string;
  mode: string;
  providerRef: string | null;
  amountMinor: number;
  coveredMinor: number;
  paidMinor: number | null;
  differenceMinor: number | null;
  paymentRef: string | null;
  method: string | null;
  paidAt: Date | null;
  rawStatus: string | null;
  note: string | null;
  parcels: number;
  settledAt: Date | null;
  settleError: string | null;
  requestedAt: Date;
  lastCheckedAt: Date | null;
}

export interface PayoutView {
  /** What the courier's own feature allows: `request` (we may ask), `read` (we only read what it paid), `none`. */
  supported: 'request' | 'read' | 'none';
  enabled: boolean;
  minAmountMinor: number;
  /** The parcels a request would cover now: delivered with cash collected, on no statement and in no open request. */
  holds: { parcels: number; cashMinor: number; chargesMinor: number; netMinor: number };
  /** What the courier says it holds, when it says (null: it gives no figure, or it did not answer). */
  courierBalanceMinor: number | null;
  open: PayoutRow | null;
  rows: PayoutRow[];
  /** Why a request cannot be asked now (empty: it can). */
  blockedBy: ('OFF' | 'NOT_SUPPORTED' | 'OPEN' | 'NOTHING' | 'BELOW_MINIMUM')[];
}

const SELECT = {
  id: true,
  state: true,
  mode: true,
  providerRef: true,
  amountMinor: true,
  coveredMinor: true,
  paidMinor: true,
  differenceMinor: true,
  paymentRef: true,
  method: true,
  paidAt: true,
  rawStatus: true,
  note: true,
  shipmentIds: true,
  settledAt: true,
  settleError: true,
  requestedAt: true,
  lastCheckedAt: true,
} as const;

type Row = Prisma.CourierPayoutGetPayload<{ select: typeof SELECT }>;
const idsOf = (v: Prisma.JsonValue): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const rowOf = ({ shipmentIds, ...r }: Row): PayoutRow => ({ ...r, parcels: idsOf(shipmentIds).length });

async function account(deps: PaymentsDeps, storeId: number, id: string) {
  const a = UUID.test(id) ? await deps.db.courierAccount.findFirst({ where: { id, storeId }, select: { id: true, name: true, providerKey: true, enabled: true, archivedAt: true } }) : null;
  if (!a) throw new PaymentsError('NOT_FOUND', 'no such courier account', ['courierAccountId']);
  return a;
}

/** The parcels a courier holds cash for and no request or statement covers yet, with what they come to (pure over rows). */
export async function coveredParcels(deps: Pick<PaymentsDeps, 'db'>, storeId: number, courierAccountId: string) {
  const open = await deps.db.courierPayout.findMany({ where: { storeId, courierAccountId, state: { in: [...OPEN] } }, select: { shipmentIds: true } });
  const inOpen = new Set(open.flatMap((o) => idsOf(o.shipmentIds)));
  const rows = await deps.db.shipment.findMany({
    where: { storeId, courierAccountId, status: { in: [...DELIVERED] }, OR: [{ codAmountMinor: { gt: 0 } }, { codCollectedMinor: { gt: 0 } }] },
    select: { id: true, consignmentId: true, codAmountMinor: true, codCollectedMinor: true, chargeMinor: true },
    orderBy: { id: 'asc' },
    take: 20_000,
  });
  const onStatement = new Set(
    (await deps.db.courierSettlementLine.findMany({ where: { storeId, kind: 'COD', shipmentId: { in: rows.map((r) => r.id) } }, select: { shipmentId: true } })).map((l) => l.shipmentId!),
  );
  const parcels = rows
    .filter((r) => !onStatement.has(r.id) && !inOpen.has(r.id))
    .map((r) => ({ id: r.id, consignmentId: r.consignmentId, cashMinor: r.codCollectedMinor ?? r.codAmountMinor, chargeMinor: r.chargeMinor ?? 0 }))
    .filter((r) => r.cashMinor > 0);
  const cashMinor = parcels.reduce((s, p) => s + p.cashMinor, 0);
  const chargesMinor = parcels.reduce((s, p) => s + p.chargeMinor, 0);
  return { parcels, cashMinor, chargesMinor, netMinor: cashMinor - chargesMinor };
}

/** The courier's payouts: what it holds, its own figure, the open request and the latest ones (`payments.view`). */
export async function payoutView(deps: PaymentsDeps, who: Who, courierAccountId: string): Promise<PayoutView> {
  await allow(deps, who, 'payments.view');
  const storeId = who.storeId;
  const a = await account(deps, storeId, courierAccountId);
  const cfg = await setting(deps, storeId, 'delivery.courier.payouts');
  const supported = courierCapabilitiesOf(a.providerKey)?.payouts ?? 'none';
  const [cov, rows] = await Promise.all([
    coveredParcels(deps, storeId, a.id),
    deps.db.courierPayout.findMany({ where: { storeId, courierAccountId: a.id }, select: SELECT, orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }], take: PAYOUT_LATEST }),
  ]);
  const open = rows.find((r) => (OPEN as readonly string[]).includes(r.state)) ?? null;
  let courierBalanceMinor: number | null = null;
  if (cfg.enabled && supported !== 'none' && deps.couriers) {
    try {
      courierBalanceMinor = (await (await deps.couriers(storeId, a.providerKey)).api.balance?.())?.balanceMinor ?? null;
    } catch {
      courierBalanceMinor = null;
    }
  }
  const blockedBy: PayoutView['blockedBy'] = [];
  if (!cfg.enabled) blockedBy.push('OFF');
  if (supported !== 'request') blockedBy.push('NOT_SUPPORTED');
  if (open) blockedBy.push('OPEN');
  if (cov.netMinor <= 0) blockedBy.push('NOTHING');
  else if (cov.netMinor < cfg.minAmountMinor) blockedBy.push('BELOW_MINIMUM');
  return {
    supported,
    enabled: cfg.enabled,
    minAmountMinor: cfg.minAmountMinor,
    holds: { parcels: cov.parcels.length, cashMinor: cov.cashMinor, chargesMinor: cov.chargesMinor, netMinor: cov.netMinor },
    courierBalanceMinor,
    open: open ? rowOf(open) : null,
    rows: rows.map(rowOf),
    blockedBy,
  };
}

/** `payments.settle` in this store (for the "Check now" route, which reads requests back and settles the paid ones). */
export const allowPayouts = (deps: PaymentsDeps, who: Who): Promise<void> => allow(deps, who, 'payments.settle');

const requestInput = z.object({ pin: z.string().max(40).default(''), requestKey: z.string().regex(KEY) }).strict();

async function pinPolicy(deps: PaymentsDeps): Promise<PinPolicy> {
  const [minLength, maxAttempts, lockMinutes] = await Promise.all([
    deps.settings.value('books.pin.minLength'),
    deps.settings.value('books.pin.maxAttempts'),
    deps.settings.value('books.pin.lockMinutes'),
  ]);
  return { minLength, maxLength: Math.max(minLength, PIN_MAX_DIGITS), maxAttempts, lockMinutes };
}

/**
 * S28 · PR 674: the owner's payout text (`delivery.courier.messages`) filled for this request, in the booking card's note
 * language; null while the switch is off. It travels as the payout request's note, never as a message of its own.
 */
async function payoutNote(deps: PaymentsDeps, storeId: number, courierName: string, amountMinor: number): Promise<string | null> {
  const cfg = await setting(deps, storeId, 'delivery.courier.messages');
  if (!cfg.enabled) return null;
  const [lang, currency] = await Promise.all([setting(deps, storeId, 'delivery.courier.booking'), setting(deps, storeId, 'store.currency')]);
  const values: Record<string, string> = { courier: courierName, amount: minorToMajorText(amountMinor, currency) };
  const text = cfg.payout[lang.noteLang]
    .replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return text || null;
}

/** Asks the courier to pay what the parcels it holds come to (`payments.settle` and the owner's PIN). */
export async function requestPayout(deps: PaymentsDeps, who: Who, courierAccountId: string, input: unknown): Promise<PayoutRow & { replay: boolean }> {
  await allow(deps, who, 'payments.settle');
  const d = parse(requestInput, input, 'payout request');
  const storeId = who.storeId;
  const a = await account(deps, storeId, courierAccountId);
  const same = await deps.db.courierPayout.findFirst({ where: { storeId, requestKey: d.requestKey }, select: { ...SELECT, courierAccountId: true } });
  if (same) {
    if (same.courierAccountId !== a.id) throw new PaymentsError('IDEMPOTENCY_MISMATCH', 'this request key belongs to another courier');
    return { ...rowOf(same), replay: true };
  }
  const cfg = await setting(deps, storeId, 'delivery.courier.payouts');
  if (!cfg.enabled) throw new PaymentsError('PAYOUTS_OFF', 'courier payouts are switched off');
  if (courierCapabilitiesOf(a.providerKey)?.payouts !== 'request' || !deps.couriers) throw new PaymentsError('PAYOUT_NOT_SUPPORTED', 'this courier has no payment request of its own');
  if (!a.enabled || a.archivedAt) throw new PaymentsError('NOT_FOUND', 'this courier account is switched off', ['courierAccountId']);
  const open = await deps.db.courierPayout.findFirst({ where: { storeId, courierAccountId: a.id, state: { in: [...OPEN] } }, select: { id: true } });
  if (open) throw new PaymentsError('PAYOUT_OPEN', 'an earlier request to this courier is still open', [], { payoutId: open.id });
  const cov = await coveredParcels(deps, storeId, a.id);
  if (cov.netMinor <= 0) throw new PaymentsError('PAYOUT_NOTHING', 'this courier holds nothing to ask for', [], { minAmountMinor: cfg.minAmountMinor });
  if (cov.netMinor < cfg.minAmountMinor)
    throw new PaymentsError('PAYOUT_NOTHING', 'less than the smallest amount to ask for', ['amount'], { minAmountMinor: cfg.minAmountMinor, netMinor: cov.netMinor });
  // the owner's PIN, checked before anything is asked (WRONG_PIN, PIN_REQUIRED … come from the auth package)
  await verifyOwnerPin(deps.db, who.actor, d.pin, await pinPolicy(deps), { action: 'courier.payout.request', storeId, now: nowOf(deps), ctx: { source: 'admin-api', ...who.ctx } });
  const { api, mode } = await deps.couriers(storeId, a.providerKey);
  if (!api.payouts?.request) throw new PaymentsError('PAYOUT_NOT_SUPPORTED', 'this courier has no payment request of its own');
  const at = nowOf(deps);
  // saved first: a request that timed out is a row waiting for a person, never asked twice
  const row = await deps.db.$transaction(async (tx) => {
    const r = await tx.courierPayout.create({
      data: {
        storeId,
        courierAccountId: a.id,
        state: 'REQUESTED',
        mode,
        amountMinor: cov.netMinor,
        coveredMinor: cov.netMinor,
        shipmentIds: cov.parcels.map((p) => p.id),
        requestedAt: at,
        requestedById: who.actor.staffUserId,
        requestKey: d.requestKey,
      },
      select: { id: true },
    });
    await auditMoney(tx, who, 'courier.payout.request', 'CourierPayout', r.id, undefined, { courierAccountId: a.id, amountMinor: cov.netMinor, parcels: cov.parcels.length, mode });
    return r;
  });
  const note = await payoutNote(deps, storeId, a.name, cov.netMinor);
  let result: PayoutRequestResult;
  try {
    result = await api.payouts.request!({ merchantRef: row.id, amountMinor: cov.netMinor, note });
  } catch (e) {
    result = { ok: false, error: e instanceof Error ? e.message.split('\n')[0]!.slice(0, 200) : 'no answer', unknown: true };
  }
  const data: Prisma.CourierPayoutUpdateInput = result.ok
    ? { providerRef: result.payout.ref, state: result.payout.state, rawStatus: result.payout.rawStatus, lastCheckedAt: at, ...(result.payout.state === 'REJECTED' ? { note: result.payout.note } : {}) }
    : result.unknown
      ? { note: result.error.slice(0, 300), settleError: 'UNKNOWN' }
      : { state: 'REJECTED', note: result.error.slice(0, 300), lastCheckedAt: at };
  const saved = await deps.db.courierPayout.update({ where: { id: row.id }, data, select: SELECT });
  await auditMoney(deps.db, who, result.ok ? 'courier.payout.asked' : result.unknown ? 'courier.payout.unknown' : 'courier.payout.refused', 'CourierPayout', row.id, undefined, {
    state: saved.state,
    providerRef: saved.providerRef,
    note: saved.note,
  });
  if (!result.ok && !result.unknown) throw new PaymentsError('PAYOUT_REFUSED', result.error, [], { payoutId: row.id });
  return { ...rowOf(saved), replay: false };
}

/** What the courier's word for a payout says about the money: the difference from what the parcels came to (null when equal or unknown). */
export const payoutDifference = (paidMinor: number | null, coveredMinor: number): number | null => (paidMinor === null || paidMinor === coveredMinor ? null : paidMinor - coveredMinor);

export interface PollResult {
  checked: number;
  changed: number;
  paid: number;
  settled: number;
  unsettled: number;
  unknown: number;
  errors: number;
}

const bankOf = (method: string | null): 'BANK' | 'BKASH' | 'CASH_AT_COURIER_OFFICE' => (/bkash|bikash/i.test(method ?? '') ? 'BKASH' : /cash/i.test(method ?? '') ? 'CASH_AT_COURIER_OFFICE' : 'BANK');

/** Puts a PAID request's covered parcels on an imported statement, once, in the name of `who` (`payments.settle`). */
export async function settlePayout(deps: PaymentsDeps, who: Who, payoutId: string): Promise<PayoutRow> {
  await allow(deps, who, 'payments.settle');
  const storeId = who.storeId;
  const r = UUID.test(payoutId) ? await deps.db.courierPayout.findFirst({ where: { id: payoutId, storeId }, select: { ...SELECT, courierAccountId: true } }) : null;
  if (!r) throw new PaymentsError('NOT_FOUND', 'no such payout', ['payoutId']);
  if (r.state !== 'PAID') throw new PaymentsError('NOT_PENDING', 'only a request the courier has paid is settled', [], { state: r.state });
  if (r.settledAt) return rowOf(r);
  const ids = idsOf(r.shipmentIds);
  const ships = await deps.db.shipment.findMany({
    where: { storeId, id: { in: ids }, consignmentId: { not: null } },
    select: { id: true, consignmentId: true, codAmountMinor: true, codCollectedMinor: true, chargeMinor: true },
  });
  const onStatement = new Set(
    (await deps.db.courierSettlementLine.findMany({ where: { storeId, kind: 'COD', shipmentId: { in: ships.map((s) => s.id) } }, select: { shipmentId: true } })).map((l) => l.shipmentId!),
  );
  const lines = ships
    .filter((s) => !onStatement.has(s.id))
    .map((s) => ({ consignmentId: s.consignmentId!, codMinor: s.codCollectedMinor ?? s.codAmountMinor, chargeMinor: s.chargeMinor ?? 0, status: 'delivered' }));
  let settlementId: string | null = null;
  if (lines.length) {
    const s = await importSettlement(deps, who, {
      courierAccountId: r.courierAccountId,
      reference: `PAYOUT-${r.providerRef ?? r.id}`.slice(0, 120),
      receivedAt: r.paidAt ?? nowOf(deps),
      receivedAs: bankOf(r.method),
      receivedAccountRef: r.paymentRef ?? undefined,
      lines,
    });
    settlementId = s.settlementId;
  }
  const saved = await deps.db.courierPayout.update({ where: { id: r.id }, data: { settlementId, settledAt: nowOf(deps), settleError: null }, select: SELECT });
  await auditMoney(deps.db, who, 'courier.payout.settle', 'CourierPayout', r.id, undefined, { settlementId, lines: lines.length, differenceMinor: saved.differenceMinor });
  return rowOf(saved);
}

/**
 * Reads the open requests of a store back from the couriers, and settles the PAID ones in the name of the person who
 * asked. `ids` limits it to some requests and `force` ignores the polling interval ("Check now"). A courier that does not
 * answer is counted, never a failure; a request the courier does not know (`unknown`) stays open for a person.
 */
export async function pollPayouts(deps: PaymentsDeps, storeId: number, opts: { ids?: string[]; force?: boolean } = {}): Promise<PollResult> {
  const out: PollResult = { checked: 0, changed: 0, paid: 0, settled: 0, unsettled: 0, unknown: 0, errors: 0 };
  const couriers = deps.couriers;
  if (!couriers) return out;
  const cfg = await setting(deps, storeId, 'delivery.courier.payouts');
  const now = nowOf(deps);
  const due = opts.force || opts.ids ? undefined : new Date(now.getTime() - cfg.pollMinutes * 60_000);
  const [rows, paidUnsettled] = await Promise.all([
    deps.db.courierPayout.findMany({
      where: {
        storeId,
        state: { in: [...OPEN] },
        providerRef: { not: null },
        ...(opts.ids ? { id: { in: opts.ids } } : {}),
        ...(due ? { OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: due } }] } : {}),
      },
      select: { ...SELECT, courierAccountId: true, requestedById: true, courierAccount: { select: { providerKey: true } } },
      orderBy: { requestedAt: 'asc' },
      take: 200,
    }),
    deps.db.courierPayout.findMany({
      where: { storeId, state: 'PAID', settledAt: null, settleError: null, ...(opts.ids ? { id: { in: opts.ids } } : {}) },
      select: { id: true, requestedById: true },
      take: 200,
    }),
  ]);
  for (const r of rows) {
    out.checked += 1;
    let info: CourierPayoutInfo | null;
    try {
      const { api } = await couriers(storeId, r.courierAccount.providerKey);
      info = (await api.payouts?.status(r.providerRef!)) ?? null;
    } catch {
      out.errors += 1;
      continue;
    }
    if (!info) {
      out.unknown += 1;
      await deps.db.courierPayout.update({ where: { id: r.id }, data: { lastCheckedAt: now } });
      continue;
    }
    const paid = info.state === 'PAID';
    const paidMinor = paid ? (info.amountMinor ?? null) : null;
    const diff = paid ? payoutDifference(paidMinor, r.coveredMinor) : null;
    if (info.state !== r.state || paid) out.changed += info.state !== r.state ? 1 : 0;
    await deps.db.$transaction(async (tx) => {
      await tx.courierPayout.update({
        where: { id: r.id },
        data: {
          state: info.state,
          rawStatus: info.rawStatus,
          lastCheckedAt: now,
          ...(paid ? { paidMinor, paymentRef: info.paymentRef, method: info.method, paidAt: info.paidAt ?? now, differenceMinor: diff } : {}),
          ...(info.state === 'REJECTED' ? { note: info.note ?? r.note } : {}),
        },
      });
      if (info.state !== r.state)
        await auditMoney(
          tx,
          { actor: { staffUserId: null }, storeId },
          `courier.payout.${info.state.toLowerCase()}`,
          'CourierPayout',
          r.id,
          { state: r.state },
          { state: info.state, paidMinor, differenceMinor: diff, rawStatus: info.rawStatus },
        );
    });
    if (paid) paidUnsettled.push({ id: r.id, requestedById: r.requestedById });
    if (paid) out.paid += 1;
  }
  for (const p of paidUnsettled) {
    try {
      await settlePayout(deps, { actor: { staffUserId: p.requestedById }, storeId }, p.id);
      out.settled += 1;
    } catch (e) {
      out.unsettled += 1;
      const code = (e as { code?: string }).code ?? 'ERROR';
      await deps.db.courierPayout.update({ where: { id: p.id }, data: { settleError: code.slice(0, 80) } });
    }
  }
  return out;
}

/** A request the courier never confirmed (no reference) is closed by a person who checked the courier's panel (`payments.settle`); nothing is deleted. */
export async function closePayout(deps: PaymentsDeps, who: Who, payoutId: string, input: unknown): Promise<PayoutRow> {
  await allow(deps, who, 'payments.settle');
  const d = parse(z.object({ note: z.string().trim().min(5).max(300) }).strict(), input, 'close');
  const r = UUID.test(payoutId) ? await deps.db.courierPayout.findFirst({ where: { id: payoutId, storeId: who.storeId }, select: SELECT }) : null;
  if (!r) throw new PaymentsError('NOT_FOUND', 'no such payout', ['payoutId']);
  if (r.providerRef !== null || !(OPEN as readonly string[]).includes(r.state))
    throw new PaymentsError('NOT_PENDING', 'only a request the courier never confirmed is closed by hand', [], { state: r.state });
  const saved = await deps.db.courierPayout.update({ where: { id: r.id }, data: { state: 'REJECTED', note: d.note, settleError: null }, select: SELECT });
  await auditMoney(deps.db, who, 'courier.payout.close', 'CourierPayout', r.id, { state: r.state }, { state: 'REJECTED', note: d.note });
  return rowOf(saved);
}
