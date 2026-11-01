// S13 · PR 262 (Blueprint C6.2 point 3) — Marketing › Audiences: audiences built from what people really did in this shop,
// the count of people in each, and the audience rows a campaign picks (Campaign.audienceId).
//
// - Each condition (audience-model.ts) is one query over our own records — checkouts left before the order, orders and
//   deliveries (the one status rule of @extas/metrics), bags never bought, VIP by the owner's own Sales figure
//   (`customers.list`, the same rule as Customers › VIP), grades, sizes bought, refused parcels (never one the shop caused:
//   `risk.history.ourFaultRefusals` or a return marked the shop's fault, SIM-F-044), no offers. A person is his phone
//   number, read through the one BD phone helper; a gift's number is the receiver's, so gifts never count; an erased
//   customer's numbers never count.
// - Saving (and "Count again") stores the size and when it was counted; sending the list (hashed) to Meta, Google and
//   TikTok is audience-push.ts (PR 263 / 264) — nothing here calls an ad platform, moves money or changes an order.
// - PR 263: a lookalike audience's people are its seed: those whose parcels were delivered in the owner's last N days,
//   each with his delivered sales in that window (the one "sales" status rule; never his number of orders).
// - PR 264: the exclusion audience (one per store, made by the shop the first time it is needed, never edited or
//   archived by hand) holds the numbers a person put on the refused-parcel list (@extas/orders `refusedExclusionPhones`,
//   PR 191) and, when the owner ticks it (`ads.refusedExclude.everyRefusal`), every number of the "Refused a parcel"
//   condition in his last N days. Sending it is audience-push.ts, only while `ads.refusedExclude.on`.
// - The few names shown beside the count are for a person with `customers.read`, and their numbers are masked
//   (`customers.phoneMask`).
// - Seeing needs `marketing.audiences.read`; saving, counting again, archiving and restoring need
//   `marketing.audiences.write` and are audited (marketing.audience.create / .save / .<step>). Nothing is deleted.
import { audit, type Actor, type RequestContext } from '@extas/auth';
import { maskPhone, type PhoneMask } from '@extas/customers/pure';
import { MOTHER_STORE_ID, Prisma, type PrismaClient } from '@extas/db/client';
import { phoneNormalizeBD } from '@extas/delivery/phone';
import { customerFiguresSql, statusRule } from '@extas/metrics';
import { refusedExclusionPhones } from '@extas/orders';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import {
  AUDIENCE_ACTIONS,
  AUDIENCE_KIND_BUILDER,
  AUDIENCE_KIND_EXCLUSION,
  AUDIENCE_KIND_LOOKALIKE,
  AUDIENCE_KINDS,
  audienceInputSchema,
  canAudienceStep,
  combine,
  definitionOf,
  definitionSchema,
  EXCLUSION_DEFINITION,
  lookalikeDefinitionSchema,
  lookalikeInputSchema,
  lookalikeOf,
  stateOfAudience,
  type AudienceAction,
  type AudienceDefinition,
  type AudienceRule,
  type AudienceState,
  type LookalikeDefinition,
} from './audience-model';

const S = MOTHER_STORE_ID;
const DAY_MS = 86_400_000;
/** The audiences the list shows (newest first) and the few people shown beside a count. */
export const AUDIENCE_LIST_MAX = 300; // hardcode-ok: a list length, not a business number
export const AUDIENCE_SAMPLE = 8; // hardcode-ok: how many names the count card shows, not a business number

export class AudienceError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details?: string[],
  ) {
    super(code);
  }
}

type Db = PrismaClient;
type Resolver = AdminDeps['resolver'];
export interface AudienceWho {
  actor: Actor;
  ctx: RequestContext;
}

