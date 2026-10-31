// Go-live gate F-041 / F-054 (follow-up of PR 172 and PR 171) — Money › Refunds & wallet at /admin/money/refunds:
// every refund the shop owes, by where it stands (to approve, to pay out, done, rejected), the late orders that may get
// the apology credit, and the owner's three money rules beside them (CN-018: settings sit where they are used):
//   - refund rules (`payments.refunds`): store credit instead of the way it came, after-delivery refunds, an RTO's
//     delivery charge and a delivery-charge advance (kept unless asked back, review R3 M3), four eyes;
//   - a person's own wallet credit or debit (`payments.wallet.manual`): the switch and the largest single entry;
//   - the late-delivery apology credit (`payments.wallet.apology`): the switch, by a person or by rule, the amount.
// Every one ships off (or at its safest value) and saves with `settings.write`, audited as payments.settings.save, a
// stale card refused. The approve, reject, paid-out and failed buttons and the apology credit call the payments API
// (lib/payments-api.ts), which checks each permission again; nothing here pays anyone (CLAUDE.md rule 6): money back
// by bKash or the bank is sent by a person, who then records its reference. Amounts on the cards are whole units of
// the store's currency (empty: none); the settings keep minor units.
import { createHash } from 'node:crypto';
import { audit, requirePermission, type Actor, type RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import * as pay from '@extas/payments';
import { apologySchema, REFUND_RULE_SOURCES, refundRulesSchema, storeTarget, walletManualSchema, type Value } from '@extas/settings';
import { moneyOf } from '@/components/admin/products/model';
import type { AppResolver } from './settings';

const S = MOTHER_STORE_ID;

/** The page's views and the refund states each one lists. */
export const REFUND_VIEWS = ['approve', 'payout', 'done', 'rejected', 'all'] as const;
export type RefundView = (typeof REFUND_VIEWS)[number];
const VIEW_STATE: Record<RefundView, string | undefined> = { approve: 'REQUESTED', payout: 'PAYOUT', done: 'COMPLETED', rejected: 'REJECTED', all: undefined };
const VIEW_OF: Record<string, RefundView> = { REQUESTED: 'approve', APPROVED: 'payout', FAILED: 'payout', COMPLETED: 'done', REJECTED: 'rejected' };

export const MONEY_CARDS = ['refunds', 'walletManual', 'apology'] as const;
export type MoneyCardKey = (typeof MONEY_CARDS)[number];
const SETTING = { refunds: 'payments.refunds', walletManual: 'payments.wallet.manual', apology: 'payments.wallet.apology' } as const;

export interface MoneyCard {
  key: MoneyCardKey;
  value: Record<string, unknown>;
  version: string;
}

export interface RefundsDeps {
  db: PrismaClient;
  resolver: AppResolver;
  payments: pay.PaymentsDeps;
}
export interface RefundsWho {
  actor: Actor;
  ctx: RequestContext;
}

export interface RefundLine extends pay.RefundRow {
  /** Who asked: a person's name, or null when the shop asked by itself (a cancel or a returned parcel). */
  askedBy: string | null;
  decidedBy: string | null;
  paidBy: string | null;
  customerId: string | null;
}

export interface ApologyLine extends pay.ApologyCandidate {
  customerName: string | null;
}

export interface RefundsPageView {
  view: RefundView;
  counts: Record<RefundView, number>;
  owed: pay.RefundList['owed'];
  rows: RefundLine[];
  can: { approve: boolean; execute: boolean; settings: boolean; apology: boolean; wallet: boolean };
  /** The owner's rules as they stand (the approve dialog offers the wallet only when he allows it). */
  rules: Value<'payments.refunds'>;
  me: string | null;
  apology: { enabled: boolean; mode: string; rows: ApologyLine[] };
  cards: Record<MoneyCardKey, MoneyCard>;
}

export class MoneyCardError extends Error {
  constructor(
    readonly code: 'INVALID_INPUT' | 'STALE',
    readonly status: number,
    readonly details: string[] = [],
  ) {
    super(code);
  }
}
export const isMoneyCardError = (e: unknown): e is MoneyCardError => e instanceof MoneyCardError;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);

/** A stored amount (minor units) as the card shows it: whole units, '' for none. */
const major = (minor: number | null, digits: number): number | '' => (minor === null ? '' : minor / 10 ** digits);
/** A card's amount back to minor units: '' or null is none; anything else must be a number of 0 or more. */
function minorOf(v: unknown, digits: number, field: string): number | null {
  if (v === '' || v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) throw new MoneyCardError('INVALID_INPUT', 400, [field]);
  return Math.round(n * 10 ** digits);
}
const plain = (v: unknown, field: string): number | null => {
  if (v === '' || v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) throw new MoneyCardError('INVALID_INPUT', 400, [field]);
  return n;
};

