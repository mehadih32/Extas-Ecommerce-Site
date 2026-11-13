// S28 · PR 706 (CN-049) — the practice data seeder. Fills a store with the admin prototype's sample world so the owner can
// practise on the real admin: ~90 orders over six months in every status (New, Confirmed, Booked, Packed, Handed over,
// Delivered, Paid, Returned, Cancelled, also Processing, On hold and Awaiting advance), 60 sample customers, 24 sample
// products, 18 incomplete orders, courier payouts and courier claims, with the prototype's names, areas, prices and
// couriers. Rules:
//  - Deterministic: the same `now` gives the same data (a fixed seed, ids made from the record's own key).
//  - Idempotent: when practice orders already exist nothing is written ("already").
//  - Every row it makes carries `isPractice = true`, so "Reset practice data" removes exactly these rows and nothing else.
//  - It touches nothing outside the system: no ERP push, no courier call, no message, no stock level or movement, no
//    reservation, no payment gateway. Practice products are DRAFT (never on the live shop) and every practice phone
//    number is in a reserved range that no operator uses.
// Tables that are not on `main` yet are skipped (see docs/demo/admin-proto-v5/gap/PRACTICE-TODO.md).
import { createHash } from 'node:crypto';
import { PRACTICE_PHONE_PREFIX, type Prisma, type PrismaClient } from '@extas/db/client';
import {
  ADS_SOURCES,
  CANCEL_CODES,
  CATEGORIES,
  CHANNELS,
  COLOURS,
  COURIERS,
  DELIVERY_FEE,
  DHAKA_AREAS,
  FIRST_NAMES,
  FREE_DELIVERY_OVER,
  HOLD_CODES,
  LAST_NAMES,
  ORDER_PLAN,
  OUTSIDE_AREAS,
  PAYMENTS,
  PRACTICE_CUSTOMERS,
  PRACTICE_INCOMPLETE,
  SIZES_BOTTOM,
  SIZES_TOP,
  SUB_AREAS,
  type OrderKind,
  type Zone,
} from './data';

type Db = PrismaClient;
const DAY = 86_400_000; // hardcode-ok: milliseconds in a day
const HOUR = 3_600_000; // hardcode-ok: milliseconds in an hour
const SEED = 20_261_112; // hardcode-ok: the prototype's own seed, so the practice world matches the prototype's

export interface SeedResult {
  seeded: boolean;
  reason?: 'already' | 'no-store';
  counts: Record<string, number>;
}

