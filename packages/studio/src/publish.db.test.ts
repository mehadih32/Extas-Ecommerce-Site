// S23 · PR 440–442 on a real PostgreSQL (skipped without TEST_DATABASE_ADMIN_URL): queueing and running a post from
// a finished render job onto a Facebook or Instagram account, and (PR 442) the approval queue, the calendar's
// reschedule, the per-platform daily limit and `publishDuePosts`. The adapter here is a stand-in (no real
// network), the same shape `PublisherResolver` gives — `runtime.ts`'s own wiring is exercised by the web app's own
// tests.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRole, syncAuth, SYSTEM } from '@extas/auth';
import { createTestDatabase, HAS_TEST_DB, seedSampleStores, type TestDatabase } from '@extas/auth/testing';
import type { SocialPublishResult } from '@extas/adapters';
import { registry, type Key, type Value } from '@extas/settings';
import { saveStudioAccount } from './accounts';
import type { StudioDeps, Who } from './context';
import { decideSocialPost, publishDuePosts, queueSocialPost, rescheduleSocialPost, runSocialPost, studioCalendar, studioSocialPosts, type PublishDeps } from './index';
import { queueSocialRender, runSocialRenderJob } from './render';
import { saveStudioTemplate } from './templates';

describe.skipIf(!HAS_TEST_DB)('PR 440 · posting a render job to Facebook/Instagram (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  let who: Who;
  let reader: Who;
  const settings = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return registry[key].default as Value<K>;
    },
  };
  const sd = (): StudioDeps => ({ db: t.prisma, settings });
  let lastSent: { imageUrl: string; caption: string } | null = null;
  let nextResult: SocialPublishResult = { ok: true, externalPostId: 'mock-ext-1' };
  const pd = (): PublishDeps => ({
    ...sd(),
    publisher: { async resolve(_storeId, platform) { return { api: { async publishPhoto(post) { lastSent = post; return nextResult; } }, mode: platform === 'facebook' ? 'LIVE' : 'MOCK' }; } },
    async publicUrlOf(assetId) { return assetId ? `https://shop.example.test/media/${assetId}.jpg` : null; },
  });

  const makeProduct = (slug: string, nameEn: string) => t.prisma.product.create({ data: { storeId: S, slug, nameEn } });
  const giveCoverPhoto = async (productId: string) => {
    const asset = await t.prisma.mediaAsset.create({ data: { storeId: S, kind: 'IMAGE', storage: 'LOCAL_DISK', storageKey: `products/${S}/${productId.slice(0, 8)}.jpg`, mimeType: 'image/jpeg', bytes: 500n, checksumSha256: productId.slice(0, 8).padEnd(64, '0'), isOriginal: true } });
    await t.prisma.productMedia.create({ data: { storeId: S, productId, assetId: asset.id, role: 'FRONT', isPrimary: true } });
    return asset.id;
  };
  const finishedRenderJob = async (caption?: string) => {
    const tpl = await saveStudioTemplate(sd(), who, { action: 'add', kind: 'image', name: `Poster ${Date.now()}`, spec: { aspectRatio: '1:1', brandAssetIds: [] } });
    const product = await makeProduct(`post-${Date.now()}`, 'Posted Tee');
    await giveCoverPhoto(product.id);
    const job = await queueSocialRender(sd(), who, { templateId: tpl.id, productIds: [product.id], ...(caption ? { caption } : {}) });
    return runSocialRenderJob(sd(), who, job.id);
  };

  beforeAll(async () => {
    t = await createTestDatabase('studio_publish');
    [S] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const staff = async (key: string, perms: ('studio.read' | 'studio.write' | 'studio.generate' | 'studio.publish')[]) => {
      const role = await createRole(t.prisma, SYSTEM, { key, nameEn: key, nameBn: key, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email: `${key}@example.com`, displayName: key, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
      return { actor: { staffUserId: u.id }, storeId: S };
    };
    who = await staff('t440-pub', ['studio.read', 'studio.write', 'studio.generate', 'studio.publish']);
    reader = await staff('t440-reader', ['studio.read']);
  });

  afterAll(async () => t.drop());

  it('queues a post as PENDING_APPROVAL for a new account (needs approval by default), never calling the adapter', async () => {
    lastSent = null;
    const acc = await saveStudioAccount(sd(), who, { action: 'add', platform: 'facebook', externalId: 'fb-440-1', name: 'EXTAS Page' });
    await saveStudioAccount(sd(), who, { action: 'switch', id: acc.id, enabled: true, version: acc.version });
    const job = await finishedRenderJob('Launch day');
    const posted = await queueSocialPost(pd(), who, { renderJobId: job.id, accountId: acc.id });
    expect(posted.status).toBe('PENDING_APPROVAL');
    expect(posted.caption).toBe('Launch day');
    expect(posted.platform).toBe('facebook');
    expect(lastSent).toBeNull();

    const list = await studioSocialPosts(sd(), reader);
    expect(list.some((p) => p.id === posted.id)).toBe(true);
  });

  it('an account set to run free queues PUBLISHING, then `runSocialPost` actually calls the adapter', async () => {
    lastSent = null;
    nextResult = { ok: true, externalPostId: 'ext-post-1' };
    const acc = await saveStudioAccount(sd(), who, { action: 'add', platform: 'instagram', externalId: 'ig-440-1', name: 'EXTAS Instagram' });
    const enabled = await saveStudioAccount(sd(), who, { action: 'switch', id: acc.id, enabled: true, version: acc.version });
    const free = await saveStudioAccount(sd(), who, { action: 'requireApproval', id: acc.id, requireApproval: false, version: enabled.version });
    const job = await finishedRenderJob();

    const queued = await queueSocialPost(pd(), who, { renderJobId: job.id, accountId: free.id, caption: 'New drop' });
    expect(queued.status).toBe('PUBLISHING');
    expect(lastSent).toBeNull();

    const ran = await runSocialPost(pd(), who, queued.id);
    expect(ran.status).toBe('SUCCEEDED');
    expect(ran.externalPostId).toBe('ext-post-1');
    expect(ran.publishedAt).not.toBeNull();
    expect(lastSent).toMatchObject({ caption: 'New drop' });

    await expect(runSocialPost(pd(), who, queued.id)).rejects.toMatchObject({ code: 'WRONG_STATE' });
  });

  it('a failing adapter leaves the post FAILED with the adapter`s own words', async () => {
    nextResult = { ok: false, error: 'the Page access token has expired' };
    const acc = await saveStudioAccount(sd(), who, { action: 'add', platform: 'facebook', externalId: 'fb-440-2', name: 'Failing Page' });
    const enabled = await saveStudioAccount(sd(), who, { action: 'switch', id: acc.id, enabled: true, version: acc.version });
    const free = await saveStudioAccount(sd(), who, { action: 'requireApproval', id: acc.id, requireApproval: false, version: enabled.version });
    const job = await finishedRenderJob('Sale now');
    const queued = await queueSocialPost(pd(), who, { renderJobId: job.id, accountId: free.id });
    const ran = await runSocialPost(pd(), who, queued.id);
    expect(ran.status).toBe('FAILED');
    expect(ran.error).toBe('the Page access token has expired');
  });

  it('refuses a job that has not finished, an account that is off, a YouTube account (PR 441), and an empty caption', async () => {
    const acc = await saveStudioAccount(sd(), who, { action: 'add', platform: 'facebook', externalId: 'fb-440-3', name: 'Guard Page' });
    const enabled = await saveStudioAccount(sd(), who, { action: 'switch', id: acc.id, enabled: true, version: acc.version });

    const tpl = await saveStudioTemplate(sd(), who, { action: 'add', kind: 'image', name: 'Unfinished', spec: { aspectRatio: '1:1', brandAssetIds: [] } });
    const product = await makeProduct('post-unfinished', 'Unfinished Tee');
    const queuedJob = await queueSocialRender(sd(), who, { templateId: tpl.id, productIds: [product.id] });
    await expect(queueSocialPost(pd(), who, { renderJobId: queuedJob.id, accountId: enabled.id, caption: 'x' })).rejects.toMatchObject({ code: 'WRONG_STATE' });

    const offAccount = await saveStudioAccount(sd(), who, { action: 'add', platform: 'facebook', externalId: 'fb-440-4', name: 'Off Page' });
    const job = await finishedRenderJob('x');
    await expect(queueSocialPost(pd(), who, { renderJobId: job.id, accountId: offAccount.id, caption: 'x' })).rejects.toMatchObject({ code: 'ACCOUNT_OFF' });

    // YouTube still refuses (PR 441): a real connection exists, but a photo is not a video — named why, not "no adapter".
    const youtube = await saveStudioAccount(sd(), who, { action: 'add', platform: 'youtube', externalId: 'yt-440-1', name: 'YouTube' });
    const youtubeOn = await saveStudioAccount(sd(), who, { action: 'switch', id: youtube.id, enabled: true, version: youtube.version });
    await expect(queueSocialPost(pd(), who, { renderJobId: job.id, accountId: youtubeOn.id, caption: 'x' })).rejects.toMatchObject({ code: 'NOT_SUPPORTED', message: 'YouTube needs a real video; the studio makes a preview photo until the video engine is built' });

    const noCaptionJob = await finishedRenderJob();
    await expect(queueSocialPost(pd(), who, { renderJobId: noCaptionJob.id, accountId: enabled.id })).rejects.toMatchObject({ code: 'EMPTY' });
  });

  it('only `studio.generate` may queue a post, and only `studio.publish` may queue one that runs free or run it', async () => {
    const acc = await saveStudioAccount(sd(), who, { action: 'add', platform: 'facebook', externalId: 'fb-440-5', name: 'Perm Page' });
    const enabled = await saveStudioAccount(sd(), who, { action: 'switch', id: acc.id, enabled: true, version: acc.version });
    const free = await saveStudioAccount(sd(), who, { action: 'requireApproval', id: acc.id, requireApproval: false, version: enabled.version });
    const job = await finishedRenderJob('x');
    await expect(queueSocialPost(pd(), reader, { renderJobId: job.id, accountId: enabled.id, caption: 'x' })).rejects.toThrow();

    const generateOnly = { actor: reader.actor, storeId: S }; // reader only holds studio.read above; reuse a fresh role instead
    const role = await createRole(t.prisma, SYSTEM, { key: 't440-gen-only', nameEn: 'gen', nameBn: 'gen', permissions: ['studio.read', 'studio.generate'] });
    const u = await t.prisma.staffUser.create({ data: { email: 't440-gen-only@example.com', displayName: 'gen-only', passwordHash: 'not-a-login' } });
    await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
    const genOnly: Who = { actor: { staffUserId: u.id }, storeId: S };
    await expect(queueSocialPost(pd(), genOnly, { renderJobId: job.id, accountId: free.id, caption: 'x' })).rejects.toThrow();
    void generateOnly;
  });
});

