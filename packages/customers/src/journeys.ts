// PR 289 — automations: customer journeys with triggers, waits, checks and messages (Blueprint B5.3; BACKEND-ARCHITECTURE
// §5.7 Messages; SIM-F-032's product-life reminder). The owner builds a journey (journey-rules.ts): it starts N days after
// a delivered order (of one category or any), after N days without an order, or N days after a profile was made; then
// its steps wait, check the person still fits a condition of the segment builder (PR 287) and send a message from a
// template. `runJourneys` (the message job, before each send run) enrols the people a trigger names — once per person and
// start — and moves each due person on: a wait sets his next time, a check that fails ends his journey, a message is
// queued in the message log (step `crmJourney`) for the Messages engine, which sends it only with his yes for offers on
// that channel, outside the quiet hours, within the weekly cap per person and with the stop line (PR 298; CN-021 P14).
//
// Off as shipped (`customers.journeys`), and every journey is saved off. Seeing needs `messages.journey.read`; building,
// switching, archiving and the settings need `messages.automations.write`; every change is audited. Nothing is deleted
// (archive and restore); a person who is erased leaves every journey (erasure.ts). Nothing here moves money or changes
// an order, a price or COD, and nobody is blocked.
import { audit, requirePermission } from '@extas/auth';
import { Prisma } from '@extas/db/client';
import { CRM_MESSAGE_STEP, type JourneysSettings } from '@extas/settings';
import { z } from 'zod';
import { checkStoreId, nowOf, parse, setting, TX, UUID, type CustomersDeps, type Who } from './context';
import { CustomersError } from './errors';
import { journeyMessageKey, journeyPlan, journeyTrigger, readJourney, type JourneyExit, type JourneyPlan, type JourneyTrigger } from './journey-rules';
import { baseOf, checkRefs, conditionSql, optionsOf, type SegmentOptions } from './segments';

export const JOURNEYS_READ = 'messages.journey.read' as const;
export const JOURNEYS_WRITE = 'messages.automations.write' as const;
const DAY_MS = 86_400_000;

async function gate(deps: CustomersDeps, who: Who, permission: typeof JOURNEYS_READ | typeof JOURNEYS_WRITE): Promise<boolean> {
  checkStoreId(who.storeId);
  const held = await requirePermission(deps.db, who.actor, permission, { storeId: who.storeId });
  return held.has(JOURNEYS_WRITE);
}

export interface JourneyCounts {
  active: number;
  done: number;
  exited: number;
  sent: number;
}

export interface AutomationRow extends JourneyCounts {
  id: string;
  name: string;
  enabled: boolean;
  archivedAt: Date | null;
  updatedAt: Date;
  trigger: JourneyTrigger | null;
  steps: number;
  sends: number;
}

export interface JourneysScreen {
  enabled: boolean;
  settings: JourneysSettings;
  journeys: AutomationRow[];
  archived: AutomationRow[];
  canWrite: boolean;
}

async function countsOf(deps: CustomersDeps, S: number, ids: string[]): Promise<Map<string, JourneyCounts>> {
  const out = new Map<string, JourneyCounts>(ids.map((id) => [id, { active: 0, done: 0, exited: 0, sent: 0 }]));
  if (!ids.length) return out;
  const [states, sent] = await Promise.all([
    deps.db.journeyEnrollment.groupBy({ by: ['journeyId', 'status'], where: { storeId: S, journeyId: { in: ids } }, _count: { _all: true } }),
    deps.db.$queryRaw<{ j: string; n: bigint }[]>`SELECT je."journeyId"::text AS j, count(*) AS n FROM "NotificationLog" l JOIN "JourneyEnrollment" je ON l."dedupeKey" LIKE 'crm:' || je."id"::text || ':%' WHERE l."storeId" = ${S} AND l."step" = ${CRM_MESSAGE_STEP} AND l."status" = 'SENT' AND je."journeyId" = ANY(${ids}::uuid[]) GROUP BY 1`,
  ]);
  for (const r of states) {
    const c = out.get(r.journeyId)!;
    if (r.status === 'ACTIVE') c.active += r._count._all;
    else if (r.status === 'DONE') c.done += r._count._all;
    else c.exited += r._count._all;
  }
  for (const r of sent) out.get(r.j)!.sent = Number(r.n);
  return out;
}

