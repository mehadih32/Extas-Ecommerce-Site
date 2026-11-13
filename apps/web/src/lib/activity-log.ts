// S28 · PR 705 (admin prototype v5, GAP-MAP part 2 P2-13) — Settings → Activity log: who changed what (the audit log every
// admin action already writes) and who looked at a customer's details (`CustomerAccessLog`). Read-only on append-only
// records: nothing here edits or removes a row. A row shows who, when, what and which record, and only the NAMES of the
// fields that changed, never their old or new values (those can hold a phone or an address). Filters: who, words in the
// action, the kind of record, from and to day. A CSV of the filtered rows can be downloaded; the download is itself written
// to the log. Needs `audit.read`. The page size is the `activity.log` setting.
import { audit, requirePermission, type Actor, type RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID, type Prisma, type PrismaClient } from '@extas/db/client';
import { dayStart, nextDay } from '@extas/metrics';
import { errorResponse, fail, guardAdmin, isUuid, type AdminDeps } from './admin-auth';
import { changedKeys } from './people-pure';

type Db = PrismaClient;

export type ActivityKind = 'changes' | 'views';
export interface ActivityFilters {
  kind: ActivityKind;
  who: string | null;
  text: string;
  from: string | null;
  to: string | null;
  page: number;
}
export interface ActivityRow {
  id: string;
  at: string;
  who: string;
  whoType: string;
  action: string;
  entity: string;
  entityId: string | null;
  fields: string[];
}
export interface ActivityView {
  kind: ActivityKind;
  filters: ActivityFilters;
  rows: ActivityRow[];
  more: boolean;
  pageSize: number;
  people: { id: string; name: string }[];
}

const ymd = (v: string | null | undefined): string | null => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) ? v : null);

/** The filters as the address carries them; anything malformed falls back to "no filter". */
export function filtersOf(q: URLSearchParams | Record<string, string | undefined>): ActivityFilters {
  const get = (k: string) => (q instanceof URLSearchParams ? q.get(k) : q[k]) ?? null;
  const who = get('who');
  const page = Number(get('page'));
  return {
    kind: get('kind') === 'views' ? 'views' : 'changes',
    who: who && isUuid(who) ? who : null,
    text: (get('text') ?? '').trim().slice(0, 60),
    from: ymd(get('from')),
    to: ymd(get('to')),
    page: Number.isInteger(page) && page >= 1 && page <= 10_000 ? page : 1, // hardcode-ok: a paging guard, not a business number
  };
}

