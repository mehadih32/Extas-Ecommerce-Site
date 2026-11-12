// S23 · PR 443 — comments and Direct messages from Facebook and Instagram, into the Support inbox (Blueprint C5.5
// point 5, B4.2, B4.10). Two Meta webhooks, signed the same way as Messenger and WhatsApp (verifyWhatsAppSignature,
// X-Hub-Signature-256 with the app secret):
//   - Facebook Page comments: `object: "page"`, field `feed`, `verb: "comment"` — a public word under one of the
//     Page's own posts. Routed into the SAME channel as the Page's Messenger DMs (one Page, one app, one webhook
//     subscription; messenger/index.ts's `parseMessengerWebhook` already takes the `messaging` field of that body —
//     `parseFacebookCommentsWebhook` here takes the `feed` field of the very same body), so the owner connects one
//     Page once and both its DMs and its public comments reach Support.
//   - Instagram comments and Direct messages: `object: "instagram"`, fields `comments` and `messages` — its own
//     webhook subscription (a Business account, linked through the Page but a separate Graph API object from
//     Messenger), so its own Keys & connections row and its own `SupportChannel` kind, `instagram` (channels.ts
//     reserved the kind and its label; this PR is the first to use it).
// A comment's words carry a short, visible "(public comment on a post)" mark so the team never mistakes a public
// reply for a private one; nothing here replies — Doot (A360-06, Blueprint C10 item 6) only routes and classifies
// ("price?" under a photo becomes a conversation); a reply that commits the business stays a person's job, sent the
// same way as any other inbox reply, kept NOT_SENT with CHANNEL_NOT_CONNECTED until a real adapter sends it (PR 443
// adds no outbound sender for either kind — channels.ts's existing fallback already covers that honestly).
// Honest gap, not built: TikTok comment ingestion. TikTok's public Content/Display API has no webhook that hands a
// third-party app a Page's or video's inbound comments (unlike Facebook's and Instagram's `feed`/`comments` fields);
// faking one here would mean nothing ever arrives behind a working-looking switch, so Support's TikTok row stays
// absent and this file builds only what Meta's API actually offers today. The owner's register row keeps the words
// "and TikTok" from the Blueprint for later: when TikTok opens a real inbound-comments webhook to business apps,
// this module gains its own parser next to the two below, unchanged in shape.
import { z } from 'zod';
import { defineAdapter, requireSecret, AdapterError } from '../define';

export const FACEBOOK_COMMENTS_PROVIDER = 'facebookPageComments';
export const INSTAGRAM_ENGAGEMENT_PROVIDER = 'instagramEngagement';
export const META_ENGAGEMENT_DEFAULT_BASE_URL = 'https://graph.facebook.com';
export const META_ENGAGEMENT_DEFAULT_API_VERSION = 'v21.0';
/** Meta signs every webhook post with the app secret — the same HMAC as Messenger and WhatsApp. */
export const SOCIAL_ENGAGEMENT_SIGNATURE_HEADER = 'x-hub-signature-256';

export const facebookCommentsConfig = z.object({
  /** The Facebook Page's id (the same Page as Messenger, above, when both are connected). */
  pageId: z.string().trim().regex(/^\d{5,30}$/, { message: 'digits only (the Page id from the Meta app)' }),
  apiVersion: z.string().trim().regex(/^v\d{1,3}\.\d{1,2}$/, { message: 'like v21.0' }).optional(),
  baseUrl: z.url({ protocol: /^https$/, message: 'not an https address' }).max(500).optional(),
});
export type FacebookCommentsConfig = z.output<typeof facebookCommentsConfig>;

export const instagramEngagementConfig = z.object({
  /** The Instagram Business account's id (Meta app → the linked Page → Instagram accounts). */
  igUserId: z.string().trim().regex(/^\d{5,30}$/, { message: 'digits only (the Instagram Business account id)' }),
  apiVersion: z.string().trim().regex(/^v\d{1,3}\.\d{1,2}$/, { message: 'like v21.0' }).optional(),
  baseUrl: z.url({ protocol: /^https$/, message: 'not an https address' }).max(500).optional(),
});
export type InstagramEngagementConfig = z.output<typeof instagramEngagementConfig>;

/** Just enough to let the Test button prove the key: read the connected Page or Instagram account's own name. */
export interface EngagementReader {
  account(): Promise<{ name: string }>;
}

type Fetch = typeof fetch;

function graphReader(opts: { baseUrl: string; apiVersion: string; accessToken: string; id: string; fetch?: Fetch }): EngagementReader {
  const doFetch = opts.fetch ?? fetch;
  return {
    async account() {
      const res = await doFetch(`${opts.baseUrl.replace(/\/+$/, '')}/${opts.apiVersion}/${opts.id}?fields=name&access_token=${encodeURIComponent(opts.accessToken)}`);
      const raw = await res.text();
      let body: Record<string, unknown> | null = null;
      try {
        body = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
      } catch {
        body = null;
      }
      if (res.status >= 300 || !body?.name) {
        const e = (body?.error ?? null) as { message?: string } | null;
        throw new Error(e?.message ? e.message.slice(0, 120) : `HTTP ${res.status}: the answer was not understood`);
      }
      return { name: String(body.name) };
    },
  };
}