/** Messages › Automations: the journeys with their people (on the way, finished, left) and messages sent. */
export async function journeysScreen(deps: CustomersDeps, who: Who): Promise<JourneysScreen> {
  const canWrite = await gate(deps, who, JOURNEYS_READ);
  const S = who.storeId;
  const settings = await setting(deps, S, 'customers.journeys');
  const rows = await deps.db.journey.findMany({ where: { storeId: S }, orderBy: [{ archivedAt: { sort: 'desc', nulls: 'first' } }, { name: 'asc' }], take: 500 });
  const counts = await countsOf(deps, S, rows.map((r) => r.id));
  const view = (r: (typeof rows)[number]): AutomationRow => {
    const read = readJourney(r.trigger, r.steps);
    return { id: r.id, name: r.name, enabled: r.enabled, archivedAt: r.archivedAt, updatedAt: r.updatedAt, trigger: read?.trigger ?? null, steps: read?.plan.steps.length ?? 0, sends: read?.plan.steps.filter((s) => s.kind === 'send').length ?? 0, ...counts.get(r.id)! };
  };
  return { enabled: settings.enabled, settings, journeys: rows.filter((r) => !r.archivedAt).map(view), archived: rows.filter((r) => r.archivedAt).map(view), canWrite };
}

export interface JourneyTemplate {
  key: string;
  channel: string;
}

export interface JourneyEditor {
  journey: { id: string; name: string; enabled: boolean; archivedAt: Date | null; version: string; trigger: JourneyTrigger | null; plan: JourneyPlan | null; counts: JourneyCounts } | null;
  templates: JourneyTemplate[];
  options: SegmentOptions;
  settings: JourneysSettings;
  canWrite: boolean;
}

/** One journey for the builder (null id: a new one), with the templates and the pickers' lists. */
export async function journeyEditor(deps: CustomersDeps, who: Who, id: string | null): Promise<JourneyEditor | null> {
  const canWrite = await gate(deps, who, JOURNEYS_READ);
  const S = who.storeId;
  if (id !== null && !UUID.test(id)) return null;
  const [row, templates, options, settings] = await Promise.all([
    id ? deps.db.journey.findFirst({ where: { id, storeId: S } }) : Promise.resolve(null),
    deps.db.notificationTemplate.findMany({ where: { storeId: S, archivedAt: null }, distinct: ['key', 'channel'], orderBy: [{ key: 'asc' }, { channel: 'asc' }], select: { key: true, channel: true } }),
    optionsOf(deps, S),
    setting(deps, S, 'customers.journeys'),
  ]);
  if (id && !row) return null;
  const read = row ? readJourney(row.trigger, row.steps) : null;
  const counts = row ? (await countsOf(deps, S, [row.id])).get(row.id)! : null;
  return {
    journey: row ? { id: row.id, name: row.name, enabled: row.enabled, archivedAt: row.archivedAt, version: row.updatedAt.toISOString(), trigger: read?.trigger ?? null, plan: read?.plan ?? null, counts: counts! } : null,
    templates,
    options,
    settings,
    canWrite,
  };
}

async function switchedOn(deps: CustomersDeps, S: number): Promise<JourneysSettings> {
  const s = await setting(deps, S, 'customers.journeys');
  if (!s.enabled) throw new CustomersError('SWITCHED_OFF', 'automations are switched off', ['customers.journeys']);
  return s;
}

const saveInput = z.object({ name: z.string().trim().min(1).max(80), trigger: z.unknown(), plan: z.unknown(), version: z.string().max(40).optional() }).strict();
const nameKey = (s: string) => s.trim().toLocaleLowerCase();

