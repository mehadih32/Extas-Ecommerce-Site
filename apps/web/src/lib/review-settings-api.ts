// S14 · PR 295 — Products › Reviews › More options: the review request card (`reviews.requests`: skip orders already
// reviewed, how many days the page counts). The request's own switch, channel, words and day stay in Messages.
//
//   GET  /api/admin/review-settings   the card with its version (`reviews.read`)
//   PUT  /api/admin/review-settings   {key, value, version} saved whole; a card changed by someone else in between is
//                                     STALE (`reviews.moderate`; audited, and in the settings change log with who)
// Nothing here moves money: the photo-review reward is not on this card.
import { createHash } from 'node:crypto';
import { audit, requirePermission, type Actor, type RequestContext } from '@extas/auth';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { reviewRequestsSchema, storeTarget } from '@extas/settings';
import { body, errorResponse, fail, guardAdmin, json, type AdminDeps } from './admin-auth';

const S = MOTHER_STORE_ID;
export const REVIEW_SETTING_KEYS = ['reviews.requests'] as const;
export type ReviewSettingKey = (typeof REVIEW_SETTING_KEYS)[number];

export interface ReviewSettingCard {
  key: ReviewSettingKey;
  value: Record<string, unknown>;
  version: string;
}

interface Who {
  actor: Actor;
  ctx: RequestContext;
}

type Deps = Pick<AdminDeps, 'db' | 'resolver'>;

class ReviewSettingsError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details: string[] = [],
  ) {
    super(code);
  }
}

const versionOf = (v: unknown): string => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** The card with its version (`reviews.read`). */
export async function reviewSettingCards(deps: Deps, who: Who): Promise<Record<ReviewSettingKey, ReviewSettingCard>> {
  await requirePermission(deps.db, who.actor, 'reviews.read', { storeId: S });
  const value = (await deps.resolver.value('reviews.requests', { storeId: S })) as unknown as Record<string, unknown>;
  return { 'reviews.requests': { key: 'reviews.requests', value, version: versionOf(value) } };
}

/** Saves the card whole (`reviews.moderate`): checked against its schema and the version the page showed; audited. */
export async function saveReviewSetting(deps: Deps, who: Who, input: unknown): Promise<Record<ReviewSettingKey, ReviewSettingCard>> {
  await requirePermission(deps.db, who.actor, 'reviews.moderate', { storeId: S });
  if (!isObj(input) || input.key !== 'reviews.requests') throw new ReviewSettingsError('INVALID_INPUT', 400, ['key']);
  const before = await deps.resolver.value('reviews.requests', { storeId: S });
  if (input.version !== versionOf(before)) throw new ReviewSettingsError('STALE', 409);
  const ok = reviewRequestsSchema.safeParse(input.value);
  if (!ok.success) throw new ReviewSettingsError('INVALID_INPUT', 400, [...new Set(ok.error.issues.map((i) => String(i.path[0] ?? 'value')))]);
  if (versionOf(ok.data) !== versionOf(before)) {
    await deps.resolver.set('reviews.requests', ok.data, storeTarget(S), { actorId: who.actor.staffUserId ?? null, reason: 'Products › Reviews › Review requests' });
    await audit(deps.db, who.actor, { storeId: S, action: 'reviews.requests.save', entityType: 'Setting', entityId: 'reviews.requests', before: { ...before }, after: { ...ok.data } }, who.ctx);
  }
  return reviewSettingCards(deps, who);
}

/** /api/admin/review-settings — GET the card (`reviews.read`), PUT it (`reviews.moderate`). */
export async function reviewSettingsHandler(request: Request, deps: AdminDeps | null): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'PUT') return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: method === 'GET' ? 'reviews.read' : 'reviews.moderate', storeId: S });
  if (g instanceof Response) return g;
  const who = { actor: g.actor, ctx: g.ctx };
  try {
    const cards = method === 'GET' ? await reviewSettingCards(deps!, who) : await saveReviewSetting(deps!, who, await body(request));
    return json({ ok: true, cards });
  } catch (e) {
    if (e instanceof ReviewSettingsError) return json({ ok: false, error: e.code, ...(e.details.length ? { details: e.details } : {}) }, { status: e.status });
    return errorResponse(e);
  }
}
