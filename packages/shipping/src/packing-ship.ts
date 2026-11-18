// PR 814 (prototype v5, Orders › To ship): the two reads the Booked and Packed chips need beside the packing lists.
// - `dayEndFigures`: the day-end check's three figures (Packed today, Handed over, Not handed over yet).
// - `packContacts`: the phone and delivery place of the listed orders, for the "Viewing as" Owner / Packer switch.
// Both are read only (`fulfilment.read`); nothing here books, prints, packs or changes an order.
import type { Prisma } from '@extas/db/client';
import { openReviewIds, type OrdersDeps } from '@extas/orders';
import { allow, nowOf, setting, type ShippingDeps, type Who } from './context';
import { dayStart } from './packing-pure';

const ordersDeps = (deps: ShippingDeps): OrdersDeps => ({ db: deps.db, settings: deps.settings, now: deps.now });

/** Orders the packing screen works on (never archived, never one whose cancel is asked, never one in review). */
async function listed(deps: ShippingDeps, storeId: number): Promise<Prisma.OrderWhereInput> {
  const reviews = await openReviewIds(ordersDeps(deps), storeId);
  return { storeId, archivedAt: null, cancelPending: false, cancelRequestedAt: null, id: { notIn: reviews } };
}

export interface DayEndFigures {
  /** Packed since the shop day began, plus every order still Packed. */
  packedToday: number;
  /** The courier's pickup took it since the shop day began. */
  handedToday: number;
  /** Still Packed: waiting for the courier's pickup. */
  notHanded: number;
}

export async function dayEndFigures(deps: ShippingDeps, who: Who): Promise<DayEndFigures> {
  await allow(deps, who, 'fulfilment.read');
  const [base, timeZone] = await Promise.all([listed(deps, who.storeId), setting(deps, who.storeId, 'store.timeZone')]);
  const from = dayStart(nowOf(deps), timeZone, 0);
  const [packedToday, handedToday, notHanded] = await Promise.all([
    deps.db.order.count({ where: { AND: [base, { OR: [{ status: 'PACKED' }, { packedAt: { gte: from } }] }] } }),
    deps.db.order.count({ where: { AND: [base, { status: 'HANDED_OVER', handedOverAt: { gte: from } }] } }),
    deps.db.order.count({ where: { AND: [base, { status: 'PACKED' }] } }),
  ]);
  return { packedToday, handedToday, notHanded };
}

export interface PackContact {
  orderId: string;
  phone: string;
  /** The first three and last three digits with dots between (the Packer view). */
  phoneMasked: string;
  /** The full delivery address as typed (the Owner view). */
  address: string;
  /** The area's name (the Packer view shows only this). */
  area: string;
  /** PR 1120 (prototype v5 To ship table): the customer's name, the pieces and the cash the courier collects. */
  name: string;
  lines: { name: string; colour: string | null; size: string | null; qty: number }[];
  /** What the courier still collects (0: paid in full) and in which currency. */
  codMinor: number;
  currency: string;
}

/** The phone and delivery place of listed orders (at most 500). The page asks only when the person may read orders. */
export async function packContacts(deps: ShippingDeps, who: Who, orderIds: string[]): Promise<PackContact[]> {
  await allow(deps, who, 'fulfilment.read');
  if (!orderIds.length) return [];
  const rows = await deps.db.order.findMany({
    where: { storeId: who.storeId, id: { in: orderIds.slice(0, 500) } },
    select: {
      id: true,
      phone: true,
      shippingAddressText: true,
      backfilledAddress: true,
      area: { select: { nameEn: true } },
      customerName: true,
      codAmountMinor: true,
      currency: true,
      items: { where: { status: 'ACTIVE' }, orderBy: { createdAt: 'asc' }, select: { productName: true, colourName: true, sizeLabel: true, quantity: true } },
    },
  });
  return rows.map((r) => {
    const phone = r.phone ?? '';
    return {
      orderId: r.id,
      phone,
      phoneMasked: phone ? `${phone.slice(0, 3)}•••••${phone.slice(-3)}` : '',
      address: r.shippingAddressText ?? r.backfilledAddress ?? '',
      area: r.area?.nameEn ?? '',
      name: r.customerName ?? '',
      lines: r.items.map((i) => ({ name: i.productName, colour: i.colourName, size: i.sizeLabel, qty: i.quantity })),
      codMinor: r.codAmountMinor,
      currency: r.currency,
    };
  });
}
