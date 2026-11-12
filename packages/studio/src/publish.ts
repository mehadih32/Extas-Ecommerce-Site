// S23 · PR 440 (Blueprint C5.1, C5.3, C5.5 point 3 "Publishing adapters — Facebook Page, Instagram feed/reel/story
// (part 1)") — turns a finished render job (PR 439) into a `SocialPost` on one of the store's Facebook or
// Instagram accounts (PR 437), through `@extas/adapters/social-publish`'s two adapters. TikTok and YouTube have no
// adapter yet (PR 441): choosing one of those refuses outright (`NOT_SUPPORTED`).
//
// Automatic vs queued (Blueprint C5.3, CLAUDE.md rule 2/6 — nothing goes out without the owner's OK by default):
// every new account ships `requireApproval: true` (PR 437), so by default a post made here is only queued, status
// `PENDING_APPROVAL`, and nothing reaches the adapter at all; clearing that queue is PR 442. Only once the owner has
// explicitly switched an account to run free does a post publish itself, right away, and only then does the caller
// also need `studio.publish` on top of `studio.generate` (queuing itself only ever needs `studio.generate`, the
// same permission that already queues and runs a render job).
//
// Honest scope, unchanged from PR 439: the render job's own output is a single existing product photo, so every
// post this function makes is that one photo — Facebook's single-photo post, or Instagram's media-container flow
// for one image — whatever the template's own kind (image, reel, short, story). A real reel, Story or carousel
// needs a real video or several images; that is wired in once the compositor exists, without changing this
// function's shape.
import { z } from 'zod';
import type { Prisma } from '@extas/db/client';
import type { SocialPublisher } from '@extas/adapters';
import { allow, checkStoreId, logChange, nowOf, parse, StudioError, type StudioDeps, type Who } from './context';
import type { StudioPlatform } from './accounts';

/** The platforms with a publishing adapter today (PR 440); TikTok and YouTube follow in PR 441. */
export const PUBLISHABLE_PLATFORMS = ['facebook', 'instagram'] as const satisfies readonly StudioPlatform[];
export type PublishablePlatform = (typeof PUBLISHABLE_PLATFORMS)[number];

export const queuePostInput = z
  .object({
    renderJobId: z.uuid(),
    accountId: z.uuid(),
    caption: z.string().trim().min(1).max(2200).optional(),
  })
  .strict();
export type QueuePostInput = z.infer<typeof queuePostInput>;

export type SocialPostStatus = 'PENDING_APPROVAL' | 'PUBLISHING' | 'SUCCEEDED' | 'FAILED';

export interface SocialPostRow {
  id: string;
  accountId: string;
  platform: PublishablePlatform;
  kind: string;
  caption: string | null;
  mediaAssetIds: string[];
  status: SocialPostStatus;
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
    externalPostId: p.externalPostId,
    publishedAt: p.publishedAt?.toISOString() ?? null,
    error: p.error,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
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
    throw new StudioError('NOT_SUPPORTED', `${account.platform} has no publishing adapter yet`, ['accountId']);
  }
  if (!account.requireApproval) await allow(deps, who, 'studio.publish');
  const input_ = (job.input ?? {}) as { caption?: string | null };
  const caption = (d.caption ?? input_.caption ?? '').trim();
  if (!caption) throw new StudioError('EMPTY', 'write a caption before posting', ['caption']);
  const kind = (job.input as { plan?: { kind?: string } } | null)?.plan?.kind ?? 'image';

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
      status: account.requireApproval ? 'PENDING_APPROVAL' : 'PUBLISHING',
    },
  });
  await logChange(deps.db, who, { action: 'studio.post.queue', entityType: 'SocialPost', entityId: made.id, before: null, after: { accountId: account.id, status: made.status } });
  return rowOf({ ...made, account: { platform: account.platform } });
}

/**
 * Runs a `PUBLISHING` post through its account's adapter (`studio.publish` — a post only reaches this state when
 * the owner has already set that account to run free, checked again here).
 */
export async function runSocialPost(deps: PublishDeps, who: Who, postId: string): Promise<SocialPostRow> {
  await allow(deps, who, 'studio.publish');
  const post = await deps.db.socialPost.findFirst({ where: { id: postId, storeId: who.storeId }, include: { account: { select: { platform: true, externalId: true } } } });
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
  const result = await api.publishPhoto({ imageUrl, caption: post.caption ?? '' });
  const after = result.ok
    ? await finish({ status: 'SUCCEEDED', externalPostId: result.externalPostId, publishedAt: nowOf(deps) })
    : await finish({ status: 'FAILED', error: result.error });
  await logChange(deps.db, who, { action: 'studio.post.publish', entityType: 'SocialPost', entityId: post.id, before: { status: post.status }, after: { status: after.status, externalPostId: after.externalPostId } });
  return rowOf(after);
}
