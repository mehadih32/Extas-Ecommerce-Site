// S13 · PR 263 (Blueprint C6.2 points 3 and 5, demo 97x-adm2-marketing.js "Ads › Audiences") — sending a saved audience
// to the ad platforms: its people as hashed phone numbers to each ad account the shop has read (Marketing › Ad
// platforms), and for a lookalike audience its seed as a value-based list (each person's delivered sales) with the
// platform's lookalike drawn from it.
//
// - Off as it ships (`ads.audiences.push`): "Send now" refuses and nothing leaves the shop. The owner's settings card
//   sits on Marketing › Audiences: the switch, the lookalike's countries and size per platform (empty = no lookalike
//   is made) and the fewest people a list must hold for each platform (0 = no floor).
// - A number leaves the shop only as sha256 hashes (tracking/model.ts `hashPhone`), and the list is never stored: the
//   shop keeps one AudienceSync row per ad account (status, how many were sent, when, the platform's ids and its last
//   refusal in words).
// - The writers are practice copies for now (A1.3): they answer like the platform and send nothing, and the shop saves
//   no platform id from them. A platform with no ad account read yet is shown as a practice send too.
// - Nothing here changes a budget, a bid or a campaign (rule 6), moves money or touches an order. Sending and the card
//   need `marketing.audiences.write`; both are audited (marketing.audience.push, marketing.audiences.settings) with
//   counts only — never a number or a hash.
// - PR 264: the exclusion audience (people who refused a parcel) is sent the same way, marked as an exclusion, only while
//   both `ads.audiences.push` and `ads.refusedExclude.on` are on; its card and the daily refresh's card
//   (`ads.audienceRefresh`) sit beside the sending card. The daily refresh (`refreshAudiences`) is called by the
//   background worker once a day through the server-only hook /api/internal/audiences/refresh (the server's internal
//   token, CACHE_HOOK_TOKEN; Caddy answers 404 to /api/internal/ from outside): every live audience counted again, and
//   the ones already sent to a real ad account sent again, plus the exclusion list.
import { createHash, timingSafeEqual } from 'node:crypto';
import { AUDIENCE_WRITER_PLATFORMS, practiceAudienceWriter, type AdsPlatform, type AudienceMember, type AudienceWriter, type LookalikeSize } from '@extas/adapters';
import { audit, SYSTEM } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { adsAudienceRefreshSchema, adsAudiencesSchema, adsRefusedExcludeSchema, lookalikeCountries, storeTarget, type AdsAudiencesSettings } from '@extas/settings';
import en from '../../../messages/admin-audiences.en.json';
import { adminDeps, body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { hashPhone, toMajor } from '../tracking/model';
import { AUDIENCE_KIND_EXCLUSION, AUDIENCE_KIND_LOOKALIKE } from './audience-model';
import { AudienceError, audienceOne, ensureExclusionAudience, membersOf, recountAudiences, type AudienceWho } from './audiences';

const S = MOTHER_STORE_ID;
const ENUM: Record<AdsPlatform, 'META' | 'GOOGLE' | 'TIKTOK'> = { meta: 'META', google: 'GOOGLE', tiktok: 'TIKTOK' };
const FROM_ENUM: Record<string, AdsPlatform> = { META: 'meta', GOOGLE: 'google', TIKTOK: 'tiktok' };
/** A platform's refusal kept on the row, in words. */
const ERROR_MAX = 200; // hardcode-ok: a stored text's length, not a business number

type Db = PrismaClient;
type Resolver = AdminDeps['resolver'];

export interface PushDeps {
  db: Db;
  resolver: Resolver;
  /** Tests pass their own writers (a stand-in platform); otherwise each platform's practice writer. */
  writers?: Partial<Record<AdsPlatform, AudienceWriter>>;
  now?: () => Date;
}

export type PushStatus = 'SENT' | 'PRACTICE' | 'TOO_SMALL' | 'FAILED';
export type LookalikeStatus = 'MADE' | 'NO_SIZE' | 'NO_COUNTRY' | 'FAILED';
export interface PushResult {
  platform: AdsPlatform;
  /** The ad account (null: none read yet, so a practice send). */
  account: { id: string; name: string } | null;
  status: PushStatus;
  sent: number;
  lookalike: LookalikeStatus | null;
  error: string | null;
}

export interface AudienceSyncRow {
  platform: AdsPlatform;
  account: string;
  status: string;
  memberCount: number | null;
  syncedAt: string | null;
  lookalike: boolean;
  lastError: string | null;
}

const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);

