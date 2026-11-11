// S23 · PR 440 (Blueprint C5.1, C5.5 point 3 "Publishing adapters — Facebook Page, Instagram feed/reel/story (part
// 1)") — the studio's own two publishing adapters, under the `META` kind the Marketing ads module already shares
// (Keys & connections lists several providers per kind; this is not exclusive, so Meta Ads and these two may run
// side by side). Both read the same long-lived Page access token the owner types once; Instagram also needs the
// linked Instagram Business Account id (Meta → the Page → Linked accounts).
//
// Honest scope (same rule as PR 439's render engine): the studio has no real video file yet, only a preview — the
// featured product's own live photo (PR 439). So whatever a template's kind, what actually reaches Facebook or
// Instagram today is that one photo as a feed/single-image post; a reel, a carousel or a Story needs a real video or
// several images and is wired in once the real compositor exists (a later PR), without touching this adapter's
// contract. The mock serves until the owner's key is in and the Test (reading the Page / the Instagram account)
// passes (A1.3) — nothing here reaches a real account before that.
//
// Facebook: one call, `POST /{pageId}/photos` with the image's own public url and the caption.
// Instagram: Meta's two-step container flow — `POST /{igUserId}/media` (image_url + caption) to get a creation id,
// then `POST /{igUserId}/media_publish` with that id. No polling: a single photo needs none (only video processing
// does), so this still finishes in one request pair.
import { z } from 'zod';
import { defineAdapter, requireSecret } from '../define';
import { META_DEFAULT_API_VERSION, META_DEFAULT_BASE_URL } from '../ads';

export const FACEBOOK_PAGE_PUBLISH_PROVIDER = 'facebookPagePublish';
export const INSTAGRAM_PUBLISH_PROVIDER = 'instagramPublish';

export const facebookPagePublishConfig = z.object({
  pageId: z.string().trim().regex(/^\d{5,30}$/, { message: 'digits only (the Page id)' }),
  apiVersion: z.string().trim().regex(/^v\d{1,3}\.\d{1,2}$/, { message: 'like v21.0' }).optional(),
  baseUrl: z.url({ protocol: /^https$/, message: 'not an https address' }).max(500).optional(),
});
export type FacebookPagePublishConfig = z.output<typeof facebookPagePublishConfig>;

export const instagramPublishConfig = z.object({
  igUserId: z.string().trim().regex(/^\d{5,30}$/, { message: 'digits only (the Instagram Business Account id)' }),
  apiVersion: z.string().trim().regex(/^v\d{1,3}\.\d{1,2}$/, { message: 'like v21.0' }).optional(),
  baseUrl: z.url({ protocol: /^https$/, message: 'not an https address' }).max(500).optional(),
});
export type InstagramPublishConfig = z.output<typeof instagramPublishConfig>;

export interface SocialPhotoPost {
  /** A public https address the platform itself fetches the photo from (CLAUDE.md: never a file this adapter reads). */
  imageUrl: string;
  caption: string;
}

export type SocialPublishResult = { ok: true; externalPostId: string } | { ok: false; error: string };

export interface SocialPublisher {
  publishPhoto(post: SocialPhotoPost): Promise<SocialPublishResult>;
}

/** Meta's error codes worth a plain word (the rest fall back to Meta's own message, trimmed). */
const META_PUBLISH_CODES: Readonly<Record<number, string>> = {
  190: 'the Page access token has expired or is not valid',
  10: 'this app cannot do that yet (a Meta permission is missing)',
  100: 'the photo address could not be read by Meta (it must be public https, not behind a password)',
  9007: 'the picture could not be processed',
  2207026: 'posting is paused for this Instagram account',
};

type Fetch = typeof fetch;

