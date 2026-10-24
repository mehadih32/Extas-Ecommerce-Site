// PR 131 — My account's read side (demo 60-account.js acc_header, acc_tabOrders, acc_orderCard, acc_tabWallet): the
// header's figures, the order cards, the wallet. Everything is read for the signed-in customer only, in his store, as
// it is stored: an order's state and times (never moved here, CN-022), the wallet's balance and its ledger.
import type { Prisma } from '@extas/db/client';
import { checkStoreId, setting, type AccountsDeps } from './context';
import { firstNameOf, lateOf, trackOf, type OrderState, type TrackView } from './pure';
import { phoneNormalizeBD } from '@extas/delivery/phone';

const ACTIVE_WALLET = 'ACTIVE';

export interface AccountSummary {
  customerId: string;
  name: string | null;
  firstName: string;
  /** As said back (01712-345678). */
  phone: string | null;
  orders: number;
  /** The wallet's balance; null when he has no wallet. */
  walletMinor: number | null;
}

/** A line's colour as the shop draws it (key and hex for the picture; empty when the variant is gone). */
export interface LineColour {
  key: string;
  hex: string;
  nameEn: string;
  nameBn: string | null;
}

export interface OrderCardLine {
  productId: string | null;
  nameEn: string;
  nameBn: string | null;
  colour: LineColour | null;
  quantity: number;
}

export interface OrderCard {
  number: string;
  placedAt: string;
  status: OrderState;
  track: TrackView;
  /** PR 135 (SIM-F-018): past its band's promise in hours and still on its way. */
  late: boolean;
  /** Pieces on the order (active lines). */
  items: number;
  totalMinor: number;
  /** The first lines, for the pictures. */
  lines: OrderCardLine[];
  /** Lines beyond those. */
  more: number;
}

export interface WalletEntryView {
  id: string;
  direction: 'CREDIT' | 'DEBIT';
  amountMinor: number;
  balanceAfterMinor: number;
  reason: string;
  note: string | null;
  orderNumber: string | null;
  at: string;
}

export interface WalletView {
  balanceMinor: number;
  entries: WalletEntryView[];
}

/** The lines an order card shows as pictures. */
const CARD_LINES = 4;

/** His placed orders in this store (a started checkout's draft is not an order; an archived one is gone from his view). */
export const orderWhere = (storeId: number, customerId: string) => ({ storeId, customerId, archivedAt: null, status: { not: 'DRAFT' as const } });

type ItemRef = { variantId: string | null; colourName: string | null };
type Looks = Map<string, { nameBn: string | null; colour: LineColour | null }>;

/** The Bengali names and the colours of the lines' variants (one query), as the receipt reads them. */
export async function lineColours(deps: AccountsDeps, storeId: number, items: ItemRef[]): Promise<Looks> {
  const ids = [...new Set(items.flatMap((i) => (i.variantId ? [i.variantId] : [])))];
  if (!ids.length) return new Map();
  const vs = await deps.db.productVariant.findMany({
    where: { storeId, id: { in: ids } },
    select: { id: true, product: { select: { nameBn: true } }, colour: { select: { key: true, hex: true, nameEn: true, nameBn: true } } },
  });
  return new Map(vs.map((v) => [v.id, { nameBn: v.product.nameBn, colour: v.colour ? { ...v.colour } : null }]));
}

/** A line's Bengali name and colour (the stored colour name when the variant is gone). */
export function lineLook(looks: Looks, i: ItemRef): { nameBn: string | null; colour: LineColour | null } {
  const v = i.variantId ? looks.get(i.variantId) : undefined;
  return { nameBn: v?.nameBn ?? null, colour: v?.colour ?? (i.colourName ? { key: '', hex: '', nameEn: i.colourName, nameBn: null } : null) };
}

/** The header: name, number, how many orders, the wallet. */
export async function accountSummary(deps: AccountsDeps, input: { storeId: number; customerId: string }): Promise<AccountSummary | null> {
  checkStoreId(input.storeId);
  const c = await deps.db.customer.findFirst({
    where: { id: input.customerId, storeId: input.storeId, archivedAt: null, erasedAt: null },
    select: { id: true, name: true, phone: true, wallet: { select: { balanceMinor: true, status: true } } },
  });
  if (!c) return null;
  const orders = await deps.db.order.count({ where: orderWhere(input.storeId, c.id) });
  const p = phoneNormalizeBD(c.phone ?? '');
  return {
    customerId: c.id,
    name: c.name,
    firstName: firstNameOf(c.name),
    phone: p.ok ? p.nice : c.phone,
    orders,
    walletMinor: c.wallet && c.wallet.status === ACTIVE_WALLET ? c.wallet.balanceMinor : null,
  };
}

