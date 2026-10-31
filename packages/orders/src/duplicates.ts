// PR 145 — the duplicate-order defence, four layers (Blueprint B1.12, F2 question 44; the demo's "Possible duplicate"):
//
//   1. the submit guard: one press = one order (the checkout's idempotency key and the bag turning CONVERTED, PR 125);
//   2. the same-customer check the moment an order lands (`screenOrder`, called by the shop after placing): another open
//      order of the same customer or phone in the last `lookbackDays` days, and how alike the lines are — the same SKU or
//      the same product and colour is high, the same product in another colour medium, the same category low;
//   3. the review queue: a match at or above `reviewFrom` waits as an open review (a FraudAlert of section "duplicate")
//      and holds the confirm until a person decides; below it the order only shows a note on its timeline;
//   4. the decision: not a duplicate (approve), cancel it as a duplicate, hold it, ask the customer (a call task), or
//      put both orders in one parcel (merge).
//
// Nothing here blocks a customer or cancels an order by itself (CLAUDE.md rule 6); the optional auto-hold (off by
// default) only parks a high match with the reason "possible duplicate" for a person. A merge never changes a price or a
// charge: both orders keep their money; whether a second delivery charge is given back is the owner's call (BLOCKED.md).
//
// S06 · PR 520 — while the owner's `risk.duplicateRules` is on, layer 2 runs the duplicate & re-order rules engine
// (duplicate-rules.ts) instead of the one look-back: the scenarios A–E, H and I, each with its own switch, window,
// confidence and proposal. "The same customer" is the same account, the same phone, or — with the identity graph on
// (PR 519) — the same identity. A rule that proposes cancel or hold opens the same review (layers 3 and 4 unchanged);
// warn and allow are a note on the timeline. The review's summary keeps every rule that fired, so the card says why
// (PR 521). Off (the default): exactly the look-back above. Within one order, two sizes stay PR 146's (two-size.ts).
import { z } from 'zod';
import type { Prisma } from '@extas/db/client';
import { allow, nowOf, parse, setting, TX, type Db, type OrdersDeps, type Tx, type Who } from './context';
import { OTHER_KEY, cancelWith, holdWith } from './commands';
import { OrdersError } from './errors';
import { RISK_REVIEW_SECTIONS, type DuplicateRules } from '@extas/settings';
import { duplicateRuleHits, type AddressCandidate, type BlockedMatch, type RuleAction, type RuleCandidate, type RuleFacts, type RuleHit, type SameBy } from './duplicate-rules';
import { alikeOrders, IDENTITY_SELECT } from './identity';
import { clusterOrders } from './identity-graph';
import { phoneForms } from './phone-history';
import { OPEN_STATES, overlapOf, severityRank, type LineFacts, type OrderState, type Severity } from './pure';
import { auditRow, eventRow, factsOf, lockOrder, staffBy, systemBy, type By, type CommandResult } from './service';
import { goodCustomerOf, noteGoodCustomer } from './good-customer';
import { gateOn, proposeHold } from './approval-gate';

/** The FraudAlert section of a duplicate review (the risk engine of S06 writes its own sections). */
export const DUPLICATE_SECTION = 'duplicate';
/** PR 541: the FraudAlert `summary.kind` of a review a risk section opened (sections.ts; a duplicate's has none). */
export const RISK_REVIEW_KIND = 'risk';
/** PR 541: why the team calls when the decision on a risk review is "ask the customer". */
export const RISK_CALL_REASON = 'RISK_CHECK';