type Values = { refunds: Value<'payments.refunds'>; walletManual: Value<'payments.wallet.manual'>; apology: Value<'payments.wallet.apology'> };

function cardValue<K extends MoneyCardKey>(key: K, v: Values[K], digits: number): Record<string, unknown> {
  if (key === 'refunds') {
    const r = v as Values['refunds'];
    return { toWallet: r.toWallet, afterDelivery: r.afterDelivery, afterDeliverySources: Object.fromEntries(REFUND_RULE_SOURCES.map((s) => [s, r.afterDeliverySources.includes(s)])), rtoDeliveryCharge: r.rtoDeliveryCharge, rtoAdvance: r.rtoAdvance ?? 'KEEP', fourEyes: r.fourEyes };
  }
  if (key === 'walletManual') {
    const w = v as Values['walletManual'];
    return { enabled: w.enabled, max: major(w.maxMinor, digits) };
  }
  const a = v as Values['apology'];
  return { enabled: a.enabled, mode: a.mode, kind: a.kind, amount: major(a.amountMinor, digits), percent: a.percent ?? '', cap: major(a.capMinor, digits), lateAfterHours: a.lateAfterHours };
}

/** The card as the owner sent it, back to the setting's own shape (then checked by the setting's schema). */
function settingValue(key: MoneyCardKey, c: Record<string, unknown>, before: Values[MoneyCardKey], digits: number): unknown {
  if (key === 'refunds') {
    const ticks = isObj(c.afterDeliverySources) ? c.afterDeliverySources : {};
    return { toWallet: c.toWallet, afterDelivery: c.afterDelivery, afterDeliverySources: REFUND_RULE_SOURCES.filter((s) => ticks[s] === true), rtoDeliveryCharge: c.rtoDeliveryCharge, rtoAdvance: c.rtoAdvance, fourEyes: c.fourEyes };
  }
  if (key === 'walletManual') return { enabled: c.enabled, maxMinor: minorOf(c.max, digits, 'max') };
  const a = before as Values['apology'];
  return {
    enabled: c.enabled,
    mode: c.mode,
    kind: c.kind,
    amountMinor: minorOf(c.amount, digits, 'amount'),
    percent: plain(c.percent, 'percent'),
    capMinor: minorOf(c.cap, digits, 'cap'),
    lateAfterHours: plain(c.lateAfterHours, 'lateAfterHours') ?? 0,
    to: a.to,
  };
}

const SCHEMA = { refunds: refundRulesSchema, walletManual: walletManualSchema, apology: apologySchema } as const;

async function valuesOf(deps: RefundsDeps): Promise<{ values: Values; digits: number }> {
  const [refunds, walletManual, apology, currency] = await Promise.all([
    deps.resolver.value('payments.refunds', { storeId: S }),
    deps.resolver.value('payments.wallet.manual', { storeId: S }),
    deps.resolver.value('payments.wallet.apology', { storeId: S }),
    deps.resolver.value('store.currency', { storeId: S }) as Promise<string>,
  ]);
  return { values: { refunds, walletManual, apology } as Values, digits: moneyOf(currency, 'en').digits };
}

const cardsOf = (values: Values, digits: number): Record<MoneyCardKey, MoneyCard> =>
  Object.fromEntries(
    MONEY_CARDS.map((k) => {
      const value = cardValue(k, values[k], digits);
      return [k, { key: k, value, version: versionOf(value) }];
    }),
  ) as Record<MoneyCardKey, MoneyCard>;

