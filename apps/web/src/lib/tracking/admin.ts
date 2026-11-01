// S13 · PR 257 (Blueprint C6.2) — Marketing › Tracking: what the shop's server sent to the ad platforms.
//
// - The overview: the switch and its choices (`ads.tracking`), each platform's connection (mock or live, its last
//   test), and for the chosen days each event × platform: sent, practice copy (mock), failed and waiting; the newest
//   events with their delivery per platform. Test events are listed but never counted.
// - "Send test event": one sample event (the newest published product) to every platform in its test mode; on a mock
//   nothing leaves the shop. "Send waiting now": the waiting and failed events with attempts left, at once.
// - Seeing needs `ads.tracking.read`; changing and sending need `ads.tracking.manage`; both audited. Keys are typed on
//   Keys & connections (`vault.write`), never here. Nothing here moves money, changes a price or touches an order.
// - PR 257 follow-up (go-live gate customer 360°): the "Where an order came from" card (`ads.attribution`): keep the
//   campaign tags and ad click ids of a visit on the order, for how many days, the first or the latest visit.
import { createHash } from 'node:crypto';
import { AD_PLATFORM_CONNECTION, type AdPlatform } from '@extas/adapters';
import { audit, requirePermission, type Actor, type RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { attributionSchema, storeTarget, trackingSchema, type AttributionSettings, type TrackingSettings } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { TRACKING_EVENTS, TRACKING_PLATFORMS, type Deliveries, type DeliveryState, type StoredItem } from './model';
import { recordEvent, sendEvents, type SendOutcome, type TrackingDeps } from './service';

const S = MOTHER_STORE_ID;
/** The day windows the page offers. */
export const TRACKING_DAYS = [7, 30] as const; // hardcode-ok: the page's view choices, not a business number
/** The newest events listed. */
export const RECENT_MAX = 25; // hardcode-ok: a list length, not a business number

export class TrackingError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details?: string[],
  ) {
    super(code);
  }
}
const isTrackingError = (e: unknown): e is TrackingError => e instanceof TrackingError;

export interface TrackingWho {
  actor: Actor;
  ctx: RequestContext;
}

const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export type Counts = Record<DeliveryState, number>;
const zero = (): Counts => ({ sent: 0, mock: 0, failed: 0, waiting: 0 });

export interface PlatformLink {
  platform: AdPlatform;
  ticked: boolean;
  /** MOCK until a key is in and its test passed. */
  mode: string;
  connected: boolean;
  lastTest: { at: string; ok: boolean } | null;
}

export interface RecentEvent {
  id: string;
  eventId: string;
  name: string;
  test: boolean;
  at: string;
  valueMinor: number | null;
  currency: string | null;
  path: string | null;
  items: number;
  deliveries: Deliveries;
}

export interface TrackingOverview {
  card: { key: 'tracking'; value: TrackingSettings; version: string };
  /** PR 257 follow-up: the "Where an order came from" card. */
  attribution: { key: 'attribution'; value: AttributionSettings; version: string };
  days: number;
  platforms: PlatformLink[];
  /** Recorded per event (test events not counted). */
  recorded: Record<string, number>;
  /** event → platform → delivery state counts. */
  table: Record<string, Partial<Record<AdPlatform, Counts>>>;
  waiting: number;
  recent: RecentEvent[];
}

const pathOf = (url: string | null) => {
  if (!url) return null;
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
};