/** What an order card reads of an order. */
const CARD_SELECT = {
  number: true,
  placedAt: true,
  status: true,
  confirmedAt: true,
  packedAt: true,
  handedOverAt: true,
  deliveredAt: true,
  cancelledAt: true,
  returnedAt: true,
  totalMinor: true,
  deliveryBand: { select: { hoursMax: true } },
  items: { where: { status: 'ACTIVE' as const }, orderBy: { createdAt: 'asc' as const }, select: { productId: true, variantId: true, productName: true, colourName: true, quantity: true } },
};

/**
 * PR 150 — one page of his orders as cards, newest first (`where` already holds his store and his account). Ties in
 * the placing time keep one order (the id), so a page never repeats or skips an order.
 */
export async function cardsOf(deps: AccountsDeps, storeId: number, where: Prisma.OrderWhereInput, page: { skip: number; take: number }, now: Date): Promise<OrderCard[]> {
  const lateRule = await setting(deps, storeId, 'account.track.late');
  const rows = await deps.db.order.findMany({ where, orderBy: [{ placedAt: 'desc' }, { id: 'desc' }], skip: page.skip, take: page.take, select: CARD_SELECT });
  const shown = rows.flatMap((o) => o.items.slice(0, CARD_LINES));
  const colours = await lineColours(deps, storeId, shown);
  return rows.map((o) => ({
    number: o.number,
    placedAt: o.placedAt.toISOString(),
    status: o.status,
    track: trackOf(o.status, o),
    late: lateOf({ status: o.status, placedAt: o.placedAt, hoursMax: o.deliveryBand?.hoursMax }, lateRule, now).late,
    items: o.items.reduce((s, i) => s + i.quantity, 0),
    totalMinor: o.totalMinor,
    lines: o.items.slice(0, CARD_LINES).map((i) => ({ productId: i.productId, nameEn: i.productName, quantity: i.quantity, ...lineLook(colours, i) })),
    more: Math.max(0, o.items.length - CARD_LINES),
  }));
}

/** His orders, newest first (`account.lists.orders` of them), each as its card. PR 150: the first page of orderHistory. */
export async function orderCards(deps: AccountsDeps, input: { storeId: number; customerId: string; now?: Date }): Promise<OrderCard[]> {
  checkStoreId(input.storeId);
  const { orders: take } = await setting(deps, input.storeId, 'account.lists');
  return cardsOf(deps, input.storeId, orderWhere(input.storeId, input.customerId), { skip: 0, take }, input.now ?? new Date());
}

/** His wallet: the balance and the newest entries of its ledger (`account.lists.walletEntries`). */
export async function walletView(deps: AccountsDeps, input: { storeId: number; customerId: string }): Promise<WalletView | null> {
  checkStoreId(input.storeId);
  const w = await deps.db.walletAccount.findFirst({ where: { storeId: input.storeId, customerId: input.customerId, status: ACTIVE_WALLET }, select: { id: true, balanceMinor: true } });
  if (!w) return null;
  const { walletEntries: take } = await setting(deps, input.storeId, 'account.lists');
  const entries = await deps.db.walletEntry.findMany({ where: { walletId: w.id }, orderBy: { createdAt: 'desc' }, take });
  const orderIds = [...new Set(entries.flatMap((e) => (e.orderId ? [e.orderId] : [])))];
  const numbers = orderIds.length ? await deps.db.order.findMany({ where: { id: { in: orderIds }, storeId: input.storeId }, select: { id: true, number: true } }) : [];
  const numberOf = new Map(numbers.map((n) => [n.id, n.number]));
  return {
    balanceMinor: w.balanceMinor,
    entries: entries.map((e) => ({
      id: e.id,
      direction: e.direction,
      amountMinor: e.amountMinor,
      balanceAfterMinor: e.balanceAfterMinor,
      reason: e.reason,
      note: e.note,
      orderNumber: e.orderId ? (numberOf.get(e.orderId) ?? null) : null,
      at: e.createdAt.toISOString(),
    })),
  };
}