/** Saves a journey (new ones are saved off). Checks every template and every condition's category or area. Audited. */
export async function saveJourney(deps: CustomersDeps, who: Who, id: string | null, input: unknown): Promise<JourneyEditor> {
  await gate(deps, who, JOURNEYS_WRITE);
  const S = who.storeId;
  const s = await switchedOn(deps, S);
  const d = parse(saveInput, input, 'journey');
  const trigger = parse(journeyTrigger, d.trigger, 'trigger');
  const plan = parse(journeyPlan, d.plan, 'journey steps');
  if (plan.steps.length > s.maxSteps) throw new CustomersError('LIMIT_REACHED', 'too many steps', ['plan.steps'], { max: s.maxSteps });
  if (id !== null && !UUID.test(id)) throw new CustomersError('NOT_FOUND', 'no such journey', ['journeyId']);
  const conds = plan.steps.flatMap((x) => (x.kind === 'check' ? [x.condition] : []));
  await checkRefs(deps, S, { v: 1, all: [...conds, ...(trigger.type === 'delivered' && trigger.category ? [{ field: 'category' as const, value: trigger.category }] : [])] });
  const sends = plan.steps.flatMap((x, i) => (x.kind === 'send' ? [{ i, key: x.template, channel: x.channel }] : []));
  const have = await deps.db.notificationTemplate.findMany({ where: { storeId: S, archivedAt: null, OR: sends.map((x) => ({ key: x.key, channel: x.channel })) }, select: { key: true, channel: true } });
  const missing = sends.filter((x) => !have.some((h) => h.key === x.key && h.channel === x.channel)).map((x) => `plan.steps.${x.i}.template`);
  if (missing.length) throw new CustomersError('INVALID_INPUT', 'a step names a template the shop does not have on that channel', missing);
  const json = { trigger: trigger as unknown as Prisma.InputJsonValue, steps: plan as unknown as Prisma.InputJsonValue };
  const saved = await deps.db.$transaction(async (tx) => {
    const live = await tx.journey.findMany({ where: { storeId: S, archivedAt: null }, select: { id: true, name: true } });
    if (live.some((x) => x.id !== id && nameKey(x.name) === nameKey(d.name))) throw new CustomersError('NAME_TAKEN', 'another journey has this name', ['name']);
    if (id === null) {
      if (live.length >= s.maxJourneys) throw new CustomersError('LIMIT_REACHED', 'the store keeps its most journeys already', ['customers.journeys.maxJourneys'], { max: s.maxJourneys });
      const row = await tx.journey.create({ data: { storeId: S, name: d.name, enabled: false, ...json } });
      await audit(tx, who.actor, { action: 'journey.create', entityType: 'Journey', entityId: row.id, storeId: S, after: { name: row.name, trigger, plan } }, who.ctx);
      return row;
    }
    const before = await tx.journey.findFirst({ where: { id, storeId: S } });
    if (!before) throw new CustomersError('NOT_FOUND', 'no such journey', ['journeyId']);
    if (before.archivedAt) throw new CustomersError('NOT_ACTIVE', 'the journey is archived; restore it first', ['journeyId']);
    if (d.version !== undefined && d.version !== before.updatedAt.toISOString()) throw new CustomersError('STALE', 'the journey was changed by someone else; reload it', ['version'], { version: before.updatedAt.toISOString() });
    const row = await tx.journey.update({ where: { id: before.id }, data: { name: d.name, ...json } });
    await audit(tx, who.actor, { action: 'journey.update', entityType: 'Journey', entityId: row.id, storeId: S, before: { name: before.name, trigger: before.trigger, plan: before.steps }, after: { name: row.name, trigger, plan } }, who.ctx);
    return row;
  }, TX);
  return (await journeyEditor(deps, who, saved.id))!;
}

const switchInput = z.object({ enabled: z.boolean() }).strict();