export async function trackingOverview(deps: Pick<TrackingDeps, 'db' | 'resolver'>, days: number = TRACKING_DAYS[0]): Promise<TrackingOverview> {
  const [value, attribution] = await Promise.all([deps.resolver.value('ads.tracking', { storeId: S }), deps.resolver.value('ads.attribution', { storeId: S })]);
  const now = Date.now();
  const since = new Date(now - days * 86_400_000);
  const links = await deps.db.integration.findMany({ where: { archivedAt: null, OR: TRACKING_PLATFORMS.map((p) => ({ kind: AD_PLATFORM_CONNECTION[p].kind, provider: AD_PLATFORM_CONNECTION[p].provider })) }, orderBy: { updatedAt: 'desc' } });
  const platforms = TRACKING_PLATFORMS.map((p): PlatformLink => {
    const row = links.find((r) => r.kind === AD_PLATFORM_CONNECTION[p].kind && r.provider === AD_PLATFORM_CONNECTION[p].provider && (r.storeId === S || r.storeId === null) && r.enabled);
    return { platform: p, ticked: value.platforms[p], mode: row?.mode ?? 'MOCK', connected: !!row && row.mode !== 'MOCK', lastTest: row?.lastTestAt ? { at: row.lastTestAt.toISOString(), ok: !!row.lastTestOk } : null };
  });
  const [byName, states, waiting, recentRows] = await Promise.all([
    deps.db.trackedEvent.groupBy({ by: ['name'], where: { storeId: S, test: false, occurredAt: { gte: since } }, _count: { _all: true } }),
    deps.db.$queryRaw<{ name: string; platform: string; state: string; n: number }[]>`
      SELECT e."name" AS name, d.key AS platform, d.value->>'state' AS state, count(*)::int AS n
      FROM "TrackedEvent" e, jsonb_each(e."deliveries") d
      WHERE e."storeId" = ${S} AND e."test" = false AND e."occurredAt" >= ${since}
      GROUP BY 1, 2, 3`,
    deps.db.trackedEvent.count({ where: { storeId: S, pending: true } }),
    deps.db.trackedEvent.findMany({ where: { storeId: S }, orderBy: { occurredAt: 'desc' }, take: RECENT_MAX }),
  ]);
  const recorded = Object.fromEntries(TRACKING_EVENTS.map((e) => [e, byName.find((b) => b.name === e)?._count._all ?? 0]));
  const table: TrackingOverview['table'] = Object.fromEntries(TRACKING_EVENTS.map((e) => [e, {}]));
  for (const r of states) {
    if (!(r.name in table) || !(TRACKING_PLATFORMS as readonly string[]).includes(r.platform) || !(r.state in zero())) continue;
    const cell = (table[r.name]![r.platform as AdPlatform] ??= zero());
    cell[r.state as DeliveryState] += r.n;
  }
  const recent = recentRows.map(
    (r): RecentEvent => ({
      id: r.id,
      eventId: r.eventId,
      name: r.name,
      test: r.test,
      at: r.occurredAt.toISOString(),
      valueMinor: r.valueMinor,
      currency: r.currency,
      path: pathOf(r.url),
      items: Array.isArray(r.items) ? (r.items as unknown as StoredItem[]).reduce((n, i) => n + (i.quantity ?? 0), 0) : 0,
      deliveries: (r.deliveries ?? {}) as Deliveries,
    }),
  );
  return { card: { key: 'tracking', value, version: versionOf(value) }, attribution: { key: 'attribution', value: attribution, version: versionOf(attribution) }, days, platforms, recorded, table, waiting, recent };
}

