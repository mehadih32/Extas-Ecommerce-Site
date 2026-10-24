// S06 · PR 519 — the Order Identity Graph (Blueprint B1.12, B6.4; BACKEND-ARCHITECTURE §8.7): one identity built from the
// phone, the name, the address, the device and the connection (IP), so a customer who changes his number is still the
// same person. Every order is linked once when it lands (`linkIdentity`; again after the team edits its phone, name or
// address): its values become IdentityLink rows of one IdentityCluster, and the cluster is the one every order shares
// with —
//   · an order with the same phone (in any stored form, through the one BD phone helper);
//   · an order from the same device (the shop's own random device id), when `risk.identity.joinOnDevice`;
//   · an order whose name AND address are alike (pg_trgm similarity, PR 603's trigram indexes: spelling a little off
//     still matches), in the owner's window.
// The links are transitive: A and B share a device, B and C a name and an address, so A, B and C are one person. Two
// identities that turn out to be one are merged into the older one (the newer is marked merged, never deleted). The IP
// never joins two orders by itself (many people share one mobile connection); it is linked and counted only. The
// matched earlier orders the graph has not seen yet are linked in the same step, so the graph fills from the history
// the day the owner switches it on.
//
// While `risk.identity` is on, the risk score's `identityMatch` and `deviceMatch` (PR 541, 159) read the order's
// identity (`clusterOrders`) instead of their own look-ups, and the duplicate rules (PR 520) find "the same customer"
// through it. IP and device links expire with the order's own kept facts (`risk.capture.retentionDays`, the purge job).
// A record and a read only: nothing here blocks anyone, holds or cancels an order, or touches COD, a price or a charge.
import type { Prisma } from '@extas/db/client';
import { phoneNormalizeBD } from '@extas/delivery';
import { allow, nowOf, setting, TX, UUID, type OrdersDeps, type Tx, type Who } from './context';
import { alikeOrders, IDENTITY_SELECT, type IdentityOrder } from './identity';
import { pastOrdersOf, phoneForms } from './phone-history';
import { summarizeHistory, type IdentityVia, type PastOrder, type PhoneSummary } from './pure';
import { auditRow, eventRow, systemBy, type By } from './service';

/** Where the graph's own timeline rows say they came from. */
export const IDENTITY_SOURCE = 'identity-graph';
/** The order event the link step writes. */
export const IDENTITY_EVENT = 'order.identityLinked';
/** The advisory lock (with the store id) that keeps two link steps of one store from building two identities at once. */
const LOCK_KEY = 519;
const DAY = 86_400_000;

/** The kinds one order is linked by (the e-mail and the chat ids come with their channels). */
export const LINKED_KINDS = ['PHONE', 'NAME', 'ADDRESS', 'DEVICE', 'IP'] as const satisfies readonly Prisma.IdentityLinkCreateManyInput['kind'][];
type LinkedKind = (typeof LINKED_KINDS)[number];
/** The kinds that expire with the order's kept facts (PR 159). */
const EXPIRING: ReadonlySet<LinkedKind> = new Set(['DEVICE', 'IP']);

