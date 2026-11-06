// S13 · PR 282 (register "Marketing calendar across ads, content and social"; Blueprint C6.1 item 5, BACKEND-ARCHITECTURE
// MKT-01 "one marketing calendar (campaigns, festive cut-offs, ads, content, social)", demo 97x-adm2-marketing.js x2Cal)
// — Marketing › Calendar (/admin/marketing/calendar) and the same view on Marketing › Campaigns. Off as it ships
// (`marketing.calendar`, registry v217).
// - One calendar, day by day on the shop's clock (`store.timeZone`), reads what the other marketing pages already keep,
//   one source per lane (CALENDAR_SOURCES): campaigns (PR 256, with their landing pages and orders), the ads running
//   (PR 259–261, not paused), message sends (Broadcast: e-mail PR 290, win-back PR 300, blasts PR 277), the seasonal home
//   windows (PR 280), the festive Smart Rules' last order days per band (PR 214/281), blog posts scheduled or published
//   (BlogPost) and social posts (SocialPost). It never starts, stops, sends, publishes or changes any of them; each item
//   links to the page where it is managed.
// - The owner's own plan lines ("Eid", "Pohela Boishakh", "Winter sale": CalendarEntry kind `plan`, migration 0161) are
//   the only thing written here: added, changed, set aside and brought back, never deleted. Adding, changing and
//   bringing back need the switch on; setting aside works while off.
// - The hook for other modules (e.g. lane A's blog publish calendar, PR 245): write a CalendarEntry row with your own
//   kind (a lane name such as `content` or `social`) and refType/refId, and it shows here read-only in that lane; a row
//   whose `content:<refId>` (etc.) item a source already shows is not shown twice. Or add a source to CALENDAR_SOURCES.
// Seeing needs `marketing.campaigns.read`; changing needs `marketing.campaigns.write`, the settings card too. Every change
// is audited. No price, offer, discount, budget or send changes; no money moves.
import { createHash } from 'node:crypto';
import { audit } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import * as rl from '@extas/rules';
import { marketingCalendarSettingsSchema, storeTarget, type MarketingCalendarSettings } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { wallToUtc, windowState } from '../shop/seasonal-home-model';
import type { AdPlatformsWho } from './ad-platforms';
import {
  addDays,
  agendaOrder,
  CALENDAR_LANES,
  calendarRange,
  dateDay,
  dayAt,
  dayDate,
  inRange,
  planInput,
  stateByDays,
  type CalendarItem,
  type CalendarLane,
  type CalendarRange,
  type CalendarState,
} from './calendar-model';
import { campaignList } from './campaigns';
import { isPaused } from './campaign-control';

const S = MOTHER_STORE_ID;
/** Rows one lane reads for one view (page-length guards, not business numbers). */
const LANE_ROWS = 300; // hardcode-ok: a page-length guard
const SET_ASIDE_SHOWN = 50; // hardcode-ok: a list-length guard
const CAPTION_SHOWN = 60; // hardcode-ok: a text-length guard
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The owner's own plan lines (CalendarEntry.kind). */
export const PLAN_KIND = 'plan';

export class CalendarError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details?: string[],
  ) {
    super(code);
  }
}

export interface CalendarDeps {
  db: PrismaClient;
  resolver: AdminDeps['resolver'];
  now?: () => Date;
}

/** What one source gets: the view, the shop's clock and its today, and the instants the view starts and ends at. */
export interface CalendarSourceCtx {
  db: PrismaClient;
  resolver: AdminDeps['resolver'];
  now: Date;
  timeZone: string;
  today: string;
  range: CalendarRange;
  fromAt: Date;
  /** The first instant after the view. */
  toAt: Date;
}
export type CalendarSource = (c: CalendarSourceCtx) => Promise<CalendarItem[]>;

const words = (en: string, bn: string | null | undefined) => ({ en, bn: bn?.trim() || null });
const lastDayOf = (end: Date, tz: string) => dayAt(new Date(end.getTime() - 1), tz);

const CAMPAIGN_STATE: Record<string, CalendarState> = { RUNNING: 'live', SCHEDULED: 'scheduled', DRAFT: 'off', PAUSED: 'off', ENDED: 'ended' };
const SEND_STATE: Record<string, CalendarState> = { SENDING: 'live', SCHEDULED: 'scheduled', SENT: 'ended', PAUSED: 'off' };