export interface AudienceRow {
  id: string;
  name: string;
  kind: string;
  state: AudienceState;
  rules: AudienceRule[];
  /** A lookalike's seed window (days), else null. */
  seedDays: number | null;
  size: number | null;
  countedAt: string | null;
  campaigns: number;
}
export interface AudienceView extends AudienceRow {
  version: string;
}
export interface AudienceCount {
  size: number;
  /** Conditions that cannot count anyone now (VIP while the owner's figure is empty). */
  unavailable: string[];
  /** A few of the people (only for a person with `customers.read`; numbers masked). */
  sample: { name: string | null; phone: string }[] | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const iso = (d: Date | null) => (d ? d.toISOString() : null);
const SELECT = { id: true, name: true, kind: true, definition: true, size: true, lastBuiltAt: true, archivedAt: true, updatedAt: true } as const;
type Raw = Prisma.AudienceGetPayload<{ select: typeof SELECT }>;

/** What the conditions need from settings and the store's own rows, read once per count. */
interface Ctx {
  storeId: number;
  now: Date;
  vipMinSalesMinor: number | null;
  ourFault: string[];
  sizeLabels: Map<string, string>;
}

async function ctxOf(db: Db, resolver: Resolver, storeId: number, now: Date): Promise<Ctx> {
  const [list, hist, sizes] = await Promise.all([resolver.value('customers.list', { storeId }), resolver.value('risk.history', { storeId }), db.size.findMany({ where: { storeId }, select: { id: true, label: true } })]);
  return { storeId, now, vipMinSalesMinor: list.vipMinSalesMinor ?? null, ourFault: [...hist.ourFaultRefusals], sizeLabels: new Map(sizes.map((x) => [x.id, x.label])) };
}

/** An order (alias `o`) a person placed for himself: in this store, not archived, not a gift, counted as ordered. */
const ownOrder = (storeId: number) => Prisma.sql`o."storeId" = ${storeId} AND o."archivedAt" IS NULL AND NOT o."isGift" AND ${statusRule('ordered')}`;
const orderPhone = Prisma.sql`COALESCE(o."phone", oc."phone")`;
const orderFrom = Prisma.sql`"Order" o LEFT JOIN "Customer" oc ON oc."id" = o."customerId"`;

/** One condition's people as rows `(phone)`, null when it cannot count anyone now. */
function ruleSql(r: AudienceRule, c: Ctx): Prisma.Sql | null {
  const S = c.storeId;
  const since = r.days == null ? null : new Date(c.now.getTime() - r.days * DAY_MS);
  switch (r.kind) {
    case 'incomplete':
      return Prisma.sql`SELECT d."phone" AS phone FROM "CheckoutDraft" d WHERE d."storeId" = ${S} AND d."phone" IS NOT NULL AND d."convertedOrderId" IS NULL AND d."lastActivityAt" >= ${since}`;
    case 'ordered':
      return Prisma.sql`SELECT ${orderPhone} AS phone FROM ${orderFrom} WHERE ${ownOrder(S)} AND o."placedAt" >= ${since}`;
    case 'delivered':
      return Prisma.sql`SELECT ${orderPhone} AS phone FROM ${orderFrom} WHERE ${ownOrder(S)} AND ${statusRule('sales')} AND o."deliveredAt" >= ${since}`;
    case 'bagNoBuy':
      // a bag with a line still in it, touched in the window, never turned into an order by its owner since it was started
      return Prisma.sql`
        SELECT b.phone FROM (
          SELECT k."id", k."customerId", k."createdAt", COALESCE(kc."phone", (SELECT d."phone" FROM "CheckoutDraft" d WHERE d."cartId" = k."id" AND d."phone" IS NOT NULL ORDER BY d."lastActivityAt" DESC LIMIT 1)) AS phone
          FROM "Cart" k LEFT JOIN "Customer" kc ON kc."id" = k."customerId"
          WHERE k."storeId" = ${S} AND k."status"::text IN ('ACTIVE', 'ABANDONED') AND k."lastActivityAt" >= ${since}
            AND EXISTS (SELECT 1 FROM "CartItem" i WHERE i."cartId" = k."id" AND i."removedAt" IS NULL AND NOT i."savedForLater")
        ) b
        WHERE b.phone IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM ${orderFrom} WHERE ${ownOrder(S)} AND o."placedAt" >= b."createdAt" AND (o."customerId" = b."customerId" OR o."phone" = b.phone))`;
    case 'vip': {
      if (c.vipMinSalesMinor == null) return null;
      const people = Prisma.sql`SELECT COALESCE(p."mergedIntoId", p."id")::text AS k, p."id" AS cid, p."phone" AS phone FROM "Customer" p WHERE p."storeId" = ${S} AND p."erasedAt" IS NULL`;
      return Prisma.sql`WITH people AS (${people}), fig AS (${customerFiguresSql(S, people)}) SELECT people.phone FROM people JOIN fig ON fig.k = people.k WHERE fig.sales_value >= ${c.vipMinSalesMinor}`;
    }
    case 'grade':
      return Prisma.sql`SELECT g."phone" FROM "Customer" g WHERE g."storeId" = ${S} AND g."erasedAt" IS NULL AND g."gradeId" = ${r.ref}::uuid`;
    case 'size': {
      const label = c.sizeLabels.get(r.ref ?? '');
      if (!label) return null;
      return Prisma.sql`
        SELECT ${orderPhone} AS phone FROM "OrderItem" i JOIN ${orderFrom} ON o."id" = i."orderId" LEFT JOIN "ProductVariant" v ON v."id" = i."variantId"
        WHERE i."storeId" = ${S} AND NOT (i."status"::text IN ('REMOVED', 'CANCELLED')) AND ${ownOrder(S)} AND (v."sizeId" = ${r.ref}::uuid OR (v."sizeId" IS NULL AND i."sizeLabel" = ${label}))
          ${since ? Prisma.sql`AND o."placedAt" >= ${since}` : Prisma.empty}`;
    }
    case 'refused': {
      // the same refusal as Customers › Refused before: a parcel back at the shop for a reason that is not the shop's own
      const reason = Prisma.sql`COALESCE(
        (SELECT e."reasonCode" FROM "OrderEvent" e WHERE e."storeId" = ${S} AND e."orderId" = o."id" AND e."type" = 'order.returned' AND e."reasonCode" IS NOT NULL ORDER BY e."createdAt" DESC, e."id" DESC LIMIT 1),
        (SELECT x."reasonCode" FROM "ReturnRecord" x WHERE x."storeId" = ${S} AND x."orderId" = o."id" AND x."kind"::text = 'REFUSED_AT_DOOR' AND x."reasonCode" IS NOT NULL ORDER BY x."createdAt" DESC LIMIT 1),
        '')`;
      return Prisma.sql`
        SELECT ${orderPhone} AS phone FROM ${orderFrom}
        WHERE o."storeId" = ${S} AND o."archivedAt" IS NULL AND NOT o."isGift" AND o."status" = 'RETURNED'
          AND NOT (${reason} = ANY(${c.ourFault}::text[]))
          AND NOT EXISTS (SELECT 1 FROM "ReturnRecord" f WHERE f."storeId" = ${S} AND f."orderId" = o."id" AND f."ourFault")
          ${since ? Prisma.sql`AND COALESCE(o."returnedAt", o."placedAt") >= ${since}` : Prisma.empty}`;
    }
    case 'noOffers':
      return Prisma.sql`SELECT n."phone" FROM "Customer" n WHERE n."storeId" = ${S} AND n."erasedAt" IS NULL AND n."mergedIntoId" IS NULL AND NOT (COALESCE(n."smsMarketingConsent", false) OR COALESCE(n."whatsappMarketingConsent", false))`;
  }
}

/** Numbers in their one form (E.164); a number the helper cannot read is left out (no platform could match it). */
function phonesOf(rows: { phone: string | null }[]): Set<string> {
  const out = new Set<string>();
  for (const r of rows) {
    if (!r.phone) continue;
    const p = phoneNormalizeBD(r.phone);
    if (p.ok) out.add(p.e164);
  }
  return out;
}

/** The audience's people (E.164 numbers) now, and the conditions that could not count anyone. */
export async function audienceMembers(db: Db, resolver: Resolver, def: AudienceDefinition, now: Date = new Date(), storeId: number = S): Promise<{ phones: Set<string>; unavailable: string[] }> {
  if (!def.rules.length) return { phones: new Set(), unavailable: [] };
  const c = await ctxOf(db, resolver, storeId, now);
  const unavailable: string[] = [];
  const sets = await Promise.all(
    def.rules.map(async (r) => {
      const q = ruleSql(r, c);
      if (!q) {
        unavailable.push(r.kind);
        return new Set<string>();
      }
      return phonesOf(await db.$queryRaw<{ phone: string | null }[]>(q));
    }),
  );
  const out = combine(def.rules, sets);
  await dropErased(db, out, storeId);
  return { phones: out, unavailable: [...new Set(unavailable)] };
}

/** PR 263: a lookalike's seed — each person delivered to in the last `seedDays`, with his delivered sales (minor unit). */
export async function seedMembers(db: Db, def: LookalikeDefinition, now: Date = new Date(), storeId: number = S): Promise<Map<string, number>> {
  const since = new Date(now.getTime() - def.seedDays * DAY_MS);
  const rows = await db.$queryRaw<{ phone: string | null; value: bigint | number }[]>(Prisma.sql`
    SELECT ${orderPhone} AS phone, COALESCE(sum(o."totalMinor"), 0)::bigint AS value FROM ${orderFrom}
    WHERE ${ownOrder(storeId)} AND ${statusRule('sales')} AND o."deliveredAt" >= ${since}
    GROUP BY 1`);
  const out = new Map<string, number>();
  for (const r of rows) {
    const p = r.phone ? phoneNormalizeBD(r.phone) : null;
    if (p?.ok) out.set(p.e164, (out.get(p.e164) ?? 0) + Number(r.value));
  }
  await dropErased(db, out, storeId);
  return out;
}

/** Every number an erased customer had: never sent, never counted. */
async function dropErased(db: Db, out: Set<string> | Map<string, unknown>, storeId: number) {
  if (out.size) for (const p of phonesOf(await db.customer.findMany({ where: { storeId, erasedAt: { not: null } }, select: { phone: true } }))) out.delete(p);
}

/**
 * PR 264: the exclusion list's people now — the numbers a person put on the refused-parcel list, and (the owner's tick)
 * every number with a parcel refused at the door that was not the shop's fault, in his last N days (0 = any time).
 */
export async function exclusionMembers(db: Db, resolver: Resolver, now: Date = new Date(), storeId: number = S): Promise<Set<string>> {
  const [card, listed] = await Promise.all([resolver.value('ads.refusedExclude', { storeId }), refusedExclusionPhones(db, storeId)]);
  const out = phonesOf(listed.map((phone) => ({ phone })));
  if (card.everyRefusal) {
    const q = ruleSql({ kind: 'refused', days: card.days || null, ref: null, exclude: false }, await ctxOf(db, resolver, storeId, now));
    if (q) for (const p of phonesOf(await db.$queryRaw<{ phone: string | null }[]>(q))) out.add(p);
  }
  await dropErased(db, out, storeId);
  return out;
}

/** Any saved audience's people now: E.164 numbers, each with his delivered sales for a lookalike's seed (else null). */
export async function membersOf(db: Db, resolver: Resolver, a: { kind: string; definition: unknown }, now: Date = new Date(), storeId: number = S): Promise<{ people: Map<string, number | null>; valueBased: boolean }> {
  if (a.kind === AUDIENCE_KIND_EXCLUSION) return { people: new Map([...(await exclusionMembers(db, resolver, now, storeId))].map((p) => [p, null])), valueBased: false };
  if (a.kind === AUDIENCE_KIND_LOOKALIKE) {
    const def = lookalikeOf(a.definition);
    return { people: def ? await seedMembers(db, def, now, storeId) : new Map(), valueBased: true };
  }
  const { phones } = await audienceMembers(db, resolver, definitionOf(a.definition), now, storeId);
  return { people: new Map([...phones].map((p) => [p, null])), valueBased: false };
}

/** Names beside a few numbers, masked. */
async function sampleOf(db: Db, resolver: Resolver, phones: Iterable<string>, storeId: number) {
  const some = [...phones].sort().slice(0, AUDIENCE_SAMPLE);
  const [mask, people] = await Promise.all([resolver.value('customers.phoneMask', { storeId }) as Promise<PhoneMask>, some.length ? db.customer.findMany({ where: { storeId, phone: { in: some } }, select: { phone: true, name: true } }) : Promise.resolve([])]);
  const names = new Map(people.map((p) => [p.phone ?? '', p.name]));
  return some.map((p) => ({ name: names.get(p) ?? null, phone: maskPhone(p, mask) }));
}

/** PR 263: a lookalike seed's count, and a few masked names for a person allowed to see customers. */
export async function seedCount(db: Db, resolver: Resolver, def: LookalikeDefinition, seeCustomers: boolean, now: Date = new Date(), storeId: number = S): Promise<AudienceCount> {
  const m = await seedMembers(db, def, now, storeId);
  return { size: m.size, unavailable: [], sample: seeCustomers ? await sampleOf(db, resolver, m.keys(), storeId) : null };
}

/** The count, and a few masked names for a person allowed to see customers. */
export async function audienceCount(db: Db, resolver: Resolver, def: AudienceDefinition, seeCustomers: boolean, now: Date = new Date(), storeId: number = S): Promise<AudienceCount> {
  const m = await audienceMembers(db, resolver, def, now, storeId);
  return { size: m.phones.size, unavailable: m.unavailable, sample: seeCustomers ? await sampleOf(db, resolver, m.phones, storeId) : null };
}

async function campaignCounts(db: Db, storeId: number, ids: string[]) {
  const rows = ids.length ? await db.campaign.groupBy({ by: ['audienceId'], where: { storeId, audienceId: { in: ids }, archivedAt: null }, _count: { _all: true } }) : [];
  return new Map(rows.map((r) => [r.audienceId ?? '', r._count._all]));
}

const rowOf = (a: Raw, used: Map<string, number>): AudienceRow => ({
  id: a.id,
  name: a.name,
  kind: a.kind,
  state: stateOfAudience(a),
  rules: a.kind === AUDIENCE_KIND_BUILDER ? definitionOf(a.definition).rules : [],
  seedDays: a.kind === AUDIENCE_KIND_LOOKALIKE ? (lookalikeOf(a.definition)?.seedDays ?? null) : null,
  size: a.size,
  countedAt: iso(a.lastBuiltAt),
  campaigns: used.get(a.id) ?? 0,
});

/**
 * PR 264: the store's exclusion audience, made the first time it is needed (the name is the shop's words; one per store,
 * kept so by a unique index). Not audited: the shop makes it, nobody chose anything.
 */
export async function ensureExclusionAudience(db: Db, name: string, storeId: number = S): Promise<{ id: string }> {
  const have = await db.audience.findFirst({ where: { storeId, kind: AUDIENCE_KIND_EXCLUSION }, select: { id: true } });
  if (have) return have;
  try {
    return await db.audience.create({ data: { storeId, kind: AUDIENCE_KIND_EXCLUSION, name, definition: { ...EXCLUSION_DEFINITION } }, select: { id: true } });
  } catch (e) {
    // another request made it a moment ago (the unique index): read that one
    const again = await db.audience.findFirst({ where: { storeId, kind: AUDIENCE_KIND_EXCLUSION }, select: { id: true } });
    if (again) return again;
    throw e;
  }
}

/** Every audience (archived too, marked), the exclusion list first, then newest first, with the campaigns that use it. */
export async function audienceList(db: Db, storeId: number = S): Promise<AudienceRow[]> {
  const found = await db.audience.findMany({ where: { storeId }, orderBy: { createdAt: 'desc' }, take: AUDIENCE_LIST_MAX, select: SELECT });
  const rows = [...found.filter((r) => r.kind === AUDIENCE_KIND_EXCLUSION), ...found.filter((r) => r.kind !== AUDIENCE_KIND_EXCLUSION)];
  const used = await campaignCounts(
    db,
    storeId,
    rows.map((r) => r.id),
  );
  return rows.map((r) => rowOf(r, used));
}

/** One audience for its page (null = not one of this store's). */
export async function audienceOne(db: Db, id: string, storeId: number = S): Promise<AudienceView | null> {
  if (!UUID.test(id)) return null;
  const a = await db.audience.findFirst({ where: { id, storeId }, select: SELECT });
  if (!a) return null;
  return { ...rowOf(a, await campaignCounts(db, storeId, [a.id])), version: a.updatedAt.toISOString() };
}

/** What the builder offers: the store's sizes and grades (not archived), and whether VIP has the owner's figure. */
export async function audienceChoices(db: Db, resolver: Resolver, storeId: number = S) {
  const [sizes, grades, list] = await Promise.all([
    db.size.findMany({ where: { storeId, archivedAt: null }, orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }], select: { id: true, label: true } }),
    db.customerGrade.findMany({ where: { storeId, archivedAt: null }, orderBy: [{ sortOrder: 'asc' }, { nameEn: 'asc' }], select: { id: true, nameEn: true, nameBn: true } }),
    resolver.value('customers.list', { storeId }),
  ]);
  return { sizes, grades, vipSet: list.vipMinSalesMinor != null };
}

