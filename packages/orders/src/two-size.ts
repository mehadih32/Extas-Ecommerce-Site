// PR 146 — the two-size follow-up (Blueprint B1.10; demo 02-core.js order flags "2 sizes — check" and "2 sizes — for
// someone else"; demo 01-data.js the "2-Size Follow-up" helper). An order with the same piece in the same colour in
// neighbouring sizes (S and M, or a run S, M, L as ONE group) is usually a customer unsure of his size: one of them
// comes back at the door. Right after placing, the check looks at the order's lines with the bag's own grouping
// (`@extas/cart/pure` sizeGroups, the same as the bag's two-sizes card):
//   - a group the customer said in the bag is "for different people" (the bag's answer `other`) is only a note on the
//     order ("2 sizes — for someone else"): nobody is asked and nothing is flagged (SIM-F-036, a family buying S, M, L);
//   - any other group flags the order "2 sizes — check", asks the customer on his order page which he wants (keep all,
//     or only one size) and, when the owner wants it, leaves the confirmation caller a call task (TWO_SIZE).
// The message itself goes out with the notification templates (`order.twoSize`, off until the owner turns it on with
// the notifications stage); his order page carries the same question.
//
// The answer is a command of the one order service (`twoSizeAnswer`): the row lock, the version, the timeline and the
// audit log as ever, refused once a courier is booked (SIM-F-004 — the parcel the courier has is the parcel). "Only M"
// takes the other sizes' lines out through the edit (edit.ts applyEdit): the stock is let go, the total and the amount
// to collect fall by exactly those lines, a paid order's overpaid part becomes a refund REQUEST, nothing else. A line
// that carries an offer or a set price is never taken out by itself (the offer's price would change): the answer is
// kept and the team decides with the customer. Off by default (`orders.twoSize`, CN-018). With no answer, all go.
import { answerFor, sizeGroups, SIZE_ANSWERS, type SizeAnswer, type SizeLine } from '@extas/cart/pure';
import { z } from 'zod';
import { allow, parse, setting, UUID, type Db, type OrdersDeps, type Tx, type Who } from './context';
import type { CustomerRef } from './customer';
import { applyEdit, customerBy, ownOrderId, removeRefusal, rescreenAfterEdit, type EditDone } from './edit';
import { isOrdersError, OrdersError } from './errors';
import { plan } from './pure';
import { execute, factsOf, MACHINE_SELECT, machineOf, staffBy, systemBy, type By, type CommandOptions, type CommandResult, type LockedOrder } from './service';

/** The order flags the team's screens read (Order.flags). */
export const TWO_SIZE_FLAGS = { check: 'TWO_SIZES', other: 'TWO_SIZES_OTHER' } as const;

/** Order.twoSizeStatus: the question is open, answered, a person must finish it, or it was only a note. */
export const TWO_SIZE_STATUS = { asked: 'ASKED', answered: 'ANSWERED', team: 'NEEDS_TEAM', noted: 'NOTED' } as const;

/** One group as the check recorded it (the ask event's data). */
export interface TwoSizeGroup {
  key: string;
  product: string;
  colour: string | null;
  /** In size order, each with its lines on the order. */
  sizes: { sizeId: string; label: string; lineIds: string[] }[];
}

const groupSchema = z.object({
  key: z.string(),
  product: z.string(),
  colour: z.string().nullable(),
  sizes: z.array(z.object({ sizeId: z.string(), label: z.string(), lineIds: z.array(z.string()) })),
});
const checkData = z.object({ asked: z.array(groupSchema) });
const answerData = z.object({ key: z.string() });

/** The bag's stored answers, read safely (anything unknown is dropped); the same reading as the bag's own. */
function answersOf(v: unknown): Record<string, SizeAnswer> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter((e): e is [string, SizeAnswer] => (SIZE_ANSWERS as readonly unknown[]).includes(e[1])));
}