/** A name or an address as the graph compares it: Unicode-folded, lower case, one space between words. */
export function normText(s: string | null | undefined): string | null {
  const v = (s ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  return v || null;
}

/** A phone as the graph stores it: the E.164 form of a valid BD number (so 01…, +880… and Bengali digits meet), else its text. */
export function normPhone(s: string | null | undefined): string | null {
  if (!s?.trim()) return null;
  const p = phoneNormalizeBD(s);
  return p.ok ? p.e164 : normText(s);
}

/** One order's values as links: the phone, the name, the address, the device and the IP it has. */
export function identityValues(o: Pick<IdentityOrder, 'phone' | 'customerName' | 'shippingAddressText' | 'deviceId' | 'ip'>): { kind: LinkedKind; valueNorm: string }[] {
  const raw: [LinkedKind, string | null][] = [
    ['PHONE', normPhone(o.phone)],
    ['NAME', normText(o.customerName)],
    ['ADDRESS', normText(o.shippingAddressText)],
    ['DEVICE', o.deviceId?.trim() || null],
    ['IP', o.ip?.trim() || null],
  ];
  return raw.filter((r): r is [LinkedKind, string] => !!r[1]).map(([kind, valueNorm]) => ({ kind, valueNorm }));
}

type LinkOrder = IdentityOrder & { piiExpiresAt: Date | null };
const LINK_SELECT = { ...IDENTITY_SELECT, piiExpiresAt: true } as const;

export interface IdentityLinked {
  clusterId: string;
  /** A new identity (no earlier order matched). */
  created: boolean;
  /** The earlier orders that tied this one in, by how (their numbers). */
  joined: { phone: string[]; device: string[]; nameAddress: string[] };
  /** Other identities merged into this one (they turned out to be the same person). */
  merged: number;
  /** Earlier orders linked for the first time in this step (the graph filling from the history). */
  filled: number;
}

/** Writes the links of some orders into one identity (an order's existing link with the same value is only seen again). */
async function linkValues(tx: Tx, storeId: number, clusterId: string, orders: readonly LinkOrder[], now: Date): Promise<void> {
  if (!orders.length) return;
  const existing = await tx.identityLink.findMany({ where: { storeId, orderId: { in: orders.map((o) => o.id) } }, select: { orderId: true, kind: true, valueNorm: true } });
  const have = new Set(existing.map((l) => `${l.orderId}|${l.kind}|${l.valueNorm}`));
  const fresh = orders.flatMap((o) =>
    identityValues(o)
      .filter((v) => !have.has(`${o.id}|${v.kind}|${v.valueNorm}`))
      .map((v) => ({ storeId, clusterId, kind: v.kind, valueNorm: v.valueNorm, orderId: o.id, firstSeenAt: o.placedAt, lastSeenAt: now, expiresAt: EXPIRING.has(v.kind) ? o.piiExpiresAt : null })),
  );
  if (fresh.length) await tx.identityLink.createMany({ data: fresh });
}

/**
 * Links one order into its identity (once when it lands; `again` after the team's edit of its phone, name or address —
 * the new values are added, the old ones stay as they were true then). Off (`risk.identity.enabled`): nothing happens
 * (null). A second call finds the first link and does nothing more. Never changes the order itself.
 */
export async function linkIdentity(deps: OrdersDeps, ref: { storeId: number; orderId: string }, opts: { again?: boolean; by?: By } = {}): Promise<IdentityLinked | null> {
  const cfg = await setting(deps, ref.storeId, 'risk.identity');
  if (!cfg.enabled) return null;
  const db = deps.db;
  const o = await db.order.findFirst({ where: { id: ref.orderId, storeId: ref.storeId }, select: { ...LINK_SELECT, storeId: true, status: true, customerId: true } });
  if (!o || o.status === 'DRAFT') return null;
  if (!opts.again && (await db.identityLink.count({ where: { storeId: ref.storeId, orderId: o.id } }))) return null;
  const values = identityValues(o);
  if (!values.length) return null;
  const since = cfg.windowDays > 0 ? new Date(o.placedAt.getTime() - cfg.windowDays * DAY) : undefined;
  const forms = phoneForms(o.phone);
  const device = cfg.joinOnDevice ? (o.deviceId?.trim() ?? null) : null;
  const pick = { id: true, number: true } as const;
  // the direct matches among the EARLIER orders, read before the lock: the same phone (any time), the same device and an
  // alike name + address (in the window); a later order links itself when it lands
  const [byPhone, alike, byDevice] = await Promise.all([
    forms.length ? db.order.findMany({ where: { storeId: o.storeId, id: { not: o.id }, phone: { in: forms }, status: { not: 'DRAFT' }, archivedAt: null, placedAt: { lt: o.placedAt } }, orderBy: [{ placedAt: 'desc' }, { id: 'desc' }], take: cfg.orders, select: pick }) : [],
    alikeOrders(deps, o.storeId, o, { windowDays: cfg.windowDays, addressSimilarity: cfg.addressSimilarity, name: cfg.nameSimilarity }, cfg.orders),
    device ? db.order.findMany({ where: { storeId: o.storeId, id: { not: o.id }, deviceId: device, status: { not: 'DRAFT' }, archivedAt: null, placedAt: { lt: o.placedAt, ...(since ? { gte: since } : {}) } }, orderBy: [{ placedAt: 'desc' }, { id: 'desc' }], take: cfg.orders, select: pick }) : [],
  ]);
  const alikeRows = alike.length ? await db.order.findMany({ where: { storeId: o.storeId, id: { in: alike.map((a) => a.id) } }, select: pick }) : [];
  const matched = [...new Set([...byPhone, ...alikeRows, ...byDevice].map((x) => x.id))];
  const by = opts.by ?? systemBy(IDENTITY_SOURCE);
  const phoneNorm = normPhone(o.phone);
  const now = nowOf(deps);

  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 AS ok FROM pg_advisory_xact_lock(${LOCK_KEY}::int, ${o.storeId}::int)`;
    // a second call at the same moment waited for the lock: the first one's link stands
    if (!opts.again && (await tx.identityLink.count({ where: { storeId: o.storeId, orderId: o.id } }))) return null;
    const where: Prisma.IdentityLinkWhereInput[] = [];
    if (matched.length) where.push({ orderId: { in: matched } });
    if (phoneNorm) where.push({ kind: 'PHONE', valueNorm: phoneNorm });
    if (device) where.push({ kind: 'DEVICE', valueNorm: device });
    if (opts.again) where.push({ orderId: o.id });
    const linked = where.length ? await tx.identityLink.findMany({ where: { storeId: o.storeId, OR: where }, select: { clusterId: true, orderId: true } }) : [];
    const clusterIds = [...new Set(linked.map((l) => l.clusterId))];
    const clusters = clusterIds.length ? await tx.identityCluster.findMany({ where: { storeId: o.storeId, id: { in: clusterIds }, mergedIntoId: null }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true, primaryCustomerId: true } }) : [];
    let survivor = clusters[0];
    const created = !survivor;
    if (!survivor) survivor = await tx.identityCluster.create({ data: { storeId: o.storeId, primaryCustomerId: o.customerId, createdAt: now }, select: { id: true, primaryCustomerId: true } });
    const absorbed = clusters.slice(1).map((c) => c.id);
    if (absorbed.length) {
      // the same person after all: one identity, the older one; the newer is marked merged (nothing is deleted)
      await tx.identityLink.updateMany({ where: { storeId: o.storeId, clusterId: { in: absorbed } }, data: { clusterId: survivor.id } });
      await tx.identityCluster.updateMany({ where: { storeId: o.storeId, id: { in: absorbed } }, data: { mergedIntoId: survivor.id, archivedAt: now } });
      await auditRow(tx, by, { storeId: o.storeId, action: 'identity.merge', entityType: 'IdentityCluster', entityId: survivor.id, before: { clusters: absorbed }, after: { clusterId: survivor.id, orderId: o.id } });
    }
    if (!survivor.primaryCustomerId && o.customerId) await tx.identityCluster.update({ where: { id: survivor.id }, data: { primaryCustomerId: o.customerId } });
    // this order, and the matched earlier orders the graph has not seen yet
    const seen = new Set(linked.map((l) => l.orderId).filter((x): x is string => !!x));
    const unseen = matched.filter((id) => !seen.has(id));
    const history = unseen.length ? await tx.order.findMany({ where: { storeId: o.storeId, id: { in: unseen } }, select: LINK_SELECT }) : [];
    await linkValues(tx, o.storeId, survivor.id, [o, ...history], now);
    const numbers = (l: readonly { number: string }[]) => [...new Set(l.map((x) => x.number))];
    const result: IdentityLinked = { clusterId: survivor.id, created, joined: { phone: numbers(byPhone), device: numbers(byDevice), nameAddress: numbers(alikeRows) }, merged: absorbed.length, filled: history.length };
    await eventRow(tx, by, { storeId: o.storeId, orderId: o.id, type: IDENTITY_EVENT, data: { ...result, ...(opts.again ? { after: 'edit' } : {}) } });
    return result;
  }, TX);
}

/** One order of an identity, with how it is tied to the order asked about. */
export interface ClusterOrder {
  id: string;
  number: string;
  phone: string | null;
  status: string;
  placedAt: Date;
  totalMinor: number;
  cancelReasonCode: string | null;
  areaId: string | null;
  via: IdentityVia[];
}

/**
 * The other orders of one order's identity (newest first, at most `take`), each with how it is tied to this one: the
 * same phone, the same device, an alike name and address (the owner's similarities), or only through other orders.
 * Null: the order is not linked (the graph was off when it landed, or the link step failed).
 */
export async function clusterOrders(deps: OrdersDeps, storeId: number, orderId: string, take: number): Promise<{ clusterId: string; orders: ClusterOrder[] } | null> {
  const mine = await deps.db.identityLink.findMany({ where: { storeId, orderId }, orderBy: { lastSeenAt: 'desc' }, select: { clusterId: true, kind: true, valueNorm: true } });
  if (!mine.length) return null;
  const clusterId = mine[0]!.clusterId;
  const cfg = await setting(deps, storeId, 'risk.identity');
  const own = (k: LinkedKind) => new Set(mine.filter((l) => l.kind === k).map((l) => l.valueNorm));
  const [phones, devices, names, addresses] = [own('PHONE'), own('DEVICE'), [...own('NAME')], [...own('ADDRESS')]];
  const rows = await deps.db.$queryRaw<{ orderId: string; kind: string; valueNorm: string; sim: number | null }[]>`
    SELECT l."orderId"::text AS "orderId", l."kind"::text AS kind, l."valueNorm" AS "valueNorm",
      CASE WHEN l."kind" = 'NAME' THEN (SELECT max(similarity(l."valueNorm", n)) FROM unnest(${names}::text[]) AS n)
           WHEN l."kind" = 'ADDRESS' THEN (SELECT max(similarity(l."valueNorm", a)) FROM unnest(${addresses}::text[]) AS a)
           ELSE NULL END::float8 AS sim
    FROM "IdentityLink" l
    WHERE l."storeId" = ${storeId} AND l."clusterId" = ${clusterId}::uuid AND l."orderId" IS NOT NULL AND l."orderId" <> ${orderId}::uuid`;
  const ties = new Map<string, { phone: boolean; device: boolean; name: boolean; address: boolean }>();
  for (const r of rows) {
    const t = ties.get(r.orderId) ?? { phone: false, device: false, name: false, address: false };
    if (r.kind === 'PHONE' && phones.has(r.valueNorm)) t.phone = true;
    if (r.kind === 'DEVICE' && devices.has(r.valueNorm)) t.device = true;
    if (r.kind === 'NAME' && (r.sim ?? 0) >= Math.min(cfg.nameSimilarity, 1) - 1e-9) t.name = true;
    if (r.kind === 'ADDRESS' && (r.sim ?? 0) >= cfg.addressSimilarity - 1e-9) t.address = true;
    ties.set(r.orderId, t);
  }
  if (!ties.size) return { clusterId, orders: [] };
  const found = await deps.db.order.findMany({
    where: { storeId, id: { in: [...ties.keys()] }, status: { not: 'DRAFT' }, archivedAt: null },
    orderBy: [{ placedAt: 'desc' }, { id: 'desc' }],
    take: Math.max(0, take),
    select: { id: true, number: true, phone: true, status: true, placedAt: true, totalMinor: true, cancelReasonCode: true, areaId: true },
  });
  const orders = found.map((x): ClusterOrder => {
    const t = ties.get(x.id)!;
    const via: IdentityVia[] = [...(t.phone ? (['phone'] as const) : []), ...(t.device ? (['device'] as const) : []), ...(t.name && t.address ? (['nameAddress'] as const) : [])];
    return { ...x, via: via.length ? via : ['linked'] };
  });
  return { clusterId, orders };
}

/**
 * PR 519 → PR 541, 159: the risk score's facts from the identity — the earlier orders under ANOTHER number of the same
 * person (`identity`: tied by anything but only the same device) and those from the same device (`device`). Null: the
 * graph is off or the order is not linked (the score then uses its own look-ups, as before the graph).
 */
export async function identityRiskFacts(deps: OrdersDeps, storeId: number, o: Pick<IdentityOrder, 'id' | 'phone' | 'placedAt'>, take: number): Promise<{ identity: PastOrder[]; device: PastOrder[] } | null> {
  if (!(await setting(deps, storeId, 'risk.identity')).enabled) return null;
  const c = await clusterOrders(deps, storeId, o.id, take);
  if (!c) return null;
  const forms = new Set(phoneForms(o.phone));
  const earlier = c.orders.filter((x) => x.placedAt < o.placedAt && !(x.phone && forms.has(x.phone)));
  const onlyDevice = (x: ClusterOrder) => x.via.length === 1 && x.via[0] === 'device';
  const [identity, device] = await Promise.all([pastOrdersOf(deps, storeId, earlier.filter((x) => !onlyDevice(x))), pastOrdersOf(deps, storeId, earlier.filter((x) => x.via.includes('device')))]);
  return { identity, device };
}

/** The identity beside one order, for the team (`orders.risk.read`). */
export interface IdentityView {
  /** The graph is switched on (new orders are linked). */
  enabled: boolean;
  /** The order's identity; null: not linked. */
  clusterId: string | null;
  /** The other numbers the same person ordered under. */
  otherPhones: string[];
  orders: ClusterOrder[];
  /** What the identity's other orders came to (the owner's our-fault refusals shown, never counted). */
  summary: PhoneSummary;
}

/** How many of an identity's orders the order page reads. */
const VIEW_ORDERS = 50;

/** One order's identity: its other orders with how each is tied, the other numbers, and what they came to. A read only. */
export async function identityView(deps: OrdersDeps, who: Who, orderId: string): Promise<IdentityView | null> {
  await allow(deps, who, 'orders.risk.read');
  if (!UUID.test(orderId)) return null;
  const o = await deps.db.order.findFirst({ where: { id: orderId, storeId: who.storeId }, select: { id: true, phone: true } });
  if (!o) return null;
  const [cfg, history, c] = await Promise.all([setting(deps, who.storeId, 'risk.identity'), setting(deps, who.storeId, 'risk.history'), clusterOrders(deps, who.storeId, orderId, VIEW_ORDERS)]);
  const orders = c?.orders ?? [];
  const forms = new Set(phoneForms(o.phone));
  const otherPhones = [...new Set(orders.map((x) => x.phone).filter((p): p is string => !!p && !forms.has(p)))];
  const past = await pastOrdersOf(deps, who.storeId, orders);
  return { enabled: cfg.enabled, clusterId: c?.clusterId ?? null, otherPhones, orders, summary: summarizeHistory(past, { ourFault: new Set(history.ourFaultRefusals) }) };
}