const issueFields = (issues: { path: PropertyKey[] }[]) => [...new Set(issues.map((i) => i.path.filter((x) => typeof x === 'string').join('.') || 'value'))];

/** A size or grade picked in a condition must be this store's own. */
async function checkRefs(db: Db, def: AudienceDefinition, storeId: number) {
  const want = (k: 'size' | 'grade') => [...new Set(def.rules.filter((r) => r.kind === k && r.ref).map((r) => r.ref!))];
  const [sizes, grades] = [want('size'), want('grade')];
  const [ns, ng] = await Promise.all([sizes.length ? db.size.count({ where: { storeId, id: { in: sizes } } }) : 0, grades.length ? db.customerGrade.count({ where: { storeId, id: { in: grades } } }) : 0]);
  if (ns !== sizes.length || ng !== grades.length) throw new AudienceError('INVALID_INPUT', 400, ['rules.ref']);
}

/** Create (id null) or save an audience at the version it was read at; the count is taken and kept with it. */
export async function saveAudience(db: Db, resolver: Resolver, who: AudienceWho, id: string | null, input: unknown, now: Date = new Date(), storeId: number = S): Promise<AudienceView> {
  const lookalike = !!input && typeof input === 'object' && (input as { kind?: unknown }).kind === AUDIENCE_KIND_LOOKALIKE;
  const ok = lookalike ? lookalikeInputSchema.safeParse(input) : audienceInputSchema.safeParse(input);
  if (!ok.success) throw new AudienceError('INVALID_INPUT', 400, issueFields(ok.error.issues));
  const d = ok.data;
  const kind = lookalike ? AUDIENCE_KIND_LOOKALIKE : AUDIENCE_KIND_BUILDER;
  if (!lookalike) await checkRefs(db, d.definition as AudienceDefinition, storeId);
  const before = id ? await audienceOne(db, id, storeId) : null;
  if (id && !before) throw new AudienceError('NOT_FOUND', 404);
  if (before && before.version !== d.version) throw new AudienceError('STALE', 409);
  if (before?.state === 'ARCHIVED') throw new AudienceError('ARCHIVED', 409);
  // PR 264: the shop's exclusion list is never edited by hand (its people come from the refused-parcel list)
  if (before?.kind === AUDIENCE_KIND_EXCLUSION) throw new AudienceError('SYSTEM', 409);
  // an audience keeps its kind: a builder audience is never turned into a lookalike, nor back
  if (before && before.kind !== kind) throw new AudienceError('INVALID_INPUT', 400, ['kind']);
  const { people } = await membersOf(db, resolver, { kind, definition: d.definition }, now, storeId);
  const data = { name: d.name, definition: d.definition as unknown as Prisma.InputJsonValue, size: people.size, lastBuiltAt: now };
  const row = before ? await db.audience.update({ where: { id: before.id }, data, select: { id: true } }) : await db.audience.create({ data: { storeId, kind, ...data }, select: { id: true } });
  const after = (await audienceOne(db, row.id, storeId))!;
  const strip = ({ version: _v, ...x }: AudienceView) => ({ ...x });
  await audit(db, who.actor, { storeId, action: before ? 'marketing.audience.save' : 'marketing.audience.create', entityType: 'Audience', entityId: row.id, before: before ? strip(before) : undefined, after: strip(after) }, who.ctx);
  return after;
}

