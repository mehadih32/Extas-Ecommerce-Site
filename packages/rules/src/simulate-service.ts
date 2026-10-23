// PR 219 — rule simulation: "what would this change have done to the orders we really had?" The store's recent orders
// (the last `rules.simulation.defaultDays`, at most `rules.simulation.maxOrders`) are priced twice by the engine with the
// same cart, band, payment and coupon: once with the rules live today, once with the candidate in place of its rule
// (switched on, as if published now or at its start). Nothing is written to the orders; the result is kept as a
// SmartRuleSimulation row so the owner can look back at what was checked before a change went live.
import { z } from 'zod';
import { allow, found, nowOf, parse, setting, type RulesDeps, type Who } from './context';
import { activeRules } from './core';
import { clockFacts, quote, type CartFacts, type Quote } from './engine';
import { asJson, draftRule, toRule } from './rows';
import { scopeFacts } from './facts';
import { ruleContentSchema, type Rule } from './model';
import { RulesError } from './errors';

const DAY_MS = 86_400_000;
const NOTHING = 0;

const simSchema = z.object({ days: z.int().min(1).max(366).optional(), content: z.unknown().optional() }).strict();

export interface SimOrder {
  orderId: string;
  number: string;
  placedAt: string;
  before: { itemsMinor: number; deliveryMinor: number | null; totalMinor: number; cod: boolean | null };
  after: { itemsMinor: number; deliveryMinor: number | null; totalMinor: number; cod: boolean | null };
  differenceMinor: number;
}

export interface SimulationResult {
  id: string;
  ruleId: string;
  ruleKey: string;
  version: number;
  fromDraft: boolean;
  days: number;
  from: string;
  to: string;
  /** Orders priced (capped by rules.simulation.maxOrders). */
  orders: number;
  capped: boolean;
  /** Orders whose price, delivery or COD changes. */
  changed: number;
  before: Totals;
  after: Totals;
  /** after − before, all orders together (negative = customers pay less). */
  differenceMinor: number;
  freeDeliveryBefore: number;
  freeDeliveryAfter: number;
  codRefusedBefore: number;
  codRefusedAfter: number;
  /** Orders whose delivery charge the engine cannot tell (no band, or a charge not set yet). */
  deliveryUnknown: number;
  /** The orders that change most (largest difference first). */
  biggest: SimOrder[];
  createdAt: string;
}

interface Totals {
  itemsMinor: number;
  discountMinor: number;
  deliveryMinor: number;
  totalMinor: number;
}

const zero = (): Totals => ({ itemsMinor: NOTHING, discountMinor: NOTHING, deliveryMinor: NOTHING, totalMinor: NOTHING });
const add = (t: Totals, q: Quote) => {
  t.itemsMinor += q.itemsMinor;
  t.discountMinor += q.discountMinor;
  t.deliveryMinor += q.delivery.chargeMinor ?? NOTHING;
  t.totalMinor += q.totalMinor;
};

const BIGGEST = 20;