/** One source per lane. The owner's plan lines and other modules' CalendarEntry rows are read by `entries` below. */
export const CALENDAR_SOURCES: Record<Exclude<CalendarLane, 'plan'>, CalendarSource> = {
  // PR 256: a campaign with its window (a draft without a start is counted as "no dates yet", not drawn).
  async campaign(c) {
    const { rows } = await campaignList(c.db, S);
    return rows.flatMap((r) => {
      if (r.state === 'ARCHIVED' || !r.startsAt) return [];
      const starts = dayAt(new Date(r.startsAt), c.timeZone);
      return [{ id: `campaign:${r.id}`, lane: 'campaign' as const, title: words(r.name, null), starts, ends: r.endsAt ? lastDayOf(new Date(r.endsAt), c.timeZone) : null, open: !r.endsAt, state: CAMPAIGN_STATE[r.state] ?? 'off', detail: r.channels.join(' · ') || null, counts: { pages: r.pages, orders: r.orders, delivered: r.delivered }, href: `/admin/marketing/campaigns/${r.id}` }];
    });
  },
  // PR 259–261: an ad campaign that is not paused, over its campaign's window when it has one, else from today on.
  async ads(c) {
    const rows = await c.db.adCampaign.findMany({ where: { storeId: S, archivedAt: null }, take: LANE_ROWS, orderBy: { createdAt: 'desc' }, select: { id: true, name: true, status: true, adAccount: { select: { platform: true } }, campaign: { select: { startsAt: true, endsAt: true } } } });
    return rows.flatMap((r) => {
      if (isPaused(r.status)) return [];
      const at = r.campaign?.startsAt ?? null;
      const starts = at ? dayAt(at, c.timeZone) : c.today;
      const ends = at && r.campaign?.endsAt ? lastDayOf(r.campaign.endsAt, c.timeZone) : null;
      return [{ id: `ads:${r.id}`, lane: 'ads' as const, title: words(r.name, null), starts, ends, open: ends === null, state: stateByDays(starts, ends, c.today), detail: r.adAccount.platform.toLowerCase(), href: '/admin/marketing/ad-platforms' }];
    });
  },
  // PR 290 / 300 / 277: a message send on its day (drafts and cancelled sends are not on the calendar).
  async message(c) {
    const rows = await c.db.broadcast.findMany({ where: { storeId: S, scheduledAt: { gte: c.fromAt, lt: c.toAt }, status: { in: Object.keys(SEND_STATE) } }, take: LANE_ROWS, orderBy: { scheduledAt: 'asc' }, select: { id: true, name: true, channel: true, status: true, scheduledAt: true, kind: true } });
    return rows.map((r) => ({ id: `message:${r.id}`, lane: 'message' as const, title: words(r.name, null), starts: dayAt(r.scheduledAt!, c.timeZone), ends: null, open: false, state: SEND_STATE[r.status] ?? 'off', detail: r.channel.toLowerCase(), href: r.kind ? '/admin/messages/campaigns' : r.channel === 'EMAIL' ? '/admin/messages/email' : null }));
  },
  // PR 280: a seasonal home window that is not stopped.
  async home(c) {
    const rows = await c.db.scheduledLayoutSwitch.findMany({ where: { storeId: S, status: 'SCHEDULED', applyAt: { lt: c.toAt }, OR: [{ revertAt: null }, { revertAt: { gt: c.fromAt } }] }, take: LANE_ROWS, orderBy: { applyAt: 'asc' }, include: { snapshot: { select: { name: true } } } });
    const st: Record<string, CalendarState> = { LIVE: 'live', UPCOMING: 'scheduled', ENDED: 'ended', STOPPED: 'off' };
    return rows.map((r) => ({ id: `home:${r.id}`, lane: 'home' as const, title: words(r.snapshot.name, null), starts: dayAt(r.applyAt, c.timeZone), ends: r.revertAt ? lastDayOf(r.revertAt, c.timeZone) : null, open: !r.revertAt, state: st[windowState(r, c.now)] ?? 'off', detail: null, href: '/admin/marketing/seasonal' }));
  },
  // PR 214 / 281: a switched-on festive rule, its last order day marked per delivery band.
  async festive(c) {
    const [rules, bands] = await Promise.all([rl.activeRules(c.db, S), c.db.deliveryBand.findMany({ where: { storeId: S }, select: { key: true, nameEn: true } })]);
    const bandName = new Map(bands.map((b) => [b.key, b.nameEn]));
    return rules.flatMap((r) => {
      const cuts = r.kind === 'festive' && !r.archived && r.status === 'ACTIVE' ? rl.festiveCuts(r) : [];
      if (!cuts.length) return [];
      const marks = cuts.map((x) => ({ day: dayAt(new Date(x.at), c.timeZone), label: bandName.get(x.band) ?? x.band })).sort((a, b) => a.day.localeCompare(b.day) || a.label.localeCompare(b.label));
      const passed = cuts.every((x) => new Date(x.at) <= c.now);
      const state: CalendarState = passed ? 'ended' : rl.isLive(r, c.now) ? 'live' : 'scheduled';
      return [{ id: `festive:${r.key}`, lane: 'festive' as const, title: words(r.nameEn, r.nameBn), starts: marks[0]!.day, ends: marks[marks.length - 1]!.day, open: false, state, detail: null, marks, href: '/admin/marketing/festive' }];
    });
  },
  // Blog posts scheduled, or published, in the view (the blog's own admin — PR 245 — links here once it lands).
  async content(c) {
    const rows = await c.db.blogPost.findMany({ where: { storeId: S, archivedAt: null, OR: [{ status: 'SCHEDULED', scheduledAt: { gte: c.fromAt, lt: c.toAt } }, { status: 'PUBLISHED', publishedAt: { gte: c.fromAt, lt: c.toAt } }] }, take: LANE_ROWS, orderBy: { scheduledAt: 'asc' }, select: { id: true, title: true, locale: true, status: true, scheduledAt: true, publishedAt: true } });
    return rows.map((r) => ({ id: `content:${r.id}`, lane: 'content' as const, title: words(r.title, null), starts: dayAt((r.status === 'PUBLISHED' ? r.publishedAt : r.scheduledAt)!, c.timeZone), ends: null, open: false, state: r.status === 'PUBLISHED' ? ('ended' as const) : ('scheduled' as const), detail: r.locale, href: null }));
  },
  // Social posts scheduled, or published, in the view (the social studio, S23, links here once it lands).
  async social(c) {
    const rows = await c.db.socialPost.findMany({ where: { storeId: S, OR: [{ scheduledAt: { gte: c.fromAt, lt: c.toAt } }, { publishedAt: { gte: c.fromAt, lt: c.toAt } }] }, take: LANE_ROWS, orderBy: { scheduledAt: 'asc' }, select: { id: true, kind: true, caption: true, status: true, scheduledAt: true, publishedAt: true, account: { select: { platform: true } } } });
    return rows.map((r) => {
      const at = r.publishedAt ?? r.scheduledAt!;
      const cap = r.caption?.trim().replace(/\s+/g, ' ') || r.kind;
      const state: CalendarState = r.publishedAt ? 'ended' : /fail|cancel|reject/i.test(r.status) ? 'off' : 'scheduled';
      return { id: `social:${r.id}`, lane: 'social' as const, title: words(cap.length > CAPTION_SHOWN ? `${cap.slice(0, CAPTION_SHOWN - 1)}…` : cap, null), starts: dayAt(at, c.timeZone), ends: null, open: false, state, detail: r.account.platform.toLowerCase(), href: null };
    });
  },
};

