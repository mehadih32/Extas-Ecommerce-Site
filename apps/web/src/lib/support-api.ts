// S22 · PR 425 — the support inbox's admin API (Support › Inbox, Support settings; Blueprint B4.4). Every route signs
// the person in (guardAdmin), checks the permission in the store it touches (`?storeId=`, default the mother store),
// then calls @extas/support, which checks it again. JSON answers are `{ ok: true, … }` or `{ ok: false, error: CODE,
// details }`; a file answer is the file itself.
//
//   GET   /api/admin/support                    ?view=&q=&channel=&page= — the inbox (support.read)
//   GET   /api/admin/support/c/:id              one conversation: messages, files, notes, the log (support.read)
//   POST  /api/admin/support/c/:id/messages     {body, note, assetIds, requestKey, version?} a reply or an internal
//                                               note; a reply with no connected channel is kept as NOT_SENT (support.reply)
//   POST  /api/admin/support/c/:id/assign       {staffId|null, version?} take, let go or give (support.reply; another
//                                               person: support.assign)
//   POST  /api/admin/support/c/:id/status       {status: OPEN|WAITING|SOLVED, version?} (support.reply)
//   POST  /api/admin/support/c/:id/identity     PR 427: {action: phone|unlink|split, phone?, version?} who is writing —
//                                               set the chat's number (and so its customer), "not this customer", "not
//                                               the same person"; audited (support.identity)
//   GET   /api/admin/support/catalogue          PR 429: ?q= the catalogue drawer's search — live products by name, SKU
//                                               or colour, with their colours, sizes and stock (support.reply; off
//                                               while `support.catalogue` is off: CATALOGUE_OFF)
//   POST  /api/admin/support/c/:id/products     PR 429: {productId, variantId?, colour?, lang?, requestKey, version?}
//                                               one product sent as a card — its photos, name, price and the link
//                                               with the chat's `r=` reference (support.reply)
//   GET   /api/admin/support/c/:id/cart         PR 430: the chat's bag — its lines priced by the shop's own engines and
//                                               the details to start from (support.order; CART_OFF while
//                                               `support.cart` is off)
//   POST  /api/admin/support/c/:id/cart         PR 430: {action: add|quantity|remove, …} the bag changed; {action: quote,
//                                               form} the checkout priced for the details with the fraud gate (cod |
//                                               advance | closed); {action: order, form, fingerprint, requestKey}
//                                               "Create order" / "Take advance": the checkout's own placeOrder with the
//                                               chat's channel as source, the shop's after-order checks, the pay link
//                                               sent into the chat when the owner's layer asks an advance (support.order)
//   POST  /api/admin/support/files              multipart `file` — one file for a reply, checked by its contents
//                                               against Support settings; answers its id (support.reply)
//   GET   /api/admin/support/files/:id          one file of a conversation, our stored copy (support.read)
//   GET   /api/admin/support/staff              who can take conversations here (support.read)
//   GET   /api/admin/support/settings           the Support settings cards with their versions (support.read)
//   PUT   /api/admin/support/settings           {key, value, version} one card saved whole (support.settings); the
//                                               live chat switched on makes its channel (PR 426)
//   GET   /api/admin/support/channels           PR 426: the store's channels with their conversations (support.read)
//   POST  /api/admin/support/channels           {action: add|rename|switch|archive, …} a Messenger Page or a WhatsApp
//                                               number added (switched off), renamed, switched, put away; never deleted
//                                               (support.settings)
// PR 426: replies go out through the channels' connectors (lib/support-connect: Messenger, WhatsApp with Meta's reply
// window, the site's live chat), each the practice mock until its key is in Keys & connections.
import { MOTHER_STORE_ID } from '@extas/db/client';
import { checkoutFlag } from '@extas/orders';
import { storeGeneratedFile, type MediaDeps } from '@extas/media';
import type { PermissionKey } from '@extas/auth';
import * as sp from '@extas/support';
import { body, errorResponse, fail, guardAdmin, isUuid, json, type AdminDeps } from './admin-auth';
import { mediaDeps } from './media';
import { paymentModeOf } from './payments-gateway';
import { orderLanded } from './shop/checkout-api';
import { hrefIn } from './shop/lang';
import { ROUTES } from './shop/routes';
import { siteAddress } from './seo/site';
import { supportConnections, supportSenders } from './support-connect';
import inboxEn from '../../messages/admin-inbox.en.json';