/** Runs the simulation for a rule's draft (or the content given, or its live version) and keeps the result. */
export async function simulateRule(deps: RulesDeps, who: Who, id: string, input: unknown = {}): Promise<SimulationResult> {
  await allow(deps, who, 'rules.read');
  const b = parse(simSchema, input, 'simulation');
  const row = found(await deps.db.smartRule.findFirst({ where: { id, storeId: who.storeId } }), 'rule');
  const given = b.content !== undefined ? parse(ruleContentSchema, b.content, 'rule') : null;
  const base = given ? { ...given, id: row.id, version: row.version + 1, archived: false } : (draftRule(row) ?? toRule(row));
  if (!base) throw new RulesError('NOTHING_TO_PUBLISH', 'there is nothing to simulate');
  const now = nowOf(deps);
  // Switched on, from now (or its own later start) and with no end before then.
  const at = base.startsAt && Date.parse(base.startsAt) > now.getTime() ? new Date(base.startsAt) : now;
  const cand: Rule = { ...base, status: 'ACTIVE', archived: false, endsAt: base.endsAt && Date.parse(base.endsAt) > at.getTime() ? base.endsAt : null };

  const [days, maxOrders, maxPercentOff, timeZone] = await Promise.all([
    b.days ?? setting(deps, who.storeId, 'rules.simulation.defaultDays'),
    setting(deps, who.storeId, 'rules.simulation.maxOrders'),
    setting(deps, who.storeId, 'rules.discount.maxPercentOff'),
    setting(deps, who.storeId, 'store.timeZone'),
  ]);
  const from = new Date(now.getTime() - days * DAY_MS);
  const live = (await activeRules(deps.db, who.storeId)).filter((r) => r.id !== row.id);
  const liveSelf = toRule(row);
  const beforeRules = liveSelf && liveSelf.status === 'ACTIVE' && !liveSelf.archived ? [...live, liveSelf] : live;
  const afterRules = [...live, cand];

  const orders = await deps.db.order.findMany({
    where: { storeId: who.storeId, placedAt: { gte: from, lte: now }, status: { notIn: ['DRAFT', 'CANCELLED'] }, archivedAt: null },
    orderBy: { placedAt: 'desc' },
    take: maxOrders + 1,
    // Follow-up 54: the band's own charge, so the simulated delivery figure is the one the checkout charges today.
    include: { items: { where: { status: 'ACTIVE' } }, deliveryBand: { select: { key: true, enabled: true, chargeMinor: true, archivedAt: true } } },
  });
  const capped = orders.length > maxOrders;
  const list = orders.slice(0, maxOrders);
  const facts = await scopeFacts(deps.db, who.storeId, list.flatMap((o) => o.items.map((i) => i.productId).filter((x): x is string => !!x)));
  const codes = [...new Set(list.map((o) => o.couponCode?.trim().toUpperCase()).filter((x): x is string => !!x))];
  const coupons = codes.length ? await deps.db.coupon.findMany({ where: { storeId: who.storeId, code: { in: codes } }, select: { code: true, ruleId: true } }) : [];
  const couponRule = new Map(coupons.map((c) => [c.code, c.ruleId]));
  const clock = clockFacts(at, timeZone);
  const limits = { maxPercentOff };

  const before = zero();
  const after = zero();
  let changed = 0;
  let freeB = 0;
  let freeA = 0;
  let codRefusedB = NOTHING;
  let codRefusedA = NOTHING;
  let unknown = 0;
  const rowsOut: SimOrder[] = [];
  for (const o of list) {
    const code = o.couponCode?.trim().toUpperCase() ?? null;
    const unlocked = code ? couponRule.get(code) : null;
    const f: CartFacts = {
      now: at,
      lines: o.items.map((i) => {
        const sf = i.productId ? facts.get(i.productId) : undefined;
        return { id: i.id, variantId: i.variantId, unitPriceMinor: i.unitPriceMinor, quantity: i.quantity, productId: i.productId, categoryIds: sf?.categoryIds ?? [], collectionIds: sf?.collectionIds ?? [], freeDelivery: sf?.freeDelivery ?? null, comboId: i.comboId };
      }),
      bandKey: o.deliveryBand?.key ?? null,
      ...(o.deliveryBand && o.deliveryBand.archivedAt === null ? { bandChargeMinor: o.deliveryBand.enabled ? o.deliveryBand.chargeMinor : null } : {}),
      paymentMethod: o.paymentMethod,
      couponCode: code,
      couponRuleIds: unlocked ? [unlocked] : [],
      customer: { loggedIn: o.customerId !== null, deliveredOrders: null },
      source: o.source,
      weekday: clock.weekday,
      hour: clock.hour,
    };
    const qb = quote(beforeRules, f, limits);
    const qa = quote(afterRules, f, limits);
    add(before, qb);
    add(after, qa);
    if (qb.delivery.free) freeB++;
    if (qa.delivery.free) freeA++;
    if (qb.cod.allowed === false) codRefusedB++;
    if (qa.cod.allowed === false) codRefusedA++;
    if (!qa.totalKnown) unknown++;
    const diff = qa.totalMinor - qb.totalMinor;
    const isChanged = diff !== 0 || qa.delivery.chargeMinor !== qb.delivery.chargeMinor || qa.cod.allowed !== qb.cod.allowed;
    if (isChanged) {
      changed++;
      rowsOut.push({
        orderId: o.id,
        number: o.number,
        placedAt: o.placedAt.toISOString(),
        before: { itemsMinor: qb.itemsMinor, deliveryMinor: qb.delivery.chargeMinor, totalMinor: qb.totalMinor, cod: qb.cod.allowed },
        after: { itemsMinor: qa.itemsMinor, deliveryMinor: qa.delivery.chargeMinor, totalMinor: qa.totalMinor, cod: qa.cod.allowed },
        differenceMinor: diff,
      });
    }
  }
  rowsOut.sort((x, y) => Math.abs(y.differenceMinor) - Math.abs(x.differenceMinor));
  const result = {
    ruleId: row.id,
    ruleKey: row.key,
    version: cand.version,
    fromDraft: given === null && row.draft !== null,
    days,
    from: from.toISOString(),
    to: now.toISOString(),
    orders: list.length,
    capped,
    changed,
    before,
    after,
    differenceMinor: after.totalMinor - before.totalMinor,
    freeDeliveryBefore: freeB,
    freeDeliveryAfter: freeA,
    codRefusedBefore: codRefusedB,
    codRefusedAfter: codRefusedA,
    deliveryUnknown: unknown,
    biggest: rowsOut.slice(0, BIGGEST),
  };
  const saved = await deps.db.smartRuleSimulation.create({
    data: { storeId: who.storeId, ruleId: row.id, input: asJson({ days, version: cand.version, fromDraft: result.fromDraft, content: cand }), result: asJson(result), actorId: who.actor.staffUserId },
  });
  return { ...result, id: saved.id, createdAt: saved.createdAt.toISOString() };
}

/** Earlier simulations of a rule, newest first. */
export async function listSimulations(deps: RulesDeps, who: Who, id: string): Promise<SimulationResult[]> {
  await allow(deps, who, 'rules.read');
  found(await deps.db.smartRule.findFirst({ where: { id, storeId: who.storeId }, select: { id: true } }), 'rule');
  const rows = await deps.db.smartRuleSimulation.findMany({ where: { storeId: who.storeId, ruleId: id }, orderBy: { createdAt: 'desc' }, take: 20 });
  return rows.map((r) => ({ ...(r.result as unknown as Omit<SimulationResult, 'id' | 'createdAt'>), id: r.id, createdAt: r.createdAt.toISOString() }));
}