/** The cards on Marketing › Audiences and the setting each one saves (PR 264 adds the exclusion list and the refresh). */
const CARDS = {
  audiences: { setting: 'ads.audiences', schema: adsAudiencesSchema },
  refused: { setting: 'ads.refusedExclude', schema: adsRefusedExcludeSchema },
  refresh: { setting: 'ads.audienceRefresh', schema: adsAudienceRefreshSchema },
} as const;
export type AudienceCardKey = keyof typeof CARDS;
type CardValue<K extends AudienceCardKey> = ReturnType<(typeof CARDS)[K]['schema']['parse']>;

export interface AudiencesCard<K extends AudienceCardKey = 'audiences'> {
  key: K;
  value: CardValue<K>;
  version: string;
}

/** One card at its version. */
export async function audienceCard<K extends AudienceCardKey>(resolver: Resolver, key: K, storeId: number = S): Promise<AudiencesCard<K>> {
  const value = (await resolver.value(CARDS[key].setting, { storeId })) as CardValue<K>;
  return { key, value, version: versionOf(value) };
}

export const audiencesCard = (resolver: Resolver, storeId: number = S) => audienceCard(resolver, 'audiences', storeId);

/** PR 264: the name the exclusion audience is made with (the shop's words; the page shows it in the reader's language). */
export const EXCLUSION_NAME: string = en.au.excl.name;

/**
 * PR 264: the store's exclusion audience, made when there is none yet and counted when it never was (or `recount`).
 * Marketing › Audiences calls it so the list always shows the exclusion line, on or off.
 */
export async function exclusionAudience(db: Db, resolver: Resolver, storeId: number = S, opts: { recount?: boolean; now?: Date } = {}): Promise<{ id: string }> {
  const ex = await ensureExclusionAudience(db, EXCLUSION_NAME, storeId);
  const row = await db.audience.findUniqueOrThrow({ where: { id: ex.id }, select: { lastBuiltAt: true } });
  if (opts.recount || !row.lastBuiltAt) {
    const now = opts.now ?? new Date();
    const { people } = await membersOf(db, resolver, { kind: AUDIENCE_KIND_EXCLUSION, definition: null }, now, storeId);
    await db.audience.update({ where: { id: ex.id }, data: { size: people.size, lastBuiltAt: now } });
  }
  return ex;
}

/**
 * PUT {key, value, version}: one of the owner's cards (audited when it changes). PR 264: turning the exclusion list on
 * counts the shop's exclusion audience again (making it when there is none yet).
 */