/** One step (count again, archive, restore) at the version it was read at. */
export async function audienceStep(db: Db, resolver: Resolver, who: AudienceWho, id: string, input: unknown, now: Date = new Date(), storeId: number = S): Promise<AudienceView> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const action = (AUDIENCE_ACTIONS as readonly string[]).includes(String(o.action)) ? (o.action as AudienceAction) : null;
  if (!action) throw new AudienceError('INVALID_INPUT', 400, ['action']);
  const before = await audienceOne(db, id, storeId);
  if (!before) throw new AudienceError('NOT_FOUND', 404);
  if (before.version !== o.version) throw new AudienceError('STALE', 409);
  if (!canAudienceStep(action, before.state)) throw new AudienceError('WRONG_STATE', 409);
  // PR 264: the exclusion list can be counted again, never archived (turning its switch off stops it being sent)
  if (before.kind === AUDIENCE_KIND_EXCLUSION && action !== 'recount') throw new AudienceError('SYSTEM', 409);
  let data: Prisma.AudienceUpdateInput;
  if (action === 'recount') {
    const { people } = await membersOf(db, resolver, { kind: before.kind, definition: before.kind === AUDIENCE_KIND_LOOKALIKE ? { v: 1, seedDays: before.seedDays } : before.kind === AUDIENCE_KIND_EXCLUSION ? EXCLUSION_DEFINITION : { v: 1, rules: before.rules } }, now, storeId);
    data = { size: people.size, lastBuiltAt: now };
  } else data = { archivedAt: action === 'archive' ? now : null };
  await db.audience.update({ where: { id }, data });
  const after = (await audienceOne(db, id, storeId))!;
  await audit(db, who.actor, { storeId, action: `marketing.audience.${action}`, entityType: 'Audience', entityId: id, before: { state: before.state, size: before.size }, after: { state: after.state, size: after.size } }, who.ctx);
  return after;
}