function mockReader(): EngagementReader {
  return { async account() { return { name: 'practice account' }; } };
}

export const mockFacebookCommentsAdapter = defineAdapter<EngagementReader, Record<string, never>>({
  kind: 'META',
  provider: 'mockFacebookPageComments',
  modes: [],
  secrets: [],
  configSchema: z.object({}).strict() as unknown as z.ZodType<Record<string, never>>,
  async create() {
    throw new AdapterError('no Page is connected for comments yet; the mock serves until its key is entered');
  },
  async mock() {
    return mockReader();
  },
  async test() {
    return { ok: true, message: 'mock Facebook comments: nothing is read, nothing leaves the server' };
  },
});

export const facebookPageCommentsAdapter = defineAdapter<EngagementReader, FacebookCommentsConfig>({
  kind: 'META',
  provider: FACEBOOK_COMMENTS_PROVIDER,
  modes: ['LIVE'],
  secrets: ['pageAccessToken', 'appSecret', 'verifyToken'],
  configSchema: facebookCommentsConfig,
  async create(ctx) {
    return graphReader({
      baseUrl: ctx.config.baseUrl ?? META_ENGAGEMENT_DEFAULT_BASE_URL,
      apiVersion: ctx.config.apiVersion ?? META_ENGAGEMENT_DEFAULT_API_VERSION,
      accessToken: await requireSecret(ctx, 'pageAccessToken'),
      id: ctx.config.pageId,
    });
  },
  async mock() {
    return mockReader();
  },
  async test(api, ctx) {
    if (ctx.mode === 'MOCK') return { ok: true, message: 'mock Facebook comments: nothing is read, nothing leaves the server' };
    const a = await api.account();
    return { ok: true, message: `connected; Page ${a.name}` };
  },
});

export const mockInstagramEngagementAdapter = defineAdapter<EngagementReader, Record<string, never>>({
  kind: 'META',
  provider: 'mockInstagramEngagement',
  modes: [],
  secrets: [],
  configSchema: z.object({}).strict() as unknown as z.ZodType<Record<string, never>>,
  async create() {
    throw new AdapterError('no Instagram account is connected for comments/DMs yet; the mock serves until its key is entered');
  },
  async mock() {
    return mockReader();
  },
  async test() {
    return { ok: true, message: 'mock Instagram comments/DMs: nothing is read, nothing leaves the server' };
  },
});

export const instagramEngagementAdapter = defineAdapter<EngagementReader, InstagramEngagementConfig>({
  kind: 'META',
  provider: INSTAGRAM_ENGAGEMENT_PROVIDER,
  modes: ['LIVE'],
  secrets: ['pageAccessToken', 'appSecret', 'verifyToken'],
  configSchema: instagramEngagementConfig,
  async create(ctx) {
    return graphReader({
      baseUrl: ctx.config.baseUrl ?? META_ENGAGEMENT_DEFAULT_BASE_URL,
      apiVersion: ctx.config.apiVersion ?? META_ENGAGEMENT_DEFAULT_API_VERSION,
      accessToken: await requireSecret(ctx, 'pageAccessToken'),
      id: ctx.config.igUserId,
    });
  },
  async mock() {
    return mockReader();
  },
  async test(api, ctx) {
    if (ctx.mode === 'MOCK') return { ok: true, message: 'mock Instagram comments/DMs: nothing is read, nothing leaves the server' };
    const a = await api.account();
    return { ok: true, message: `connected; account ${a.name}` };
  },
});

export const socialEngagementAdapters = [mockFacebookCommentsAdapter, facebookPageCommentsAdapter, mockInstagramEngagementAdapter, instagramEngagementAdapter] as const;
/** The engagement providers with a LIVE mode (Keys & connections lists them; the mock is not one). */
export const liveSocialEngagementAdapters = [facebookPageCommentsAdapter, instagramEngagementAdapter] as const;

// ------------------------------------------------------------------------------------------------------ inbound

export type EngagementFileKind = 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' | 'OTHER';

/** One comment or Direct message a webhook body brought — Facebook's `feed` field, or Instagram's `comments`/`messages`. */
export interface EngagementInbound {
  /** The Page id (Facebook comments) or the Instagram Business account id (Instagram). */
  rootId: string;
  /** The commenter's or sender's id. */
  from: string;
  name?: string;
  messageId: string;
  text: string;
  files: { kind: EngagementFileKind; url: string }[];
  at: Date;
  /** A comment is public, under a post; a Direct message is private. Carried so the team never confuses the two. */
  isPublicComment: boolean;
  /** The post the comment was left on, when the webhook gave one. */
  postId?: string;
}