export async function saveAudiencesCard(db: Db, resolver: Resolver, who: AudienceWho, input: unknown, storeId: number = S, now: Date = new Date()): Promise<AudiencesCard<AudienceCardKey>> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const key = typeof o.key === 'string' && Object.hasOwn(CARDS, o.key) ? (o.key as AudienceCardKey) : null;
  if (!key) throw new AudienceError('INVALID_INPUT', 400, ['key']);
  const { setting, schema } = CARDS[key];
  const before = await resolver.value(setting, { storeId });
  if (o.version !== versionOf(before)) throw new AudienceError('STALE', 409);
  const ok = schema.safeParse(o.value);
  if (!ok.success) throw new AudienceError('INVALID_INPUT', 400, [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  if (versionOf(ok.data) !== versionOf(before)) {
    await resolver.set(setting, ok.data as never, storeTarget(storeId), { actorId: who.actor.staffUserId ?? null, reason: 'Marketing › Audiences' });
    await audit(db, who.actor, { storeId, action: 'marketing.audiences.settings', entityType: 'Setting', entityId: setting, before: { ...before }, after: { ...ok.data } }, who.ctx);
    // the exclusion card changes who is on the list: count it again now
    if (key === 'refused') await exclusionAudience(db, resolver, storeId, { recount: true, now });
  }
  return audienceCard(resolver, key, storeId);
}

/** What one platform takes from the owner's card: its floor and its lookalike's size. */
function platformCard(s: AdsAudiencesSettings, p: AdsPlatform): { floor: number; percent: number | null; size: LookalikeSize | null } {
  if (p === 'meta') return { floor: s.minMeta, percent: s.metaPercent || null, size: null };
  const size = (p === 'google' ? s.googleSize : s.tiktokSize) || null;
  return { floor: p === 'google' ? s.minGoogle : s.minTiktok, percent: null, size };
}

/** The audience's sends so far, one row per ad account (newest first). */
export async function audienceSyncs(db: Db, audienceId: string, storeId: number = S): Promise<AudienceSyncRow[]> {
  const rows = await db.audienceSync.findMany({ where: { storeId, audienceId }, orderBy: { updatedAt: 'desc' }, select: { adAccountId: true, status: true, memberCount: true, syncedAt: true, lookalikeExternalId: true, lastError: true } });
  const accounts = rows.length ? await db.adAccount.findMany({ where: { storeId, id: { in: rows.map((r) => r.adAccountId) } }, select: { id: true, name: true, platform: true } }) : [];
  const byId = new Map(accounts.map((a) => [a.id, a]));
  return rows.flatMap((r) => {
    const a = byId.get(r.adAccountId);
    return a ? [{ platform: FROM_ENUM[a.platform] ?? 'meta', account: a.name, status: r.status, memberCount: r.memberCount, syncedAt: r.syncedAt?.toISOString() ?? null, lookalike: !!r.lookalikeExternalId, lastError: r.lastError }] : [];
  });
}

/**
 * "Send now": the audience (at the version it was read at) to every ad account of each platform, or to the platform's
 * practice copy where no account is read yet. Refused while the switch is off.
 */
export async function pushAudience(deps: PushDeps, who: AudienceWho, id: string, input: unknown, storeId: number = S): Promise<PushResult[]> {
  const { db, resolver } = deps;
  const now = deps.now?.() ?? new Date();
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const settings = await resolver.value('ads.audiences', { storeId });
  if (!settings.push) throw new AudienceError('SWITCH_OFF', 409);
  const a = await audienceOne(db, id, storeId);
  if (!a) throw new AudienceError('NOT_FOUND', 404);
  if (a.version !== o.version) throw new AudienceError('STALE', 409);
  if (a.state === 'ARCHIVED') throw new AudienceError('ARCHIVED', 409);
  const raw = await db.audience.findUniqueOrThrow({ where: { id }, select: { kind: true, definition: true } });
  const exclusion = raw.kind === AUDIENCE_KIND_EXCLUSION;
  // PR 264: the exclusion list leaves the shop only while its own switch is on too
  if (exclusion && !(await resolver.value('ads.refusedExclude', { storeId })).on) throw new AudienceError('EXCLUDE_OFF', 409);
  const [{ people, valueBased }, currency] = await Promise.all([membersOf(db, resolver, raw, now, storeId), resolver.value('store.currency', { storeId })]);
  const members: AudienceMember[] = [];
  for (const [phone, value] of people) {
    const h = hashPhone(phone);
    if (h) members.push({ ...h, value: value == null ? null : toMajor(value, currency) });
  }
  // an empty list is never sent (the platforms refuse it, and an empty lookalike seed means nothing)
  if (!members.length) throw new AudienceError('EMPTY', 409);
  const isLookalike = raw.kind === AUDIENCE_KIND_LOOKALIKE;
  const countries = lookalikeCountries(settings);
  const accounts = await db.adAccount.findMany({ where: { storeId, archivedAt: null }, orderBy: { createdAt: 'asc' }, select: { id: true, name: true, platform: true } });
  const results: PushResult[] = [];

  for (const platform of AUDIENCE_WRITER_PLATFORMS) {
    const writer = deps.writers?.[platform] ?? practiceAudienceWriter(platform);
    const card = platformCard(settings, platform);
    const own = accounts.filter((x) => x.platform === ENUM[platform]);
    for (const acc of own.length ? own : [null]) {
      // the shop keeps a row only for a real account sent through a live writer
      const keep = !!acc && !writer.practice;
      const prev = keep ? await db.audienceSync.findUnique({ where: { audienceId_adAccountId: { audienceId: id, adAccountId: acc.id } }, select: { externalAudienceId: true, lookalikeExternalId: true } }) : null;
      const r: PushResult = { platform, account: acc ? { id: acc.id, name: acc.name } : null, status: 'SENT', sent: 0, lookalike: null, error: null };
      let externalId = prev?.externalAudienceId ?? null;
      let lookalikeId = prev?.lookalikeExternalId ?? null;
      if (card.floor > 0 && members.length < card.floor) r.status = 'TOO_SMALL';
      else {
        const up = await writer.upload({ externalId, name: a.name, members, valueBased, exclusion });
        if (!up.ok) {
          r.status = 'FAILED';
          r.error = up.error.slice(0, ERROR_MAX);
        } else {
          r.sent = up.value.sent;
          externalId = up.value.externalId;
          if (writer.practice) r.status = 'PRACTICE';
          if (isLookalike) {
            if (!countries.length) r.lookalike = 'NO_COUNTRY';
            else if (!card.percent && !card.size) r.lookalike = 'NO_SIZE';
            else if (lookalikeId) r.lookalike = 'MADE'; // drawn once; the platform follows its seed list as it changes
            else {
              const lal = await writer.lookalike({ seedExternalId: externalId, name: a.name, spec: { percent: card.percent, size: card.size, countries } });
              if (lal.ok) {
                r.lookalike = 'MADE';
                lookalikeId = lal.value.externalId;
              } else {
                r.lookalike = 'FAILED';
                r.error = lal.error.slice(0, ERROR_MAX);
              }
            }
          }
        }
      }
      results.push(r);
      if (keep) {
        const sentNow = r.status === 'SENT';
        const data = { status: r.status, memberCount: sentNow ? r.sent : members.length, lastError: r.error, externalAudienceId: externalId, lookalikeExternalId: lookalikeId, ...(sentNow ? { syncedAt: now } : {}) };
        await db.audienceSync.upsert({ where: { audienceId_adAccountId: { audienceId: id, adAccountId: acc.id } }, create: { storeId, audienceId: id, adAccountId: acc.id, ...data }, update: data });
      }
    }
  }
  await audit(db, who.actor, { storeId, action: 'marketing.audience.push', entityType: 'Audience', entityId: id, after: { people: members.length, valueBased, exclusion, results: results.map((x) => ({ platform: x.platform, account: x.account?.id ?? null, status: x.status, sent: x.sent, lookalike: x.lookalike })) } }, who.ctx);
  return results;
}

export interface RefreshResult {
  /** Off (`ads.audienceRefresh`): nothing was counted or sent. */
  skipped: 'off' | null;
  counted: number;
  /** Each audience sent again: its sends, or why it was not sent (switch off, empty …). */
  sent: { id: string; results: PushResult[] | null; error: string | null }[];
}

/**
 * PR 264 — the daily refresh (the worker, once a day from the owner's hour): every live audience counted again; while
 * sending is on, the audiences already sent to a real ad account sent again, and the exclusion list while it is on.
 * Practice sends keep no row, so before the keys are in only the exclusion list is sent (as practice).
 */
export async function refreshAudiences(deps: PushDeps, storeId: number = S): Promise<RefreshResult> {
  const { db, resolver } = deps;
  const now = deps.now?.() ?? new Date();
  const [refresh, sending, refused] = await Promise.all([resolver.value('ads.audienceRefresh', { storeId }), resolver.value('ads.audiences', { storeId }), resolver.value('ads.refusedExclude', { storeId })]);
  if (!refresh.on) return { skipped: 'off', counted: 0, sent: [] };
  const ex = refused.on ? await exclusionAudience(db, resolver, storeId, { now }) : null;
  const counted = await recountAudiences(db, resolver, now, storeId);
  const sent: RefreshResult['sent'] = [];
  if (!sending.push) return { skipped: null, counted, sent };
  const synced = await db.audienceSync.findMany({ where: { storeId, audience: { archivedAt: null } }, distinct: ['audienceId'], select: { audienceId: true } });
  const ids = [...new Set([...(ex ? [ex.id] : []), ...synced.map((r) => r.audienceId)])];
  const who: AudienceWho = { actor: SYSTEM, ctx: { source: 'audience-refresh' } };
  for (const id of ids) {
    const a = await audienceOne(db, id, storeId);
    if (!a) continue;
    try {
      sent.push({ id, results: await pushAudience(deps, who, id, { version: a.version }, storeId), error: null });
    } catch (e) {
      if (!(e instanceof AudienceError)) throw e;
      sent.push({ id, results: null, error: e.code });
    }
  }
  return { skipped: null, counted, sent };
}

/** The server's internal token (CACHE_HOOK_TOKEN), compared in constant time; none set = never. */
export function internalCaller(request: Request): boolean {
  const token = process.env.CACHE_HOOK_TOKEN ?? '';
  const sent = request.headers.get('x-extas-cache-hook') ?? '';
  return token.length >= 32 && sent.length === token.length && timingSafeEqual(Buffer.from(sent), Buffer.from(token));
}

/**
 * /api/internal/audiences/refresh — POST {storeId?} from the background worker with the server's internal token
 * (CACHE_HOOK_TOKEN in `x-extas-cache-hook`); without it the answer is "not found". Counts only in the answer.
 */
export async function audienceRefreshHook(request: Request, deps: AdminDeps | null = adminDeps()): Promise<Response> {
  if (request.method.toUpperCase() !== 'POST' || !internalCaller(request)) return fail(404, 'not-found');
  if (!deps) return fail(503, 'database-not-configured');
  try {
    const o = await body(request);
    const storeId = Number.isInteger(o.storeId) && (o.storeId as number) > 0 ? (o.storeId as number) : S;
    const r = await refreshAudiences({ db: deps.db, resolver: deps.resolver }, storeId);
    return json({ ok: true, skipped: r.skipped, counted: r.counted, sent: r.sent.map((x) => ({ id: x.id, error: x.error, statuses: x.results?.map((p) => p.status) ?? [] })) });
  } catch (e) {
    return errorResponse(e);
  }
}

const answer = (e: unknown): Response => (e instanceof AudienceError ? json({ ok: false, error: e.code, ...(e.details ? { details: e.details } : {}) }, { status: e.status }) : errorResponse(e));

/** /api/admin/marketing/audiences/<id>/push — POST {version}: "Send now" (`marketing.audiences.write`). */
export async function audiencePushHandler(request: Request, deps: AdminDeps | null, id: string): Promise<Response> {
  if (request.method.toUpperCase() !== 'POST') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: 'marketing.audiences.write', storeId: S });
  if (g instanceof Response) return g;
  try {
    const results = await pushAudience({ db: deps!.db, resolver: deps!.resolver }, { actor: g.actor, ctx: g.ctx }, id, await body(request));
    return json({ ok: true, results });
  } catch (e) {
    return answer(e);
  }
}

/**
 * /api/admin/marketing/audiences/settings — GET the cards (sending, PR 264 exclusion list and daily refresh) (`marketing.audiences.read`); PUT {key, value, version}
 * (`marketing.audiences.write`).
 */
export async function audiencesSettingsHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'marketing.audiences.read' : 'marketing.audiences.write', storeId: S });
  if (g instanceof Response) return g;
  try {
    if (method === 'GET') {
      const [audiences, refused, refresh] = await Promise.all([audienceCard(deps!.resolver, 'audiences'), audienceCard(deps!.resolver, 'refused'), audienceCard(deps!.resolver, 'refresh')]);
      return json({ ok: true, cards: { audiences, refused, refresh } });
    }
    const card = await saveAudiencesCard(deps!.db, deps!.resolver, { actor: g.actor, ctx: g.ctx }, await body(request));
    return json({ ok: true, cards: { [card.key]: card } });
  } catch (e) {
    return answer(e);
  }
}