/** Count every live audience again, builder, lookalike and the exclusion list (the daily refresh, PR 264). */
export async function recountAudiences(db: Db, resolver: Resolver, now: Date = new Date(), storeId: number = S): Promise<number> {
  const rows = await db.audience.findMany({ where: { storeId, kind: { in: [...AUDIENCE_KINDS] }, archivedAt: null }, select: { id: true, kind: true, definition: true } });
  for (const a of rows) {
    const { people } = await membersOf(db, resolver, a, now, storeId);
    await db.audience.update({ where: { id: a.id }, data: { size: people.size, lastBuiltAt: now } });
  }
  return rows.length;
}

const answer = (e: unknown): Response => (e instanceof AudienceError ? json({ ok: false, error: e.code, ...(e.details ? { details: e.details } : {}) }, { status: e.status }) : errorResponse(e));

/**
 * /api/admin/marketing/audiences[/<id>] — GET the list or one (`marketing.audiences.read`); POST a new audience; PUT one
 * (save); POST {action, version} on one — recount, archive, restore (`marketing.audiences.write`).
 */
export async function audiencesHandler(request: Request, deps: AdminDeps | null, id: string | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST' && method !== 'PUT') return fail(405, 'method-not-allowed');
  if (!id && method === 'PUT') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'marketing.audiences.read' : 'marketing.audiences.write', storeId: S });
  if (g instanceof Response) return g;
  const db = deps!.db;
  const who = { actor: g.actor, ctx: g.ctx };
  try {
    if (!id) {
      if (method === 'GET') return json({ ok: true, list: await audienceList(db) });
      return json({ ok: true, audience: await saveAudience(db, deps!.resolver, who, null, await body(request)) }, { status: 201 });
    }
    if (method === 'GET') {
      const a = await audienceOne(db, id);
      return a ? json({ ok: true, audience: a }) : fail(404, 'NOT_FOUND');
    }
    if (method === 'PUT') return json({ ok: true, audience: await saveAudience(db, deps!.resolver, who, id, await body(request)) });
    return json({ ok: true, audience: await audienceStep(db, deps!.resolver, who, id, await body(request)) });
  } catch (e) {
    return answer(e);
  }
}

