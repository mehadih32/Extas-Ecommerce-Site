// S28 · PR 1220 (p102, the owner's ask: the row buttons the prototype v5 shows appear on the live admin while practice mode is
// on) — the practice world's NON-money display rows beside the flagged orders and customers: the AI approvals waiting (AI ›
// Approvals), written from the prototype's own queue (data.ts `PRACTICE_ROWS`). Rules, the same as the rest of the practice
// world:
//  - Practice-owned by a mark, never a real row: an approval carries `channel = 'practice'` (PRACTICE_CHANNEL). The table has
//    no practice flag and the schema is not changed here.
//  - Shown only while practice mode is on: every list that reads them filters the mark out while it is off
//    (`practiceApprovalScope`), and nothing that sends or acts (the Telegram digest, the AI) ever reads them.
//  - Acting on one never acts for real: an approval of these kinds is decided by a status change only (approvals.ts has no
//    side effect for them), nothing is sent, booked, published or moved.
//  - Removed by "Reset practice data" and the sales rebuild (`removePracticeRows`, reset.ts); a second seed adds nothing.
//  - Deterministic: ids come from the row's own key, times are counted back from `now`.
import type { Prisma, PrismaClient } from '@extas/db/client';
import { PRACTICE_ROWS, type PracticeApproval } from './data';
import { practiceId } from './ids';

type Db = PrismaClient;
type Tx = Prisma.TransactionClient;
const MINUTE = 60_000; // hardcode-ok: milliseconds in a minute

/** The mark on every practice approval (AiApprovalRequest.channel). */
export const PRACTICE_CHANNEL = 'practice'; // hardcode-ok: an ownership mark, not a text the shop shows

/** The `where` that leaves practice approvals out (a null channel is kept: `channel <> x` alone would drop it). */
export const NOT_PRACTICE_APPROVAL: Prisma.AiApprovalRequestWhereInput = { OR: [{ channel: null }, { channel: { not: PRACTICE_CHANNEL } }] };

/** The extra `where` of an approvals list: nothing while practice mode is on, else "not a practice approval". */
export function practiceApprovalScope(practiceOn: boolean): Prisma.AiApprovalRequestWhereInput {
  return practiceOn ? {} : NOT_PRACTICE_APPROVAL;
}

/** An amount of a sample text in the store's currency, whole units (৳1,500). */
function moneyText(currency: string, n: number): string {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: 0, maximumFractionDigits: Number.isInteger(n) ? 0 : 1 }).format(n);
  } catch {
    return `${currency} ${n}`;
  }
}

/** Fills `{m0}`… with the amounts and `{name}`… with the values; an unknown placeholder is left as it is. */
export function fillText(text: string, currency: string, money: readonly number[] = [], values: Record<string, string | number> = {}): string {
  return text.replace(/\{(m\d+|[a-zA-Z]+)\}/g, (all, k: string) => {
    if (/^m\d+$/.test(k)) {
      const n = money[Number(k.slice(1))];
      return n === undefined ? all : moneyText(currency, n);
    }
    return values[k] === undefined ? all : String(values[k]);
  });
}

const districtOf = (address: string | null): string => (address ?? '').split(',').map((s) => s.trim()).filter(Boolean).pop() ?? '';