export async function activityView(deps: Pick<AdminDeps, 'db' | 'resolver'>, actor: Actor, storeId: number, f: ActivityFilters, tz: string, opts: { all?: boolean } = {}): Promise<ActivityView> {
  await requirePermission(deps.db, actor, 'audit.read', { storeId });
  const cfg = await deps.resolver.value('activity.log', { storeId });
  const size = opts.all ? 5000 : cfg.pageSize; // hardcode-ok: the most rows one CSV download carries
  const at: Prisma.DateTimeFilter = {};
  if (f.from) at.gte = dayStart(f.from, tz);
  if (f.to) at.lt = dayStart(nextDay(f.to), tz);
  const when = f.from || f.to ? { createdAt: at } : {};
  const skip = opts.all ? 0 : (f.page - 1) * size;
  const db: Db = deps.db;
  let rows: ActivityRow[] = [];
  let more = false;
  if (f.kind === 'changes') {
    const found = await db.auditLog.findMany({
      where: { AND: [{ OR: [{ storeId }, { storeId: null }] }, f.text ? { OR: [{ action: { contains: f.text, mode: 'insensitive' } }, { entityType: { contains: f.text, mode: 'insensitive' } }] } : {}], ...when, ...(f.who ? { actorId: f.who } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take: size + 1,
      select: { id: true, createdAt: true, actorType: true, actorId: true, action: true, entityType: true, entityId: true, before: true, after: true },
    });
    more = found.length > size;
    const names = await nameMap(db, found.map((r) => r.actorId));
    rows = found.slice(0, size).map((r) => ({ id: r.id, at: r.createdAt.toISOString(), who: r.actorId ? (names.get(r.actorId) ?? '') : '', whoType: r.actorType, action: r.action, entity: r.entityType, entityId: r.entityId, fields: changedKeys(r.before, r.after) }));
  } else {
    const found = await db.customerAccessLog.findMany({
      where: { storeId, ...when, ...(f.who ? { staffUserId: f.who } : {}), ...(f.text ? { action: { contains: f.text, mode: 'insensitive' } } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take: size + 1,
      select: { id: true, createdAt: true, staffUserId: true, action: true, customerId: true },
    });
    more = found.length > size;
    const names = await nameMap(db, found.map((r) => r.staffUserId));
    rows = found.slice(0, size).map((r) => ({ id: r.id, at: r.createdAt.toISOString(), who: r.staffUserId ? (names.get(r.staffUserId) ?? '') : '', whoType: r.staffUserId ? 'STAFF' : 'SYSTEM', action: r.action, entity: 'Customer', entityId: r.customerId, fields: [] }));
  }
  const people = (await db.staffUser.findMany({ orderBy: { displayName: 'asc' }, select: { id: true, displayName: true } })).map((p) => ({ id: p.id, name: p.displayName }));
  return { kind: f.kind, filters: f, rows, more, pageSize: cfg.pageSize, people };
}

async function nameMap(db: Db, ids: (string | null)[]): Promise<Map<string, string>> {
  const want = [...new Set(ids.filter((i): i is string => !!i && isUuid(i)))];
  if (!want.length) return new Map();
  return new Map((await db.staffUser.findMany({ where: { id: { in: want } }, select: { id: true, displayName: true } })).map((s) => [s.id, s.displayName]));
}

const cell = (v: string | null) => {
  const s = (v ?? '').replace(/\r?\n/g, ' ');
  // a cell starting with = + - @ would run as a formula in a spreadsheet; a leading apostrophe stops that
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** The filtered rows as CSV text (when, who, kind of person, what, record, record id, changed fields). */
export const csvOf = (rows: readonly ActivityRow[]): string => ['when,who,type,action,record,record id,changed fields', ...rows.map((r) => [r.at, r.who, r.whoType, r.action, r.entity, r.entityId, r.fields.join(' ')].map(cell).join(','))].join('\n') + '\n';

/** GET /api/admin/activity-log?kind=&who=&text=&from=&to=&page=[&format=csv] (audit.read). */
export async function activityRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  if (path.length) return fail(404, 'not-found');
  if (request.method.toUpperCase() !== 'GET') return fail(405, 'method-not-allowed');
  const url = new URL(request.url);
  const raw = url.searchParams.get('storeId');
  const storeId = raw === null ? MOTHER_STORE_ID : /^\d+$/.test(raw) ? Number(raw) : null;
  if (storeId === null) return fail(400, 'invalid-store-id');
  try {
    const g = await guardAdmin(request, deps, { permission: 'audit.read', storeId });
    if (g instanceof Response) return g;
    const tz = await deps!.resolver.value('store.timeZone', { storeId });
    const f = filtersOf(url.searchParams);
    const csv = url.searchParams.get('format') === 'csv';
    const v = await activityView(deps!, g.actor, storeId, f, tz, { all: csv });
    if (csv) {
      await audit(deps!.db, g.actor, { action: 'activity.export', entityType: 'ActivityLog', after: { kind: f.kind, rows: v.rows.length }, storeId }, g.ctx);
      return new Response(csvOf(v.rows), { status: 200, headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="activity-log-${f.kind}.csv"`, 'cache-control': 'no-store' } });
    }
    return new Response(JSON.stringify({ ok: true, ...v }), { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  } catch (e) {
    return errorResponse(e);
  }
}
