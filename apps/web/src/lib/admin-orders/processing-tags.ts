// PR 1127 (prototype v5, Orders › Processing): why each order needs a person, as the prototype's chips — No stock (a piece
// whose variant is out of stock), No answer (its call ended on a "did not answer" outcome of `risk.history.noAnswerOutcomes`),
// Suspicious (a risk flag: watch, blocklist, repeat refuser, the red tag), Merge needed (another open order on the same phone,
// or the bundling's "one parcel?" mark) and Advance asked (an advance is asked and not in yet). Read only: a tag never moves
// an order. The pure part (`tagsOf`) is tested without a database.
import type { PrismaClient } from '@extas/db/client';
import * as od from '@extas/orders';

export const PROCESSING_TAGS = ['stock', 'noanswer', 'suspicious', 'merge', 'advance'] as const;
export type ProcessingTag = (typeof PROCESSING_TAGS)[number];

const SUSPICIOUS = new Set<string>([od.RISK_WATCH_FLAG, od.BLOCKLIST_FLAG, od.REFUSER_FLAG, od.AUTO_RED_FLAG]);
/** The states an order is "open" in for the same-phone check (not delivered, returned or cancelled). */
const OPEN = ['PLACED', 'PROCESSING', 'CONFIRMED', 'AWAITING_ADVANCE', 'ON_HOLD'] as const;

export interface TagFacts {
  flags: string[];
  outOfStock: boolean;
  noAnswer: boolean;
  samePhoneOpen: boolean;
  advanceAsked: boolean;
}

export function tagsOf(f: TagFacts): ProcessingTag[] {
  const out: ProcessingTag[] = [];
  if (f.outOfStock) out.push('stock');
  if (f.noAnswer) out.push('noanswer');
  if (f.flags.some((x) => SUSPICIOUS.has(x))) out.push('suspicious');
  if (f.samePhoneOpen || f.flags.includes(od.BUNDLE_FLAG)) out.push('merge');
  if (f.advanceAsked) out.push('advance');
  return out;
}

export async function processingTags(db: PrismaClient, storeId: number, orderIds: readonly string[], noAnswerOutcomes: readonly string[]): Promise<Map<string, ProcessingTag[]>> {
  if (!orderIds.length) return new Map();
  const ids = [...orderIds];
  const orders = await db.order.findMany({
    where: { storeId, id: { in: ids } },
    select: { id: true, phone: true, status: true, internalFlags: true, advanceRequiredMinor: true, paidMinor: true, items: { where: { status: 'ACTIVE' }, select: { variantId: true } } },
  });
  const variantIds = [...new Set(orders.flatMap((o) => o.items.map((i) => i.variantId).filter((v): v is string => !!v)))];
  const phones = [...new Set(orders.map((o) => o.phone).filter((p): p is string => !!p))];
  const [variants, open, calls] = await Promise.all([
    variantIds.length ? db.productVariant.findMany({ where: { id: { in: variantIds } }, select: { id: true, inStock: true } }) : Promise.resolve([]),
    phones.length ? db.order.groupBy({ by: ['phone'], where: { storeId, phone: { in: phones }, status: { in: [...OPEN] } }, _count: { _all: true } }) : Promise.resolve([]),
    noAnswerOutcomes.length ? db.callTask.findMany({ where: { storeId, orderId: { in: ids }, outcome: { in: [...noAnswerOutcomes] } }, select: { orderId: true } }) : Promise.resolve([]),
  ]);
  const inStock = new Map(variants.map((v) => [v.id, v.inStock]));
  const openByPhone = new Map(open.map((g) => [g.phone, g._count._all]));
  const noAnswer = new Set(calls.map((c) => c.orderId));
  return new Map(
    orders.map((o) => [
      o.id,
      tagsOf({
        flags: o.internalFlags,
        outOfStock: o.items.some((i) => i.variantId !== null && inStock.get(i.variantId) === false),
        noAnswer: noAnswer.has(o.id),
        samePhoneOpen: !!o.phone && (openByPhone.get(o.phone) ?? 0) > 1,
        advanceAsked: o.status === 'AWAITING_ADVANCE' || (o.advanceRequiredMinor !== null && o.advanceRequiredMinor > 0 && o.paidMinor < o.advanceRequiredMinor),
      }),
    ]),
  );
}
