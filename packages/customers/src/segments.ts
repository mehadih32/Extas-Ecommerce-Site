// PR 287 — segments from real behaviour, saved and reusable (Blueprint B5.2; BACKEND-ARCHITECTURE §5.5 CUS-03, CUS-03a;
// demo V12.4 #/admin/customers/segments). A segment is a name and a list of conditions joined with "and" (segment-rules.ts),
// counted live over the same people and figures as the Customers list (list.ts `peopleBaseSql`): one person per profile
// he stays under, Sales delivered only (CN-022), refusals that were not the shop's fault. The list's own views are the
// built-in segments, counted the same way and never stored.
//
// The owner's `customers.segments` switch is off as shipped: then nothing is counted and nothing can be saved. Seeing
// segments and their counts needs `customers.read` (the preview's numbers masked without `customers.phone`); saving,
// changing, archiving and restoring need `customers.segments.write`, each audited in the same transaction. Nothing is
// ever deleted (archive and restore), a segment never sends anything by itself, and it stores rules only — never a
// customer's details, so the erasure job (erasure.ts) has nothing to clear here. The pages count live; the stored count
// and its time (`memberCount`, `lastComputedAt`) are the figure at the last save (a page view never writes).
import { audit } from '@extas/auth';
import { Prisma } from '@extas/db/client';
import { statusRule } from '@extas/metrics';
import { historyOptions } from '@extas/orders';
import { z } from 'zod';
import { allow, nowOf, parse, setting, TX, UUID, type CustomersDeps, type Viewer, type Who } from './context';
import { CustomersError } from './errors';
import { peopleBaseSql, viewWhere } from './people-sql';
import { phoneShown, type PhoneShown } from './pure';
import { BUILT_IN_SEGMENTS, readDefinition, segmentDefinition, type BuiltInSegment, type SegmentCondition, type SegmentDefinition } from './segment-rules';
import { maskOf } from './view';

const DAY_MS = 86_400_000;

/** What the conditions are read against: the store, the clock and the owner's list rules (for the built-in ones). */
interface SegCtx {
  storeId: number;
  now: Date;
}

const daysAgo = (c: SegCtx, days: number) => new Date(c.now.getTime() - days * DAY_MS);

/** One of the person's counted orders (alias `o`) matches `cond` (SQL on `o` and its lines `i`). */
function anyOrder(c: SegCtx, join: Prisma.Sql, cond: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`EXISTS (SELECT 1 FROM own JOIN "Order" o ON o."id" = own."id" AND o."storeId" = ${c.storeId} AND o."archivedAt" IS NULL AND ${statusRule('ordered')} ${join} WHERE own.k = b."id"::text AND ${cond})`;
}