/** PR 520: one rule that fired, as the review's summary keeps it (the card's words read it back, PR 521). */
export type StoredRuleHit = {
  rule: string;
  confidence: number;
  action: string;
  suggest: string;
  matches: { orderId: string; number: string; confidence: number }[];
  blocked: string[];
  values: Record<string, number | string | null>;
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The rules a summary kept (PR 520), read defensively: anything that is not a rule hit is left out. */
export function storedRules(v: unknown): StoredRuleHit[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((h): StoredRuleHit[] => {
    if (!isObj(h) || typeof h.rule !== 'string' || typeof h.action !== 'string') return [];
    const matches = Array.isArray(h.matches)
      ? h.matches.flatMap((m) => (isObj(m) && typeof m.orderId === 'string' ? [{ orderId: m.orderId, number: typeof m.number === 'string' ? m.number : '', confidence: typeof m.confidence === 'number' ? m.confidence : 0 }] : []))
      : [];
    const values: Record<string, number | string | null> = {};
    if (isObj(h.values)) for (const [k, x] of Object.entries(h.values)) if (typeof x === 'number' || typeof x === 'string' || x === null) values[k] = x;
    const blocked = Array.isArray(h.blocked) ? h.blocked.filter((b): b is string => typeof b === 'string') : [];
    return [{ rule: h.rule, confidence: typeof h.confidence === 'number' ? h.confidence : 0, action: h.action, suggest: typeof h.suggest === 'string' ? h.suggest : '', matches, blocked, values }];
  });
}

/** A review's section, whether a risk section opened it, the signals that put it there (PR 541) and the duplicate rules that fired (PR 520), from its summary. */
export function reviewKindOf(summary: unknown): { section: string; risk: boolean; because: string[]; rules: StoredRuleHit[] } {
  const s = isObj(summary) ? summary : {};
  const because = Array.isArray(s.because) ? s.because.filter((k): k is string => typeof k === 'string') : [];
  return { section: typeof s.section === 'string' ? s.section : DUPLICATE_SECTION, risk: s.kind === RISK_REVIEW_KIND, because, rules: storedRules(s.rules) };
}

/** The hold reason key the auto-hold and the "hold" decision use when the owner's list has it. */
export const DUPLICATE_HOLD_KEY = 'possible-duplicate';
/** Why the team calls (CallTask.reason) when the decision is "ask the customer". */
export const DUPLICATE_CALL_REASON = 'DUPLICATE_CHECK';

export interface DuplicateMatch {
  orderId: string;
  number: string;
  status: OrderState;
  placedAt: Date;
  /** How alike the lines are; null for a match that shares none (PR 520: B different items, D an address, I bulk). */
  severity: Severity | null;
  productIds: string[];
}

export interface ScreenResult {
  /** The strongest match, or null (no other open order of this customer is alike). */
  severity: Severity | null;
  matches: DuplicateMatch[];
  /** The open review it waits in, when the match is at or above `reviewFrom` (PR 520: a rule proposed cancel or hold). */
  alertId: string | null;
  held: boolean;
  /** PR 520: the rules that fired (empty while `risk.duplicateRules` is off). */
  rules: RuleHit[];
  /** PR 520: the strongest proposal of the rules, or null. */
  proposed: RuleAction | null;
}

/** A severity's rank, with "nothing alike" (null) below low. */
const sevRank = (s: Severity | null): number => (s ? severityRank(s) : -1);

/** The lines of some orders as the comparison needs them: the variant, the product, its colour and its category. */
async function lineFacts(db: Db, storeId: number, orderIds: string[]): Promise<Map<string, LineFacts[]>> {
  const items = await db.orderItem.findMany({ where: { storeId, orderId: { in: orderIds }, status: 'ACTIVE' }, select: { orderId: true, variantId: true, productId: true } });
  const variantIds = [...new Set(items.map((i) => i.variantId).filter((x): x is string => !!x))];
  const variants = new Map((await db.productVariant.findMany({ where: { storeId, id: { in: variantIds } }, select: { id: true, colourId: true, productId: true } })).map((v) => [v.id, v]));
  const productIds = [...new Set(items.map((i) => i.productId ?? (i.variantId ? variants.get(i.variantId)?.productId : null)).filter((x): x is string => !!x))];
  const categories = new Map((await db.product.findMany({ where: { storeId, id: { in: productIds } }, select: { id: true, categoryId: true } })).map((p) => [p.id, p.categoryId]));
  const out = new Map<string, LineFacts[]>();
  for (const i of items) {
    const v = i.variantId ? variants.get(i.variantId) : undefined;
    const productId = i.productId ?? v?.productId ?? null;
    const category = productId ? categories.get(productId) : null;
    const l: LineFacts = { variantId: i.variantId, productId, colourId: v?.colourId ?? null, categoryIds: category ? [category] : [] };
    out.set(i.orderId, [...(out.get(i.orderId) ?? []), l]);
  }
  return out;
}

/** The other open orders of the same customer (or the same phone) in the look-back, and how alike each one is. */
export async function duplicateMatches(deps: OrdersDeps, storeId: number, orderId: string): Promise<DuplicateMatch[]> {
  const cfg = await setting(deps, storeId, 'orders.duplicates');
  const o = await deps.db.order.findFirst({ where: { id: orderId, storeId }, select: { id: true, customerId: true, phone: true, placedAt: true } });
  if (!o) throw new OrdersError('NOT_FOUND', 'no such order', ['orderId']);
  const who: Prisma.OrderWhereInput[] = [];
  if (o.customerId) who.push({ customerId: o.customerId });
  if (o.phone) who.push({ phone: o.phone });
  if (!who.length) return [];
  const since = new Date(o.placedAt.getTime() - cfg.lookbackDays * 86_400_000);
  const others = await deps.db.order.findMany({
    where: { storeId, id: { not: o.id }, OR: who, placedAt: { gte: since }, status: { in: [...OPEN_STATES] } },
    orderBy: { placedAt: 'desc' },
    take: 20,
    select: { id: true, number: true, status: true, placedAt: true },
  });
  if (!others.length) return [];
  const facts = await lineFacts(deps.db, storeId, [o.id, ...others.map((x) => x.id)]);
  const mine = facts.get(o.id) ?? [];
  const out: DuplicateMatch[] = [];
  for (const x of others) {
    const m = overlapOf(mine, facts.get(x.id) ?? []);
    if (m) out.push({ orderId: x.id, number: x.number, status: x.status as OrderState, placedAt: x.placedAt, severity: m.severity, productIds: m.productIds });
  }
  return out.sort((a, b) => sevRank(b.severity) - sevRank(a.severity));
}

/** What one check found and what it opens: the look-back's (PR 145) or the rules engine's (PR 520). */
interface ScreenPlan {
  matches: DuplicateMatch[];
  severity: Severity | null;
  review: boolean;
  proposedAction: 'CANCEL' | 'HOLD' | 'WARN';
  confidence: number | null;
  rules: RuleHit[];
  proposed: RuleAction | null;
}

/** PR 145 as it was: one look-back, a review from `reviewFrom`. */
async function lookbackPlan(deps: OrdersDeps, storeId: number, orderId: string, cfg: { reviewFrom: Severity; autoHold: boolean }): Promise<ScreenPlan> {
  const matches = await duplicateMatches(deps, storeId, orderId);
  const top = matches[0]?.severity ?? null;
  const review = top !== null && severityRank(top) >= severityRank(cfg.reviewFrom);
  return { matches, severity: top, review, proposedAction: cfg.autoHold && top === 'high' ? 'HOLD' : 'WARN', confidence: null, rules: [], proposed: null };
}

const MINUTE = 60_000;
/** How many other orders, alike addresses and identity orders one check reads at most. */
const RULE_TAKE = { candidates: 50, addresses: 20, cluster: 200 } as const;

/** The rules engine's facts of one order (PR 520): only what the switched-on rules need is read. */
async function ruleFacts(deps: OrdersDeps, storeId: number, orderId: string, rc: DuplicateRules): Promise<{ facts: RuleFacts; lines: Map<string, LineFacts[]> }> {
  const o = await deps.db.order.findFirst({ where: { id: orderId, storeId }, select: { ...IDENTITY_SELECT, customerId: true } });
  if (!o) throw new OrdersError('NOT_FOUND', 'no such order', ['orderId']);
  const r = rc.rules;
  const forms = phoneForms(o.phone);
  const identityOn = (await setting(deps, storeId, 'risk.identity')).enabled;
  const cluster = identityOn ? await clusterOrders(deps, storeId, o.id, RULE_TAKE.cluster) : null;
  const sameBy = (x: { customerId: string | null; phone: string | null }): SameBy => (o.customerId && x.customerId === o.customerId ? 'customer' : x.phone && forms.includes(x.phone) ? 'phone' : 'identity');

  // the same customer's other open orders, in the longest window of the rules that read them (0 = no limit)
  const reading = (['A', 'B', 'C', 'E', 'I'] as const).filter((k) => r[k].enabled);
  const windows = reading.map((k) => r[k].windowMinutes);
  const since = windows.length && !windows.includes(0) ? new Date(o.placedAt.getTime() - Math.max(...windows) * MINUTE) : undefined;
  const who: Prisma.OrderWhereInput[] = [];
  if (o.customerId) who.push({ customerId: o.customerId });
  if (forms.length) who.push({ phone: { in: forms } });
  if (cluster?.orders.length) who.push({ id: { in: cluster.orders.map((x) => x.id) } });
  const others =
    reading.length && who.length
      ? await deps.db.order.findMany({
          where: { storeId, id: { not: o.id }, OR: who, status: { in: [...OPEN_STATES] }, ...(since ? { placedAt: { gte: since } } : {}) },
          orderBy: [{ placedAt: 'desc' }, { id: 'desc' }],
          take: RULE_TAKE.candidates,
          select: { id: true, number: true, status: true, placedAt: true, customerId: true, phone: true },
        })
      : [];
  const ids = [o.id, ...others.map((x) => x.id)];
  const lines = await lineFacts(deps.db, storeId, ids);
  const sums = await deps.db.orderItem.groupBy({ by: ['orderId'], where: { storeId, orderId: { in: ids }, status: 'ACTIVE' }, _sum: { quantity: true } });
  const pieces = new Map(sums.map((g) => [g.orderId, g._sum.quantity ?? 0]));
  const candidates: RuleCandidate[] = others.map((x) => ({ orderId: x.id, number: x.number, status: x.status as OrderState, placedAt: x.placedAt, lines: lines.get(x.id) ?? [], pieces: pieces.get(x.id) ?? 0, by: sameBy(x) }));

  // D: earlier orders under another number to an alike address (any name)
  let addresses: AddressCandidate[] = [];
  if (r.D.enabled) {
    const windowDays = r.D.windowMinutes > 0 ? Math.ceil(r.D.windowMinutes / 1440) : 0;
    const alike = await alikeOrders(deps, storeId, o, { windowDays, addressSimilarity: Math.max(0.3, r.D.minConfidence / 100), name: null }, RULE_TAKE.addresses);
    const sim = new Map(alike.map((x) => [x.id, x.similarity]));
    const rows = alike.length ? await deps.db.order.findMany({ where: { storeId, id: { in: [...sim.keys()] } }, select: { id: true, number: true, status: true, placedAt: true } }) : [];
    addresses = rows.map((x) => ({ orderId: x.id, number: x.number, status: x.status as OrderState, placedAt: x.placedAt, similarity: sim.get(x.id) ?? 0 }));
  }

  // H: the block register's BLOCKED entries this order matches (a read only: nothing here blocks anyone)
  const blocked: BlockedMatch[] = [];
  if (r.H.enabled) {
    const by: Prisma.BlockEntryWhereInput[] = [];
    if (forms.length) by.push({ phone: { in: forms } });
    if (o.customerId) by.push({ customerId: o.customerId });
    if (cluster) by.push({ identityClusterId: cluster.clusterId });
    const direct = by.length ? await deps.db.blockEntry.findMany({ where: { storeId, status: 'BLOCKED', OR: by }, select: { id: true, phone: true, customerId: true, blockedAt: true } }) : [];
    for (const e of direct) blocked.push({ entryId: e.id, how: e.phone && forms.includes(e.phone) ? 'phone' : o.customerId && e.customerId === o.customerId ? 'customer' : 'identity', blockedAt: e.blockedAt });
    const address = o.shippingAddressText?.trim();
    if (address) {
      const floor = Math.max(0.3, r.H.minConfidence / 100);
      const near = await deps.db.$queryRaw<{ id: string; similarity: number; blockedAt: Date | null }[]>`
        SELECT "id"::text AS id, similarity(lower("addressGiven"), lower(${address}))::float8 AS similarity, "blockedAt" AS "blockedAt" FROM "BlockEntry"
        WHERE "storeId" = ${storeId} AND "status"::text = 'BLOCKED' AND "addressGiven" IS NOT NULL
          AND similarity(lower("addressGiven"), lower(${address})) >= ${floor}::real
        ORDER BY similarity DESC LIMIT ${RULE_TAKE.addresses}`;
      const seen = new Set(blocked.map((x) => x.entryId));
      for (const n of near) if (!seen.has(n.id)) blocked.push({ entryId: n.id, how: 'address', similarity: Number(n.similarity), blockedAt: n.blockedAt });
    }
  }
  return { facts: { placedAt: o.placedAt, lines: lines.get(o.id) ?? [], pieces: pieces.get(o.id) ?? 0, candidates, addresses, blocked }, lines };
}

const PROPOSED: Readonly<Record<RuleAction, ScreenPlan['proposedAction']>> = { cancel: 'CANCEL', hold: 'HOLD', warn: 'WARN', allow: 'WARN' };

/** PR 520: the rules engine's plan — a review when the strongest proposal is cancel or hold. */
async function rulesPlan(deps: OrdersDeps, storeId: number, orderId: string, rc: DuplicateRules): Promise<ScreenPlan> {
  const { facts, lines } = await ruleFacts(deps, storeId, orderId, rc);
  const res = duplicateRuleHits(facts, rc);
  const info = new Map<string, { status: OrderState; placedAt: Date }>([...facts.candidates, ...facts.addresses].map((x) => [x.orderId, { status: x.status, placedAt: x.placedAt }]));
  const byId = new Map<string, DuplicateMatch>();
  for (const h of res.hits)
    for (const m of h.matches) {
      const i = info.get(m.orderId);
      if (!i) continue;
      const was = byId.get(m.orderId)?.severity ?? null;
      const severity = sevRank(m.severity) > sevRank(was) ? m.severity : was;
      byId.set(m.orderId, { orderId: m.orderId, number: m.number, status: i.status, placedAt: i.placedAt, severity, productIds: overlapOf(facts.lines, lines.get(m.orderId) ?? [])?.productIds ?? [] });
    }
  const matches = [...byId.values()].sort((a, b) => sevRank(b.severity) - sevRank(a.severity) || b.placedAt.getTime() - a.placedAt.getTime());
  const severity = matches[0]?.severity ?? null;
  const review = res.top === 'cancel' || res.top === 'hold';
  const strongest = res.hits.filter((h) => h.action === res.top).map((h) => h.confidence);
  return { matches, severity, review, proposedAction: res.top ? PROPOSED[res.top] : 'WARN', confidence: strongest.length ? Math.max(...strongest) : null, rules: res.hits, proposed: res.top };
}

/** One hit as the summary keeps it (no dates, no lines: the order ids, the numbers, the confidences and the words' values). */
const storedHit = (h: RuleHit): StoredRuleHit => ({ rule: h.rule, confidence: h.confidence, action: h.action, suggest: h.suggest, matches: h.matches.map((m) => ({ orderId: m.orderId, number: m.number, confidence: m.confidence })), blocked: h.blocked, values: h.values });

/**
 * Layer 2 — runs once when an order lands (the shop calls it after placing; a second call finds the first result and
 * does nothing more). Never throws for the customer's sake: the caller logs a failure and the order stays placed.
 * PR 142 (B1.10 "every edit re-runs the fraud check"): `again` runs it after an edit changed the phone or the lines —
 * a new check event every time, a review only when none is open yet, and never a hold by itself (a person is editing).
 * PR 520: with `risk.duplicateRules` on, the rules engine decides what is found and proposed; nothing is cancelled here.
 */
export async function screenOrder(deps: OrdersDeps, ref: { storeId: number; orderId: string }, opts: { again?: { by: By } } = {}): Promise<ScreenResult> {
  const cfg = await setting(deps, ref.storeId, 'orders.duplicates');
  const none: ScreenResult = { severity: null, matches: [], alertId: null, held: false, rules: [], proposed: null };
  if (!cfg.enabled) return none;
  const seen = opts.again ? null : await deps.db.orderEvent.findFirst({ where: { storeId: ref.storeId, orderId: ref.orderId, type: 'order.duplicateCheck' }, select: { id: true } });
  if (seen) return none;
  const rc = await setting(deps, ref.storeId, 'risk.duplicateRules');
  const plan = rc.enabled ? await rulesPlan(deps, ref.storeId, ref.orderId, rc) : await lookbackPlan(deps, ref.storeId, ref.orderId, cfg);
  const { matches, review } = plan;
  const top = plan.severity;
  const by = opts.again?.by ?? systemBy('duplicate-check');
  const now = nowOf(deps);
  const alertId = await deps.db.$transaction(async (tx) => {
    const o = await lockOrder(tx, ref.storeId, ref.orderId);
    // a second call at the same moment waited for the lock: the first one's result stands
    if (!opts.again && (await tx.orderEvent.count({ where: { storeId: o.storeId, orderId: o.id, type: 'order.duplicateCheck' } }))) return undefined;
    const summary = {
      section: DUPLICATE_SECTION,
      matches: matches.map((m) => ({ orderId: m.orderId, number: m.number, severity: m.severity, productIds: m.productIds })),
      ...(rc.enabled ? { rules: plan.rules.map(storedHit), proposed: plan.proposed } : {}),
      ...(opts.again ? { after: 'edit' } : {}),
    };
    let id: string | null = null;
    const open = opts.again ? await tx.fraudAlert.count({ where: { storeId: o.storeId, orderId: o.id, status: 'OPEN' } }) : 0;
    if (review && !open) {
      const a = await tx.fraudAlert.create({
        data: { storeId: o.storeId, orderId: o.id, matchedOrderIds: matches.map((m) => m.orderId), severity: top, confidence: plan.confidence, proposedAction: plan.proposedAction, summary, createdAt: now },
        select: { id: true },
      });
      id = a.id;
    }
    await eventRow(tx, by, { storeId: o.storeId, orderId: o.id, type: 'order.duplicateCheck', reasonCode: top ?? plan.proposed, data: { ...summary, review, alertId: id } });
    const ruled = rc.enabled ? { proposed: plan.proposed, rules: plan.rules.map((h) => h.rule) } : {};
    if (id) await auditRow(tx, by, { storeId: o.storeId, action: 'order.duplicate.review', entityType: 'FraudAlert', entityId: id, before: null, after: { orderId: o.id, severity: top, ...ruled } });
    return id;
  }, TX);
  if (alertId === undefined) return none;
  let held = false;
  // PR 524: a good customer is never held by the engine by itself (the review still waits for a person)
  const good = alertId && cfg.autoHold && top === 'high' && !opts.again ? await goodCustomerOf(deps, ref) : null;
  if (good) await noteGoodCustomer(deps, ref, by, 'duplicateHold', good);
  else if (alertId && cfg.autoHold && top === 'high' && !opts.again) {
    const reasons = await setting(deps, ref.storeId, 'orders.hold.reasons');
    // PR 540: with the gate on the hold is only proposed; a person holds it or lets it go
    if (reasons.some((r) => r.key === DUPLICATE_HOLD_KEY) && (await gateOn(deps, ref.storeId))) await proposeHold(deps, ref, by, 'duplicateHold', DUPLICATE_HOLD_KEY);
    else if (reasons.some((r) => r.key === DUPLICATE_HOLD_KEY)) {
      try {
        await holdWith(deps, ref, by, DUPLICATE_HOLD_KEY, undefined);
        held = true;
      } catch (e) {
        // already moved on (a person was quicker): the open review still holds the confirm
        if (!(e instanceof OrdersError)) throw e;
      }
    }
  }
  return { severity: top, matches, alertId, held, rules: plan.rules, proposed: plan.proposed };
}

// ---------------------------------------------------------------------------------------------------------------------
// Layer 3 — the review queue (admin API)
// ---------------------------------------------------------------------------------------------------------------------

export interface ReviewRow {
  alertId: string;
  /** PR 541: "duplicate", or the risk section that opened it. */
  section: string;
  risk: boolean;
  because: string[];
  /** PR 520: the duplicate rules that fired, and how sure the strongest proposal is (0–100; null for the look-back). */
  rules: StoredRuleHit[];
  confidence: number | null;
  status: string;
  severity: string | null;
  proposedAction: string;
  createdAt: Date;
  decidedAt: Date | null;
  decisionReason: string | null;
  order: { id: string; number: string; status: string; customerName: string | null; phone: string | null; totalMinor: number; placedAt: Date; version: number };
  matches: { orderId: string; number: string; status: string; severity: string; placedAt: Date | null; totalMinor: number | null }[];
}

/** PR 541 (follow-up 194): the review queue's sections — the duplicates, each risk section, or all of them. */
export const REVIEW_SECTIONS = ['all', DUPLICATE_SECTION, ...RISK_REVIEW_SECTIONS] as const;

export const reviewQuery = z
  .object({ status: z.enum(['open', 'decided', 'all']).default('open'), section: z.enum(REVIEW_SECTIONS).default('all'), cursor: z.uuid().optional(), limit: z.coerce.number().int().min(1).max(100).optional() })
  .strict();

/** The reviews (duplicates, PR 145, and the risk sections', PR 541), oldest open first (so nobody waits longest). */
export async function reviewQueue(deps: OrdersDeps, who: Who, query: unknown = {}): Promise<{ rows: ReviewRow[]; next: string | null }> {
  await allow(deps, who, 'orders.risk.read');
  const q = parse(reviewQuery, query, 'query');
  const take = q.limit ?? (await setting(deps, who.storeId, 'orders.list.pageSize'));
  const sections: Prisma.FraudAlertWhereInput =
    q.section === 'all'
      ? { OR: [{ summary: { path: ['section'], equals: DUPLICATE_SECTION } }, { summary: { path: ['kind'], equals: RISK_REVIEW_KIND } }] }
      : q.section === DUPLICATE_SECTION
        ? { summary: { path: ['section'], equals: DUPLICATE_SECTION } }
        : { AND: [{ summary: { path: ['kind'], equals: RISK_REVIEW_KIND } }, { summary: { path: ['section'], equals: q.section } }] };
  const where: Prisma.FraudAlertWhereInput = {
    storeId: who.storeId,
    ...sections,
    ...(q.status === 'open' ? { status: 'OPEN' } : q.status === 'decided' ? { status: { not: 'OPEN' } } : {}),
  };
  const alerts = await deps.db.fraudAlert.findMany({ where, orderBy: [{ createdAt: q.status === 'open' ? 'asc' : 'desc' }, { id: 'asc' }], take: take + 1, ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}) });
  const page = alerts.slice(0, take);
  const ids = [...new Set(page.flatMap((a) => [a.orderId, ...a.matchedOrderIds]))];
  const orders = new Map(
    (await deps.db.order.findMany({ where: { storeId: who.storeId, id: { in: ids } }, select: { id: true, number: true, status: true, customerName: true, phone: true, totalMinor: true, placedAt: true, version: true } })).map((o) => [o.id, o]),
  );
  const rows: ReviewRow[] = page.map((a) => {
    const o = orders.get(a.orderId)!;
    const listed = ((a.summary as { matches?: { orderId: string; severity: string | null }[] } | null)?.matches ?? []).map((m) => [m.orderId, m.severity] as const);
    const sev = new Map(listed);
    return {
      alertId: a.id,
      ...reviewKindOf(a.summary),
      status: a.status,
      severity: a.severity,
      confidence: a.confidence,
      proposedAction: a.proposedAction,
      createdAt: a.createdAt,
      decidedAt: a.decidedAt,
      decisionReason: a.decisionReason,
      order: o,
      matches: a.matchedOrderIds.map((id) => {
        const m = orders.get(id);
        return { orderId: id, number: m?.number ?? '', status: m?.status ?? '', severity: sev.get(id) ?? '', placedAt: m?.placedAt ?? null, totalMinor: m?.totalMinor ?? null };
      }),
    };
  });
  return { rows, next: alerts.length > take ? page[page.length - 1]!.id : null };
}