/** The page (`payments.view`): the refunds of one view, their counts, the late orders and the three cards. */
export async function refundsView(deps: RefundsDeps, who: RefundsWho, opts: { view?: string } = {}): Promise<RefundsPageView> {
  const held = await requirePermission(deps.db, who.actor, 'payments.view', { storeId: S });
  const view: RefundView = (REFUND_VIEWS as readonly string[]).includes(opts.view ?? '') ? (opts.view as RefundView) : 'approve';
  const pw: pay.Who = { actor: who.actor, storeId: S, ctx: who.ctx };
  const [{ values, digits }, list, groups, apology] = await Promise.all([
    valuesOf(deps),
    pay.listRefunds(deps.payments, pw, { state: VIEW_STATE[view], limit: 100 }), // hardcode-ok: one page of refunds; the counts above say how many there are
    deps.db.refund.groupBy({ by: ['status'], where: { storeId: S }, _count: { _all: true } }),
    pay.apologyCandidates(deps.payments, pw, { limit: 50 }), // hardcode-ok: the newest late orders; the rest follow as these get their credit
  ]);
  const counts = Object.fromEntries(REFUND_VIEWS.map((v) => [v, 0])) as Record<RefundView, number>;
  for (const g of groups) {
    const v = VIEW_OF[g.status];
    if (v) counts[v] += g._count._all;
    counts.all += g._count._all;
  }
  // a rejection keeps no person on the refund itself; its audit row names who said no
  const rejectedIds = list.rows.filter((r) => r.status === 'REJECTED').map((r) => r.id);
  const rejections = rejectedIds.length
    ? await deps.db.auditLog.findMany({ where: { storeId: S, action: 'refund.reject', entityType: 'Refund', entityId: { in: rejectedIds } }, orderBy: { createdAt: 'desc' }, select: { entityId: true, actorId: true } })
    : [];
  const rejectedBy = new Map<string, string>();
  for (const a of rejections) if (a.entityId && a.actorId && !rejectedBy.has(a.entityId)) rejectedBy.set(a.entityId, a.actorId);
  const staffIds = [...new Set(list.rows.flatMap((r) => [r.requestedById, r.approvedById, r.executedById, rejectedBy.get(r.id)]).filter((x): x is string => !!x))];
  const orderIds = [...new Set(list.rows.map((r) => r.orderId))];
  const customerIds = [...new Set(apology.rows.map((r) => r.customerId))];
  const [staff, orders, customers] = await Promise.all([
    staffIds.length ? deps.db.staffUser.findMany({ where: { id: { in: staffIds } }, select: { id: true, displayName: true } }) : [],
    orderIds.length ? deps.db.order.findMany({ where: { id: { in: orderIds }, storeId: S }, select: { id: true, customerId: true } }) : [],
    customerIds.length ? deps.db.customer.findMany({ where: { id: { in: customerIds }, storeId: S }, select: { id: true, name: true } }) : [],
  ]);
  const name = new Map(staff.map((s) => [s.id, s.displayName]));
  const customerOf = new Map(orders.map((o) => [o.id, o.customerId]));
  const customerName = new Map(customers.map((c) => [c.id, c.name]));
  const nameOf = (id: string | null) => (id ? (name.get(id) ?? null) : null);
  return {
    view,
    counts,
    owed: list.owed,
    rows: list.rows.map((r) => ({ ...r, askedBy: nameOf(r.requestedById), decidedBy: nameOf(r.status === 'REJECTED' ? (rejectedBy.get(r.id) ?? null) : r.approvedById), paidBy: nameOf(r.executedById), customerId: customerOf.get(r.orderId) ?? null })),
    can: {
      approve: held.has('payments.refunds.approve'),
      execute: held.has('payments.refunds.execute'),
      settings: held.has('settings.write'),
      apology: held.has('payments.apology'),
      wallet: held.has('payments.wallet'),
    },
    rules: values.refunds,
    me: who.actor.staffUserId ?? null,
    apology: { enabled: apology.enabled, mode: values.apology.mode, rows: apology.rows.map((r) => ({ ...r, customerName: customerName.get(r.customerId) ?? null })) },
    cards: cardsOf(values, digits),
  };
}