function graphClient(opts: { baseUrl: string; apiVersion: string; accessToken: string; fetch?: Fetch }) {
  const doFetch = opts.fetch ?? fetch;
  const base = `${opts.baseUrl.replace(/\/+$/, '')}/${opts.apiVersion}`;
  return async function ask(path: string, body?: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> | null }> {
    const res = await doFetch(`${base}/${path}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${opts.accessToken}`, accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    const raw = await res.text();
    try {
      return { status: res.status, body: raw ? (JSON.parse(raw) as Record<string, unknown>) : null };
    } catch {
      return { status: res.status, body: null };
    }
  };
}

function errorOf(a: { status: number; body: Record<string, unknown> | null }): string {
  const e = (a.body?.error ?? null) as { code?: number; message?: string } | null;
  if (e?.code !== undefined) return `${e.code}: ${META_PUBLISH_CODES[e.code] ?? (e.message ?? 'refused').slice(0, 120)}`;
  return `HTTP ${a.status}: the answer was not understood`;
}

/** The Facebook Page client (LIVE; a test server through `baseUrl`). */
export function createFacebookPagePublisher(opts: { baseUrl: string; apiVersion: string; accessToken: string; pageId: string; fetch?: Fetch }): SocialPublisher & { page(): Promise<{ name: string }> } {
  const ask = graphClient(opts);
  return {
    async publishPhoto(post) {
      let a;
      try {
        a = await ask(`${opts.pageId}/photos`, { url: post.imageUrl, caption: post.caption, published: true });
      } catch (e) {
        return { ok: false, error: `Facebook did not answer (${e instanceof Error ? e.message.slice(0, 80) : 'network'})` };
      }
      const id = (a.body?.post_id ?? a.body?.id) as string | undefined;
      return a.status < 300 && typeof id === 'string' ? { ok: true, externalPostId: id } : { ok: false, error: errorOf(a) };
    },
    async page() {
      const doFetch = opts.fetch ?? fetch;
      const res = await doFetch(`${opts.baseUrl.replace(/\/+$/, '')}/${opts.apiVersion}/${opts.pageId}?fields=name&access_token=${encodeURIComponent(opts.accessToken)}`);
      const body = (await res.json().catch(() => null)) as { name?: string; error?: { message?: string } } | null;
      if (res.status >= 300 || !body?.name) throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      return { name: body.name };
    },
  };
}

/** The Instagram Business Account client (LIVE): the two-step container flow, no polling (photos only). */
export function createInstagramPublisher(opts: { baseUrl: string; apiVersion: string; accessToken: string; igUserId: string; fetch?: Fetch }): SocialPublisher & { account(): Promise<{ username: string }> } {
  const ask = graphClient(opts);
  return {
    async publishPhoto(post) {
      let created;
      try {
        created = await ask(`${opts.igUserId}/media`, { image_url: post.imageUrl, caption: post.caption });
      } catch (e) {
        return { ok: false, error: `Instagram did not answer (${e instanceof Error ? e.message.slice(0, 80) : 'network'})` };
      }
      const creationId = created.body?.id as string | undefined;
      if (created.status >= 300 || typeof creationId !== 'string') return { ok: false, error: errorOf(created) };
      let published;
      try {
        published = await ask(`${opts.igUserId}/media_publish`, { creation_id: creationId });
      } catch (e) {
        return { ok: false, error: `Instagram did not answer while publishing (${e instanceof Error ? e.message.slice(0, 80) : 'network'})` };
      }
      const id = published.body?.id as string | undefined;
      return published.status < 300 && typeof id === 'string' ? { ok: true, externalPostId: id } : { ok: false, error: errorOf(published) };
    },
    async account() {
      const doFetch = opts.fetch ?? fetch;
      const res = await doFetch(`${opts.baseUrl.replace(/\/+$/, '')}/${opts.apiVersion}/${opts.igUserId}?fields=username&access_token=${encodeURIComponent(opts.accessToken)}`);
      const body = (await res.json().catch(() => null)) as { username?: string; error?: { message?: string } } | null;
      if (res.status >= 300 || !body?.username) throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      return { username: body.username };
    },
  };
}

export interface MockSocialPost extends SocialPhotoPost {
  provider: string;
  externalPostId: string;
  at: Date;
}
const OUTBOX_MAX = 200;
const G = globalThis as unknown as { __extasMockSocialPublish?: MockSocialPost[] };
const box = (): MockSocialPost[] => (G.__extasMockSocialPublish ??= []);
let seq = 0;

/** What the mock "posted" in this process (tests and the practice screen). Never a real account. */
export const mockSocialPublishOutbox = {
  all: (): readonly MockSocialPost[] => [...box()],
  clear: (): void => {
    box().length = 0;
  },
};

function mockPublisher(provider: string): SocialPublisher {
  return {
    async publishPhoto(post) {
      if (!post.imageUrl.trim() || !post.caption.trim()) return { ok: false, error: 'a post needs a photo and a caption' };
      seq += 1;
      const externalPostId = `mock-${provider}-${Date.now().toString(36)}-${seq}`;
      const b = box();
      b.push({ ...post, provider, externalPostId, at: new Date() });
      if (b.length > OUTBOX_MAX) b.splice(0, b.length - OUTBOX_MAX);
      return { ok: true, externalPostId };
    },
  };
}

export const facebookPagePublishAdapter = defineAdapter<SocialPublisher, FacebookPagePublishConfig>({
  kind: 'META',
  provider: FACEBOOK_PAGE_PUBLISH_PROVIDER,
  modes: ['LIVE'],
  secrets: ['pageAccessToken'],
  configSchema: facebookPagePublishConfig,
  async create(ctx) {
    return createFacebookPagePublisher({
      baseUrl: ctx.config.baseUrl ?? META_DEFAULT_BASE_URL,
      apiVersion: ctx.config.apiVersion ?? META_DEFAULT_API_VERSION,
      accessToken: await requireSecret(ctx, 'pageAccessToken'),
      pageId: ctx.config.pageId,
    });
  },
  async mock() {
    return mockPublisher(FACEBOOK_PAGE_PUBLISH_PROVIDER);
  },
  async test(api, ctx) {
    if (ctx.mode === 'MOCK') return { ok: true, message: 'mock Facebook Page: nothing leaves the server' };
    const p = await (api as ReturnType<typeof createFacebookPagePublisher>).page?.();
    if (!p) return { ok: false, message: 'no Page in the answer' };
    return { ok: true, message: `connected; Page ${p.name}` };
  },
});

export const instagramPublishAdapter = defineAdapter<SocialPublisher, InstagramPublishConfig>({
  kind: 'META',
  provider: INSTAGRAM_PUBLISH_PROVIDER,
  modes: ['LIVE'],
  secrets: ['pageAccessToken'],
  configSchema: instagramPublishConfig,
  async create(ctx) {
    return createInstagramPublisher({
      baseUrl: ctx.config.baseUrl ?? META_DEFAULT_BASE_URL,
      apiVersion: ctx.config.apiVersion ?? META_DEFAULT_API_VERSION,
      accessToken: await requireSecret(ctx, 'pageAccessToken'),
      igUserId: ctx.config.igUserId,
    });
  },
  async mock() {
    return mockPublisher(INSTAGRAM_PUBLISH_PROVIDER);
  },
  async test(api, ctx) {
    if (ctx.mode === 'MOCK') return { ok: true, message: 'mock Instagram: nothing leaves the server' };
    const a = await (api as ReturnType<typeof createInstagramPublisher>).account?.();
    if (!a) return { ok: false, message: 'no account in the answer' };
    return { ok: true, message: `connected; @${a.username}` };
  },
});

export const socialPublishAdapters = [facebookPagePublishAdapter, instagramPublishAdapter] as const;
