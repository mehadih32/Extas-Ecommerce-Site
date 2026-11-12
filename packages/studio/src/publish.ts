// S23 · PR 440–442 (Blueprint C5.1, C5.3, C5.5 point 3 "Publishing adapters …", point 4 "Content calendar, approval
// queue, auto-schedule rules, per-platform limits") — turns a finished render job (PR 439) into a `SocialPost` on
// one of the store's accounts (PR 437), through `@extas/adapters/social-publish`'s adapters: Facebook, Instagram
// (PR 440) and now TikTok (PR 441, its photo mode — draft or direct by the account's own `directPostApproved` flag,
// read fresh at run time so a mid-queue owner decision is honoured). YouTube has a real connection (Keys &
// connections can test it) but no honest way to post a photo as a video yet, so an account on that platform still
// refuses here (`NOT_SUPPORTED`), with a reason naming why rather than "no adapter".
//
// Automatic vs queued (Blueprint C5.3, CLAUDE.md rule 2/6 — nothing goes out without the owner's OK by default):
// every new account ships `requireApproval: true` (PR 437), so by default a post made here is only queued, status
// `PENDING_APPROVAL`, with its own `AiApprovalRequest` row (the shared table every other AI 360 proposal uses —
// `growth-agent.ts`'s own `GROWTH_KIND` is the closest precedent) so it can be cleared from a central queue once one
// exists, and nothing reaches the adapter at all; `decideSocialPost` below (PR 442, `studio.approve`) is that
// clearing step. Only once the owner has explicitly switched an account to run free does a post publish itself,
// right away (or at its chosen time — PR 442's own `scheduledAt`), and only then does the caller also need
// `studio.publish` on top of `studio.generate` (queuing itself only ever needs `studio.generate`, the same
// permission that already queues and runs a render job).
//
// PR 442 also gives the calendar its own two moving parts: a post may carry a future `scheduledAt` (set at queue
// time, or changed after with `rescheduleSocialPost`), turning it `SCHEDULED` instead of `PUBLISHING` the moment it
// is cleared to go; and `publishDuePosts` is the explicit "run what is due now" step a person (or, once a worker
// exists, a cron slot — the same honest gap `@extas/jobs`'s other "ready for the worker" functions carry) presses to
// actually send every `SCHEDULED` post whose time has come, the same SCHEDULED → sending shape
// `@extas/customers`'s `runEmailSends` already uses for e-mail broadcasts. And every path that lets a post actually
// go out — queuing free, approving, running due — checks the account's own daily limit (PR 437's `dailyLimit`) and,
// for Instagram, the platform's own published ceiling too (Blueprint C5.1: "~50 posts / 24h"), never silently.
//
// Honest scope, unchanged from PR 439: the render job's own output is a single existing product photo, so every
// post this function makes is that one photo — Facebook's single-photo post, or Instagram's media-container flow
// for one image — whatever the template's own kind (image, reel, short, story). A real reel, Story or carousel
// needs a real video or several images; that is wired in once the compositor exists, without changing this
// function's shape.
import { z } from 'zod';
import type { Prisma } from '@extas/db/client';
import type { SocialPublisher } from '@extas/adapters';
import { allow, checkStoreId, logChange, nowOf, parse, setting, StudioError, type StudioDeps, type Who } from './context';
import type { StudioPlatform } from './accounts';
import { dayStart, nextDay, ymdIn } from './daykey';

/** The platforms the studio can actually post a photo to today (PR 440, PR 441). YouTube stays out: see above. */
export const PUBLISHABLE_PLATFORMS = ['facebook', 'instagram', 'tiktok'] as const satisfies readonly StudioPlatform[];
export type PublishablePlatform = (typeof PUBLISHABLE_PLATFORMS)[number];

/** The honest reason a YouTube account refuses before a post is even queued (PR 441; see social-publish's header). */
const YOUTUBE_NOT_YET = 'YouTube needs a real video; the studio makes a preview photo until the video engine is built';