/** How the inbox names the live chat's channel when it is made (the team can rename it). */
export const LIVE_CHAT_CHANNEL_NAME = inboxEn.sup.kind.livechat;

function storeIdOf(url: URL): number | null {
  const raw = url.searchParams.get('storeId');
  const n = raw === null ? MOTHER_STORE_ID : Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

function supportFail(e: unknown): Response {
  if (sp.isSupportError(e)) return json({ ok: false, error: e.code, ...(e.details.length ? { details: e.details } : {}), ...(e.data ? { data: e.data } : {}) }, { status: e.status });
  return errorResponse(e);
}

/** The support core's dependencies from the admin's, with the channels' reply adapters (PR 426). */
export const supportDeps = (d: AdminDeps): sp.SupportDeps => {
  const base = { db: d.db, settings: d.resolver, now: d.now };
  return { ...base, channels: sp.supportChannelAdapters(base, supportSenders(() => supportConnections(d))) };
};

/**
 * PR 430: what orders from the chat need — the support core, the checkout's engines as the shop wires them (the owner's
 * Parameter for Checkout is the fraud gate; the payment modes for the go-live guard) and the shop's after-order checks.
 */
export const chatOrderDeps = (d: AdminDeps): sp.ChatOrderDeps => {
  const settings = d.resolver;
  const checkout = { db: d.db, settings, now: d.now, paymentMode: paymentModeOf, advanceFlag: (input: Parameters<typeof checkoutFlag>[1]) => checkoutFlag({ db: d.db, settings, now: d.now }, input) };
  return { ...supportDeps(d), checkout, afterPlace: (storeId, orderId) => orderLanded({ checkout, storeId }, orderId) };
};

type Route = { perm: PermissionKey; methods: string[] };

/** Which permission each path asks for at the door (the package checks again, and "give to someone" more closely). */
function routeOf(path: string[], method: string): Route | null {
  const [a, b, c, ...rest] = path;
  if (rest.length) return null;
  if (a === undefined) return { perm: 'support.read', methods: ['GET'] };
  if (a === 'c' && isUuid(b) && c === undefined) return { perm: 'support.read', methods: ['GET'] };
  if (a === 'c' && isUuid(b) && (c === 'messages' || c === 'assign' || c === 'status')) return { perm: 'support.reply', methods: ['POST'] };
  if (a === 'c' && isUuid(b) && c === 'identity') return { perm: 'support.identity', methods: ['POST'] };
  if (a === 'c' && isUuid(b) && c === 'products') return { perm: 'support.reply', methods: ['POST'] };
  if (a === 'c' && isUuid(b) && c === 'cart') return { perm: 'support.order', methods: ['GET', 'POST'] };
  if (a === 'catalogue' && b === undefined) return { perm: 'support.reply', methods: ['GET'] };
  if (a === 'files' && b === undefined && c === undefined) return { perm: 'support.reply', methods: ['POST'] };
  if (a === 'files' && isUuid(b) && c === undefined) return { perm: 'support.read', methods: ['GET'] };
  if (a === 'staff' && b === undefined) return { perm: 'support.read', methods: ['GET'] };
  if (a === 'settings' && b === undefined) return { perm: method === 'PUT' ? 'support.settings' : 'support.read', methods: ['GET', 'PUT'] };
  if (a === 'channels' && b === undefined) return { perm: method === 'POST' ? 'support.settings' : 'support.read', methods: ['GET', 'POST'] };
  return null;
}

/** RFC 6266 file name: a plain ASCII fallback and the UTF-8 name. */
function disposition(name: string | null, fallback: string): string {
  const n = sp.cleanFileName(name) ?? fallback;
  const ascii = n.replace(/[^\x20-\x7e]/g, '_').replace(/[\\"]/g, '_');
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(n)}`;
}

async function upload(request: Request, d: AdminDeps, media: MediaDeps | null, storeId: number, staffUserId: string | null): Promise<Response> {
  const rules = await d.resolver.value('support.attachments', { storeId });
  if (!rules.enabled) return fail(422, 'FILES_OFF');
  const maxBytes = rules.maxMb * 1024 * 1024;
  const declared = Number(request.headers.get('content-length') ?? '0');
  // the form around the file adds a little; anything far beyond the limit is refused before it is read
  if (declared > maxBytes * 1.05 + 64 * 1024) return fail(413, 'TOO_LARGE', [`max:${rules.maxMb}`]);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, 'INVALID_INPUT', ['file']);
  }
  const file = form.get('file');
  if (!(file instanceof File)) return fail(400, 'INVALID_INPUT', ['file']);
  if (file.size === 0) return fail(400, 'EMPTY', ['file']);
  if (file.size > maxBytes) return fail(413, 'TOO_LARGE', [`max:${rules.maxMb}`]);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sp.sniffFile(bytes);
  if (!kind || !rules.kinds[kind.kind]) return fail(422, 'FILE_NOT_ALLOWED', ['file']);
  if (!media) return fail(503, 'database-not-configured');
  const fileName = sp.cleanFileName(file.name);
  const a = await storeGeneratedFile(media, { storeId, kind: kind.mediaKind, body: bytes, contentType: kind.contentType, name: 'support file', extension: kind.extension, folder: 'support', fileName, uploadedById: staffUserId });
  return json({ ok: true, file: { id: a.id, fileName, kind: kind.mediaKind, contentType: kind.contentType, sizeBytes: bytes.byteLength } }, { status: 201 });
}

async function download(d: AdminDeps, media: MediaDeps | null, who: sp.Who, id: string): Promise<Response> {
  const f = await sp.supportFile(d, who, id);
  if (!media) return fail(503, 'database-not-configured');
  const got = await (await media.storage(who.storeId, f.storage as Parameters<typeof media.storage>[1])).get(f.storageKey);
  if (!got) return fail(404, 'NOT_FOUND', ['id']);
  return new Response(new Uint8Array(got.body), {
    status: 200,
    headers: {
      'content-type': f.contentType,
      'content-disposition': disposition(f.fileName, 'file'),
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'x-robots-tag': 'noindex',
    },
  });
}

/** PR 429: the shop's own address for a product link (the store's domain, a setting); none outside a request. */
async function shopOriginOf(storeId: number): Promise<string | null> {
  try {
    return (await siteAddress(storeId)).origin?.origin ?? null;
  } catch {
    return null;
  }
}

/** PR 430: the chat's bag, its price with the gate, and "Create order". */
async function cartRoute(request: Request, d: AdminDeps, who: sp.Who, id: string, url: URL): Promise<Response> {
  const cd = chatOrderDeps(d);
  const lang = url.searchParams.get('lang') === 'bn' ? 'bn' : 'en';
  if (request.method.toUpperCase() === 'GET') return json({ ok: true, bag: await sp.chatBag(cd, who, id, lang) });
  const { action, ...rest } = (await body(request)) as { action?: unknown };
  const input = { ...rest, conversationId: id };
  if (action === 'quote') return json({ ok: true, quote: await sp.quoteChatOrder(cd, who, input) });
  if (action === 'order') {
    const origin = (await shopOriginOf(who.storeId)) ?? '';
    return json({ ok: true, order: await sp.createChatOrder(cd, who, input, { payLink: (token, l) => `${origin}${hrefIn(l, ROUTES.payLink(token))}` }) });
  }
  return json({ ok: true, bag: await sp.changeChatBag(cd, who, { ...input, action }) });
}

/** `path` is what comes after /api/admin/support; `media` (tests) replaces the app's file storage. */
export async function supportRoute(request: Request, deps: AdminDeps | null, path: string[], media?: MediaDeps | null): Promise<Response> {
  const m = request.method.toUpperCase();
  const url = new URL(request.url);
  const storeId = storeIdOf(url);
  if (storeId === null) return fail(400, 'invalid-store-id');
  const r = routeOf(path, m);
  if (!r) return fail(404, 'not-found');
  if (!r.methods.includes(m)) return fail(405, 'method-not-allowed');
  const g = await guardAdmin(request, deps, { permission: r.perm, storeId });
  if (g instanceof Response) return g;
  const who: sp.Who = { actor: g.actor, storeId, ctx: g.ctx };
  const d = deps!;
  const sd = supportDeps(d);
  const [a, id, action] = path;
  try {
    if (a === undefined) {
      const q = url.searchParams;
      return json({ ok: true, ...(await sp.supportInbox(sd, who, { view: q.get('view') || undefined, q: q.get('q') || undefined, channel: q.get('channel') || undefined, page: q.get('page') || undefined })) });
    }
    if (a === 'c' && id) {
      if (action === undefined) return json({ ok: true, thread: await sp.supportThread(sd, who, id) });
      if (action === 'cart') return await cartRoute(request, d, who, id, url);
      const input = { ...(await body(request)), conversationId: id };
      if (action === 'messages') return json({ ok: true, ...(await sp.replyToConversation(sd, who, input)) });
      if (action === 'products') return json({ ok: true, ...(await sp.shareProduct(sd, who, input, { origin: await shopOriginOf(storeId) })) });
      if (action === 'assign') return json({ ok: true, ...(await sp.assignConversation(sd, who, input)) });
      if (action === 'identity') {
        const { action: what, ...rest } = input as { action?: unknown };
        if (what === 'phone') return json({ ok: true, ...(await sp.setContactPhone(sd, who, rest)) });
        if (what === 'unlink') return json({ ok: true, ...(await sp.unlinkContactCustomer(sd, who, rest)) });
        if (what === 'split') return json({ ok: true, ...(await sp.splitContact(sd, who, rest)) });
        return fail(400, 'INVALID_INPUT', ['action']);
      }
      return json({ ok: true, ...(await sp.setConversationStatus(sd, who, input)) });
    }
    if (a === 'files') {
      const files = media === undefined ? mediaDeps() : media;
      return id ? await download(d, files, who, id) : await upload(request, d, files, storeId, g.actor.staffUserId);
    }
    if (a === 'staff') return json({ ok: true, staff: await sp.supportStaff(sd, who) });
    if (a === 'catalogue') return json({ ok: true, ...(await sp.chatCatalogue(sd, who, { q: (url.searchParams.get('q') ?? '').slice(0, 80) })) });
    if (a === 'channels') {
      if (m === 'GET') return json({ ok: true, ...(await sp.supportChannels(sd, who)) });
      const saved = await sp.saveSupportChannel(sd, who, await body(request));
      return json({ ok: true, ...saved, ...(await sp.supportChannels(sd, who)) });
    }
    const settings = { db: d.db, settings: d.resolver };
    if (m === 'GET') return json({ ok: true, cards: await sp.supportSettingsView(settings, who) });
    const cards = await sp.saveSupportSetting(settings, who, await body(request));
    // the live chat switched on: its channel is there for the inbox and the channels list straight away
    if (cards['support.liveChat'].value.enabled) await sp.ensureLiveChatChannel(d, storeId, LIVE_CHAT_CHANNEL_NAME);
    return json({ ok: true, cards });
  } catch (e) {
    return supportFail(e);
  }
}
