// S16 · PR 352 (B3.10, Blueprint §59 answer 25: "team performance badges — build it, default off") — Reports → Team
// (`/admin/reports/team`): what each person did in a week or a month, counted from the shop's own records, never typed
// in by anyone:
//   confirmed   orders a person moved to CONFIRMED (OrderEvent, actor STAFF; each order once)
//   packed      orders a person moved to PACKED
//   handedOver  orders a person moved to HANDED_OVER (to the courier)
//   replies     support replies a person sent (Message OUT, not an internal note)
// Badges (`team.badges`, off as shipped): "most in the period" for each measure (only when someone did any, ties share it)
// and "reached the minimum" for each measure the owner gave a minimum (none as shipped). Recognition only: nothing here
// pays, takes away or changes anyone's access.
//   PUT /api/admin/reports/team   {value: {enabled, period, top, mins}, version}   (`staff.performance`; history + audit)
import { audit } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { daysPeriod, ymdIn } from '@extas/metrics';
import { registry, SettingsError, storeTarget, TEAM_MEASURES, type TeamBadgesSettings, type TeamMeasure } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from './admin-auth';
import type { AppResolver } from './settings';

export type TeamBadge = { measure: TeamMeasure; kind: 'top' | 'min' };

export interface TeamRow {
  staffId: string;
  name: string;
  counts: Record<TeamMeasure, number>;
  badges: TeamBadge[];
}

export interface TeamView {
  settings: { value: TeamBadgesSettings; version: number };
  /** The store days counted. */
  from: string;
  to: string;
  rows: TeamRow[];
}

const shift = (ymd: string, days: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/**
 * The days of the week (Saturday to Friday, the Bangladeshi week) or the month around `today`; `back` = 1 for the one
 * before. Pure.
 */
export function teamPeriod(today: string, period: 'week' | 'month', back: 0 | 1): { from: string; to: string } {
  if (period === 'week') {
    const sinceSaturday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 1) % 7;
    const from = shift(today, -sinceSaturday - 7 * back);
    return { from, to: back ? shift(from, 6) : today };
  }
  const first = back ? `${shift(`${today.slice(0, 7)}-01`, -1).slice(0, 7)}-01` : `${today.slice(0, 7)}-01`;
  return { from: first, to: back ? shift(`${today.slice(0, 7)}-01`, -1) : today };
}

/** The badges of each row: the most in each measure (ties share it, none for 0) and each minimum reached. Pure. */
export function badgesFor(rows: Omit<TeamRow, 'badges'>[], s: Pick<TeamBadgesSettings, 'top' | 'mins'>): TeamRow[] {
  const best = Object.fromEntries(TEAM_MEASURES.map((m) => [m, Math.max(0, ...rows.map((r) => r.counts[m]))])) as Record<TeamMeasure, number>;
  return rows.map((r) => ({
    ...r,
    badges: [
      ...(s.top ? TEAM_MEASURES.filter((m) => best[m] > 0 && r.counts[m] === best[m]).map((measure): TeamBadge => ({ measure, kind: 'top' })) : []),
      ...TEAM_MEASURES.filter((m) => s.mins[m] !== null && r.counts[m] >= s.mins[m]!).map((measure): TeamBadge => ({ measure, kind: 'min' })),
    ],
  }));
}

const STATUS_OF: Record<Exclude<TeamMeasure, 'replies'>, string> = { confirmed: 'CONFIRMED', packed: 'PACKED', handedOver: 'HANDED_OVER' };