/** The order's lines as the bag's grouping reads them: each size's place among the piece's own sizes (as the bag counts it). */
async function sizeLinesOf(db: Db, storeId: number, orderId: string): Promise<{ lines: SizeLine[]; names: Map<string, { product: string; colour: string | null }> }> {
  const items = await db.orderItem.findMany({ where: { storeId, orderId, status: 'ACTIVE', variantId: { not: null } }, orderBy: { createdAt: 'asc' }, select: { id: true, variantId: true, productName: true, colourName: true } });
  const variants = await db.productVariant.findMany({ where: { storeId, id: { in: items.map((i) => i.variantId!) } }, select: { id: true, productId: true, colourId: true, sizeId: true } });
  const productIds = [...new Set(variants.map((v) => v.productId))];
  const all = productIds.length
    ? await db.productVariant.findMany({ where: { storeId, productId: { in: productIds }, archivedAt: null, sizeId: { not: null } }, select: { productId: true, size: { select: { id: true, key: true, label: true, sortOrder: true, archivedAt: true } } } })
    : [];
  const order = new Map<string, Map<string, { label: string; order: number }>>();
  for (const pid of productIds) {
    const sizes = new Map<string, { key: string; label: string; sortOrder: number }>();
    for (const v of all) if (v.productId === pid && v.size && !v.size.archivedAt) sizes.set(v.size.id, v.size);
    const sorted = [...sizes.entries()].sort((a, b) => a[1].sortOrder - b[1].sortOrder || a[1].key.localeCompare(b[1].key));
    order.set(pid, new Map(sorted.map(([id, s], i) => [id, { label: s.label, order: i }])));
  }
  const byId = new Map(variants.map((v) => [v.id, v]));
  const lines: SizeLine[] = [];
  const names = new Map<string, { product: string; colour: string | null }>();
  for (const i of items) {
    const v = byId.get(i.variantId!);
    const s = v?.sizeId ? order.get(v.productId)?.get(v.sizeId) : undefined;
    if (!v || !s) continue;
    lines.push({ lineId: i.id, productId: v.productId, colourId: v.colourId, sizeId: v.sizeId!, sizeOrder: s.order, sizeLabel: s.label });
    names.set(i.id, { product: i.productName, colour: i.colourName });
  }
  return { lines, names };
}

/**
 * The check right after placing (the checkout calls it beside the duplicate check; it never fails the order). Once per
 * order: an order checked before is left as it is. Returns how many groups were asked and noted (null: switched off,
 * or nothing to look at).
 */
export async function twoSizeCheck(deps: OrdersDeps, ref: { storeId: number; orderId: string }): Promise<{ asked: number; noted: number } | null> {
  const cfg = await setting(deps, ref.storeId, 'orders.twoSize');
  if (!cfg.enabled) return null;
  const o = await deps.db.order.findFirst({ where: { id: ref.orderId, storeId: ref.storeId }, select: { twoSizeStatus: true } });
  if (!o || o.twoSizeStatus) return null;
  const { lines, names } = await sizeLinesOf(deps.db, ref.storeId, ref.orderId);
  const groups = sizeGroups(lines);
  if (!groups.length) return null;
  const cart = await deps.db.cart.findFirst({ where: { storeId: ref.storeId, convertedOrderId: ref.orderId }, select: { sizeAnswers: true } });
  const answers = answersOf(cart?.sizeAnswers);
  const byLine = new Map(lines.map((l) => [l.lineId, l]));
  const shape = (g: (typeof groups)[number]): TwoSizeGroup => ({
    key: g.key,
    product: names.get(g.lineIds[0]!)?.product ?? '',
    colour: names.get(g.lineIds[0]!)?.colour ?? null,
    sizes: g.sizes.map((s) => ({ sizeId: s.sizeId, label: s.label, lineIds: g.lineIds.filter((id) => byLine.get(id)?.sizeId === s.sizeId) })),
  });
  // SIM-F-036: "for different people" is only a note; anything else (no answer, "keep", "help me choose") is asked
  const asked = groups.filter((g) => answerFor(g, answers) !== 'other').map(shape);
  const noted = groups.filter((g) => answerFor(g, answers) === 'other').map(shape);
  try {
    await execute(
      deps,
      ref,
      systemBy('two-size-check'),
      {
        command: 'twoSizeCheck',
        input: { asked: asked.map((g) => g.key), noted: noted.map((g) => g.key) },
        effect: async (tx, lo, _f, { now }) => {
          const row = await tx.order.findUniqueOrThrow({ where: { id: lo.id }, select: { flags: true, twoSizeStatus: true } });
          if (row.twoSizeStatus) throw new OrdersError('NOTHING_CHANGED', 'this order was checked before', []);
          const flags = [...row.flags.filter((f) => f !== TWO_SIZE_FLAGS.check && f !== TWO_SIZE_FLAGS.other), ...(asked.length ? [TWO_SIZE_FLAGS.check] : []), ...(noted.length ? [TWO_SIZE_FLAGS.other] : [])];
          if (asked.length && cfg.callTask)
            await tx.callTask.create({ data: { storeId: lo.storeId, orderId: lo.id, customerId: lo.customerId, reason: 'TWO_SIZE', dueAt: now, notes: `Two sizes of the same piece: ${asked.map((g) => `${g.product} ${g.sizes.map((s) => s.label).join(' + ')}`).join('; ')}. Ask which he wants.` } });
          return {
            data: { flags, twoSizeStatus: asked.length ? TWO_SIZE_STATUS.asked : TWO_SIZE_STATUS.noted },
            eventData: { asked, noted, askCustomer: asked.length > 0 && cfg.askCustomer, callTask: asked.length > 0 && cfg.callTask },
          };
        },
      },
      { idempotencyKey: `two-size-check:${ref.orderId}` },
    );
  } catch (e) {
    // checked before, or the order moved on (cancelled in the same second): nothing to ask
    if (isOrdersError(e) && (e.code === 'NOTHING_CHANGED' || e.code === 'ILLEGAL_TRANSITION')) return null;
    throw e;
  }
  return { asked: asked.length, noted: noted.length };
}