/** Turns one journey on or off. Off, its people wait where they are; on again, they go on. Audited. */
export async function switchJourney(deps: CustomersDeps, who: Who, id: string, input: unknown): Promise<JourneyEditor> {
  await gate(deps, who, JOURNEYS_WRITE);
  const d = parse(switchInput, input, 'switch');
  const S = who.storeId;
  if (d.enabled) await switchedOn(deps, S);
  const before = UUID.test(id) ? await deps.db.journey.findFirst({ where: { id, storeId: S } }) : null;
  if (!before) throw new CustomersError('NOT_FOUND', 'no such journey', ['journeyId']);
  if (before.archivedAt) throw new CustomersError('NOT_ACTIVE', 'the journey is archived; restore it first', ['journeyId']);
  if (d.enabled && !readJourney(before.trigger, before.steps)) throw new CustomersError('INVALID_INPUT', 'the journey cannot be read; save it again first', ['plan']);
  if (before.enabled !== d.enabled)
    await deps.db.$transaction(async (tx) => {
      await tx.journey.update({ where: { id: before.id }, data: { enabled: d.enabled } });
      await audit(tx, who.actor, { action: 'journey.switch', entityType: 'Journey', entityId: before.id, storeId: S, before: { enabled: before.enabled }, after: { enabled: d.enabled } }, who.ctx);
    }, TX);
  return (await journeyEditor(deps, who, before.id))!;
}

const archiveInput = z.object({ archived: z.boolean() }).strict();

/** Archives a journey (it goes off and its people leave it, STOPPED) or restores one (off). Never deleted. Audited. */
export async function archiveJourney(deps: CustomersDeps, who: Who, id: string, input: unknown): Promise<{ id: string; archived: boolean }> {
  await gate(deps, who, JOURNEYS_WRITE);
  const d = parse(archiveInput, input, 'archive');
  const S = who.storeId;
  const now = nowOf(deps);
  const before = UUID.test(id) ? await deps.db.journey.findFirst({ where: { id, storeId: S } }) : null;
  if (!before) throw new CustomersError('NOT_FOUND', 'no such journey', ['journeyId']);
  if (!!before.archivedAt === d.archived) return { id: before.id, archived: d.archived };
  if (!d.archived) {
    const s = await switchedOn(deps, S);
    const live = await deps.db.journey.count({ where: { storeId: S, archivedAt: null } });
    if (live >= s.maxJourneys) throw new CustomersError('LIMIT_REACHED', 'the store keeps its most journeys already', ['customers.journeys.maxJourneys'], { max: s.maxJourneys });
    if (await deps.db.journey.count({ where: { storeId: S, archivedAt: null, name: { equals: before.name, mode: 'insensitive' } } })) throw new CustomersError('NAME_TAKEN', 'another journey has this name', ['name']);
  }
  await deps.db.$transaction(async (tx) => {
    await tx.journey.update({ where: { id: before.id }, data: d.archived ? { archivedAt: now, enabled: false } : { archivedAt: null } });
    if (d.archived) await tx.journeyEnrollment.updateMany({ where: { storeId: S, journeyId: before.id, status: 'ACTIVE' }, data: { status: 'EXITED', reason: 'STOPPED' satisfies JourneyExit, exitedAt: now, nextRunAt: null } });
    await audit(tx, who.actor, { action: d.archived ? 'journey.archive' : 'journey.restore', entityType: 'Journey', entityId: before.id, storeId: S, before: { archivedAt: before.archivedAt, enabled: before.enabled }, after: { archived: d.archived } }, who.ctx);
  }, TX);
  return { id: before.id, archived: d.archived };
}

/** The page's settings card: `customers.journeys` saved through its own schema. Audited. */
export async function saveJourneysSettings(deps: CustomersDeps, who: Who, input: unknown): Promise<JourneysScreen> {
  await gate(deps, who, JOURNEYS_WRITE);
  if (!deps.settings.set) throw new CustomersError('INVALID_INPUT', 'settings cannot be written here', ['settings']);
  const before = await setting(deps, who.storeId, 'customers.journeys');
  const next = { ...before, ...(input && typeof input === 'object' ? input : {}) };
  if (JSON.stringify(next) !== JSON.stringify(before)) {
    try {
      await deps.settings.set('customers.journeys', next as never, { level: 'store', storeId: who.storeId }, { actorId: who.actor.staffUserId ?? null, reason: 'Messages › Automations' });
    } catch (e) {
      throw new CustomersError('INVALID_INPUT', 'the automation settings are not valid', (e as { details?: string[] }).details ?? ['customers.journeys']);
    }
    await audit(deps.db, who.actor, { action: 'journey.settings', entityType: 'Setting', entityId: 'customers.journeys', storeId: who.storeId, before, after: next }, who.ctx);
  }
  return journeysScreen(deps, who);
}

