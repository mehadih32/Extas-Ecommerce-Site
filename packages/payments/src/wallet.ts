// S07 · PR 171 — the wallet: credit, debit, balance, and the ledger behind it (Blueprint B3.5; BACKEND-ARCHITECTURE
// §6.5.4 fact 4b, §7.7; SIM-F-054; CN-018 #8).
//
// - `postWalletEntry`: the one writer of the ledger inside the caller's transaction (refunds, the apology credit, a
//   person's own entry, a reversal; S08's exchange credit later). The customer's wallet is made the first time it is
//   needed; its row is locked; one entry per idempotency key (the same key with another entry is refused); a debit
//   never takes the balance below zero; the cached balance moves with the entry, and the entry keeps the balance after
//   it. Nothing is ever edited: a correction is a new entry the other way (`reverseWalletEntry`).
// - `walletOf` (`payments.view`): a customer's wallet with its ledger, newest first, and the balance worked out from
//   the ledger itself next to the cached one (a difference is shown, never hidden).
// - `adjustWallet` (`payments.wallet`, only while `payments.wallet.manual` is on): a person's own credit or debit with
//   a note and the amount confirmed, within the owner's limit; audited.
// - `reverseWalletEntry` (`payments.wallet`): puts one entry right with the opposite entry (CORRECTION), once.
// - `giveApology` (`payments.apology`, only while `payments.wallet.apology` is on): the late-delivery apology credit on
//   an order, by a person's amount or the owner's rule, once per order; on the order's timeline and audited.
// - `apologyCandidates` (`payments.view`): the delivered orders that came late and have no apology yet.
// The checkout's own wallet debit (@extas/checkout place.ts) and the review reward (@extas/catalogue reviews.ts) write
// the same ledger the same way; wallet.guard.test.ts keeps every other writer out.
import { Prisma } from '@extas/db/client';
import { z } from 'zod';
import { allow, KEY, nowOf, parse, setting, TX, UUID, type Db, type PaymentsDeps, type Tx, type Who } from './context';
import { PaymentsError } from './errors';
import { apologyAmount, lateHoursOf, ledgerBalance, nextBalance, opposite, REVERSIBLE_REASONS, WALLET_ACTIVE, type Direction, type WalletReason } from './wallet-pure';

/** The timeline's event types of the wallet on an order. */
export const WALLET_EVENTS = { apology: 'wallet.apology' } as const;

const actorOf = (who: Who) => ({ actorType: who.actor.staffUserId ? ('STAFF' as const) : ('SYSTEM' as const), actorId: who.actor.staffUserId });

/** One audit row for a staff action of the money services (written in the action's transaction). */
export const auditMoney = (tx: Db, who: Who, action: string, entityType: string, entityId: string, before: Prisma.InputJsonValue | undefined, after: Prisma.InputJsonValue) =>
  tx.auditLog.create({
    data: {
      storeId: who.storeId,
      ...actorOf(who),
      action,
      entityType,
      entityId,
      ...(before === undefined ? {} : { before }),
      after,
      ip: who.ctx?.ip ? who.ctx.ip.slice(0, 64) : null,
      userAgent: who.ctx?.userAgent ? who.ctx.userAgent.slice(0, 512) : null,
      source: who.ctx?.source ?? 'admin',
    },
  });

// ---------------------------------------------------------------------------------------------------------------------
// The one writer
// ---------------------------------------------------------------------------------------------------------------------

export interface WalletEntryInput {
  storeId: number;
  customerId: string;
  direction: Direction;
  amountMinor: number;
  reason: WalletReason;
  idempotencyKey: string;
  orderId?: string | null;
  exchangeId?: string | null;
  note?: string | null;
  actorId?: string | null;
  reversesEntryId?: string | null;
}

export interface PostedEntry {
  entryId: string;
  walletId: string;
  balanceAfterMinor: number;
  /** The same key was posted before: this is that entry. */
  replay: boolean;
}