/** One condition as SQL on a base row `b` (see list.ts `peopleBaseSql`). */
export function conditionSql(cond: SegmentCondition, c: SegCtx): Prisma.Sql {
  switch (cond.field) {
    case 'ordersMin':
      return Prisma.sql`b.orders >= ${cond.value}`;
    case 'ordersMax':
      return Prisma.sql`b.orders <= ${cond.value}`;
    case 'salesMin':
      return Prisma.sql`b.sales_value >= ${cond.value}`;
    case 'deliveryMin':
      return Prisma.sql`(b.orders > 0 AND b.delivered * 100 >= ${cond.value} * b.orders)`;
    case 'lastOrderOver':
      return Prisma.sql`(b.last_at IS NOT NULL AND b.last_at < ${daysAgo(c, cond.value)})`;
    case 'lastOrderWithin':
      return Prisma.sql`b.last_at >= ${daysAgo(c, cond.value)}`;
    case 'joinedWithin':
      return Prisma.sql`b."createdAt" >= ${daysAgo(c, cond.value)}`;
    case 'category':
      return anyOrder(
        c,
        Prisma.sql`JOIN "OrderItem" i ON i."orderId" = o."id" JOIN "Product" p ON p."id" = i."productId"`,
        Prisma.sql`(p."categoryId" = ${cond.value}::uuid OR EXISTS (SELECT 1 FROM "CategoryProduct" cp WHERE cp."productId" = p."id" AND cp."categoryId" = ${cond.value}::uuid))`,
      );
    case 'size':
      return anyOrder(c, Prisma.sql`JOIN "OrderItem" i ON i."orderId" = o."id"`, Prisma.sql`lower(i."sizeLabel") = lower(${cond.value})`);
    case 'area':
      return anyOrder(c, Prisma.sql`JOIN "GeoArea" a ON a."id" = o."areaId"`, Prisma.sql`(a."id" = ${cond.value}::uuid OR ${cond.value}::uuid = ANY(a."ancestorIds"))`);
    case 'source':
      return Prisma.sql`b."firstSource" = ${cond.value}`;
    case 'consent':
      if (cond.value === 'sms') return Prisma.sql`COALESCE(b."smsMarketingConsent", false)`;
      if (cond.value === 'whatsapp') return Prisma.sql`COALESCE(b."whatsappMarketingConsent", false)`;
      return Prisma.sql`NOT (COALESCE(b."smsMarketingConsent", false) OR COALESCE(b."whatsappMarketingConsent", false))`;
    case 'refused':
      return cond.value ? Prisma.sql`b.refused > 0` : Prisma.sql`b.refused = 0`;
    case 'exchanged':
      return cond.value ? Prisma.sql`b.exchanges > 0` : Prisma.sql`b.exchanges = 0`;
  }
}

/** A whole definition as SQL on `b`: every condition must hold (no condition: everyone). */
export function definitionSql(def: SegmentDefinition, c: SegCtx): Prisma.Sql {
  return def.all.length ? Prisma.join(def.all.map((x) => conditionSql(x, c)), ' AND ') : Prisma.sql`TRUE`;
}

/** The people's base for the store (the Customers list's own rule). */
async function baseOf(deps: CustomersDeps, storeId: number): Promise<Prisma.Sql> {
  const hist = await historyOptions(deps, storeId);
  return peopleBaseSql(storeId, [...hist.ourFault]);
}

/** A built-in segment as SQL on `b` (the list's view with the owner's rules). */
async function builtInSql(deps: CustomersDeps, storeId: number, now: Date): Promise<(v: BuiltInSegment) => Prisma.Sql> {
  const rules = await setting(deps, storeId, 'customers.list');
  const since = new Date(now.getTime() - rules.atRiskDays * DAY_MS);
  return (v) => viewWhere(v, rules, since);
}

/**
 * The SQL that keeps the people of a saved segment (the Customers list's `?segment=`, and later campaigns): null when
 * the segment is not this store's, is archived or cannot be read.
 */
export async function segmentFilterSql(deps: CustomersDeps, storeId: number, segmentId: string): Promise<Prisma.Sql | null> {
  if (!UUID.test(segmentId) || !(await setting(deps, storeId, 'customers.segments')).enabled) return null;
  const s = await deps.db.segment.findFirst({ where: { id: segmentId, storeId, archivedAt: null }, select: { definition: true } });
  const def = s ? readDefinition(s.definition) : null;
  return def ? definitionSql(def, { storeId, now: nowOf(deps) }) : null;
}

export interface SegmentRow {
  id: string;
  name: string;
  conditions: number;
  /** People who match now; null while it is off or the definition cannot be read. */
  count: number | null;
  readable: boolean;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}

export interface SegmentsScreen {
  enabled: boolean;
  settings: { maxSegments: number; maxConditions: number; previewShown: number };
  segments: SegmentRow[];
  archived: SegmentRow[];
  /** The list's own views, counted live (VIP only once the owner's figure is set). */
  builtIn: { id: BuiltInSegment; count: number | null }[];
  viewer: Viewer;
}