// ---- the engine ----------------------------------------------------------------------------------------------------

export interface JourneysRunResult {
  enrolled: number;
  moved: number;
  queued: number;
  done: number;
  exited: number;
}

/** The people a trigger names right now (those whose start fell in the catch-up window), not yet enrolled for it. */
async function candidates(deps: CustomersDeps, S: number, journeyId: string, t: JourneyTrigger, s: JourneysSettings, now: Date, limit: number): Promise<{ cid: string; ref: string }[]> {
  const hi = new Date(now.getTime() - t.days * DAY_MS);
  const lo = new Date(hi.getTime() - s.catchUpDays * DAY_MS);
  const base = await baseOf(deps, S);
  let pick: Prisma.Sql;
  if (t.type === 'delivered') {
    const cat = t.category
      ? Prisma.sql`AND EXISTS (SELECT 1 FROM "OrderItem" i JOIN "Product" p ON p."id" = i."productId" WHERE i."orderId" = o."id" AND (p."categoryId" = ${t.category}::uuid OR EXISTS (SELECT 1 FROM "CategoryProduct" cp WHERE cp."productId" = p."id" AND cp."categoryId" = ${t.category}::uuid)))`
      : Prisma.empty;
    pick = Prisma.sql`SELECT DISTINCT b."id"::text AS cid, o."id"::text AS ref FROM base b JOIN own ON own.k = b."id"::text JOIN "Order" o ON o."id" = own."id" AND o."storeId" = ${S} AND o."archivedAt" IS NULL AND o."status"::text IN ('DELIVERED', 'PARTIALLY_DELIVERED') AND o."deliveredAt" >= ${lo} AND o."deliveredAt" < ${hi} ${cat}`;
  } else if (t.type === 'noOrder') pick = Prisma.sql`SELECT b."id"::text AS cid, 'last:' || floor(extract(epoch FROM b.last_at))::bigint::text AS ref FROM base b WHERE b.orders > 0 AND b.last_at >= ${lo} AND b.last_at < ${hi}`;
  else pick = Prisma.sql`SELECT b."id"::text AS cid, 'joined' AS ref FROM base b WHERE b."createdAt" >= ${lo} AND b."createdAt" < ${hi}`;
  return deps.db.$queryRaw<{ cid: string; ref: string }[]>`${base} SELECT q.cid, q.ref FROM (${pick}) q WHERE NOT EXISTS (SELECT 1 FROM "JourneyEnrollment" je WHERE je."journeyId" = ${journeyId}::uuid AND je."customerId" = q.cid::uuid AND je."triggerRef" = q.ref) ORDER BY q.cid LIMIT ${limit}`;
}

type Due = Prisma.JourneyEnrollmentGetPayload<{ include: { journey: { select: { trigger: true; steps: true } } } }>;