/** PR 257 follow-up: PUT {key: 'attribution', value, version} — where an order came from (audited). */
async function saveAttribution(deps: TrackingDeps, who: TrackingWho, input: { value?: unknown; version?: unknown }): Promise<TrackingOverview> {
  const before = await deps.resolver.value('ads.attribution', { storeId: S });
  if (input.version !== versionOf(before)) throw new TrackingError('STALE', 409);
  const ok = attributionSchema.safeParse(input.value);
  if (!ok.success) throw new TrackingError('INVALID_INPUT', 400, [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  if (versionOf(ok.data) !== versionOf(before)) {
    await deps.resolver.set('ads.attribution', ok.data, storeTarget(S), { actorId: who.actor.staffUserId ?? null, reason: 'Marketing › Tracking' });
    await audit(deps.db, who.actor, { storeId: S, action: 'ads.tracking.attribution', entityType: 'Setting', entityId: 'ads.attribution', before: { ...before }, after: { ...ok.data } }, who.ctx);
  }
  return trackingOverview(deps);
}

/** PUT {key: 'tracking', value, version}: the switch, the events, the platforms, matching and attempts (audited). */
export async function saveTracking(deps: TrackingDeps, who: TrackingWho, input: unknown): Promise<TrackingOverview> {
  await requirePermission(deps.db, who.actor, 'ads.tracking.manage', { storeId: S });
  if (isObj(input) && input.key === 'attribution') return saveAttribution(deps, who, input);
  if (!isObj(input) || input.key !== 'tracking') throw new TrackingError('INVALID_INPUT', 400, ['key']);
  const before = await deps.resolver.value('ads.tracking', { storeId: S });
  if (input.version !== versionOf(before)) throw new TrackingError('STALE', 409);
  const ok = trackingSchema.safeParse(input.value);
  if (!ok.success) throw new TrackingError('INVALID_INPUT', 400, [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  if (versionOf(ok.data) !== versionOf(before)) {
    await deps.resolver.set('ads.tracking', ok.data, storeTarget(S), { actorId: who.actor.staffUserId ?? null, reason: 'Marketing › Tracking' });
    await audit(deps.db, who.actor, { storeId: S, action: 'ads.tracking.settings', entityType: 'Setting', entityId: 'ads.tracking', before: { ...before }, after: { ...ok.data } }, who.ctx);
  }
  return trackingOverview(deps);
}

/** A sample of the shop's own: the newest published product at its lowest live price (else a plain test item). */
async function sampleItems(deps: TrackingDeps): Promise<StoredItem[]> {
  const p = await deps.db.product.findFirst({
    where: { storeId: S, status: 'PUBLISHED', archivedAt: null },
    orderBy: { publishedAt: 'desc' },
    select: { id: true, nameEn: true, category: { select: { nameEn: true } }, variants: { where: { active: true, archivedAt: null, priceMinor: { not: null } }, orderBy: { priceMinor: 'asc' }, take: 1, select: { sku: true, priceMinor: true } } },
  });
  if (!p) return [{ id: 'test-item', sku: null, name: 'Test item', category: null, colour: null, size: null, quantity: 1, priceMinor: null }];
  return [{ id: p.id, sku: p.variants[0]?.sku ?? null, name: p.nameEn, category: p.category?.nameEn ?? null, colour: null, size: null, quantity: 1, priceMinor: p.variants[0]?.priceMinor ?? null }];
}

export interface ActionAnswer {
  overview: TrackingOverview;
  outcome: SendOutcome;
}

/** POST {action: 'test', event?} — one test event to every platform; {action: 'send'} — the waiting ones now. */
export async function trackingAction(deps: TrackingDeps, who: TrackingWho, input: unknown, origin: string | null): Promise<ActionAnswer> {
  await requirePermission(deps.db, who.actor, 'ads.tracking.manage', { storeId: S });
  if (!isObj(input) || (input.action !== 'test' && input.action !== 'send')) throw new TrackingError('INVALID_INPUT', 400, ['action']);
  if (input.action === 'send') {
    const outcome = await sendEvents(deps, { storeId: S });
    await audit(deps.db, who.actor, { storeId: S, action: 'ads.tracking.send', entityType: 'TrackedEvent', entityId: 'waiting', after: { events: outcome.events } }, who.ctx);
    return { overview: await trackingOverview(deps), outcome };
  }
  const name = input.event === undefined ? 'purchase' : input.event;
  if (typeof name !== 'string' || !(TRACKING_EVENTS as readonly string[]).includes(name)) throw new TrackingError('INVALID_INPUT', 400, ['event']);
  const r = await recordEvent(deps, {
    storeId: S,
    name: name as (typeof TRACKING_EVENTS)[number],
    url: origin ? `${origin}/` : null,
    items: await sampleItems(deps),
    shopper: { visitorId: `admin-test-${who.actor.staffUserId ?? 'system'}` },
    test: true,
    platforms: TRACKING_PLATFORMS,
  });
  const outcome = r.id ? await sendEvents(deps, { ids: [r.id] }) : { platforms: {}, events: 0 };
  await audit(deps.db, who.actor, { storeId: S, action: 'ads.tracking.test', entityType: 'TrackedEvent', entityId: r.id ?? 'none', after: { event: name, platforms: Object.keys(outcome.platforms) } }, who.ctx);
  return { overview: await trackingOverview(deps), outcome };
}

const answer = (e: unknown): Response => (isTrackingError(e) ? json({ ok: false, error: e.code, details: e.details }, { status: e.status }) : errorResponse(e));
const reply = (o: TrackingOverview, outcome?: SendOutcome) => json({ ok: true, overview: o, cards: { tracking: o.card, attribution: o.attribution }, ...(outcome ? { outcome } : {}) });

/**
 * /api/admin/marketing/tracking — GET the overview (`ads.tracking.read`; `?days=7|30`), PUT the settings card, POST a
 * test event or "send waiting now" (`ads.tracking.manage`). The service checks each permission again.
 */
export async function trackingHandler(request: Request, deps: AdminDeps | null, origin: string | null, extra: Partial<TrackingDeps> = {}): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'POST' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'ads.tracking.read' : 'ads.tracking.manage', storeId: S });
  if (g instanceof Response) return g;
  const d: TrackingDeps = { db: deps!.db, resolver: deps!.resolver, vault: deps!.vault, ...extra };
  const who = { actor: g.actor, ctx: g.ctx };
  try {
    if (method === 'GET') {
      const days = Number(new URL(request.url).searchParams.get('days'));
      return reply(await trackingOverview(d, (TRACKING_DAYS as readonly number[]).includes(days) ? days : TRACKING_DAYS[0]));
    }
    if (method === 'PUT') return reply(await saveTracking(d, who, await body(request)));
    const a = await trackingAction(d, who, await body(request), origin);
    return reply(a.overview, a.outcome);
  } catch (e) {
    return answer(e);
  }
}