/** A uuid made from the record's own key: the same key is always the same id. */
export function practiceId(key: string): string {
  const h = createHash('sha1').update(`extas-practice:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function makeRng(seed: number) {
  let s = seed;
  const next = () => {
    s = (s * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return s / 4_294_967_296;
  };
  const int = (a: number, b: number) => Math.floor(a + next() * (b - a + 1));
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)]!;
  const weighted = <T>(pairs: readonly (readonly [T, number])[]): T => {
    const total = pairs.reduce((n, p) => n + p[1], 0);
    let r = next() * total;
    for (const p of pairs) if ((r -= p[1]) <= 0) return p[0];
    return pairs[0]![0];
  };
  return { next, int, pick, weighted };
}

interface Cust {
  id: string;
  name: string;
  phone: string;
  zone: Zone;
  district: string;
  area: string;
  createdAt: Date;
  orders: number;
  delivered: number;
  returned: number;
  ltv: number;
  last: Date | null;
}
interface Variant {
  id: string;
  productId: string;
  name: string;
  sku: string;
  colour: string;
  size: string;
  priceMinor: number;
  costMinor: number;
}

export async function seedPractice(db: Db, storeId: number, now: Date = new Date()): Promise<SeedResult> {
  const store = await db.store.findUnique({
    where: { id: storeId },
    select: { id: true, currency: true },
  });
  if (!store) return { seeded: false, reason: 'no-store', counts: {} };
  if ((await db.order.count({ where: { storeId, isPractice: true } })) > 0) return { seeded: false, reason: 'already', counts: {} };

  const rng = makeRng(SEED);
  const digits =
    new Intl.NumberFormat('en', {
      style: 'currency',
      currency: store.currency,
    }).resolvedOptions().maximumFractionDigits ?? 2;
  const minor = (taka: number) => Math.round(taka * 10 ** digits);
  const counts: Record<string, number> = {};

  // ---- couriers (practice ones; never enabled, never connected)
  const couriers = COURIERS.map((c) => ({
    ...c,
    id: practiceId(`courier:${c.key}`),
  }));
  await db.courierAccount.createMany({
    data: couriers.map((c) => ({
      id: c.id,
      storeId,
      providerKey: c.key,
      name: `${c.name} (practice)`,
      enabled: false,
      isPractice: true,
    })),
    skipDuplicates: true,
  });
  counts.couriers = couriers.length;

  // ---- products (DRAFT: never on the live shop) with variants
  const variants: Variant[] = [];
  const products: Prisma.ProductCreateManyInput[] = [];
  const variantRows: Prisma.ProductVariantCreateManyInput[] = [];
  let n = 1000;
  for (const cat of CATEGORIES) {
    for (const name of cat.names.slice(0, 2)) {
      n += 1;
      const pid = practiceId(`product:${n}`);
      const price = Math.round(rng.int(cat.price[0], cat.price[1]) / 10) * 10 - 10;
      const cost = Math.round(price * (0.36 + rng.next() * 0.12));
      const cols = [...COLOURS].sort(() => rng.next() - 0.5).slice(0, rng.int(2, 3));
      const sizes = cat.bottom ? SIZES_BOTTOM : SIZES_TOP;
      const slug = `practice-${name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')}-${n}`;
      products.push({
        id: pid,
        storeId,
        slug,
        nameEn: `${name} (practice)`,
        status: 'DRAFT',
        minPriceMinor: minor(price),
        isPractice: true,
      });
      let order = 0;
      for (const colour of cols) {
        for (const size of sizes) {
          const sku = `PRC-${cat.code}-${n}-${colour.slice(0, 3).toUpperCase()}-${size}`;
          const vid = practiceId(`variant:${sku}`);
          variantRows.push({
            id: vid,
            storeId,
            productId: pid,
            sku,
            priceMinor: minor(price),
            active: true,
            inStock: false,
            sortOrder: order++,
          });
          variants.push({
            id: vid,
            productId: pid,
            name,
            sku,
            colour,
            size,
            priceMinor: minor(price),
            costMinor: minor(cost),
          });
        }
      }
    }
  }
  await db.product.createMany({ data: products, skipDuplicates: true });
  await db.productVariant.createMany({
    data: variantRows,
    skipDuplicates: true,
  });
  counts.products = products.length;
  const byProduct = new Map<string, Variant[]>();
  for (const v of variants) (byProduct.get(v.productId) ?? byProduct.set(v.productId, []).get(v.productId)!).push(v);
  const productIds = [...byProduct.keys()];

  // ---- customers
  const custs: Cust[] = [];
  for (let i = 0; i < PRACTICE_CUSTOMERS; i++) {
    const zone = rng.weighted<Zone>([
      ['inside', 56],
      ['sub', 16],
      ['outside', 28],
    ]);
    const [district, area] = zone === 'inside' ? (['Dhaka', rng.pick(DHAKA_AREAS)] as const) : zone === 'sub' ? rng.pick(SUB_AREAS) : rng.pick(OUTSIDE_AREAS);
    custs.push({
      id: practiceId(`customer:${i}`),
      name: `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`,
      phone: `${PRACTICE_PHONE_PREFIX}${String(10_000_000 + i * 137 + 11).padStart(8, '0')}`,
      zone,
      district,
      area,
      createdAt: new Date(now.getTime() - rng.int(5, 400) * DAY),
      orders: 0,
      delivered: 0,
      returned: 0,
      ltv: 0,
      last: null,
    });
  }

  // ---- orders
  interface Plan {
    kind: OrderKind;
    ageDays: number;
  }
  const plans: Plan[] = [];
  for (const p of ORDER_PLAN)
    for (let k = 0; k < p.count; k++)
      plans.push({
        kind: p.kind,
        ageDays: p.age[0] + rng.next() * (p.age[1] - p.age[0]),
      });
  plans.sort((a, b) => b.ageDays - a.ageDays); // oldest first, so numbers rise with time

  const orders: Prisma.OrderCreateManyInput[] = [];
  const items: Prisma.OrderItemCreateManyInput[] = [];
  const events: Prisma.OrderEventCreateManyInput[] = [];
  const payments: Prisma.PaymentCreateManyInput[] = [];
  const shipments: Prisma.ShipmentCreateManyInput[] = [];
  const shipmentEvents: Prisma.ShipmentEventCreateManyInput[] = [];
  const paidCod: {
    orderId: string;
    shipmentId: string;
    courierId: string;
    cod: number;
    charge: number;
    at: Date;
    consignment: string;
  }[] = [];
  const claimable: {
    orderId: string;
    shipmentId: string;
    courierId: string;
    kind: string;
    total: number;
    at: Date;
  }[] = [];
  let num = 10_180;

  plans.forEach((plan, i) => {
    const placedAt = new Date(now.getTime() - plan.ageDays * DAY);
    placedAt.setUTCHours(rng.int(3, 17), rng.int(0, 59), 0, 0); // 9:00-23:59 shop time
    if (placedAt > now) placedAt.setTime(now.getTime() - rng.int(10, 300) * 60_000);
    const repeat = rng.next() < 0.3 && i > 6;
    const cust = repeat ? custs[rng.int(0, Math.min(custs.length - 1, 14))]! : rng.pick(custs);
    const id = practiceId(`order:${i}`);
    const number = `P-${num++}`;
    // lines
    const lineCount = rng.weighted([
      [1, 62],
      [2, 28],
      [3, 10],
    ] as const);
    let subtotal = 0;
    let pieces = 0;
    const lines: Prisma.OrderItemCreateManyInput[] = [];
    for (let l = 0; l < lineCount; l++) {
      const pv = byProduct.get(rng.pick(productIds))!;
      const v = rng.pick(pv);
      const qty = rng.next() < 0.85 ? 1 : 2;
      subtotal += v.priceMinor * qty;
      pieces += qty;
      lines.push({
        id: practiceId(`item:${i}:${l}`),
        storeId,
        orderId: id,
        variantId: v.id,
        productId: v.productId,
        sku: v.sku,
        productName: `${v.name} (practice)`,
        colourName: v.colour,
        sizeLabel: v.size,
        quantity: qty,
        unitPriceMinor: v.priceMinor,
        discountMinor: 0, // hardcode-ok: a sample order without a discount
        lineTotalMinor: v.priceMinor * qty,
        unitCostMinor: v.costMinor,
        createdAt: placedAt,
      });
    }
    const discount = pieces >= 3 ? Math.round(subtotal * 0.1) : pieces === 2 ? Math.round(subtotal * 0.05) : 0;
    const free = subtotal - discount >= minor(FREE_DELIVERY_OVER);
    const delivery = free ? 0 : minor(DELIVERY_FEE[cust.zone]);
    const total = subtotal - discount + delivery;
    const method = rng.weighted(PAYMENTS);
    const source = rng.weighted(CHANNELS);
    const utm = source === 'WEBSITE' ? rng.weighted(ADS_SOURCES) : null;
    const courier = rng.weighted(couriers.map((c) => [c, c.share] as const));
    const at = (h: number) => new Date(Math.min(placedAt.getTime() + h * HOUR, now.getTime() - 60_000));
    const kind = plan.kind;
    const confirmedKinds: OrderKind[] = ['CONFIRMED', 'PROCESSING', 'BOOKED', 'PACKED', 'HANDED_OVER', 'IN_TRANSIT', 'DELIVERED', 'PAID', 'RETURNED'];
    const confirmed = confirmedKinds.includes(kind);
    const shipped: OrderKind[] = ['HANDED_OVER', 'IN_TRANSIT', 'DELIVERED', 'PAID', 'RETURNED'];
    const booked = confirmed && !['CONFIRMED', 'PROCESSING'].includes(kind);
    const confirmedAt = confirmed ? at(rng.int(1, 4)) : null;
    const packedAt = ['PACKED', ...shipped].includes(kind) ? at(20) : null;
    const handedOverAt = shipped.includes(kind) ? at(26) : null;
    const zoneDays = cust.zone === 'inside' ? rng.int(1, 2) : cust.zone === 'sub' ? rng.int(2, 3) : rng.int(3, 5);
    const deliveredAt = kind === 'DELIVERED' || kind === 'PAID' ? at(26 + zoneDays * 24) : null;
    const returnedAt = kind === 'RETURNED' ? at(26 + 4 * 24) : null;
    const cancelledAt = kind === 'CANCELLED' ? at(rng.int(2, 30)) : null;
    const prepaid = method !== 'COD';
    const status = (
      {
        PLACED: 'PLACED',
        AWAITING_ADVANCE: 'AWAITING_ADVANCE',
        ON_HOLD: 'ON_HOLD',
        CONFIRMED: 'CONFIRMED',
        PROCESSING: 'PROCESSING',
        BOOKED: 'CONFIRMED',
        PACKED: 'PACKED',
        HANDED_OVER: 'HANDED_OVER',
        IN_TRANSIT: 'IN_TRANSIT',
        DELIVERED: 'DELIVERED',
        PAID: 'DELIVERED',
        RETURNED: 'RETURNED',
        CANCELLED: 'CANCELLED',
      } as const
    )[kind];
    const paidInFull = kind === 'PAID' || (prepaid && confirmed && kind !== 'RETURNED');
    const paidMinor = paidInFull ? total : 0;
    orders.push({
      id,
      storeId,
      number,
      customerId: cust.id,
      status,
      source,
      currency: store.currency,
      placedAt,
      phone: cust.phone,
      customerName: cust.name,
      shippingAddressText: `House ${rng.int(1, 120)}, Road ${rng.int(1, 30)}, ${cust.area}, ${cust.district}`,
      subtotalMinor: subtotal,
      discountMinor: discount,
      deliveryChargeMinor: delivery,
      totalMinor: total,
      codAmountMinor: prepaid ? 0 : total,
      paidMinor,
      paymentMethod: method,
      utmSource: utm,
      advanceRequirement: kind === 'AWAITING_ADVANCE' ? 'DELIVERY_CHARGE' : 'NONE',
      advanceRequiredMinor: kind === 'AWAITING_ADVANCE' ? delivery || minor(DELIVERY_FEE[cust.zone]) : null,
      holdReasonCode: kind === 'ON_HOLD' ? rng.pick(HOLD_CODES) : null,
      holdFromStatus: kind === 'ON_HOLD' ? 'PLACED' : null,
      onHoldSince: kind === 'ON_HOLD' ? at(2) : null,
      cancelReasonCode: kind === 'CANCELLED' ? rng.pick(CANCEL_CODES) : null,
      confirmedAt,
      packedAt,
      handedOverAt,
      deliveredAt,
      cancelledAt,
      returnedAt,
      courierAccountId: booked ? courier.id : null,
      riskScore: rng.int(2, 40),
      riskBand: 'low',
      idempotencyKey: `practice:order:${i}`,
      isPractice: true,
      createdAt: placedAt,
      updatedAt: returnedAt ?? deliveredAt ?? cancelledAt ?? handedOverAt ?? packedAt ?? confirmedAt ?? placedAt,
    });
    items.push(...lines);
    const ev = (type: string, toStatus: Prisma.OrderEventCreateManyInput['toStatus'], when: Date, actor: 'CUSTOMER' | 'STAFF' | 'COURIER' | 'SYSTEM', message?: string) =>
      events.push({
        id: practiceId(`event:${i}:${type}`),
        storeId,
        orderId: id,
        type,
        toStatus,
        message: message ?? null,
        actorType: actor,
        source: 'practice',
        createdAt: when,
      });
    ev('order.placed', 'PLACED', placedAt, source === 'PHONE' ? 'STAFF' : 'CUSTOMER', `Order placed (${source.toLowerCase()})`);
    if (confirmedAt) ev('order.confirmed', 'CONFIRMED', confirmedAt, 'STAFF', 'Confirmed on call');
    if (packedAt) ev('order.packed', 'PACKED', packedAt, 'STAFF', 'Packed and checked');
    if (handedOverAt) ev('order.handedOver', 'HANDED_OVER', handedOverAt, 'STAFF', `Handed to ${courier.name}`);
    if (deliveredAt) ev('order.delivered', 'DELIVERED', deliveredAt, 'COURIER', 'Delivered');
    if (returnedAt) ev('order.returned', 'RETURNED', returnedAt, 'COURIER', 'Returned to the shop');
    if (cancelledAt) ev('order.cancelled', 'CANCELLED', cancelledAt, 'STAFF', 'Cancelled');
    if (kind === 'ON_HOLD') ev('order.held', 'ON_HOLD', at(2), 'STAFF', 'Put on hold');
    // money
    if (paidInFull && (prepaid || kind !== 'PAID')) {
      payments.push({
        id: practiceId(`payment:${i}`),
        storeId,
        orderId: id,
        method,
        provider: method.toLowerCase(),
        purpose: 'ORDER',
        status: 'PAID',
        amountMinor: total,
        currency: store.currency,
        paidAt: confirmedAt ?? placedAt,
        idempotencyKey: `practice:pay:${i}`,
        receivedMinor: total,
        isPractice: true,
      });
    }
    // the parcel
    if (booked) {
      const sid = practiceId(`shipment:${i}`);
      const consignment = `PRACTICE-${number}`;
      const sStatus = (
        {
          BOOKED: 'PENDING_PICKUP',
          PACKED: 'PENDING_PICKUP',
          HANDED_OVER: 'PICKED_UP',
          IN_TRANSIT: 'IN_TRANSIT',
          DELIVERED: 'DELIVERED',
          PAID: 'DELIVERED',
          RETURNED: 'RETURNED',
        } as const
      )[kind as 'BOOKED'];
      const bookedAt = at(rng.int(5, 18));
      shipments.push({
        id: sid,
        storeId,
        orderId: id,
        courierAccountId: courier.id,
        consignmentId: consignment,
        trackingCode: consignment,
        status: sStatus,
        codAmountMinor: prepaid ? 0 : total,
        codCollectedMinor: kind === 'PAID' && !prepaid ? total : null,
        chargeMinor: minor(courier.fee[cust.zone]),
        bookedAt,
        pickedAt: handedOverAt,
        deliveredAt,
        returnedAt,
        idempotencyKey: `practice:ship:${i}`,
        mode: 'MOCK',
        merchantRef: `${number}-1`,
        isPractice: true,
        createdAt: bookedAt,
      });
      shipmentEvents.push({
        id: practiceId(`sevent:${i}:0`),
        storeId,
        shipmentId: sid,
        providerEventId: `practice:${i}:booked`,
        status: 'PENDING_PICKUP',
        rawStatus: 'practice',
        occurredAt: bookedAt,
        source: 'booking',
      } as Prisma.ShipmentEventCreateManyInput);
      if (handedOverAt)
        shipmentEvents.push({
          id: practiceId(`sevent:${i}:1`),
          storeId,
          shipmentId: sid,
          providerEventId: `practice:${i}:picked`,
          status: 'PICKED_UP',
          rawStatus: 'practice',
          occurredAt: handedOverAt,
          source: 'poll',
        } as Prisma.ShipmentEventCreateManyInput);
      if (kind === 'PAID' && !prepaid && deliveredAt) {
        const settleAt = new Date(Math.min(deliveredAt.getTime() + 3 * DAY, now.getTime() - HOUR));
        paidCod.push({
          orderId: id,
          shipmentId: sid,
          courierId: courier.id,
          cod: total,
          charge: minor(courier.fee[cust.zone]),
          at: settleAt,
          consignment,
        });
        payments.push({
          id: practiceId(`payment:${i}`),
          storeId,
          orderId: id,
          method: 'COD',
          provider: 'courier',
          purpose: 'ORDER',
          status: 'PAID',
          amountMinor: total,
          currency: store.currency,
          paidAt: settleAt,
          idempotencyKey: `practice:pay:${i}`,
          receivedMinor: total,
          isPractice: true,
        });
      }
      if (['PAID', 'RETURNED', 'IN_TRANSIT', 'DELIVERED'].includes(kind))
        claimable.push({
          orderId: id,
          shipmentId: sid,
          courierId: courier.id,
          kind,
          total,
          at: handedOverAt ?? placedAt,
        });
    }
    // the customer's figures
    cust.orders += 1;
    if (status === 'DELIVERED') {
      cust.delivered += 1;
      cust.ltv += total;
    }
    if (status === 'RETURNED') cust.returned += 1;
    if (!cust.last || placedAt > cust.last) cust.last = placedAt;
  });

  await db.customer.createMany({
    data: custs.map((c) => ({
      id: c.id,
      storeId,
      phone: c.phone,
      name: c.name,
      firstSource: 'practice',
      orderCount: c.orders,
      deliveredCount: c.delivered,
      returnedCount: c.returned,
      lifetimeValueMinor: c.ltv,
      lastOrderAt: c.last,
      isPractice: true,
      createdAt: c.createdAt,
    })),
    skipDuplicates: true,
  });
  counts.customers = custs.length;
  await db.order.createMany({ data: orders, skipDuplicates: true });
  await db.orderItem.createMany({ data: items, skipDuplicates: true });
  await db.orderEvent.createMany({ data: events, skipDuplicates: true });
  await db.payment.createMany({ data: payments, skipDuplicates: true });
  await db.shipment.createMany({ data: shipments, skipDuplicates: true });
  await db.shipmentEvent.createMany({
    data: shipmentEvents,
    skipDuplicates: true,
  });
  Object.assign(counts, {
    orders: orders.length,
    items: items.length,
    payments: payments.length,
    shipments: shipments.length,
  });

  // ---- courier payouts: one per courier per week for the cash the couriers paid out
  const weeks = new Map<string, typeof paidCod>();
  for (const p of paidCod) {
    const week = Math.floor(p.at.getTime() / (7 * DAY));
    const k = `${p.courierId}:${week}`;
    (weeks.get(k) ?? weeks.set(k, []).get(k)!).push(p);
  }
  let payoutNo = 0;
  for (const [, group] of [...weeks].sort((a, b) => a[0].localeCompare(b[0]))) {
    payoutNo += 1;
    const sid = practiceId(`settlement:${payoutNo}`);
    const last = group.reduce((m, g) => (g.at > m ? g.at : m), group[0]!.at);
    const first = group.reduce((m, g) => (g.at < m ? g.at : m), group[0]!.at);
    const totalCod = group.reduce((s, g) => s + g.cod, 0);
    const charges = group.reduce((s, g) => s + g.charge, 0);
    await db.courierSettlement.create({
      data: {
        id: sid,
        storeId,
        courierAccountId: group[0]!.courierId,
        reference: `PRACTICE-PAYOUT-${payoutNo}`,
        periodFrom: first,
        periodTo: last,
        totalCodMinor: totalCod,
        chargesMinor: charges,
        netMinor: totalCod - charges,
        receivedAt: last,
        status: 'IMPORTED',
        receivedAs: 'BANK',
        isPractice: true,
        createdAt: last,
      },
    });
    await db.courierSettlementLine.createMany({
      data: group.map((g, k) => ({
        id: practiceId(`sline:${payoutNo}:${k}`),
        storeId,
        settlementId: sid,
        orderId: g.orderId,
        shipmentId: g.shipmentId,
        consignmentId: g.consignment,
        codMinor: g.cod,
        chargeMinor: g.charge,
        lineNo: k + 1,
        kind: 'COD',
        courierStatus: 'delivered',
        expectedMinor: g.cod,
        expectedChargeMinor: g.charge,
        matchState: 'MATCHED',
        moneyStatus: 'RECONCILED',
      })),
      skipDuplicates: true,
    });
  }
  counts.payouts = payoutNo;

  // ---- courier claims (lost, damaged, rider overcharge, other) in every state
  const kinds = ['LOST', 'DAMAGED', 'RIDER_OVERCHARGE', 'OTHER', 'LOST', 'DAMAGED'] as const;
  const states = ['OPEN', 'SENT', 'SETTLED', 'REJECTED', 'OPEN', 'SENT'] as const;
  const claims: Prisma.CourierClaimCreateManyInput[] = [];
  kinds.forEach((kind, k) => {
    const src = claimable[(k * 5) % Math.max(1, claimable.length)];
    if (!src) return;
    const claimed = kind === 'RIDER_OVERCHARGE' ? minor(rng.int(30, 120)) : Math.min(src.total, minor(rng.int(700, 1800)));
    claims.push({
      id: practiceId(`claim:${k}`),
      storeId,
      courierAccountId: src.courierId,
      orderId: src.orderId,
      shipmentId: src.shipmentId,
      kind,
      status: states[k]!,
      claimedMinor: claimed,
      settledMinor: states[k] === 'SETTLED' ? claimed : null,
      courierRef: states[k] === 'OPEN' ? null : `CLM-${1000 + k}`,
      note: 'Practice claim',
      idempotencyKey: `practice:claim:${k}`,
      sentAt: states[k] === 'OPEN' ? null : new Date(src.at.getTime() + 6 * DAY),
      closedAt: states[k] === 'SETTLED' || states[k] === 'REJECTED' ? new Date(src.at.getTime() + 12 * DAY) : null,
      isPractice: true,
      createdAt: new Date(src.at.getTime() + 5 * DAY),
    });
  });
  await db.courierClaim.createMany({ data: claims, skipDuplicates: true });
  counts.claims = claims.length;

  // ---- incomplete orders (started checkouts that did not finish)
  const drafts: Prisma.CheckoutDraftCreateManyInput[] = [];
  for (let k = 0; k < PRACTICE_INCOMPLETE; k++) {
    const c = rng.pick(custs);
    const v = rng.pick(variants);
    const last = new Date(now.getTime() - rng.int(20, 30 * 24 * 60) * 60_000);
    const handled = k % 6 === 5;
    drafts.push({
      id: practiceId(`draft:${k}`),
      storeId,
      visitorId: `practice-visitor-${k}`,
      phone: rng.next() < 0.75 ? c.phone : null,
      name: rng.next() < 0.7 ? c.name : null,
      addressText: rng.next() < 0.5 ? `${c.area}, ${c.district}` : null,
      data: {
        items: [
          {
            name: `${v.name} (practice)`,
            sku: v.sku,
            quantity: 1,
            unitPriceMinor: v.priceMinor,
          },
        ],
      } as Prisma.InputJsonValue,
      lastStep: rng.pick(['address', 'phone', 'payment', 'review']),
      lastActivityAt: last,
      handledAt: handled ? new Date(last.getTime() + 2 * HOUR) : null,
      handledNote: handled ? 'Called, will order later (practice)' : null,
      isPractice: true,
      createdAt: last,
      updatedAt: last,
    });
  }
  await db.checkoutDraft.createMany({ data: drafts, skipDuplicates: true });
  counts.incomplete = drafts.length;

  return { seeded: true, counts };
}
