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
import { createHash } from 'node:crypto';
import { AUDIENCE_WRITER_PLATFORMS, practiceAudienceWriter, type AdsPlatform, type AudienceMember, type AudienceWriter, type LookalikeSize } from '@extas/adapters';
import { audit } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { adsAudiencesSchema, lookalikeCountries, storeTarget, type AdsAudiencesSettings } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from '../admin-auth';
import { hashPhone, toMajor } from '../tracking/model';
import { AUDIENCE_KIND_LOOKALIKE } from './audience-model';
import { AudienceError, audienceOne, membersOf, type AudienceWho } from './audiences';

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

export interface AudiencesCard {
  key: 'audiences';
  value: AdsAudiencesSettings;
  version: string;
}

export async function audiencesCard(resolver: Resolver, storeId: number = S): Promise<AudiencesCard> {
  const value = await resolver.value('ads.audiences', { storeId });
  return { key: 'audiences', value, version: versionOf(value) };
}

/** PUT {key: 'audiences', value, version}: the owner's sending card (audited when it changes). */
export async function saveAudiencesCard(db: Db, resolver: Resolver, who: AudienceWho, input: unknown, storeId: number = S): Promise<AudiencesCard> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  if (o.key !== 'audiences') throw new AudienceError('INVALID_INPUT', 400, ['key']);
  const before = await resolver.value('ads.audiences', { storeId });
  if (o.version !== versionOf(before)) throw new AudienceError('STALE', 409);
  const ok = adsAudiencesSchema.safeParse(o.value);
  if (!ok.success) throw new AudienceError('INVALID_INPUT', 400, [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  if (versionOf(ok.data) !== versionOf(before)) {
    await resolver.set('ads.audiences', ok.data, storeTarget(storeId), { actorId: who.actor.staffUserId ?? null, reason: 'Marketing › Audiences' });
    await audit(db, who.actor, { storeId, action: 'marketing.audiences.settings', entityType: 'Setting', entityId: 'ads.audiences', before: { ...before }, after: { ...ok.data } }, who.ctx);
  }
  return audiencesCard(resolver, storeId);
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
        const up = await writer.upload({ externalId, name: a.name, members, valueBased });
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
  await audit(db, who.actor, { storeId, action: 'marketing.audience.push', entityType: 'Audience', entityId: id, after: { people: members.length, valueBased, results: results.map((x) => ({ platform: x.platform, account: x.account?.id ?? null, status: x.status, sent: x.sent, lookalike: x.lookalike })) } }, who.ctx);
  return results;
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
 * /api/admin/marketing/audiences/settings — GET the sending card (`marketing.audiences.read`); PUT {key, value, version}
 * (`marketing.audiences.write`).
 */
export async function audiencesSettingsHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'marketing.audiences.read' : 'marketing.audiences.write', storeId: S });
  if (g instanceof Response) return g;
  try {
    const card = method === 'GET' ? await audiencesCard(deps!.resolver) : await saveAudiencesCard(deps!.db, deps!.resolver, { actor: g.actor, ctx: g.ctx }, await body(request));
    return json({ ok: true, cards: { audiences: card } });
  } catch (e) {
    return answer(e);
  }
}