/** The prototype's approvals waiting (and one decided), once per store. Cards about an order or a customer use practice ones. */
async function seedApprovals(db: Db, storeId: number, currency: string, now: Date): Promise<number> {
  if ((await db.aiApprovalRequest.count({ where: { storeId, channel: PRACTICE_CHANNEL } })) > 0) return 0;
  const [orders, refuser, anyone, product] = await Promise.all([
    db.order.findMany({ where: { storeId, isPractice: true, status: 'PLACED', archivedAt: null }, orderBy: [{ placedAt: 'desc' }, { id: 'asc' }], take: 2, select: { id: true, number: true, customerName: true, shippingAddressText: true } }),
    db.customer.findFirst({ where: { storeId, isPractice: true, returnedCount: { gt: 0 } }, orderBy: [{ returnedCount: 'desc' }, { id: 'asc' }], select: { id: true, name: true, orderCount: true, returnedCount: true } }),
    db.customer.findFirst({ where: { storeId, isPractice: true }, orderBy: { id: 'asc' }, select: { id: true, name: true } }),
    db.product.findFirst({ where: { storeId, isPractice: true, archivedAt: null }, orderBy: [{ sortRank: 'asc' }, { id: 'asc' }], select: { id: true, nameEn: true, minPriceMinor: true } }),
  ]);
  const digits = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  const rows: Prisma.AiApprovalRequestCreateManyInput[] = [];
  let orderNo = 0;
  for (const a of PRACTICE_ROWS.approvals as PracticeApproval[]) {
    const values: Record<string, string | number> = {};
    let refType: string | null = null;
    let refId: string | null = null;
    if (a.uses === 'order') {
      const o = orders[orderNo++];
      if (!o) continue; // no waiting practice order: the card is left out rather than made about nothing
      Object.assign(values, { order: o.number, name: o.customerName ?? '', district: districtOf(o.shippingAddressText), orderId: o.id });
      refType = 'Order';
      refId = o.id;
    } else if (a.uses === 'refuser') {
      if (!refuser) continue;
      Object.assign(values, { name: refuser.name ?? '', refused: refuser.returnedCount, orders: refuser.orderCount, customerId: refuser.id });
      refType = 'Customer';
      refId = refuser.id;
    } else if (a.uses === 'customer') {
      if (!anyone) continue;
      values.name = anyone.name ?? '';
    } else if (a.uses === 'product') {
      if (!product || product.minPriceMinor === null) continue;
      const each = product.minPriceMinor / 10 ** digits;
      Object.assign(values, { product: product.nameEn, combo: moneyText(currency, Math.round((each * 2 * 0.9) / 10) * 10) }); // hardcode-ok: the prototype's sample combo (two pieces, 10% off, to the nearest 10)
    }
    const at = new Date(now.getTime() - a.minutesAgo * MINUTE);
    const decided = a.decidedMinutesAgo !== undefined ? new Date(now.getTime() - a.decidedMinutesAgo * MINUTE) : null;
    const ownerView: Record<string, string> = { impact: fillText(a.impact, currency, a.money, values), openHref: fillText(a.open, currency, [], values) };
    if (a.draft) ownerView.draft = fillText(a.draft, currency, a.money, values);
    rows.push({
      id: practiceId(`approval:${storeId}:${a.key}`),
      storeId,
      agentKey: a.agent,
      kind: a.kind,
      title: fillText(a.title, currency, a.money, values),
      summary: fillText(a.why, currency, a.money, values),
      payload: { practice: true, ownerView } as Prisma.InputJsonValue,
      status: decided ? 'APPROVED' : 'PENDING',
      channel: PRACTICE_CHANNEL,
      refType,
      refId,
      decidedAt: decided,
      decisionNote: decided ? 'Practice' : null,
      createdAt: at,
      updatedAt: decided ?? at,
    });
  }
  return (await db.aiApprovalRequest.createMany({ data: rows, skipDuplicates: true })).count;
}

/** Writes the practice display rows that are not there yet. Idempotent; touches nothing outside the practice world. */
export async function seedPracticeRows(db: Db, storeId: number, now: Date = new Date()): Promise<Record<string, number>> {
  const store = await db.store.findUnique({ where: { id: storeId }, select: { currency: true } });
  if (!store) return {};
  return { practiceApprovals: await seedApprovals(db, storeId, store.currency, now) };
}

/** Are practice display rows missing on a store that holds the practice world (cheap: two counts)? */
export async function practiceRowsMissing(db: Db, storeId: number): Promise<boolean> {
  const [orders, approvals] = await Promise.all([db.order.count({ where: { storeId, isPractice: true } }), db.aiApprovalRequest.count({ where: { storeId, channel: PRACTICE_CHANNEL } })]);
  return orders > 0 && approvals === 0;
}

/** Removes the practice display rows (inside the reset's transaction). Returns what it removed, by table. */
export async function removePracticeRows(tx: Tx, storeId: number): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const n = (await tx.aiApprovalRequest.deleteMany({ where: { storeId, channel: PRACTICE_CHANNEL } })).count;
  if (n) out.AiApprovalRequest = n;
  return out;
}