type EntryRow = { id: string; kind: string; refType: string | null; refId: string | null; title: string; titleBn: string | null; note: string | null; date: Date; endDate: Date | null; archivedAt: Date | null; updatedAt: Date };

function entryItem(r: EntryRow, today: string): CalendarItem | null {
  const own = r.kind === PLAN_KIND;
  const lane = (CALENDAR_LANES as readonly string[]).includes(r.kind) ? (r.kind as CalendarLane) : null;
  if (!lane) return null;
  const starts = dateDay(r.date);
  const ends = r.endDate ? dateDay(r.endDate) : null;
  return {
    id: own ? `plan:${r.id}` : r.refType && r.refId ? `${lane}:${r.refId}` : `${lane}:entry:${r.id}`,
    lane,
    title: words(r.title, r.titleBn),
    starts,
    ends,
    open: false,
    state: stateByDays(starts, ends ?? starts, today),
    detail: null,
    href: null,
    ...(own ? { own: { note: r.note, archived: r.archivedAt !== null } } : {}),
  };
}

/** A plan line as the page's edit form needs it. */
export interface PlanRow {
  id: string;
  title: string;
  titleBn: string | null;
  starts: string;
  ends: string | null;
  note: string | null;
  version: string;
}
const planRow = (r: EntryRow): PlanRow => ({ id: r.id, title: r.title, titleBn: r.titleBn, starts: dateDay(r.date), ends: r.endDate ? dateDay(r.endDate) : null, note: r.note, version: r.updatedAt.toISOString() });