/** Moves one person on as far as he goes now: up to a wait, the end, or a check he no longer passes. */
async function advance(deps: CustomersDeps, S: number, e: Due, now: Date, out: JourneysRunResult): Promise<void> {
  const read = readJourney(e.journey.trigger, e.journey.steps);
  if (!read) return;
  const end = (status: 'DONE' | 'EXITED', reason: JourneyExit | null, step: number) =>
    deps.db.journeyEnrollment.update({ where: { id: e.id }, data: { status, reason, exitedAt: now, nextRunAt: null, currentStep: step } }).then(() => void (status === 'DONE' ? out.done++ : out.exited++));
  const p = await deps.db.customer.findFirst({ where: { id: e.customerId, storeId: S }, select: { id: true, erasedAt: true, mergedIntoId: true } });
  if (!p || p.erasedAt) return end('EXITED', 'ERASED', e.currentStep);
  const person = p.mergedIntoId ? await deps.db.customer.findFirst({ where: { id: p.mergedIntoId, storeId: S, erasedAt: null }, select: { id: true, phone: true, email: true } }) : await deps.db.customer.findFirst({ where: { id: p.id }, select: { id: true, phone: true, email: true } });
  if (!person) return end('EXITED', 'ERASED', e.currentStep);
  const base = await baseOf(deps, S, [person.id]);
  out.moved++;
  if (read.plan.exitOnOrder) {
    const last = await deps.db.$queryRaw<{ placed: Date | null }[]>`${base} SELECT max(o."placedAt") AS placed FROM own JOIN "Order" o ON o."id" = own."id" AND o."archivedAt" IS NULL`;
    if (last[0]?.placed && last[0].placed > e.createdAt) return end('EXITED', 'ORDERED', e.currentStep);
  }
  const steps = read.plan.steps;
  for (let i = e.currentStep; i < steps.length; i++) {
    const step = steps[i]!;
    if (step.kind === 'wait') {
      await deps.db.journeyEnrollment.update({ where: { id: e.id }, data: { currentStep: i + 1, nextRunAt: new Date(now.getTime() + step.days * DAY_MS) } });
      return;
    }
    if (step.kind === 'check') {
      const fits = await deps.db.$queryRaw<{ ok: number }[]>`${base} SELECT 1 AS ok FROM base b WHERE ${conditionSql(step.condition, { storeId: S, now })}`;
      if (!fits.length) return end('EXITED', 'NOT_MATCHED', i);
      continue;
    }
    const to = step.channel === 'EMAIL' ? person.email : person.phone;
    const tpl = to ? await deps.db.notificationTemplate.findFirst({ where: { storeId: S, key: step.template, channel: step.channel, archivedAt: null }, select: { id: true } }) : null;
    if (!to || !tpl) continue; // no number or address for this channel (or the template was archived): the next step goes on
    const made = await deps.db.notificationLog.createMany({
      data: [{ storeId: S, customerId: person.id, channel: step.channel, recipient: to, status: 'QUEUED', dedupeKey: journeyMessageKey(e.id, i), step: CRM_MESSAGE_STEP, templateId: tpl.id, sendAfter: now }],
      skipDuplicates: true,
    });
    out.queued += made.count;
  }
  return end('DONE', null, steps.length);
}

/**
 * One store's automation run (the message job, before it sends): enrol the people each journey's trigger names, then
 * move on everyone due, at most `batchSize` of each. Safe to run twice: an enrolment is one per person and start, and a
 * queued message one per enrolment and step. Nothing at all while `customers.journeys` is off.
 */
export async function runJourneys(deps: CustomersDeps, storeId: number): Promise<JourneysRunResult | null> {
  const s = await setting(deps, storeId, 'customers.journeys');
  if (!s.enabled) return null;
  const now = nowOf(deps);
  const out: JourneysRunResult = { enrolled: 0, moved: 0, queued: 0, done: 0, exited: 0 };
  const journeys = await deps.db.journey.findMany({ where: { storeId, enabled: true, archivedAt: null }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true, trigger: true, steps: true } });
  for (const j of journeys) {
    const read = readJourney(j.trigger, j.steps);
    const room = s.batchSize - out.enrolled;
    if (!read || room <= 0) continue;
    const people = await candidates(deps, storeId, j.id, read.trigger, s, now, room);
    if (!people.length) continue;
    const made = await deps.db.journeyEnrollment.createMany({ data: people.map((x) => ({ storeId, journeyId: j.id, customerId: x.cid, triggerRef: x.ref, status: 'ACTIVE', currentStep: 0, nextRunAt: now, createdAt: now })), skipDuplicates: true });
    out.enrolled += made.count;
  }
  const due = await deps.db.journeyEnrollment.findMany({
    where: { storeId, status: 'ACTIVE', nextRunAt: { lte: now }, journey: { enabled: true, archivedAt: null } },
    orderBy: [{ nextRunAt: 'asc' }, { id: 'asc' }],
    take: s.batchSize,
    include: { journey: { select: { trigger: true, steps: true } } },
  });
  for (const e of due) await advance(deps, storeId, e, now, out);
  return out;
}