/** One of the three cards saved whole (`settings.write`, audited, a stale version refused). */
export async function saveMoneyCard(deps: RefundsDeps, who: RefundsWho, input: unknown): Promise<Record<MoneyCardKey, MoneyCard>> {
  await requirePermission(deps.db, who.actor, 'settings.write', { storeId: S });
  if (!isObj(input) || !(MONEY_CARDS as readonly unknown[]).includes(input.key)) throw new MoneyCardError('INVALID_INPUT', 400, ['key']);
  const key = input.key as MoneyCardKey;
  if (!isObj(input.value)) throw new MoneyCardError('INVALID_INPUT', 400, ['value']);
  const { values, digits } = await valuesOf(deps);
  const cards = cardsOf(values, digits);
  if (input.version !== cards[key].version) throw new MoneyCardError('STALE', 409);
  const ok = SCHEMA[key].safeParse(settingValue(key, input.value, values[key], digits));
  if (!ok.success) throw new MoneyCardError('INVALID_INPUT', 400, [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  const next = ok.data as Values[typeof key];
  if (versionOf(cardValue(key, next, digits)) !== cards[key].version) {
    await deps.resolver.set(SETTING[key], next as never, storeTarget(S), { actorId: who.actor.staffUserId ?? null, reason: 'Money › Refunds & wallet' });
    await audit(deps.db, who.actor, { storeId: S, action: 'payments.settings.save', entityType: 'Setting', entityId: SETTING[key], before: { ...values[key] }, after: { ...next } }, who.ctx);
  }
  return cardsOf({ ...values, [key]: next } as Values, digits);
}

// ---------------------------------------------------------------------------------------------------------------------
// Gate F-054 (follow-up of PR 171): one customer's wallets on his own page (Customers › the customer › Wallet)
// ---------------------------------------------------------------------------------------------------------------------

/** One ledger line as the customer's Wallet tab shows it. */
export interface WalletLine extends pay.WalletEntryRow {
  /** The person who wrote it (null: the shop by itself, or someone no longer listed). */
  by: string | null;
  orderNumber: string | null;
  /** A person may put it right with a reversal (a reward, apology, offer or a hand entry, not yet reversed). */
  reversible: boolean;
}

export interface CustomerWalletBox {
  customerId: string;
  walletId: string | null;
  status: string | null;
  balanceMinor: number;
  ledgerMinor: number;
  drift: boolean;
  more: boolean;
  entries: WalletLine[];
}

export interface CustomerWalletView {
  /** One box per profile (the main one first, then his merged profiles), in the order asked. */
  wallets: CustomerWalletBox[];
  can: { wallet: boolean; apology: boolean; settings: boolean };
  /** The owner's switch for a person's own credit or debit, and its largest single entry (minor units). */
  manual: Value<'payments.wallet.manual'>;
  /** His late orders still without the apology credit (empty while the credit is off). */
  apology: { enabled: boolean; mode: string; rows: pay.ApologyCandidate[] };
}

/** The ledger lines a profile's box shows (the newest; the full history stays in the ledger). */
const WALLET_LINES = 30; // hardcode-ok: one screenful of ledger lines per profile; `more` says when there are older ones

/** A customer's wallets and the tools beside them (`payments.view`; the tools check their own permission again). */
export async function customerWallets(deps: RefundsDeps, who: RefundsWho, customerIds: readonly string[]): Promise<CustomerWalletView> {
  const held = await requirePermission(deps.db, who.actor, 'payments.view', { storeId: S });
  const pw: pay.Who = { actor: who.actor, storeId: S, ctx: who.ctx };
  const ids = [...new Set(customerIds)];
  const [{ values }, views, apology] = await Promise.all([
    valuesOf(deps),
    Promise.all(ids.map((id) => pay.walletOf(deps.payments, pw, id, { limit: WALLET_LINES }))),
    pay.apologyCandidates(deps.payments, pw, { customerIds: ids, limit: 20 }), // hardcode-ok: one customer's late orders; more than a handful is not expected
  ]);
  const found = views.filter((v): v is pay.WalletView => !!v);
  const entries = found.flatMap((v) => v.entries);
  const staffIds = [...new Set(entries.map((e) => e.actorId).filter((x): x is string => !!x))];
  const orderIds = [...new Set(entries.map((e) => e.orderId).filter((x): x is string => !!x))];
  const [staff, orders] = await Promise.all([
    staffIds.length ? deps.db.staffUser.findMany({ where: { id: { in: staffIds } }, select: { id: true, displayName: true } }) : [],
    orderIds.length ? deps.db.order.findMany({ where: { id: { in: orderIds }, storeId: S }, select: { id: true, number: true } }) : [],
  ]);
  const name = new Map(staff.map((s) => [s.id, s.displayName]));
  const number = new Map(orders.map((o) => [o.id, o.number]));
  return {
    wallets: found.map((v) => ({
      customerId: v.customerId,
      walletId: v.walletId,
      status: v.status,
      balanceMinor: v.balanceMinor,
      ledgerMinor: v.ledgerMinor,
      drift: v.drift,
      more: v.more,
      entries: v.entries.map((e) => ({
        ...e,
        by: e.actorId ? (name.get(e.actorId) ?? null) : null,
        orderNumber: e.orderId ? (number.get(e.orderId) ?? null) : null,
        reversible: pay.REVERSIBLE_REASONS.has(e.reason) && !e.reversedBy && !e.reversesEntryId,
      })),
    })),
    can: { wallet: held.has('payments.wallet'), apology: held.has('payments.apology'), settings: held.has('settings.write') },
    manual: values.walletManual,
    apology: { enabled: apology.enabled, mode: values.apology.mode, rows: apology.rows },
  };
}