/** Facebook Page comments: the webhook's `feed` field, `verb: "comment"`, a real person's own words (not the Page's own reply). */
export function parseFacebookCommentsWebhook(body: unknown): EngagementInbound[] {
  const out: EngagementInbound[] = [];
  const b = body as { object?: unknown; entry?: unknown[] } | null;
  if (b?.object !== 'page' || !Array.isArray(b.entry)) return out;
  for (const entry of b.entry as { id?: unknown; changes?: unknown[] }[]) {
    for (const change of (entry.changes ?? []) as { field?: unknown; value?: Record<string, unknown> }[]) {
      if (change.field !== 'feed') continue;
      const v = change.value ?? {};
      if (v.item !== 'comment' || v.verb !== 'add') continue;
      const from = (v.from as { id?: unknown; name?: unknown } | undefined)?.id;
      const commentId = v.comment_id;
      const pageId = entry.id;
      // the Page's own echo of its own reply carries the Page's own id as `from`: left out, same rule as Messenger's `is_echo`
      if (typeof from !== 'string' || typeof commentId !== 'string' || typeof pageId !== 'string' || from === pageId) continue;
      const ts = Number(v.created_time);
      out.push({
        rootId: pageId,
        from,
        ...(typeof (v.from as { name?: unknown } | undefined)?.name === 'string' ? { name: ((v.from as { name: string }).name).slice(0, 120) } : {}),
        messageId: commentId,
        text: typeof v.message === 'string' ? v.message.slice(0, 8000) : '',
        files: [],
        at: Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000) : new Date(),
        isPublicComment: true,
        ...(typeof v.post_id === 'string' ? { postId: v.post_id } : {}),
      });
    }
  }
  return out;
}

const IG_FILE_KINDS: Record<string, EngagementFileKind> = { image: 'IMAGE', video: 'VIDEO', audio: 'AUDIO', share: 'OTHER' };

/** Instagram comments and Direct messages: the webhook's `comments` and `messages` fields of `object: "instagram"`. */
export function parseInstagramWebhook(body: unknown): EngagementInbound[] {
  const out: EngagementInbound[] = [];
  const b = body as { object?: unknown; entry?: unknown[] } | null;
  if (b?.object !== 'instagram' || !Array.isArray(b.entry)) return out;
  for (const entry of b.entry as { id?: unknown; changes?: unknown[]; messaging?: unknown[] }[]) {
    const igUserId = entry.id;
    if (typeof igUserId !== 'string') continue;
    for (const change of (entry.changes ?? []) as { field?: unknown; value?: Record<string, unknown> }[]) {
      if (change.field !== 'comments') continue;
      const v = change.value ?? {};
      const from = (v.from as { id?: unknown; username?: unknown } | undefined)?.id;
      const commentId = v.id;
      if (typeof from !== 'string' || typeof commentId !== 'string' || from === igUserId) continue;
      out.push({
        rootId: igUserId,
        from,
        ...(typeof (v.from as { username?: unknown } | undefined)?.username === 'string' ? { name: ((v.from as { username: string }).username).slice(0, 120) } : {}),
        messageId: commentId,
        text: typeof v.text === 'string' ? v.text.slice(0, 8000) : '',
        files: [],
        at: new Date(),
        isPublicComment: true,
        ...(typeof v.media === 'object' && v.media && typeof (v.media as Record<string, unknown>).id === 'string' ? { postId: String((v.media as Record<string, unknown>).id) } : {}),
      });
    }
    for (const ev of (entry.messaging ?? []) as Record<string, unknown>[]) {
      const msg = ev.message as { mid?: unknown; text?: unknown; is_echo?: unknown; attachments?: { type?: unknown; payload?: { url?: unknown } }[] } | undefined;
      const from = (ev.sender as { id?: unknown } | undefined)?.id;
      const recipient = (ev.recipient as { id?: unknown } | undefined)?.id ?? igUserId;
      if (!msg || msg.is_echo || typeof msg.mid !== 'string' || typeof from !== 'string' || typeof recipient !== 'string') continue;
      const files = (msg.attachments ?? []).flatMap((a) => {
        const url = a.payload?.url;
        return typeof url === 'string' && /^https:\/\//.test(url) ? [{ kind: IG_FILE_KINDS[String(a.type)] ?? 'OTHER', url: url.slice(0, 2000) }] : [];
      });
      const ts = Number(ev.timestamp);
      out.push({ rootId: recipient, from, messageId: msg.mid, text: typeof msg.text === 'string' ? msg.text.slice(0, 8000) : '', files, at: Number.isFinite(ts) && ts > 0 ? new Date(ts) : new Date(), isPublicComment: false });
    }
  }
  return out;
}