describe.skipIf(!HAS_TEST_DB)('PR 441 · TikTok draft + direct posting (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  let who: Who;
  const settings = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return registry[key].default as Value<K>;
    },
  };
  const sd = (): StudioDeps => ({ db: t.prisma, settings });
  let lastSent: { imageUrl: string; caption: string; directPostApproved?: boolean } | null = null;
  const pd = (): PublishDeps => ({
    ...sd(),
    publisher: { async resolve() { return { api: { async publishPhoto(post) { lastSent = post; return { ok: true, externalPostId: 'tt-ext-1' }; } }, mode: 'MOCK' }; } },
    async publicUrlOf(assetId) { return assetId ? `https://shop.example.test/media/${assetId}.jpg` : null; },
  });

  const makeProduct = (slug: string, nameEn: string) => t.prisma.product.create({ data: { storeId: S, slug, nameEn } });
  const giveCoverPhoto = async (productId: string) => {
    const asset = await t.prisma.mediaAsset.create({ data: { storeId: S, kind: 'IMAGE', storage: 'LOCAL_DISK', storageKey: `products/${S}/${productId.slice(0, 8)}.jpg`, mimeType: 'image/jpeg', bytes: 500n, checksumSha256: productId.slice(0, 8).padEnd(64, '0'), isOriginal: true } });
    await t.prisma.productMedia.create({ data: { storeId: S, productId, assetId: asset.id, role: 'FRONT', isPrimary: true } });
    return asset.id;
  };
  const finishedRenderJob = async (caption?: string) => {
    const tpl = await saveStudioTemplate(sd(), who, { action: 'add', kind: 'image', name: `TikTok poster ${Date.now()}`, spec: { aspectRatio: '1:1', brandAssetIds: [] } });
    const product = await makeProduct(`tt-post-${Date.now()}`, 'TikTok Tee');
    await giveCoverPhoto(product.id);
    const job = await queueSocialRender(sd(), who, { templateId: tpl.id, productIds: [product.id], ...(caption ? { caption } : {}) });
    return runSocialRenderJob(sd(), who, job.id);
  };

  beforeAll(async () => {
    t = await createTestDatabase('studio_publish_tiktok');
    [S] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const role = await createRole(t.prisma, SYSTEM, { key: 't441-pub', nameEn: 't441-pub', nameBn: 't441-pub', permissions: ['studio.read', 'studio.write', 'studio.generate', 'studio.publish'] });
    const u = await t.prisma.staffUser.create({ data: { email: 't441-pub@example.com', displayName: 't441-pub', passwordHash: 'not-a-login' } });
    await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
    who = { actor: { staffUserId: u.id }, storeId: S };
  });

  afterAll(async () => t.drop());

  it('a new TikTok account defaults to draft (`directPostApproved: false`), and the adapter is told so', async () => {
    lastSent = null;
    const acc = await saveStudioAccount(sd(), who, { action: 'add', platform: 'tiktok', externalId: 'tt-441-1', name: 'EXTAS TikTok' });
    expect(acc.directPostApproved).toBe(false);
    const enabled = await saveStudioAccount(sd(), who, { action: 'switch', id: acc.id, enabled: true, version: acc.version });
    const free = await saveStudioAccount(sd(), who, { action: 'requireApproval', id: acc.id, requireApproval: false, version: enabled.version });
    const job = await finishedRenderJob('Draft for now');

    const queued = await queueSocialPost(pd(), who, { renderJobId: job.id, accountId: free.id, caption: 'Draft for now' });
    expect(queued.platform).toBe('tiktok');
    const ran = await runSocialPost(pd(), who, queued.id);
    expect(ran.status).toBe('SUCCEEDED');
    expect(lastSent).toMatchObject({ caption: 'Draft for now', directPostApproved: false });
  });

  it('once the owner switches `directPostApproved` on, a later post tells the adapter to post direct', async () => {
    lastSent = null;
    const acc = await saveStudioAccount(sd(), who, { action: 'add', platform: 'tiktok', externalId: 'tt-441-2', name: 'Approved TikTok' });
    const enabled = await saveStudioAccount(sd(), who, { action: 'switch', id: acc.id, enabled: true, version: acc.version });
    const free = await saveStudioAccount(sd(), who, { action: 'requireApproval', id: acc.id, requireApproval: false, version: enabled.version });
    const approved = await saveStudioAccount(sd(), who, { action: 'directPostApproved', id: acc.id, directPostApproved: true, version: free.version });
    expect(approved.directPostApproved).toBe(true);

    const job = await finishedRenderJob('Live now');
    const queued = await queueSocialPost(pd(), who, { renderJobId: job.id, accountId: approved.id, caption: 'Live now' });
    await runSocialPost(pd(), who, queued.id);
    expect(lastSent).toMatchObject({ directPostApproved: true });
  });

  it('`directPostApproved` means nothing on a non-TikTok account and is refused', async () => {
    const acc = await saveStudioAccount(sd(), who, { action: 'add', platform: 'facebook', externalId: 'fb-441-1', name: 'Not TikTok' });
    await expect(saveStudioAccount(sd(), who, { action: 'directPostApproved', id: acc.id, directPostApproved: true, version: acc.version })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});

describe.skipIf(!HAS_TEST_DB)('PR 442 · approval queue, calendar and per-platform limits (PostgreSQL)', () => {
  let t: TestDatabase;
  let S: number;
  let who: Who;
  let approver: Who;
  const settings = {
    async value<K extends Key>(key: K): Promise<Value<K>> {
      return registry[key].default as Value<K>;
    },
  };
  const sd = (): StudioDeps => ({ db: t.prisma, settings });
  let lastSent: { imageUrl: string; caption: string } | null = null;
  const pd = (): PublishDeps => ({
    ...sd(),
    publisher: { async resolve() { return { api: { async publishPhoto(post) { lastSent = post; return { ok: true, externalPostId: 'ext-442' }; } }, mode: 'MOCK' }; } },
    async publicUrlOf(assetId) { return assetId ? `https://shop.example.test/media/${assetId}.jpg` : null; },
  });

  const makeProduct = (slug: string, nameEn: string) => t.prisma.product.create({ data: { storeId: S, slug, nameEn } });
  const giveCoverPhoto = async (productId: string) => {
    const asset = await t.prisma.mediaAsset.create({ data: { storeId: S, kind: 'IMAGE', storage: 'LOCAL_DISK', storageKey: `products/${S}/${productId.slice(0, 8)}.jpg`, mimeType: 'image/jpeg', bytes: 500n, checksumSha256: productId.slice(0, 8).padEnd(64, '0'), isOriginal: true } });
    await t.prisma.productMedia.create({ data: { storeId: S, productId, assetId: asset.id, role: 'FRONT', isPrimary: true } });
    return asset.id;
  };
  const finishedRenderJob = async (caption?: string) => {
    const tpl = await saveStudioTemplate(sd(), who, { action: 'add', kind: 'image', name: `442 poster ${Date.now()}-${Math.random()}`, spec: { aspectRatio: '1:1', brandAssetIds: [] } });
    const product = await makeProduct(`442-post-${Date.now()}-${Math.round(Math.random() * 1e6)}`, '442 Tee');
    await giveCoverPhoto(product.id);
    const job = await queueSocialRender(sd(), who, { templateId: tpl.id, productIds: [product.id], ...(caption ? { caption } : {}) });
    return runSocialRenderJob(sd(), who, job.id);
  };
  const future = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

  beforeAll(async () => {
    t = await createTestDatabase('studio_calendar_approval');
    [S] = await seedSampleStores(t.prisma);
    await syncAuth(t.prisma);
    const staff = async (key: string, perms: ('studio.read' | 'studio.write' | 'studio.generate' | 'studio.approve' | 'studio.publish')[]) => {
      const role = await createRole(t.prisma, SYSTEM, { key, nameEn: key, nameBn: key, permissions: perms });
      const u = await t.prisma.staffUser.create({ data: { email: `${key}@example.com`, displayName: key, passwordHash: 'not-a-login' } });
      await t.prisma.staffRoleAssignment.create({ data: { staffUserId: u.id, roleId: role.id, storeId: S } });
      return { actor: { staffUserId: u.id }, storeId: S };
    };
    who = await staff('t442-queue', ['studio.read', 'studio.write', 'studio.generate', 'studio.publish']);
    approver = await staff('t442-approve', ['studio.read', 'studio.approve']);
  });

  afterAll(async () => t.drop());

  it('queuing to an account that still needs approval makes an AiApprovalRequest row, carried on the post', async () => {
    const acc = await saveStudioAccount(sd(), who, { action: 'add', platform: 'facebook', externalId: 'fb-442-1', name: 'Approval Page' });
    await saveStudioAccount(sd(), who, { action: 'switch', id: acc.id, enabled: true, version: acc.version });
    const job = await finishedRenderJob('Needs an OK');
    const posted = await queueSocialPost(pd(), who, { renderJobId: job.id, accountId: acc.id });
    expect(posted.status).toBe('PENDING_APPROVAL');
    expect(posted.approvalRequestId).not.toBeNull();
    const ar = await t.prisma.aiApprovalRequest.findUnique({ where: { id: posted.approvalRequestId! } });
    expect(ar).toMatchObject({ status: 'PENDING', kind: 'studio.post', agentKey: 'doot', refType: 'SocialPost', refId: posted.id });
  });

  it('approving a pending post moves it to PUBLISHING (no time chosen) and marks the approval request APPROVED; only `studio.approve` may decide', async () => {
    const acc = await saveStudioAccount(sd(), who, { action: 'add', platform: 'facebook', externalId: 'fb-442-2', name: 'Approve Me' });
    await saveStudioAccount(sd(), who, { action: 'switch', id: acc.id, enabled: true, version: acc.version });
    const job = await finishedRenderJob('Approve please');
    const posted = await queueSocialPost(pd(), who, { renderJobId: job.id, accountId: acc.id });

    await expect(decideSocialPost(sd(), who, { id: posted.id, decision: 'approve' })).rejects.toThrow(); // who only holds generate/publish, not approve

    const approved = await decideSocialPost(sd(), approver, { id: posted.id, decision: 'approve' });
    expect(approved.status).toBe('PUBLISHING');
    const ar = await t.prisma.aiApprovalRequest.findUnique({ where: { id: posted.approvalRequestId! } });
    expect(ar?.status).toBe('APPROVED');
    await expect(decideSocialPost(sd(), approver, { id: posted.id, decision: 'approve' })).rejects.toMatchObject({ code: 'WRONG_STATE' });
  });

  it('a future `scheduledAt` at queue time keeps a post PENDING_APPROVAL until approved, then SCHEDULED; rejecting is final', async () => {
    const acc = await saveStudioAccount(sd(), who, { action: 'add', platform: 'facebook', externalId: 'fb-442-3', name: 'Scheduled Page' });
    await saveStudioAccount(sd(), who, { action: 'switch', id: acc.id, enabled: true, version: acc.version });
    const job = await finishedRenderJob('Later today');
    const at = future(5);
    const posted = await queueSocialPost(pd(), who, { renderJobId: job.id, accountId: acc.id, scheduledAt: at });
    expect(posted.status).toBe('PENDING_APPROVAL');
    expect(posted.scheduledAt).toBe(new Date(at).toISOString());

    const approved = await decideSocialPost(sd(), approver, { id: posted.id, decision: 'approve' });
    expect(approved.status).toBe('SCHEDULED');

    const job2 = await finishedRenderJob('Rejected one');
    const posted2 = await queueSocialPost(pd(), who, { renderJobId: job2.id, accountId: acc.id });
    const rejected = await decideSocialPost(sd(), approver, { id: posted2.id, decision: 'reject' });
    expect(rejected.status).toBe('REJECTED');
    const ar2 = await t.prisma.aiApprovalRequest.findUnique({ where: { id: posted2.approvalRequestId! } });
    expect(ar2?.status).toBe('REJECTED');
  });

  it('an account running free with a future time queues SCHEDULED directly, shows in the calendar, and can be rescheduled', async () => {
    const acc = await saveStudioAccount(sd(), who, { action: 'add', platform: 'facebook', externalId: 'fb-442-4', name: 'Free Scheduled' });
    const enabled = await saveStudioAccount(sd(), who, { action: 'switch', id: acc.id, enabled: true, version: acc.version });
    const free = await saveStudioAccount(sd(), who, { action: 'requireApproval', id: acc.id, requireApproval: false, version: enabled.version });
    const job = await finishedRenderJob('Calendar post');
    const at = future(30);
    const posted = await queueSocialPost(pd(), who, { renderJobId: job.id, accountId: free.id, scheduledAt: at });
    expect(posted.status).toBe('SCHEDULED');

    // generously wide so the store's own time zone (Asia/Dhaka, UTC+6) landing a day either side of the UTC slice
    // below can never miss it
    const from = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
    const to = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    const cal = await studioCalendar(sd(), who, { from, to });
    const found = cal.flatMap((d) => d.posts).find((p) => p.id === posted.id);
    expect(found?.status).toBe('SCHEDULED');

    const newAt = future(36);
    const moved = await rescheduleSocialPost(sd(), who, { id: posted.id, scheduledAt: newAt });
    expect(moved.scheduledAt).toBe(new Date(newAt).toISOString());
    expect(moved.status).toBe('SCHEDULED');

    const backToNow = await rescheduleSocialPost(sd(), who, { id: posted.id, scheduledAt: null });
    expect(backToNow.status).toBe('PUBLISHING');
    expect(backToNow.scheduledAt).toBeNull();
    await expect(rescheduleSocialPost(sd(), who, { id: posted.id, scheduledAt: future(2) })).rejects.toMatchObject({ code: 'WRONG_STATE' });
  });

  it('a `dailyLimit` of 1 refuses a second post the same day on the same account, approving or queuing free', async () => {
    const acc = await saveStudioAccount(sd(), who, { action: 'add', platform: 'facebook', externalId: 'fb-442-5', name: 'One A Day' });
    const enabled = await saveStudioAccount(sd(), who, { action: 'switch', id: acc.id, enabled: true, version: acc.version });
    const free = await saveStudioAccount(sd(), who, { action: 'requireApproval', id: acc.id, requireApproval: false, version: enabled.version });
    const limited = await saveStudioAccount(sd(), who, { action: 'dailyLimit', id: acc.id, dailyLimit: 1, version: free.version });

    const job1 = await finishedRenderJob('First today');
    const first = await queueSocialPost(pd(), who, { renderJobId: job1.id, accountId: limited.id });
    expect(first.status).toBe('PUBLISHING');

    const job2 = await finishedRenderJob('Second today');
    await expect(queueSocialPost(pd(), who, { renderJobId: job2.id, accountId: limited.id })).rejects.toMatchObject({ code: 'DAILY_LIMIT' });

    // the same limit is enforced on the approval path, not only on a free-running queue
    const needsApproval = await saveStudioAccount(sd(), who, { action: 'requireApproval', id: acc.id, requireApproval: true, version: limited.version });
    const job3 = await finishedRenderJob('Third today');
    const pending = await queueSocialPost(pd(), who, { renderJobId: job3.id, accountId: needsApproval.id });
    expect(pending.status).toBe('PENDING_APPROVAL'); // queuing itself is never blocked by the limit, only sending
    await expect(decideSocialPost(sd(), approver, { id: pending.id, decision: 'approve' })).rejects.toMatchObject({ code: 'DAILY_LIMIT' });
  });

  it('`publishDuePosts` sends every SCHEDULED post whose time has come, and only that, safely twice', async () => {
    const acc = await saveStudioAccount(sd(), who, { action: 'add', platform: 'facebook', externalId: 'fb-442-6', name: 'Due Now' });
    const enabled = await saveStudioAccount(sd(), who, { action: 'switch', id: acc.id, enabled: true, version: acc.version });
    const free = await saveStudioAccount(sd(), who, { action: 'requireApproval', id: acc.id, requireApproval: false, version: enabled.version });

    const jobDue = await finishedRenderJob('Due now');
    const due = await queueSocialPost(pd(), who, { renderJobId: jobDue.id, accountId: free.id, scheduledAt: new Date(Date.now() + 500).toISOString() }); // ~0.5s out
    const jobLater = await finishedRenderJob('Later');
    const later = await queueSocialPost(pd(), who, { renderJobId: jobLater.id, accountId: free.id, scheduledAt: future(48) });
    expect(due.status).toBe('SCHEDULED');
    expect(later.status).toBe('SCHEDULED');

    await new Promise((r) => setTimeout(r, 1100)); // let the "due" one's moment actually pass
    lastSent = null;
    const result = await publishDuePosts(pd(), who);
    expect(result.ran).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(lastSent).toMatchObject({ caption: 'Due now' });

    const still = await studioSocialPosts(sd(), who);
    expect(still.find((p) => p.id === due.id)?.status).toBe('SUCCEEDED');
    expect(still.find((p) => p.id === later.id)?.status).toBe('SCHEDULED');

    const again = await publishDuePosts(pd(), who);
    expect(again.ran).toBe(0); // safe to run twice — nothing newly due
  });
});