/** The Segments page: the store's saved segments (and the archived ones) and the built-in ones, counted live. */
export async function segmentsScreen(deps: CustomersDeps, who: Who): Promise<SegmentsScreen> {
  const viewer = await allow(deps, who, 'customers.read');
  const S = who.storeId;
  const [s, list, rows] = await Promise.all([
    setting(deps, S, 'customers.segments'),
    setting(deps, S, 'customers.list'),
    deps.db.segment.findMany({ where: { storeId: S }, orderBy: [{ archivedAt: { sort: 'desc', nulls: 'first' } }, { updatedAt: 'desc' }, { id: 'asc' }], select: { id: true, name: true, definition: true, createdAt: true, updatedAt: true, archivedAt: true } }),
  ]);
  const builtIns = BUILT_IN_SEGMENTS.filter((v) => v !== 'vip' || list.vipMinSalesMinor !== null);
  const now = nowOf(deps);
  const live = rows.filter((r) => !r.archivedAt);
  const defs = new Map(rows.map((r) => [r.id, readDefinition(r.definition)]));
  let counts = new Map<string, number>();
  if (s.enabled) {
    const base = await baseOf(deps, S);
    const bi = await builtInSql(deps, S, now);
    const c: SegCtx = { storeId: S, now };
    const cols = [
      ...builtIns.map((v, i) => Prisma.sql`count(*) FILTER (WHERE ${bi(v)}) AS ${Prisma.raw(`"b${i}"`)}`),
      ...live.map((r, i) => {
        const def = defs.get(r.id);
        return def ? Prisma.sql`count(*) FILTER (WHERE ${definitionSql(def, c)}) AS ${Prisma.raw(`"s${i}"`)}` : Prisma.sql`NULL::bigint AS ${Prisma.raw(`"s${i}"`)}`;
      }),
    ];
    const got = (await deps.db.$queryRaw<Record<string, bigint | null>[]>`${base} SELECT ${Prisma.join(cols, ', ')} FROM base b`)[0] ?? {};
    counts = new Map([...builtIns.map((v, i) => [`b:${v}`, Number(got[`b${i}`] ?? 0)] as const), ...live.flatMap((r, i) => (got[`s${i}`] === null || got[`s${i}`] === undefined ? [] : [[r.id, Number(got[`s${i}`])] as const]))]);
  }
  const row = (r: (typeof rows)[number]): SegmentRow => {
    const def = defs.get(r.id) ?? null;
    return { id: r.id, name: r.name, conditions: def?.all.length ?? 0, count: counts.get(r.id) ?? null, readable: !!def, createdAt: r.createdAt, updatedAt: r.updatedAt, archivedAt: r.archivedAt };
  };
  return {
    enabled: s.enabled,
    settings: { maxSegments: s.maxSegments, maxConditions: s.maxConditions, previewShown: s.previewShown },
    segments: live.map(row),
    archived: rows.filter((r) => r.archivedAt).map(row),
    builtIn: builtIns.map((v) => ({ id: v, count: s.enabled ? (counts.get(`b:${v}`) ?? 0) : null })),
    viewer,
  };
}

export interface SegmentMember {
  id: string;
  name: string | null;
  phone: PhoneShown | null;
  orders: number;
  salesMinor: number;
}

export interface SegmentPreview {
  count: number;
  /** The first matching people, biggest delivered spend first (the owner's `previewShown`). */
  members: SegmentMember[];
}

/** Counts a definition and lists its first people (the builder's live count and a saved segment's page). */
async function previewOf(deps: CustomersDeps, storeId: number, where: Prisma.Sql, shown: number, viewer: Viewer): Promise<SegmentPreview> {
  const base = await baseOf(deps, storeId);
  const mask = await maskOf(deps, storeId);
  const [cnt, rows] = await Promise.all([
    deps.db.$queryRaw<{ n: bigint }[]>`${base} SELECT count(*) AS n FROM base b WHERE ${where}`,
    shown > 0
      ? deps.db.$queryRaw<{ id: string; name: string | null; phone: string | null; orders: bigint; sales_value: bigint }[]>`${base} SELECT b."id", b."name", b."phone", b.orders, b.sales_value FROM base b WHERE ${where} ORDER BY b.sales_value DESC, b.orders DESC, b."id" LIMIT ${shown}`
      : Promise.resolve([]),
  ]);
  return {
    count: Number(cnt[0]?.n ?? 0),
    members: rows.map((r) => ({ id: r.id, name: r.name, phone: phoneShown(r.phone, viewer.fullPhone, mask), orders: Number(r.orders), salesMinor: Number(r.sales_value) })),
  };
}