// ---------------------------------------------------------------------------------------------------------------------
// Layer 4 — the decision
// ---------------------------------------------------------------------------------------------------------------------

export const DECISIONS = ['approve', 'decline', 'hold', 'ask', 'merge'] as const;
export type Decision = (typeof DECISIONS)[number];

export const decideInput = z
  .object({
    decision: z.enum(DECISIONS),
    note: z.string().trim().max(2_000).optional(),
    /** "hold": the hold reason (default "possible duplicate"); "other" needs the note. */
    holdReasonKey: z.string().trim().min(1).max(60).optional(),
    /** "merge": the matched order the new one joins in one parcel (default: the strongest match). */
    mergeWith: z.uuid().optional(),
  })
  .strict();

export interface DecideResult {
  alertId: string;
  decision: Decision;
  alertStatus: string;
  order: CommandResult | null;
  callTaskId: string | null;
  groupId: string | null;
}

/** The decision log row (FraudDecision is append-only, PR 543), the alert's answer and the order's timeline row. */
async function decided(tx: Tx, by: By, a: { id: string; storeId: number; orderId: string }, decision: Decision, note: string | undefined, status: 'APPROVED' | 'DECLINED' | 'OPEN', now: Date, kind: 'duplicate' | 'risk' = 'duplicate'): Promise<void> {
  if (status !== 'OPEN') await tx.fraudAlert.update({ where: { id: a.id }, data: { status, decidedById: by.actorId, decisionReason: decision, decidedAt: now } });
  await tx.fraudDecision.create({ data: { storeId: a.storeId, alertId: a.id, orderId: a.orderId, decision: `${kind}.${decision}`, reason: note ?? null, actorType: by.actorType, actorId: by.actorId } });
  await auditRow(tx, by, { storeId: a.storeId, action: `order.${kind}.${decision}`, entityType: 'FraudAlert', entityId: a.id, before: { status: 'OPEN' }, after: { status, note: note ?? null } });
}