export interface CalendarOverview {
  settings: MarketingCalendarSettings;
  card: { key: 'calendar'; value: MarketingCalendarSettings; version: string };
  timeZone: string;
  today: string;
  range: CalendarRange;
  /** Everything in the view (only while the switch is on), in day-by-day order. */
  items: CalendarItem[];
  /** How many items each lane has in the view. */
  lanes: Record<CalendarLane, number>;
  /** Campaigns with no start yet (not drawn). */
  undated: number;
  /** The owner's plan lines in the view, as the edit forms need them. */
  plans: PlanRow[];
  /** Plan lines set aside (newest first), to bring back. */
  setAside: PlanRow[];
}

const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const settingsOf = async (deps: CalendarDeps) => (await deps.resolver.value('marketing.calendar', { storeId: S })) as MarketingCalendarSettings;
const zoneOf = async (deps: CalendarDeps) => (await deps.resolver.value('store.timeZone', { storeId: S })) as string;
const ENTRY_SELECT = { id: true, kind: true, refType: true, refId: true, title: true, titleBn: true, note: true, date: true, endDate: true, archivedAt: true, updatedAt: true } as const;

/** GET: the settings and, while on, the view from `from` (the shop's today unless another day is asked for). */
export async function calendarOverview(deps: CalendarDeps, ask: { from?: unknown } = {}): Promise<CalendarOverview> {
  const now = deps.now?.() ?? new Date();
  const [settings, timeZone] = await Promise.all([settingsOf(deps), zoneOf(deps)]);
  const today = dayAt(now, timeZone);
  const range = calendarRange(today, settings.days, ask.from);
  const lanes = Object.fromEntries(CALENDAR_LANES.map((l) => [l, 0])) as Record<CalendarLane, number>;
  const base = { settings, card: { key: 'calendar' as const, value: settings, version: versionOf(settings) }, timeZone, today, range, lanes };
  if (!settings.enabled) return { ...base, items: [], undated: 0, plans: [], setAside: [] };
  const fromAt = wallToUtc(`${range.from}T00:00`, timeZone)!;
  const toAt = wallToUtc(`${addDays(range.to, 1)}T00:00`, timeZone)!;
  const ctx: CalendarSourceCtx = { db: deps.db, resolver: deps.resolver, now, timeZone, today, range, fromAt, toAt };
  const [fromSources, entries, setAside, undated] = await Promise.all([
    Promise.all(Object.values(CALENDAR_SOURCES).map((src) => src(ctx))),
    deps.db.calendarEntry.findMany({ where: { storeId: S, archivedAt: null, date: { lte: dayDate(range.to) }, OR: [{ endDate: { gte: dayDate(range.from) } }, { date: { gte: dayDate(range.from) } }] }, orderBy: { date: 'asc' }, take: LANE_ROWS, select: ENTRY_SELECT }),
    deps.db.calendarEntry.findMany({ where: { storeId: S, kind: PLAN_KIND, archivedAt: { not: null } }, orderBy: { archivedAt: 'desc' }, take: SET_ASIDE_SHOWN, select: ENTRY_SELECT }),
    deps.db.campaign.count({ where: { storeId: S, archivedAt: null, startsAt: null, status: { not: 'ENDED' } } }),
  ]);
  const seen = new Set<string>();
  const items: CalendarItem[] = [];
  for (const i of [...fromSources.flat(), ...entries.flatMap((e) => entryItem(e, today) ?? [])]) {
    if (seen.has(i.id) || !inRange(i, range)) continue;
    seen.add(i.id);
    items.push(i);
    lanes[i.lane] += 1;
  }
  items.sort(agendaOrder(range));
  return { ...base, items, undated, plans: entries.filter((e) => e.kind === PLAN_KIND).map(planRow), setAside: setAside.map(planRow) };
}

