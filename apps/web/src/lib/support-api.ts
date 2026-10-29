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
//   POST  /api/admin/support/files              multipart `file` — one file for a reply, checked by its contents
//                                               against Support settings; answers its id (support.reply)
//   GET   /api/admin/support/files/:id          one file of a conversation, our stored copy (support.read)
//   GET   /api/admin/support/staff              who can take conversations here (support.read)
//   GET   /api/admin/support/settings           the Support settings cards with their versions (support.read)
//   PUT   /api/admin/support/settings           {key, value, version} one card saved whole (support.settings)
import { MOTHER_STORE_ID } from '@extas/db/client';
import { storeGeneratedFile, type MediaDeps } from '@extas/media';
import type { PermissionKey } from '@extas/auth';
import * as sp from '@extas/support';
import { body, errorResponse, fail, guardAdmin, isUuid, json, type AdminDeps } from './admin-auth';
import { mediaDeps } from './media';

function storeIdOf(url: URL): number | null {
  const raw = url.searchParams.get('storeId');
  const n = raw === null ? MOTHER_STORE_ID : Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

function supportFail(e: unknown): Response {
  if (sp.isSupportError(e)) return json({ ok: false, error: e.code, ...(e.details.length ? { details: e.details } : {}), ...(e.data ? { data: e.data } : {}) }, { status: e.status });
  return errorResponse(e);
}

/** The support core's dependencies from the admin's (no channel is connected yet: PR 426). */
export const supportDeps = (d: AdminDeps): sp.SupportDeps => ({ db: d.db, settings: d.resolver, now: d.now });

type Route = { perm: PermissionKey; methods: string[] };

/** Which permission each path asks for at the door (the package checks again, and "give to someone" more closely). */
function routeOf(path: string[], method: string): Route | null {
  const [a, b, c, ...rest] = path;
  if (rest.length) return null;
  if (a === undefined) return { perm: 'support.read', methods: ['GET'] };
  if (a === 'c' && isUuid(b) && c === undefined) return { perm: 'support.read', methods: ['GET'] };
  if (a === 'c' && isUuid(b) && (c === 'messages' || c === 'assign' || c === 'status')) return { perm: 'support.reply', methods: ['POST'] };
  if (a === 'files' && b === undefined && c === undefined) return { perm: 'support.reply', methods: ['POST'] };
  if (a === 'files' && isUuid(b) && c === undefined) return { perm: 'support.read', methods: ['GET'] };
  if (a === 'staff' && b === undefined) return { perm: 'support.read', methods: ['GET'] };
  if (a === 'settings' && b === undefined) return { perm: method === 'PUT' ? 'support.settings' : 'support.read', methods: ['GET', 'PUT'] };
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
      const input = { ...(await body(request)), conversationId: id };
      if (action === 'messages') return json({ ok: true, ...(await sp.replyToConversation(sd, who, input)) });
      if (action === 'assign') return json({ ok: true, ...(await sp.assignConversation(sd, who, input)) });
      return json({ ok: true, ...(await sp.setConversationStatus(sd, who, input)) });
    }
    if (a === 'files') {
      const files = media === undefined ? mediaDeps() : media;
      return id ? await download(d, files, who, id) : await upload(request, d, files, storeId, g.actor.staffUserId);
    }
    if (a === 'staff') return json({ ok: true, staff: await sp.supportStaff(sd, who) });
    const settings = { db: d.db, settings: d.resolver };
    if (m === 'GET') return json({ ok: true, cards: await sp.supportSettingsView(settings, who) });
    return json({ ok: true, cards: await sp.saveSupportSetting(settings, who, await body(request)) });
  } catch (e) {
    return supportFail(e);
  }
}