export const queuePostInput = z
  .object({
    renderJobId: z.uuid(),
    accountId: z.uuid(),
    caption: z.string().trim().min(1).max(2200).optional(),
    // PR 442: a future moment to hold the post for (the calendar). Absent/undefined = as soon as it is cleared.
    scheduledAt: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();
export type QueuePostInput = z.infer<typeof queuePostInput>;

export type SocialPostStatus = 'PENDING_APPROVAL' | 'SCHEDULED' | 'PUBLISHING' | 'SUCCEEDED' | 'FAILED' | 'REJECTED';

export interface SocialPostRow {
  id: string;
  accountId: string;
  platform: PublishablePlatform;
  kind: string;
  caption: string | null;
  mediaAssetIds: string[];
  status: SocialPostStatus;
  scheduledAt: string | null;
  approvalRequestId: string | null;
  externalPostId: string | null;
  publishedAt: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

type PostRow = {
  id: string;
  accountId: string;
  account: { platform: string };
  kind: string;
  caption: string | null;
  mediaAssetIds: string[];
  status: string;
  scheduledAt: Date | null;
  approvalRequestId: string | null;
  externalPostId: string | null;
  publishedAt: Date | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function rowOf(p: PostRow): SocialPostRow {
  return {
    id: p.id,
    accountId: p.accountId,
    platform: p.account.platform as PublishablePlatform,
    kind: p.kind,
    caption: p.caption,
    mediaAssetIds: p.mediaAssetIds,
    status: p.status as SocialPostStatus,
    scheduledAt: p.scheduledAt?.toISOString() ?? null,
    approvalRequestId: p.approvalRequestId,
    externalPostId: p.externalPostId,
    publishedAt: p.publishedAt?.toISOString() ?? null,
    error: p.error,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

/** Blueprint C5.1: Instagram's own API ceiling (~50 posts/24h) on top of whatever the owner sets as `dailyLimit`.
 * hardcode-ok: a platform's own technical fact, not a business policy (CN-018 is about policy numbers). */
const PLATFORM_DAILY_CAP: Partial<Record<PublishablePlatform, number>> = { instagram: 50 };

/**
 * Refuses (`DAILY_LIMIT`) when the account already has, for the store's own calendar day `at` falls on, as many
 * `SCHEDULED`/`PUBLISHING`/`SUCCEEDED` posts as its own `dailyLimit` (PR 437) or the platform's own ceiling allows —
 * whichever is lower. `excludePostId` leaves one post's own existing row out of the count (rescheduling it within
 * the same day must not count itself twice).
 */
async function assertDailyLimitOk(deps: StudioDeps, who: Who, account: { id: string; platform: string; dailyLimit: number | null }, at: Date, excludePostId?: string): Promise<void> {
  const cap = Math.min(account.dailyLimit ?? Infinity, PLATFORM_DAILY_CAP[account.platform as PublishablePlatform] ?? Infinity);
  if (!Number.isFinite(cap)) return;
  const tz = await setting(deps, who.storeId, 'store.timeZone');
  const day = ymdIn(at, tz);
  const from = dayStart(day, tz);
  const to = dayStart(nextDay(day), tz);
  const count = await deps.db.socialPost.count({
    where: {
      storeId: who.storeId,
      accountId: account.id,
      ...(excludePostId ? { id: { not: excludePostId } } : {}),
      status: { in: ['SCHEDULED', 'PUBLISHING', 'SUCCEEDED'] },
      OR: [{ scheduledAt: { gte: from, lt: to } }, { scheduledAt: null, publishedAt: { gte: from, lt: to } }, { scheduledAt: null, publishedAt: null, updatedAt: { gte: from, lt: to } }],
    },
  });
  if (count >= cap) throw new StudioError('DAILY_LIMIT', `this account's daily limit (${cap}) for ${day} is already reached`, ['accountId']);
}

/** Parses a future `scheduledAt`; `undefined`/`null` stays `null` (run as soon as it is cleared). */
function parseScheduledAt(deps: Pick<StudioDeps, 'now'>, raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const at = new Date(raw);
  if (at.getTime() < nowOf(deps).getTime() - 60_000) throw new StudioError('INVALID_INPUT', 'the time has passed', ['scheduledAt']);
  return at;
}

/** The store's posts (`studio.read`), newest first. */
export async function studioSocialPosts(deps: StudioDeps, who: Who): Promise<SocialPostRow[]> {
  await allow(deps, who, 'studio.read');
  const rows = await deps.db.socialPost.findMany({ where: { storeId: who.storeId }, include: { account: { select: { platform: true } } }, orderBy: { createdAt: 'desc' } });
  return rows.map(rowOf);
}

/** Resolves this store's publishing adapter for a platform (MOCK until a real key passes Test — A1.3). */
export interface PublisherResolver {
  resolve(storeId: number, platform: PublishablePlatform): Promise<{ api: SocialPublisher; mode: 'MOCK' | 'SANDBOX' | 'LIVE' }>;
}

export interface PublishDeps extends StudioDeps {
  publisher: PublisherResolver;
  /** A public https address Meta can fetch the photo from (the shop's own media URL for this asset, if any). */
  publicUrlOf(assetId: string): Promise<string | null>;
}

/**
 * Queues a post from a finished render job onto one account (`studio.generate`; an account set to run free also
 * needs `studio.publish` before its post can even be queued — CLAUDE.md rule 6, nobody who can only draft may make
 * one go out unsupervised). Nothing is sent here: a `PENDING_APPROVAL` post waits for PR 442's queue, and a
 * `PUBLISHING` one (the account runs free) waits for the explicit `runSocialPost` below, the same two-step shape
 * as PR 439's render job. Refuses a render job that has not `SUCCEEDED` yet (`WRONG_STATE`), an account outside
 * this store or archived/switched off (`NOT_FOUND`/`ACCOUNT_OFF`), and a platform with no adapter yet
 * (`NOT_SUPPORTED`, PR 441).
 */
export async function queueSocialPost(deps: PublishDeps, who: Who, input: unknown): Promise<SocialPostRow> {
  await allow(deps, who, 'studio.generate');
  checkStoreId(who.storeId);
  const d = parse(queuePostInput, input, 'post');
  const job = await deps.db.socialRenderJob.findFirst({ where: { id: d.renderJobId, storeId: who.storeId } });
  if (!job) throw new StudioError('NOT_FOUND', 'no such render job', ['renderJobId']);
  if (job.status !== 'SUCCEEDED' || !job.outputAssetId) throw new StudioError('WRONG_STATE', 'only a finished render job can be posted', ['status']);
  const account = await deps.db.socialAccount.findFirst({ where: { id: d.accountId, storeId: who.storeId } });
  if (!account) throw new StudioError('NOT_FOUND', 'no such account', ['accountId']);
  if (account.archivedAt || !account.enabled) throw new StudioError('ACCOUNT_OFF', 'this account is archived or switched off', ['accountId']);
  if (!PUBLISHABLE_PLATFORMS.includes(account.platform as PublishablePlatform)) {
    const why = account.platform === 'youtube' ? YOUTUBE_NOT_YET : `${account.platform} has no publishing adapter yet`;
    throw new StudioError('NOT_SUPPORTED', why, ['accountId']);
  }
  if (!account.requireApproval) await allow(deps, who, 'studio.publish');
  const input_ = (job.input ?? {}) as { caption?: string | null };
  const caption = (d.caption ?? input_.caption ?? '').trim();
  if (!caption) throw new StudioError('EMPTY', 'write a caption before posting', ['caption']);
  const kind = (job.input as { plan?: { kind?: string } } | null)?.plan?.kind ?? 'image';
  const scheduledAt = parseScheduledAt(deps, d.scheduledAt);
  // An account still waiting for approval holds every post `PENDING_APPROVAL` regardless of a chosen time — the
  // schedule only starts once a person clears it (`decideSocialPost`); an account that runs free starts it right
  // from the queue, `SCHEDULED` if a future time was chosen, else straight to `PUBLISHING` as before PR 442.
  const status = account.requireApproval ? 'PENDING_APPROVAL' : scheduledAt ? 'SCHEDULED' : 'PUBLISHING';
  if (status !== 'PENDING_APPROVAL') await assertDailyLimitOk(deps, who, account, scheduledAt ?? nowOf(deps));

  const made = await deps.db.socialPost.create({
    data: {
      storeId: who.storeId,
      accountId: account.id,
      kind,
      caption,
      hashtags: [],
      mediaAssetIds: [job.outputAssetId],
      productIds: (job.input as { productIds?: string[] } | null)?.productIds ?? [],
      templateId: job.templateId,
      status,
      scheduledAt,
    },
  });
  // PR 442: a post still waiting for a person gets its own row in the shared AI 360 proposal table, the same one
  // `growth-agent.ts`'s `GROWTH_KIND` already uses, so a future central queue page can list every kind at once.
  let approvalRequestId: string | null = null;
  if (status === 'PENDING_APPROVAL') {
    const ar = await deps.db.aiApprovalRequest.create({
      data: { storeId: who.storeId, agentKey: 'doot', kind: 'studio.post', title: `Studio: post to ${account.platform} — ${caption.slice(0, 60)}`, payload: { postId: made.id, platform: account.platform } as unknown as Prisma.InputJsonValue, refType: 'SocialPost', refId: made.id, channel: 'admin' },
    });
    await deps.db.socialPost.update({ where: { id: made.id }, data: { approvalRequestId: ar.id } });
    approvalRequestId = ar.id;
  }
  await logChange(deps.db, who, { action: 'studio.post.queue', entityType: 'SocialPost', entityId: made.id, before: null, after: { accountId: account.id, status: made.status, scheduledAt: made.scheduledAt } });
  return rowOf({ ...made, account: { platform: account.platform }, approvalRequestId });
}

const decideInput = z.object({ id: z.uuid(), decision: z.enum(['approve', 'reject']) }).strict();

/**
 * Clears one `PENDING_APPROVAL` post (`studio.approve` — Blueprint C5.3's approval queue; the studio's own section
 * of it today, a central AI 360 queue page once one is built, reading the same `AiApprovalRequest` row this post
 * carries). Approving moves it on exactly where `queueSocialPost` would have put it had the account already run
 * free: `SCHEDULED` for a future `scheduledAt`, else straight to `PUBLISHING` (a person, or `publishDuePosts`,
 * still has to actually send it — approving never calls the adapter by itself). Rejecting is final: `REJECTED`,
 * kept for the record, never deleted. Refuses anything not still `PENDING_APPROVAL` (`WRONG_STATE`).
 */
export async function decideSocialPost(deps: StudioDeps, who: Who, input: unknown): Promise<SocialPostRow> {
  await allow(deps, who, 'studio.approve');
  checkStoreId(who.storeId);
  const d = parse(decideInput, input, 'decision');
  const post = await deps.db.socialPost.findFirst({ where: { id: d.id, storeId: who.storeId }, include: { account: { select: { id: true, platform: true, dailyLimit: true } } } });
  if (!post) throw new StudioError('NOT_FOUND', 'no such post', ['id']);
  if (post.status !== 'PENDING_APPROVAL') throw new StudioError('WRONG_STATE', 'only a post waiting for approval can be decided', ['status']);
  const now = nowOf(deps);
  const decidedById = who.actor.staffUserId ?? null;
  if (d.decision === 'reject') {
    const after = await deps.db.socialPost.update({ where: { id: post.id }, data: { status: 'REJECTED' }, include: { account: { select: { platform: true } } } });
    if (post.approvalRequestId) await deps.db.aiApprovalRequest.update({ where: { id: post.approvalRequestId }, data: { status: 'REJECTED', decidedById, decidedAt: now } });
    await logChange(deps.db, who, { action: 'studio.post.decide', entityType: 'SocialPost', entityId: post.id, before: { status: post.status }, after: { status: after.status } });
    return rowOf(after);
  }
  const effective = post.scheduledAt ?? now;
  await assertDailyLimitOk(deps, who, post.account, effective);
  const status = post.scheduledAt && post.scheduledAt.getTime() > now.getTime() ? 'SCHEDULED' : 'PUBLISHING';
  const after = await deps.db.socialPost.update({ where: { id: post.id }, data: { status }, include: { account: { select: { platform: true } } } });
  if (post.approvalRequestId) await deps.db.aiApprovalRequest.update({ where: { id: post.approvalRequestId }, data: { status: 'APPROVED', decidedById, decidedAt: now } });
  await logChange(deps.db, who, { action: 'studio.post.decide', entityType: 'SocialPost', entityId: post.id, before: { status: post.status }, after: { status: after.status } });
  return rowOf(after);
}

const rescheduleInput = z.object({ id: z.uuid(), scheduledAt: z.iso.datetime({ offset: true }).nullable() }).strict();

/**
 * Moves a post still waiting (`PENDING_APPROVAL`) or already cleared for a later time (`SCHEDULED`) to a new time,
 * or `null` to let it go the moment it is next cleared/run (`studio.generate`, the same level as queuing). Refuses
 * anything already sent or sending (`WRONG_STATE`): the calendar only ever moves what has not gone out yet.
 */
export async function rescheduleSocialPost(deps: StudioDeps, who: Who, input: unknown): Promise<SocialPostRow> {
  await allow(deps, who, 'studio.generate');
  checkStoreId(who.storeId);
  const d = parse(rescheduleInput, input, 'reschedule');
  const post = await deps.db.socialPost.findFirst({ where: { id: d.id, storeId: who.storeId }, include: { account: { select: { id: true, platform: true, dailyLimit: true } } } });
  if (!post) throw new StudioError('NOT_FOUND', 'no such post', ['id']);
  if (post.status !== 'PENDING_APPROVAL' && post.status !== 'SCHEDULED') throw new StudioError('WRONG_STATE', 'only a post not yet sent can be rescheduled', ['status']);
  const scheduledAt = parseScheduledAt(deps, d.scheduledAt);
  let status = post.status;
  if (post.status === 'SCHEDULED') {
    if (scheduledAt) await assertDailyLimitOk(deps, who, post.account, scheduledAt, post.id);
    status = scheduledAt ? 'SCHEDULED' : 'PUBLISHING';
    if (status === 'PUBLISHING') await assertDailyLimitOk(deps, who, post.account, nowOf(deps), post.id);
  }
  const after = await deps.db.socialPost.update({ where: { id: post.id }, data: { scheduledAt, status }, include: { account: { select: { platform: true } } } });
  await logChange(deps.db, who, { action: 'studio.post.reschedule', entityType: 'SocialPost', entityId: post.id, before: { scheduledAt: post.scheduledAt }, after: { scheduledAt: after.scheduledAt, status: after.status } });
  return rowOf(after);
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const calendarInput = z.object({ from: z.string().regex(YMD_RE), to: z.string().regex(YMD_RE) }).strict();

export interface CalendarDay {
  date: string;
  posts: SocialPostRow[];
}

/**
 * The content calendar (`studio.read`): every post with a `scheduledAt` or `publishedAt` in the store's own
 * `from`…`to` days, grouped by that day — `scheduledAt` when a post still has one (waiting or already sent at its
 * chosen time), else `publishedAt` for one that went out the moment it was cleared with no time chosen.
 */
export async function studioCalendar(deps: StudioDeps, who: Who, input: unknown): Promise<CalendarDay[]> {
  await allow(deps, who, 'studio.read');
  checkStoreId(who.storeId);
  const d = parse(calendarInput, input, 'calendar range');
  if (d.to < d.from) throw new StudioError('INVALID_INPUT', 'the range ends before it starts', ['to']);
  const tz = await setting(deps, who.storeId, 'store.timeZone');
  const from = dayStart(d.from, tz);
  const to = dayStart(nextDay(d.to), tz);
  const rows = await deps.db.socialPost.findMany({
    where: { storeId: who.storeId, OR: [{ scheduledAt: { gte: from, lt: to } }, { scheduledAt: null, publishedAt: { gte: from, lt: to } }] },
    include: { account: { select: { platform: true } } },
  });
  const byDay = new Map<string, SocialPostRow[]>();
  for (const r of rows) {
    const at = r.scheduledAt ?? r.publishedAt ?? r.createdAt;
    const date = ymdIn(at, tz);
    const list = byDay.get(date) ?? [];
    list.push(rowOf(r));
    byDay.set(date, list);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, posts]) => ({ date, posts: posts.sort((a, b) => (a.scheduledAt ?? a.publishedAt ?? a.createdAt).localeCompare(b.scheduledAt ?? b.publishedAt ?? b.createdAt)) }));
}

export interface PublishDueResult {
  ran: number;
  succeeded: number;
  failed: number;
}

/**
 * Sends every `SCHEDULED` post whose own time has come (`studio.publish`) — the explicit step a person presses
 * today, and the one a background worker's cron slot calls once `@extas/jobs` wires a slot for it (the same honest
 * gap its other "ready for the worker" functions already carry). One post's failure never stops the rest. Safe to
 * run twice: a post the previous run already moved past `SCHEDULED` is simply not due again.
 */
export async function publishDuePosts(deps: PublishDeps, who: Who): Promise<PublishDueResult> {
  await allow(deps, who, 'studio.publish');
  checkStoreId(who.storeId);
  const now = nowOf(deps);
  const due = await deps.db.socialPost.findMany({ where: { storeId: who.storeId, status: 'SCHEDULED', scheduledAt: { lte: now } }, select: { id: true }, orderBy: { scheduledAt: 'asc' } });
  const out: PublishDueResult = { ran: 0, succeeded: 0, failed: 0 };
  for (const p of due) {
    const claimed = await deps.db.socialPost.updateMany({ where: { id: p.id, status: 'SCHEDULED' }, data: { status: 'PUBLISHING' } });
    if (claimed.count !== 1) continue; // another run already claimed it
    out.ran += 1;
    const sent = await runSocialPost(deps, who, p.id);
    if (sent.status === 'SUCCEEDED') out.succeeded += 1;
    else if (sent.status === 'FAILED') out.failed += 1;
  }
  await logChange(deps.db, who, { action: 'studio.schedule.runDue', entityType: 'SocialPost', entityId: who.storeId.toString(), before: null, after: out });
  return out;
}

/**
 * Runs a `PUBLISHING` post through its account's adapter (`studio.publish` — a post only reaches this state when
 * the owner has already set that account to run free, checked again here).
 */
export async function runSocialPost(deps: PublishDeps, who: Who, postId: string): Promise<SocialPostRow> {
  await allow(deps, who, 'studio.publish');
  const post = await deps.db.socialPost.findFirst({ where: { id: postId, storeId: who.storeId }, include: { account: { select: { platform: true, externalId: true, directPostApproved: true } } } });
  if (!post) throw new StudioError('NOT_FOUND', 'no such post', ['postId']);
  if (post.status !== 'PUBLISHING') throw new StudioError('WRONG_STATE', 'only a post waiting to publish can run', ['status']);
  const platform = post.account.platform as PublishablePlatform;
  const assetId = post.mediaAssetIds[0];
  const imageUrl = assetId ? await deps.publicUrlOf(assetId) : null;
  const finish = async (patch: Prisma.SocialPostUpdateInput) => deps.db.socialPost.update({ where: { id: post.id }, data: patch, include: { account: { select: { platform: true } } } });

  if (!imageUrl) {
    const after = await finish({ status: 'FAILED', error: 'the post’s photo has no public address yet' });
    await logChange(deps.db, who, { action: 'studio.post.publish', entityType: 'SocialPost', entityId: post.id, before: { status: post.status }, after: { status: after.status } });
    return rowOf(after);
  }

  const { api } = await deps.publisher.resolve(who.storeId, platform);
  const result = await api.publishPhoto({ imageUrl, caption: post.caption ?? '', directPostApproved: post.account.directPostApproved });
  const after = result.ok
    ? await finish({ status: 'SUCCEEDED', externalPostId: result.externalPostId, publishedAt: nowOf(deps) })
    : await finish({ status: 'FAILED', error: result.error });
  await logChange(deps.db, who, { action: 'studio.post.publish', entityType: 'SocialPost', entityId: post.id, before: { status: post.status }, after: { status: after.status, externalPostId: after.externalPostId } });
  return rowOf(after);
}