async function switchedOn(deps: CustomersDeps, storeId: number) {
  const s = await setting(deps, storeId, 'customers.segments');
  if (!s.enabled) throw new CustomersError('SWITCHED_OFF', 'segments are switched off', ['customers.segments']);
  return s;
}

/** Checks the categories and areas a definition names exist (a typed id that is not this store's is refused). */
async function checkRefs(deps: CustomersDeps, storeId: number, def: SegmentDefinition): Promise<void> {
  const cats = def.all.filter((x) => x.field === 'category').map((x) => x.value as string);
  const areas = def.all.filter((x) => x.field === 'area').map((x) => x.value as string);
  const [c, a] = await Promise.all([
    cats.length ? deps.db.category.count({ where: { storeId, id: { in: cats } } }) : Promise.resolve(0),
    areas.length ? deps.db.geoArea.count({ where: { id: { in: areas } } }) : Promise.resolve(0),
  ]);
  const bad = [...(c < new Set(cats).size ? ['category'] : []), ...(a < new Set(areas).size ? ['area'] : [])];
  if (bad.length) throw new CustomersError('INVALID_INPUT', 'a condition names something the shop does not have', bad);
}

const previewInput = z.object({ definition: z.unknown() }).strict();

/** The builder's live count for an unsaved definition (`customers.read`; while segments are on). */
export async function previewSegment(deps: CustomersDeps, who: Who, input: unknown): Promise<SegmentPreview> {
  const viewer = await allow(deps, who, 'customers.read');
  const s = await switchedOn(deps, who.storeId);
  const def = parse(segmentDefinition, parse(previewInput, input, 'preview').definition, 'segment');
  if (def.all.length > s.maxConditions) throw new CustomersError('LIMIT_REACHED', 'too many conditions', ['definition.all'], { max: s.maxConditions });
  return previewOf(deps, who.storeId, definitionSql(def, { storeId: who.storeId, now: nowOf(deps) }), s.previewShown, viewer);
}

export interface SegmentPage {
  segment: { id: string; name: string; definition: SegmentDefinition | null; createdAt: Date; updatedAt: Date; archivedAt: Date | null; version: string };
  preview: SegmentPreview | null;
  enabled: boolean;
  viewer: Viewer;
}

/** One saved segment with its live count and first people (`customers.read`); null when it is not this store's. */
export async function segmentPage(deps: CustomersDeps, who: Who, id: string): Promise<SegmentPage | null> {
  const viewer = await allow(deps, who, 'customers.read');
  if (!UUID.test(id)) return null;
  const r = await deps.db.segment.findFirst({ where: { id, storeId: who.storeId } });
  if (!r) return null;
  const s = await setting(deps, who.storeId, 'customers.segments');
  const def = readDefinition(r.definition);
  const preview = s.enabled && def ? await previewOf(deps, who.storeId, definitionSql(def, { storeId: who.storeId, now: nowOf(deps) }), s.previewShown, viewer) : null;
  return { segment: { id: r.id, name: r.name, definition: def, createdAt: r.createdAt, updatedAt: r.updatedAt, archivedAt: r.archivedAt, version: r.updatedAt.toISOString() }, preview, enabled: s.enabled, viewer };
}


const saveInput = z
  .object({
    name: z.string().trim().min(1).max(80),
    definition: z.unknown(),
    /** The segment's `version` as the page read it (a save in between is STALE). */
    version: z.string().max(40).optional(),
  })
  .strict();

const nameKey = (s: string) => s.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Saves a new segment (`id` null) or changes one (`customers.segments.write`; while segments are on). The name is the
 * store's own (no other live segment has it), the conditions at most the owner's number, the categories and areas real;
 * the count is taken at once. Audited in the same transaction.
 */