/** PUT: the settings card ({key: 'calendar', value, version}). Audited. */
export async function saveCalendarCard(deps: CalendarDeps, who: AdPlatformsWho, input: unknown): Promise<CalendarOverview['card']> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  if (o.key !== 'calendar') throw new CalendarError('INVALID_INPUT', 400, ['key']);
  const before = await settingsOf(deps);
  if (o.version !== versionOf(before)) throw new CalendarError('STALE', 409);
  const ok = marketingCalendarSettingsSchema.safeParse(o.value);
  if (!ok.success) throw new CalendarError('INVALID_INPUT', 400, [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  if (versionOf(ok.data) !== versionOf(before)) {
    await deps.resolver.set('marketing.calendar', ok.data, storeTarget(S), { actorId: who.actor.staffUserId ?? null, reason: 'Marketing › Calendar' });
    await audit(deps.db, who.actor, { storeId: S, action: 'marketingCalendar.settings', entityType: 'Setting', entityId: 'marketing.calendar', before: { ...before }, after: { ...ok.data } }, who.ctx);
  }
  return { key: 'calendar', value: ok.data, version: versionOf(ok.data) };
}

/** POST {action: plan.add | plan.update | plan.archive | plan.restore, …}: the owner's own plan lines. Audited. */
export async function calendarAction(deps: CalendarDeps, who: AdPlatformsWho, b: Record<string, unknown>): Promise<{ id: string }> {
  const action = typeof b.action === 'string' ? b.action : '';
  if (!['plan.add', 'plan.update', 'plan.archive', 'plan.restore'].includes(action)) throw new CalendarError('INVALID_INPUT', 400, ['action']);
  const settings = await settingsOf(deps);
  if (!settings.enabled && action !== 'plan.archive') throw new CalendarError('SWITCHED_OFF', 409, ['marketing.calendar']);
  const log = (id: string, after: Record<string, unknown>, before?: Record<string, unknown>) => audit(deps.db, who.actor, { storeId: S, action: `marketingCalendar.${action}`, entityType: 'CalendarEntry', entityId: id, ...(before ? { before } : {}), after }, who.ctx);
  const fields = (v: { title: string; titleBn: string | null; starts: string; ends: string | null; note: string | null }) => ({ title: v.title, titleBn: v.titleBn, date: dayDate(v.starts), endDate: v.ends ? dayDate(v.ends) : null, note: v.note });
  const shown = (v: { title: string; titleBn: string | null; starts: string; ends: string | null; note: string | null }) => ({ title: v.title, titleBn: v.titleBn, starts: v.starts, ends: v.ends, note: v.note });

  if (action === 'plan.add') {
    const p = planInput(b);
    if (!p.ok) throw new CalendarError('INVALID_INPUT', 400, p.bad);
    const row = await deps.db.calendarEntry.create({ data: { storeId: S, kind: PLAN_KIND, status: 'PLANNED', createdById: who.actor.staffUserId ?? null, ...fields(p.value) } });
    await log(row.id, shown(p.value));
    return { id: row.id };
  }
  const id = typeof b.id === 'string' && UUID_RE.test(b.id) ? b.id : null;
  const row = id ? await deps.db.calendarEntry.findFirst({ where: { id, storeId: S, kind: PLAN_KIND }, select: ENTRY_SELECT }) : null;
  if (!row) throw new CalendarError('NOT_FOUND', 404, ['id']);
  const was = planRow(row);
  if (action === 'plan.update') {
    if (row.archivedAt) throw new CalendarError('SET_ASIDE', 409, ['id']);
    if (b.version !== was.version) throw new CalendarError('STALE', 409);
    const p = planInput(b);
    if (!p.ok) throw new CalendarError('INVALID_INPUT', 400, p.bad);
    await deps.db.calendarEntry.update({ where: { id: row.id }, data: fields(p.value) });
    await log(row.id, shown(p.value), shown(was));
    return { id: row.id };
  }
  const archive = action === 'plan.archive';
  if (archive === (row.archivedAt !== null)) throw new CalendarError(archive ? 'SET_ASIDE' : 'NOT_SET_ASIDE', 409, ['id']);
  await deps.db.calendarEntry.update({ where: { id: row.id }, data: { archivedAt: archive ? (deps.now?.() ?? new Date()) : null } });
  await log(row.id, { archived: archive, title: row.title });
  return { id: row.id };
}

const answer = (e: unknown): Response => (e instanceof CalendarError ? json({ ok: false, error: e.code, details: e.details }, { status: e.status }) : errorResponse(e));

/** /api/admin/marketing/calendar — GET the view (?from=YYYY-MM-DD; `marketing.campaigns.read`); PUT the card and POST a plan-line action (`marketing.campaigns.write`). */
export async function calendarHandler(request: Request, deps: AdminDeps | null, now?: () => Date): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const b = method === 'GET' ? {} : await body(request).catch(() => ({}) as Record<string, unknown>);
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'marketing.campaigns.read' : 'marketing.campaigns.write', storeId: S });
  if (g instanceof Response) return g;
  const d: CalendarDeps = { db: deps!.db, resolver: deps!.resolver, ...(now ? { now } : {}) };
  const who = { actor: g.actor, ctx: g.ctx };
  try {
    if (method === 'GET') return json({ ok: true, ...(await calendarOverview(d, { from: new URL(request.url).searchParams.get('from') ?? undefined })) });
    if (method === 'PUT') return json({ ok: true, cards: { calendar: await saveCalendarCard(d, who, b) } });
    return json({ ok: true, ...(await calendarAction(d, who, b as Record<string, unknown>)) });
  } catch (e) {
    return answer(e);
  }
}