/** Writes one ledger entry inside the caller's transaction (see the file header). */
export async function postWalletEntry(tx: Tx, e: WalletEntryInput): Promise<PostedEntry> {
  if (!Number.isInteger(e.amountMinor) || e.amountMinor <= 0) throw new PaymentsError('INVALID_INPUT', 'a wallet entry needs a positive whole amount', ['amountMinor']);
  const customer = await tx.customer.findFirst({ where: { id: e.customerId, storeId: e.storeId }, select: { id: true } });
  if (!customer) throw new PaymentsError('NOT_FOUND', 'no such customer', ['customerId']);
  await tx.$executeRaw`INSERT INTO "WalletAccount" ("id", "storeId", "customerId", "balanceMinor", "status", "updatedAt")
    VALUES (gen_random_uuid(), ${e.storeId}, ${e.customerId}::uuid, 0, ${WALLET_ACTIVE}, now()) ON CONFLICT ("customerId") DO NOTHING`;
  const rows = await tx.$queryRaw<{ id: string; balanceMinor: number; status: string; storeId: number }[]>`
    SELECT "id"::text AS id, "balanceMinor", "status", "storeId" FROM "WalletAccount" WHERE "customerId" = ${e.customerId}::uuid FOR UPDATE`;
  const w = rows[0];
  if (!w || w.storeId !== e.storeId) throw new PaymentsError('NOT_FOUND', 'no such wallet', ['customerId']);
  const same = await tx.walletEntry.findUnique({ where: { walletId_idempotencyKey: { walletId: w.id, idempotencyKey: e.idempotencyKey } } });
  if (same) {
    if (same.direction !== e.direction || same.amountMinor !== e.amountMinor || same.reason !== e.reason || (same.orderId ?? null) !== (e.orderId ?? null)) {
      throw new PaymentsError('IDEMPOTENCY_MISMATCH', 'this key was used for another wallet entry', ['idempotencyKey']);
    }
    return { entryId: same.id, walletId: w.id, balanceAfterMinor: same.balanceAfterMinor, replay: true };
  }
  if (w.status !== WALLET_ACTIVE) throw new PaymentsError('WALLET_CLOSED', 'the wallet is not active', [], { status: w.status });
  const after = nextBalance(w.balanceMinor, e.direction, e.amountMinor);
  if (after === null) throw new PaymentsError('INSUFFICIENT_BALANCE', 'the wallet does not hold that much', ['amountMinor'], { balanceMinor: w.balanceMinor });
  const entry = await tx.walletEntry.create({
    data: {
      storeId: e.storeId,
      walletId: w.id,
      direction: e.direction,
      amountMinor: e.amountMinor,
      balanceAfterMinor: after,
      reason: e.reason,
      orderId: e.orderId ?? null,
      exchangeId: e.exchangeId ?? null,
      idempotencyKey: e.idempotencyKey,
      note: e.note ?? null,
      actorId: e.actorId ?? null,
      reversesEntryId: e.reversesEntryId ?? null,
    },
    select: { id: true },
  });
  await tx.walletAccount.update({ where: { id: w.id }, data: { balanceMinor: after } });
  return { entryId: entry.id, walletId: w.id, balanceAfterMinor: after, replay: false };
}