export async function saveSegment(deps: CustomersDeps, who: Who, id: string | null, input: unknown): Promise<SegmentPage> {
  await allow(deps, who, 'customers.segments.write');
  const s = await switchedOn(deps, who.storeId);
  const d = parse(saveInput, input, 'segment');
  const def = parse(segmentDefinition, d.definition, 'segment');
  if (def.all.length > s.maxConditions) throw new CustomersError('LIMIT_REACHED', 'too many conditions', ['definition.all'], { max: s.maxConditions });
  if (id !== null && !UUID.test(id)) throw new CustomersError('NOT_FOUND', 'no such segment', ['segmentId']);
  await checkRefs(deps, who.storeId, def);
  const S = who.storeId;
  const now = nowOf(deps);
  const count = (await previewOf(deps, S, definitionSql(def, { storeId: S, now }), 0, { fullPhone: false, orders: false, merge: false, audit: false, segments: false })).count;
  const saved = await deps.db.$transaction(async (tx) => {
    const live = await tx.segment.findMany({ where: { storeId: S, archivedAt: null }, select: { id: true, name: true } });
    if (live.some((x) => x.id !== id && nameKey(x.name) === nameKey(d.name))) throw new CustomersError('NAME_TAKEN', 'another segment has this name', ['name']);
    if (id === null) {
      if (live.length >= s.maxSegments) throw new CustomersError('LIMIT_REACHED', 'the store keeps its most segments already', ['customers.segments.maxSegments'], { max: s.maxSegments });
      const row = await tx.segment.create({ data: { storeId: S, name: d.name, definition: def as unknown as Prisma.InputJsonValue, memberCount: count, lastComputedAt: now } });
      await audit(tx, who.actor, { action: 'customer.segment.create', entityType: 'Segment', entityId: row.id, storeId: S, after: { name: row.name, definition: def } }, who.ctx);
      return row;
    }
    const before = await tx.segment.findFirst({ where: { id, storeId: S } });
    if (!before) throw new CustomersError('NOT_FOUND', 'no such segment', ['segmentId']);
    if (before.archivedAt) throw new CustomersError('NOT_ACTIVE', 'the segment is archived; restore it first', ['segmentId']);
    if (d.version !== undefined && d.version !== before.updatedAt.toISOString()) throw new CustomersError('STALE', 'the segment was changed by someone else; reload it', ['version'], { version: before.updatedAt.toISOString() });
    const row = await tx.segment.update({ where: { id: before.id }, data: { name: d.name, definition: def as unknown as Prisma.InputJsonValue, memberCount: count, lastComputedAt: now } });
    await audit(tx, who.actor, { action: 'customer.segment.update', entityType: 'Segment', entityId: row.id, storeId: S, before: { name: before.name, definition: before.definition }, after: { name: row.name, definition: def } }, who.ctx);
    return row;
  }, TX);
  return (await segmentPage(deps, who, saved.id))!;
}

const archiveInput = z.object({ archived: z.boolean() }).strict();

/** Archives a segment, or restores one (`customers.segments.write`); never deleted. Audited. */
export async function archiveSegment(deps: CustomersDeps, who: Who, id: string, input: unknown): Promise<{ id: string; archived: boolean }> {
  await allow(deps, who, 'customers.segments.write');
  const s = await switchedOn(deps, who.storeId);
  const d = parse(archiveInput, input, 'archive');
  if (!UUID.test(id)) throw new CustomersError('NOT_FOUND', 'no such segment', ['segmentId']);
  const S = who.storeId;
  return deps.db.$transaction(async (tx) => {
    const r = await tx.segment.findFirst({ where: { id, storeId: S } });
    if (!r) throw new CustomersError('NOT_FOUND', 'no such segment', ['segmentId']);
    if (!!r.archivedAt === d.archived) return { id, archived: d.archived };
    if (!d.archived) {
      const live = await tx.segment.findMany({ where: { storeId: S, archivedAt: null }, select: { name: true } });
      if (live.length >= s.maxSegments) throw new CustomersError('LIMIT_REACHED', 'the store keeps its most segments already', ['customers.segments.maxSegments'], { max: s.maxSegments });
      if (live.some((x) => nameKey(x.name) === nameKey(r.name))) throw new CustomersError('NAME_TAKEN', 'another segment has this name', ['name']);
    }
    await tx.segment.update({ where: { id }, data: { archivedAt: d.archived ? nowOf(deps) : null } });
    await audit(tx, who.actor, { action: d.archived ? 'customer.segment.archive' : 'customer.segment.restore', entityType: 'Segment', entityId: id, storeId: S, before: { archivedAt: r.archivedAt }, after: { archived: d.archived } }, who.ctx);
    return { id, archived: d.archived };
  }, TX);
}