/** One review's decision. Every path writes the decision log, the audit row and the order's timeline row. */
export async function decideReview(deps: OrdersDeps, who: Who, alertId: string, input: unknown): Promise<DecideResult> {
  await allow(deps, who, 'orders.risk.decide');
  const d = parse(decideInput, input, 'decision');
  if (!z.uuid().safeParse(alertId).success) throw new OrdersError('NOT_FOUND', 'no such review', ['alertId']);
  const found = await deps.db.fraudAlert.findFirst({ where: { id: alertId, storeId: who.storeId } });
  // PR 541: a duplicate's review (PR 145) or a risk section's, decided the same way; nothing else is a review here
  const kindOf = found ? reviewKindOf(found.summary) : null;
  const a = found && kindOf && (kindOf.risk || kindOf.section === DUPLICATE_SECTION) ? found : null;
  if (!a || !kindOf) throw new OrdersError('NOT_FOUND', 'no such review', ['alertId']);
  const kind = kindOf.risk ? 'risk' : 'duplicate';
  if (a.status !== 'OPEN') throw new OrdersError('ILLEGAL_TRANSITION', 'this review is already decided', ['alertId'], { status: a.status });
  const by = staffBy(who.actor, who.ctx);
  const now = nowOf(deps);
  const ref = { storeId: who.storeId, orderId: a.orderId };
  const result = (over: Partial<DecideResult>): DecideResult => ({ alertId: a.id, decision: d.decision, alertStatus: 'OPEN', order: null, callTaskId: null, groupId: null, ...over });
  /** Takes the review under the order's lock, or refuses when someone decided it in between. */
  const takeOpen = async (tx: Tx) => {
    const n = await tx.fraudAlert.count({ where: { id: a.id, status: 'OPEN' } });
    if (!n) throw new OrdersError('ILLEGAL_TRANSITION', 'this review is already decided', ['alertId']);
  };

  switch (d.decision) {
    case 'approve': {
      await deps.db.$transaction(async (tx) => {
        await lockOrder(tx, ref.storeId, ref.orderId);
        await takeOpen(tx);
        await decided(tx, by, a, 'approve', d.note, 'APPROVED', now, kind);
        await eventRow(tx, by, { ...ref, type: `order.${kind}.approved`, message: d.note ?? null, data: { alertId: a.id, section: kindOf.section } });
      }, TX);
      return result({ alertStatus: 'APPROVED' });
    }
    case 'decline': {
      await allow(deps, who, 'orders.cancel');
      // a risk section's decline is "declined after risk review", never a block (that is a separate proposal)
      const order = await cancelWith(deps, ref, by, kind === 'risk' ? 'RISK_DECLINED' : 'DUPLICATE_ORDER', d.note, {
        picked: false,
        extra: { alertId: a.id },
        also: async (tx, _o, at) => {
          await takeOpen(tx);
          await decided(tx, by, a, 'decline', d.note, 'DECLINED', at, kind);
        },
      });
      return result({ alertStatus: 'DECLINED', order });
    }
    case 'hold': {
      await allow(deps, who, 'orders.hold');
      const key = d.holdReasonKey ?? (kind === 'duplicate' ? DUPLICATE_HOLD_KEY : undefined);
      if (!key) throw new OrdersError('REASON_REQUIRED', 'pick a hold reason from the list', ['holdReasonKey']);
      if (key === OTHER_KEY && !d.note) throw new OrdersError('REASON_REQUIRED', 'this reason needs a note', ['note']);
      const order = await holdWith(deps, ref, by, key, d.note, {
        also: async (tx, _o, at) => {
          await takeOpen(tx);
          await decided(tx, by, a, 'hold', d.note, 'OPEN', at, kind);
          return { alertId: a.id };
        },
      });
      return result({ order });
    }
    case 'ask': {
      const taskId = await deps.db.$transaction(async (tx) => {
        const o = await lockOrder(tx, ref.storeId, ref.orderId);
        await takeOpen(tx);
        const reason = kind === 'risk' ? RISK_CALL_REASON : DUPLICATE_CALL_REASON;
        const open = await tx.callTask.findFirst({ where: { storeId: o.storeId, orderId: o.id, reason, status: { in: ['OPEN', 'IN_PROGRESS'] } }, select: { id: true } });
        const t = open ?? (await tx.callTask.create({ data: { storeId: o.storeId, orderId: o.id, customerId: o.customerId, reason, notes: d.note ?? null }, select: { id: true } }));
        await decided(tx, by, a, 'ask', d.note, 'OPEN', now, kind);
        await eventRow(tx, by, { ...ref, type: `order.${kind}.ask`, message: d.note ?? null, data: { alertId: a.id, callTaskId: t.id } });
        return t.id;
      }, TX);
      return result({ callTaskId: taskId });
    }
    case 'merge': {
      const other = d.mergeWith ?? a.matchedOrderIds[0];
      if (!other || !a.matchedOrderIds.includes(other)) throw new OrdersError('NOT_MERGEABLE', 'merge with one of the matched orders', ['mergeWith']);
      const m = await mergeOrders(deps, who, { orderIds: [a.orderId, other], note: d.note }, { alertId: a.id, by, now, kind });
      return result({ alertStatus: 'APPROVED', groupId: m.groupId });
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// One parcel for two orders of one customer (merge). Prices, charges and payments stay as they are.
// ---------------------------------------------------------------------------------------------------------------------

export const mergeInput = z.object({ orderIds: z.array(z.uuid()).length(2), note: z.string().trim().max(2_000).optional() }).strict();

/** Where an order may still join a parcel: open, not handed to a courier. */
const MERGEABLE: readonly OrderState[] = ['PLACED', 'AWAITING_ADVANCE', 'CONFIRMED', 'ON_HOLD'];

export interface MergeResult {
  groupId: string;
  orders: { orderId: string; number: string; version: number }[];
}

/** Puts two open orders of one customer in one parcel (OrderGroup). Each order keeps its lines, prices and charges. */
export async function mergeOrders(deps: OrdersDeps, who: Who, input: unknown, review?: { alertId: string; by: By; now: Date; kind?: 'duplicate' | 'risk' }): Promise<MergeResult> {
  await allow(deps, who, 'orders.merge');
  const d = parse(mergeInput, input, 'merge');
  const ids = [...new Set(d.orderIds)].sort();
  if (ids.length !== 2) throw new OrdersError('NOT_MERGEABLE', 'two different orders', ['orderIds']);
  const by = review?.by ?? staffBy(who.actor, who.ctx);
  return deps.db.$transaction(async (tx) => {
    // both rows locked in one fixed order, so two merges never wait on each other
    const [a, b] = [await lockOrder(tx, who.storeId, ids[0]!), await lockOrder(tx, who.storeId, ids[1]!)];
    const same = (a.customerId && a.customerId === b.customerId) || (a.phone && a.phone === b.phone);
    if (!same) throw new OrdersError('NOT_MERGEABLE', 'the orders are of different customers', ['orderIds']);
    for (const o of [a, b]) {
      const f = await factsOf(tx, o);
      if (!MERGEABLE.includes(o.status as OrderState) || f.shipment || o.cancelPending) throw new OrdersError('NOT_MERGEABLE', `order ${o.number} is booked or finished`, ['orderIds'], { orderId: o.id, status: o.status });
    }
    if (review) {
      const n = await tx.fraudAlert.count({ where: { id: review.alertId, status: 'OPEN' } });
      if (!n) throw new OrdersError('ILLEGAL_TRANSITION', 'this review is already decided', ['alertId']);
    }
    const groupId = a.orderGroupId ?? b.orderGroupId ?? (await tx.orderGroup.create({ data: { storeId: who.storeId, reason: 'MERGE', note: d.note ?? null, createdById: who.actor.staffUserId }, select: { id: true } })).id;
    const out: MergeResult['orders'] = [];
    for (const o of [a, b]) {
      const after = await tx.order.update({ where: { id: o.id }, data: { orderGroupId: groupId, version: { increment: 1 } }, select: { version: true } });
      const partner = o.id === a.id ? b : a;
      await eventRow(tx, by, { storeId: o.storeId, orderId: o.id, type: 'order.merged', message: d.note ?? null, data: { groupId, with: { orderId: partner.id, number: partner.number }, alertId: review?.alertId ?? null } });
      await auditRow(tx, by, { storeId: o.storeId, action: 'order.merge', entityType: 'Order', entityId: o.id, before: { orderGroupId: o.orderGroupId, version: o.version }, after: { orderGroupId: groupId, version: after.version } });
      out.push({ orderId: o.id, number: o.number, version: after.version });
    }
    if (review) {
      const alert = await tx.fraudAlert.findUniqueOrThrow({ where: { id: review.alertId }, select: { id: true, storeId: true, orderId: true } });
      await decided(tx, by, alert, 'merge', d.note, 'APPROVED', review.now, review.kind);
    }
    return { groupId, orders: out };
  }, TX);
}