/**
 * /api/admin/marketing/audiences/count?definition=<json> — GET: how many people match now, nothing saved
 * (`marketing.audiences.read`, so a read-only account can look too; the few names only with `customers.read`).
 */
export async function audienceCountHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (request.method.toUpperCase() !== 'GET') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: 'marketing.audiences.read', storeId: S });
  if (g instanceof Response) return g;
  try {
    const q = new URL(request.url).searchParams;
    let raw: unknown = null;
    try {
      raw = JSON.parse(q.get('definition') ?? q.get('lookalike') ?? 'null');
    } catch {
      raw = null;
    }
    const see = g.permissions?.has('customers.read') ?? false;
    if (q.has('lookalike')) {
      const lal = lookalikeDefinitionSchema.safeParse(raw);
      if (!lal.success) throw new AudienceError('INVALID_INPUT', 400, issueFields(lal.error.issues));
      return json({ ok: true, count: await seedCount(deps!.db, deps!.resolver, lal.data, see) });
    }
    const ok = definitionSchema.safeParse(raw);
    if (!ok.success) throw new AudienceError('INVALID_INPUT', 400, issueFields(ok.error.issues));
    await checkRefs(deps!.db, ok.data, S);
    return json({ ok: true, count: await audienceCount(deps!.db, deps!.resolver, ok.data, see) });
  } catch (e) {
    return answer(e);
  }
}