/** What each person did over the store days `from`–`to`, with the badges; people who did nothing are left out. */
export async function teamCounts(db: PrismaClient, storeId: number, from: string, to: string, timeZone: string, s: Pick<TeamBadgesSettings, 'top' | 'mins'>): Promise<TeamRow[]> {
  const p = daysPeriod(from, to, timeZone);
  const [events, replies] = await Promise.all([
    db.$queryRaw<{ staffId: string; status: string; n: bigint }[]>`
      SELECT e."actorId" AS "staffId", e."toStatus"::text AS "status", COUNT(DISTINCT e."orderId")::bigint AS "n"
        FROM "OrderEvent" e
       WHERE e."storeId" = ${storeId} AND e."actorType"::text = 'STAFF' AND e."actorId" IS NOT NULL
         AND e."toStatus"::text = ANY(${Object.values(STATUS_OF)}) AND e."createdAt" >= ${p.from} AND e."createdAt" < ${p.to}
       GROUP BY 1, 2`,
    db.$queryRaw<{ staffId: string; n: bigint }[]>`
      SELECT m."senderStaffId"::text AS "staffId", COUNT(*)::bigint AS "n"
        FROM "Message" m
       WHERE m."storeId" = ${storeId} AND m."senderType"::text = 'STAFF' AND m."senderStaffId" IS NOT NULL AND m."direction" = 'OUT'
         AND m."isInternalNote" = false AND m."sentAt" >= ${p.from} AND m."sentAt" < ${p.to}
       GROUP BY 1`,
  ]);
  const counts = new Map<string, Record<TeamMeasure, number>>();
  const of = (id: string) => counts.get(id) ?? (counts.set(id, Object.fromEntries(TEAM_MEASURES.map((m) => [m, 0])) as Record<TeamMeasure, number>), counts.get(id)!);
  for (const e of events) {
    const measure = (Object.keys(STATUS_OF) as (keyof typeof STATUS_OF)[]).find((k) => STATUS_OF[k] === e.status);
    if (measure) of(e.staffId)[measure] = Number(e.n);
  }
  for (const r of replies) of(r.staffId).replies = Number(r.n);
  const ids = [...counts.keys()].filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  const staff = ids.length ? await db.staffUser.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } }) : [];
  const nameOf = new Map(staff.map((x) => [x.id, x.displayName]));
  const rows = ids.filter((id) => nameOf.has(id)).map((id) => ({ staffId: id, name: nameOf.get(id)!, counts: counts.get(id)! }));
  const total = (r: { counts: Record<TeamMeasure, number> }) => TEAM_MEASURES.reduce((n, m) => n + r.counts[m], 0);
  return badgesFor(rows, s).sort((a, b) => total(b) - total(a) || a.name.localeCompare(b.name));
}

/** The page's view: the setting, the period (this or the one before) and, when on, each person's counts and badges. */
export async function teamView(deps: { db: PrismaClient; resolver: AppResolver }, storeId: number, back: 0 | 1, now = new Date()): Promise<TeamView> {
  const at = { storeId };
  const [s, tz] = await Promise.all([deps.resolver.get('team.badges', at), deps.resolver.value('store.timeZone', at)]);
  const { from, to } = teamPeriod(ymdIn(now, tz), s.value.period, back);
  return { settings: { value: s.value, version: s.version }, from, to, rows: s.value.enabled ? await teamCounts(deps.db, storeId, from, to, tz, s.value) : [] };
}

/** PUT the setting (the table at the top). */
export async function teamRoute(request: Request, deps: AdminDeps | null): Promise<Response> {
  if (request.method.toUpperCase() !== 'PUT') return fail(405, 'method-not-allowed');
  const raw = new URL(request.url).searchParams.get('storeId');
  const storeId = raw === null ? MOTHER_STORE_ID : Number(raw);
  if (!Number.isInteger(storeId) || storeId < 1) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission: 'staff.performance', storeId });
  if (g instanceof Response) return g;
  const d = deps!;
  try {
    const b = await body(request);
    const parsed = registry['team.badges'].schema.safeParse(b.value === undefined ? Symbol('missing') : b.value);
    if (!parsed.success) return json({ ok: false, error: 'INVALID_INPUT', details: parsed.error.issues.map((i) => `${['team.badges', ...i.path].join('.')}: ${i.message}`) }, { status: 400 });
    const at = { storeId };
    const before = await d.resolver.value('team.badges', at);
    if (JSON.stringify(before) !== JSON.stringify(parsed.data)) {
      await d.resolver.set('team.badges', parsed.data, storeTarget(storeId), { actorId: g.actor.staffUserId ?? null, reason: 'Reports › Team', expectedVersion: typeof b.version === 'number' ? b.version : undefined });
      await audit(d.db, g.actor, { storeId, action: 'team.badges', entityType: 'Setting', entityId: 'team.badges', before: { 'team.badges': before }, after: { 'team.badges': parsed.data } }, g.ctx);
    }
    const now = await d.resolver.get('team.badges', at);
    return json({ ok: true, value: now.value, version: now.version });
  } catch (e) {
    if (e instanceof SettingsError) return json({ ok: false, error: e.code === 'VERSION_CONFLICT' ? 'VERSION_CONFLICT' : 'INVALID_INPUT', details: [...e.issues] }, { status: e.code === 'VERSION_CONFLICT' ? 409 : 400 });
    return errorResponse(e);
  }
}