/** The questions still open on an order: the asked groups not answered yet whose sizes are still two or more on it. */
export async function openTwoSize(db: Db, storeId: number, orderId: string): Promise<TwoSizeGroup[]> {
  const events = await db.orderEvent.findMany({ where: { storeId, orderId, type: { in: ['order.twoSizeCheck', 'order.twoSizeAnswer'] } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { type: true, data: true } });
  let asked: TwoSizeGroup[] = [];
  const answered = new Set<string>();
  for (const e of events) {
    if (e.type === 'order.twoSizeCheck') asked = checkData.safeParse(e.data).data?.asked ?? [];
    else {
      const k = answerData.safeParse(e.data).data?.key;
      if (k) answered.add(k);
    }
  }
  if (!asked.length) return [];
  const active = new Set((await db.orderItem.findMany({ where: { storeId, orderId, status: 'ACTIVE' }, select: { id: true } })).map((i) => i.id));
  return asked
    .filter((g) => !answered.has(g.key))
    .map((g) => ({ ...g, sizes: g.sizes.map((s) => ({ ...s, lineIds: s.lineIds.filter((id) => active.has(id)) })).filter((s) => s.lineIds.length) }))
    .filter((g) => g.sizes.length >= 2);
}

export const twoSizeAnswerInput = z
  .object({
    key: z.string().trim().min(1).max(400),
    /** "all": every size goes; a size id: only that size goes, the other sizes' lines are taken out. */
    keep: z.union([z.literal('all'), z.string().regex(UUID)]),
    note: z.string().trim().max(2_000).optional(),
  })
  .strict();

/** The answer under the order's lock: the group, the lines taken out (or kept for the team), the flag and the call task. */
async function answer(deps: OrdersDeps, ref: { storeId: number; orderId: string }, by: By, d: z.output<typeof twoSizeAnswerInput>, via: string, opts: CommandOptions): Promise<{ result: CommandResult; removed: string[] }> {
  let removed: string[] = [];
  const result = await execute(
    deps,
    ref,
    by,
    {
      command: 'twoSizeAnswer',
      input: d,
      effect: async (tx: Tx, o: LockedOrder, _f, { now }) => {
        const open = await openTwoSize(tx, o.storeId, o.id);
        const g = open.find((x) => x.key === d.key);
        if (!g) throw new OrdersError('NOTHING_CHANGED', 'this question is answered already', ['key']);
        const kept = d.keep === 'all' ? null : g.sizes.find((s) => s.sizeId === d.keep);
        if (d.keep !== 'all' && !kept) throw new OrdersError('INVALID_INPUT', 'pick one of the sizes on the order', ['keep']);
        const out = kept ? g.sizes.filter((s) => s !== kept).flatMap((s) => s.lineIds) : [];
        let done: EditDone | null = null;
        let applied = true;
        if (out.length) {
          // a line with an offer or a set price is never taken out by itself: the answer waits for a person
          const [items, order] = await Promise.all([
            tx.orderItem.findMany({ where: { storeId: o.storeId, orderId: o.id, status: 'ACTIVE' }, select: { id: true, comboId: true } }),
            tx.order.findUniqueOrThrow({ where: { id: o.id }, select: { discountMinor: true } }),
          ]);
          const refused = items.filter((i) => out.includes(i.id)).some((i) => removeRefusal(i, order, items.length - out.length + 1) !== null);
          if (refused) applied = false;
          else done = await applyEdit(deps, tx, o, { lines: out.map((lineId) => ({ lineId, remove: true as const })) }, { reason: 'two-size', by });
        }
        const row = await tx.order.findUniqueOrThrow({ where: { id: o.id }, select: { flags: true, twoSizeStatus: true } });
        const left = open.length - 1;
        const status = !applied ? TWO_SIZE_STATUS.team : left ? TWO_SIZE_STATUS.asked : row.twoSizeStatus === TWO_SIZE_STATUS.team ? TWO_SIZE_STATUS.team : TWO_SIZE_STATUS.answered;
        const flags = status === TWO_SIZE_STATUS.answered ? row.flags.filter((f) => f !== TWO_SIZE_FLAGS.check) : row.flags;
        if (status === TWO_SIZE_STATUS.answered)
          await tx.callTask.updateMany({ where: { storeId: o.storeId, orderId: o.id, reason: 'TWO_SIZE', status: { in: ['OPEN', 'IN_PROGRESS'] } }, data: { status: 'DONE', closedAt: now, outcome: 'two-size answered' } });
        removed = done ? done.lines.map((l) => l.lineId) : [];
        const base = done?.effect ?? {};
        return {
          ...base,
          data: { ...base.data, flags, twoSizeStatus: status },
          reasonCode: 'two-size',
          message: d.note ?? null,
          eventData: { ...base.eventData, key: g.key, product: g.product, sizes: g.sizes.map((s) => s.label), keep: kept ? kept.label : 'all', applied, via },
        };
      },
    },
    opts,
  );
  return { result, removed };
}

/** The team's answer (`orders.edit`): what the customer said on the phone. */
export async function answerTwoSize(deps: OrdersDeps, who: Who, orderId: string, input: unknown, opts: CommandOptions = {}): Promise<CommandResult> {
  await allow(deps, who, 'orders.edit');
  if (!UUID.test(orderId)) throw new OrdersError('NOT_FOUND', 'no such order', ['orderId']);
  const d = parse(twoSizeAnswerInput, input, 'two-size');
  const by = staffBy(who.actor, who.ctx);
  const ref = { storeId: who.storeId, orderId };
  const r = await answer(deps, ref, by, d, 'admin', opts);
  await rescreenAfterEdit(deps, ref, by, { lines: r.removed.map((lineId) => ({ lineId, remove: true as const })) });
  return r.result;
}

/** The open questions for the admin page (`orders.read`). */
export async function twoSizeQuestions(deps: OrdersDeps, who: Who, orderId: string): Promise<TwoSizeGroup[]> {
  await allow(deps, who, 'orders.read');
  if (!UUID.test(orderId)) throw new OrdersError('NOT_FOUND', 'no such order', ['orderId']);
  return openTwoSize(deps.db, who.storeId, orderId);
}

/** What his order page asks now (nothing while the owner has it off or the order is past the step). */
export interface CustomerTwoSizeState {
  open: boolean;
  questions: { key: string; product: string; colour: string | null; sizes: { sizeId: string; label: string }[] }[];
}

/** The two-size question on his order page. */
export async function customerTwoSizeState(deps: OrdersDeps, c: CustomerRef, n: string): Promise<CustomerTwoSizeState> {
  const id = await ownOrderId(deps, c, n);
  const cfg = await setting(deps, c.storeId, 'orders.twoSize');
  if (!cfg.enabled || !cfg.askCustomer) return { open: false, questions: [] };
  const o = await deps.db.order.findUniqueOrThrow({ where: { id }, select: MACHINE_SELECT });
  if (!plan('twoSizeAnswer', machineOf(o, await factsOf(deps.db, o))).ok) return { open: false, questions: [] };
  const open = await openTwoSize(deps.db, c.storeId, id);
  return { open: open.length > 0, questions: open.map((g) => ({ key: g.key, product: g.product, colour: g.colour, sizes: g.sizes.map((s) => ({ sizeId: s.sizeId, label: s.label })) })) };
}

export const customerTwoSizeInput = z.object({ number: z.string().trim().min(1).max(40), key: twoSizeAnswerInput.shape.key, keep: twoSizeAnswerInput.shape.keep }).strict();

/** His answer from his order page (only while the owner lets the page ask). */
export async function customerTwoSizeAnswer(deps: OrdersDeps, c: CustomerRef, input: unknown, opts: CommandOptions = {}): Promise<CommandResult> {
  const d = parse(customerTwoSizeInput, input, 'two-size');
  const orderId = await ownOrderId(deps, c, d.number);
  const cfg = await setting(deps, c.storeId, 'orders.twoSize');
  if (!cfg.enabled || !cfg.askCustomer) throw new OrdersError('EDIT_CLOSED', 'this order can no longer be changed here', ['number'], { closed: 'OFF' });
  const by = customerBy(c);
  const ref = { storeId: c.storeId, orderId };
  const r = await answer(deps, ref, by, { key: d.key, keep: d.keep }, 'order-page', opts);
  await rescreenAfterEdit(deps, ref, by, { lines: r.removed.map((lineId) => ({ lineId, remove: true as const })) });
  return r.result;
}