const settingsInput = z.object({ enabled: z.boolean(), maxSegments: z.unknown(), maxConditions: z.unknown(), previewShown: z.unknown() }).partial().strict();

/** The page's own settings card (`customers.segments.write`): the switch and the three numbers. Audited. */
export async function saveSegmentSettings(deps: CustomersDeps, who: Who, input: unknown): Promise<SegmentsScreen> {
  await allow(deps, who, 'customers.segments.write');
  const d = parse(settingsInput, input, 'segment settings');
  if (!deps.settings.set) throw new CustomersError('INVALID_INPUT', 'settings cannot be written here', ['settings']);
  const before = await setting(deps, who.storeId, 'customers.segments');
  const next = { ...before, ...d };
  if (JSON.stringify(next) !== JSON.stringify(before)) {
    try {
      await deps.settings.set('customers.segments', next as never, { level: 'store', storeId: who.storeId }, { actorId: who.actor.staffUserId ?? null, reason: 'Customers › Segments' });
    } catch (e) {
      throw new CustomersError('INVALID_INPUT', 'the segment settings are not valid', (e as { details?: string[] }).details ?? ['customers.segments']);
    }
    await audit(deps.db, who.actor, { action: 'customer.segment.settings', entityType: 'Setting', entityId: 'customers.segments', storeId: who.storeId, before, after: next }, who.ctx);
  }
  return segmentsScreen(deps, who);
}

export interface SegmentOptions {
  categories: { id: string; nameEn: string; nameBn: string | null }[];
  areas: { id: string; nameEn: string; nameBn: string | null }[];
  sizes: string[];
  sources: string[];
}

/** What the builder's pickers offer: the store's categories, the districts, the sizes sold, where people first came from. */
export async function segmentOptions(deps: CustomersDeps, who: Who): Promise<SegmentOptions> {
  await allow(deps, who, 'customers.read');
  const S = who.storeId;
  const [categories, areas, sizes, sources] = await Promise.all([
    deps.db.category.findMany({ where: { storeId: S, archivedAt: null }, orderBy: [{ nameEn: 'asc' }], select: { id: true, nameEn: true, nameBn: true }, take: 500 }),
    deps.db.geoArea.findMany({ where: { level: 'DISTRICT', archivedAt: null }, orderBy: [{ nameEn: 'asc' }], select: { id: true, nameEn: true, nameBn: true }, take: 200 }),
    deps.db.$queryRaw<{ s: string }[]>`SELECT DISTINCT i."sizeLabel" AS s FROM "OrderItem" i WHERE i."storeId" = ${S} AND i."sizeLabel" IS NOT NULL AND i."sizeLabel" <> '' ORDER BY 1 LIMIT 60`,
    deps.db.$queryRaw<{ s: string }[]>`SELECT DISTINCT c."firstSource" AS s FROM "Customer" c WHERE c."storeId" = ${S} AND c."mergedIntoId" IS NULL AND c."erasedAt" IS NULL AND c."firstSource" IS NOT NULL ORDER BY 1`,
  ]);
  return { categories, areas, sizes: sizes.map((r) => r.s), sources: sources.map((r) => r.s) };
}