/** Runs a wallet write; two presses at the same moment end as one entry (the second finds the first). */
async function once<T>(deps: PaymentsDeps, fn: (tx: Tx) => Promise<T>): Promise<T> {
  try {
    return await deps.db.$transaction(fn, TX);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return deps.db.$transaction(fn, TX);
    throw e;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Reading a wallet
// ---------------------------------------------------------------------------------------------------------------------

export interface WalletEntryRow {
  id: string;
  direction: Direction;
  amountMinor: number;
  balanceAfterMinor: number;
  reason: string;
  orderId: string | null;
  note: string | null;
  actorId: string | null;
  reversesEntryId: string | null;
  /** This entry was put right by a later one. */
  reversedBy: string | null;
  createdAt: Date;
}

export interface WalletView {
  customerId: string;
  walletId: string | null;
  status: string | null;
  /** The cached balance (what the checkout spends). */
  balanceMinor: number;
  /** The balance worked out from every entry of the ledger. */
  ledgerMinor: number;
  /** The two differ: something wrote the cached balance without an entry (never expected; shown, never hidden). */
  drift: boolean;
  entries: WalletEntryRow[];
  more: boolean;
}

/** A customer's wallet and its ledger (`payments.view`). */
export async function walletOf(deps: PaymentsDeps, who: Who, customerId: string, opts: { limit?: number } = {}): Promise<WalletView | null> {
  await allow(deps, who, 'payments.view');
  if (!UUID.test(customerId)) return null;
  const c = await deps.db.customer.findFirst({ where: { id: customerId, storeId: who.storeId }, select: { id: true } });
  if (!c) return null;
  const w = await deps.db.walletAccount.findFirst({ where: { customerId, storeId: who.storeId }, select: { id: true, status: true, balanceMinor: true } });
  if (!w) return { customerId, walletId: null, status: null, balanceMinor: 0, ledgerMinor: 0, drift: false, entries: [], more: false };
  const take = Math.min(Math.max(1, Math.trunc(opts.limit ?? 50)), 500);
  const [sums, rows] = await Promise.all([
    deps.db.walletEntry.groupBy({ by: ['direction'], where: { walletId: w.id }, _sum: { amountMinor: true } }),
    deps.db.walletEntry.findMany({ where: { walletId: w.id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: take + 1 }),
  ]);
  const ledgerMinor = ledgerBalance(sums.map((s) => ({ direction: s.direction, amountMinor: s._sum.amountMinor ?? 0 })));
  const page = rows.slice(0, take);
  const reversals = await deps.db.walletEntry.findMany({ where: { walletId: w.id, reversesEntryId: { in: page.map((r) => r.id) } }, select: { id: true, reversesEntryId: true } });
  const reversedBy = new Map(reversals.map((r) => [r.reversesEntryId!, r.id]));
  return {
    customerId,
    walletId: w.id,
    status: w.status,
    balanceMinor: w.balanceMinor,
    ledgerMinor,
    drift: ledgerMinor !== w.balanceMinor,
    entries: page.map((r) => ({
      id: r.id,
      direction: r.direction,
      amountMinor: r.amountMinor,
      balanceAfterMinor: r.balanceAfterMinor,
      reason: r.reason,
      orderId: r.orderId,
      note: r.note,
      actorId: r.actorId,
      reversesEntryId: r.reversesEntryId,
      reversedBy: reversedBy.get(r.id) ?? null,
      createdAt: r.createdAt,
    })),
    more: rows.length > take,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// A person's own entry, and a reversal
// ---------------------------------------------------------------------------------------------------------------------

export const adjustInputSchema = z
  .object({
    direction: z.enum(['CREDIT', 'DEBIT']),
    amountMinor: z.int().min(1).max(1_000_000_000),
    /** OFFER: credit the owner issues; otherwise a manual credit or debit. */
    kind: z.enum(['MANUAL', 'OFFER']).default('MANUAL'),
    note: z.string().trim().min(3).max(2_000),
    orderId: z.uuid().optional(),
    /** [confirm]: the person checked the amount. */
    confirm: z.boolean().optional(),
  })
  .strict()
  .refine((v) => v.kind !== 'OFFER' || v.direction === 'CREDIT', { message: 'an offer is a credit', path: ['kind'] });

export interface EntryResult extends PostedEntry {
  customerId: string;
  amountMinor: number;
  direction: Direction;
  reason: WalletReason;
}

const keyed = (key: string | undefined) => {
  if (!key || !KEY.test(key)) throw new PaymentsError('INVALID_INPUT', 'a wallet entry needs a valid Idempotency-Key', ['idempotencyKey']);
  return key;
};

/** A person credits or debits a customer's wallet by hand (see the file header). */
export async function adjustWallet(deps: PaymentsDeps, who: Who, customerId: string, input: unknown, opts: { idempotencyKey?: string } = {}): Promise<EntryResult> {
  await allow(deps, who, 'payments.wallet');
  if (!UUID.test(customerId)) throw new PaymentsError('NOT_FOUND', 'no such customer', ['customerId']);
  const key = keyed(opts.idempotencyKey);
  const d = parse(adjustInputSchema, input, 'wallet entry');
  const cfg = await setting(deps, who.storeId, 'payments.wallet.manual');
  if (!cfg.enabled) throw new PaymentsError('WALLET_OFF', 'changing a wallet by hand is switched off (payments.wallet.manual)');
  if (cfg.maxMinor !== null && d.amountMinor > cfg.maxMinor) throw new PaymentsError('OVER_LIMIT', 'more than the largest entry allowed', ['amountMinor'], { limitMinor: cfg.maxMinor });
  if (d.confirm !== true) throw new PaymentsError('CONFIRM_REQUIRED', 'confirm the amount first', ['confirm']);
  if (d.orderId) {
    const o = await deps.db.order.findFirst({ where: { id: d.orderId, storeId: who.storeId, customerId }, select: { id: true } });
    if (!o) throw new PaymentsError('NOT_FOUND', "no such order of this customer", ['orderId']);
  }
  const reason: WalletReason = d.kind === 'OFFER' ? 'OFFER' : d.direction === 'CREDIT' ? 'MANUAL_CREDIT' : 'MANUAL_DEBIT';
  return once(deps, async (tx) => {
    const r = await postWalletEntry(tx, { storeId: who.storeId, customerId, direction: d.direction, amountMinor: d.amountMinor, reason, idempotencyKey: `manual:${key}`, orderId: d.orderId ?? null, note: d.note, actorId: who.actor.staffUserId });
    if (!r.replay) await auditMoney(tx, who, 'wallet.adjust', 'WalletEntry', r.entryId, undefined, { customerId, direction: d.direction, amountMinor: d.amountMinor, reason, note: d.note, orderId: d.orderId ?? null, balanceAfterMinor: r.balanceAfterMinor });
    return { ...r, customerId, amountMinor: d.amountMinor, direction: d.direction, reason };
  });
}

export const reverseInputSchema = z.object({ note: z.string().trim().min(3).max(2_000), confirm: z.boolean().optional() }).strict();

/** Puts one entry right with the opposite entry, once (see the file header). */
export async function reverseWalletEntry(deps: PaymentsDeps, who: Who, entryId: string, input: unknown): Promise<EntryResult> {
  await allow(deps, who, 'payments.wallet');
  if (!UUID.test(entryId)) throw new PaymentsError('NOT_FOUND', 'no such wallet entry', ['entryId']);
  const d = parse(reverseInputSchema, input, 'reversal');
  const e = await deps.db.walletEntry.findFirst({ where: { id: entryId, storeId: who.storeId }, select: { id: true, direction: true, amountMinor: true, reason: true, orderId: true, wallet: { select: { customerId: true } } } });
  if (!e) throw new PaymentsError('NOT_FOUND', 'no such wallet entry', ['entryId']);
  if (!REVERSIBLE_REASONS.has(e.reason)) throw new PaymentsError('NOT_REVERSIBLE', 'this entry is put right through a refund, not a reversal', ['entryId'], { reason: e.reason });
  const done = await deps.db.walletEntry.findFirst({ where: { reversesEntryId: e.id }, select: { id: true, idempotencyKey: true } });
  const customerId = e.wallet.customerId;
  const direction = opposite(e.direction);
  if (done) {
    // the same reversal pressed again is the same entry; there is never a second one
    const w = await deps.db.walletEntry.findUniqueOrThrow({ where: { id: done.id }, select: { balanceAfterMinor: true, walletId: true } });
    return { entryId: done.id, walletId: w.walletId, balanceAfterMinor: w.balanceAfterMinor, replay: true, customerId, amountMinor: e.amountMinor, direction, reason: 'CORRECTION' };
  }
  if (d.confirm !== true) throw new PaymentsError('CONFIRM_REQUIRED', 'confirm the reversal first', ['confirm']);
  return once(deps, async (tx) => {
    const r = await postWalletEntry(tx, { storeId: who.storeId, customerId, direction, amountMinor: e.amountMinor, reason: 'CORRECTION', idempotencyKey: `reverse:${e.id}`, orderId: e.orderId, note: d.note, actorId: who.actor.staffUserId, reversesEntryId: e.id });
    if (!r.replay) await auditMoney(tx, who, 'wallet.reverse', 'WalletEntry', r.entryId, { entryId: e.id, direction: e.direction, amountMinor: e.amountMinor, reason: e.reason }, { customerId, direction, amountMinor: e.amountMinor, note: d.note, balanceAfterMinor: r.balanceAfterMinor });
    return { ...r, customerId, amountMinor: e.amountMinor, direction, reason: 'CORRECTION' as const };
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// The late-delivery apology credit (CN-018 #8)
// ---------------------------------------------------------------------------------------------------------------------

const LATE_STATUSES = ['DELIVERED', 'PARTIALLY_DELIVERED'] as const;
const APOLOGY_ORDER = {
  id: true,
  number: true,
  status: true,
  customerId: true,
  placedAt: true,
  deliveredAt: true,
  subtotalMinor: true,
  discountMinor: true,
  deliveryBand: { select: { hoursMax: true } },
} satisfies Prisma.OrderSelect;

const goodsOf = (o: { subtotalMinor: number; discountMinor: number }) => Math.max(0, o.subtotalMinor - o.discountMinor);

export const apologyInputSchema = z
  .object({
    /** PER_ORDER: the amount the person gives (within the limit); RULE: left out (the rule decides). */
    amountMinor: z.int().min(1).max(1_000_000_000).optional(),
    note: z.string().trim().max(2_000).optional(),
    confirm: z.boolean().optional(),
  })
  .strict();

export interface ApologyResult extends PostedEntry {
  orderId: string;
  number: string;
  customerId: string;
  amountMinor: number;
}

/** The apology credit on one order (see the file header). */
export async function giveApology(deps: PaymentsDeps, who: Who, orderId: string, input: unknown): Promise<ApologyResult> {
  await allow(deps, who, 'payments.apology');
  if (!UUID.test(orderId)) throw new PaymentsError('NOT_FOUND', 'no such order', ['orderId']);
  const d = parse(apologyInputSchema, input, 'apology credit');
  const rule = await setting(deps, who.storeId, 'payments.wallet.apology');
  if (!rule.enabled) throw new PaymentsError('APOLOGY_OFF', 'the apology credit is switched off (payments.wallet.apology)');
  const o = await deps.db.order.findFirst({ where: { id: orderId, storeId: who.storeId }, select: APOLOGY_ORDER });
  if (!o) throw new PaymentsError('NOT_FOUND', 'no such order', ['orderId']);
  if (!o.customerId) throw new PaymentsError('NO_CUSTOMER', 'the order has no customer, so there is no wallet');
  if (o.status === 'CANCELLED' || o.status === 'DRAFT') throw new PaymentsError('ORDER_CLOSED', 'the order is not one to apologise for', [], { status: o.status });
  const key = `apology:${o.id}`;
  const given = await deps.db.walletEntry.findFirst({ where: { storeId: who.storeId, orderId: o.id, reason: 'APOLOGY' }, select: { id: true, amountMinor: true, balanceAfterMinor: true, walletId: true } });
  if (given) {
    if (d.amountMinor === undefined || d.amountMinor === given.amountMinor) return { entryId: given.id, walletId: given.walletId, balanceAfterMinor: given.balanceAfterMinor, replay: true, orderId: o.id, number: o.number, customerId: o.customerId, amountMinor: given.amountMinor };
    throw new PaymentsError('ALREADY_RECORDED', 'this order has its apology credit already', [], { entryId: given.id, amountMinor: given.amountMinor });
  }
  const lateHours = lateHoursOf({ placedAt: o.placedAt, deliveredAt: o.deliveredAt, hoursMax: o.deliveryBand?.hoursMax }, nowOf(deps));
  const a = apologyAmount(rule, { goodsMinor: goodsOf(o), lateHours }, d.amountMinor);
  if (!a.ok) {
    if (a.code === 'INVALID_INPUT') throw new PaymentsError('INVALID_INPUT', rule.mode === 'RULE' ? 'the rule decides the amount' : 'give the amount', ['amountMinor']);
    throw new PaymentsError(a.code, a.code === 'NOT_LATE' ? 'the order did not come late enough for the rule' : a.code === 'OVER_LIMIT' ? 'more than the limit' : 'the rule has no amount yet', [], { lateHours });
  }
  if (d.confirm !== true) throw new PaymentsError('CONFIRM_REQUIRED', 'confirm the amount first', ['confirm'], { amountMinor: a.amountMinor, limitMinor: a.limitMinor });
  const customerId = o.customerId;
  return once(deps, async (tx) => {
    const r = await postWalletEntry(tx, { storeId: who.storeId, customerId, direction: 'CREDIT', amountMinor: a.amountMinor, reason: 'APOLOGY', idempotencyKey: key, orderId: o.id, note: d.note ?? null, actorId: who.actor.staffUserId });
    if (!r.replay) {
      await tx.orderEvent.create({ data: { storeId: who.storeId, orderId: o.id, type: WALLET_EVENTS.apology, ...actorOf(who), source: who.ctx?.source ?? 'admin', data: { entryId: r.entryId, amountMinor: a.amountMinor, mode: rule.mode, lateHours } } });
      await auditMoney(tx, who, 'wallet.apology', 'WalletEntry', r.entryId, undefined, { orderId: o.id, number: o.number, customerId, amountMinor: a.amountMinor, mode: rule.mode, lateHours, note: d.note ?? null });
    }
    return { ...r, orderId: o.id, number: o.number, customerId, amountMinor: a.amountMinor };
  });
}

export interface ApologyCandidate {
  orderId: string;
  number: string;
  customerId: string;
  deliveredAt: Date | null;
  lateHours: number;
  /** What the owner's rule gives (null in PER_ORDER mode without a rule amount, or before he typed it). */
  ruleMinor: number | null;
}

/** The delivered orders that came late and have no apology yet, latest first (`payments.view`). */
export async function apologyCandidates(deps: PaymentsDeps, who: Who, opts: { limit?: number } = {}): Promise<{ enabled: boolean; rows: ApologyCandidate[] }> {
  await allow(deps, who, 'payments.view');
  const rule = await setting(deps, who.storeId, 'payments.wallet.apology');
  if (!rule.enabled) return { enabled: false, rows: [] };
  const limit = Math.min(Math.max(1, Math.trunc(opts.limit ?? 50)), 200);
  const now = nowOf(deps);
  const orders = await deps.db.order.findMany({
    where: { storeId: who.storeId, status: { in: [...LATE_STATUSES] }, customerId: { not: null }, deliveredAt: { not: null }, archivedAt: null, deliveryBand: { hoursMax: { not: null } } },
    orderBy: { deliveredAt: 'desc' },
    take: limit * 5,
    select: APOLOGY_ORDER,
  });
  const given = new Set(
    (await deps.db.walletEntry.findMany({ where: { storeId: who.storeId, reason: 'APOLOGY', orderId: { in: orders.map((o) => o.id) } }, select: { orderId: true } })).map((e) => e.orderId!),
  );
  const rows: ApologyCandidate[] = [];
  for (const o of orders) {
    if (given.has(o.id)) continue;
    const lateHours = lateHoursOf({ placedAt: o.placedAt, deliveredAt: o.deliveredAt, hoursMax: o.deliveryBand?.hoursMax }, now);
    if (lateHours === null || lateHours <= 0 || (rule.mode === 'RULE' && lateHours < rule.lateAfterHours)) continue;
    const a = rule.mode === 'RULE' ? apologyAmount(rule, { goodsMinor: goodsOf(o), lateHours }) : null;
    rows.push({ orderId: o.id, number: o.number, customerId: o.customerId!, deliveredAt: o.deliveredAt, lateHours, ruleMinor: a && a.ok ? a.amountMinor : null });
    if (rows.length >= limit) break;
  }
  return { enabled: true, rows };
}
