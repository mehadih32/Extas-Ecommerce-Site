// S08 · PR 192 — the courier claims and rider issues admin API (BACKEND-ARCHITECTURE §5 DLV-05a, SUP-02; SIM-F-017,
// CN-018 (7)). Every route signs the person in (guardAdmin), checks the permission in the store it touches (`?storeId=`,
// default the mother store), then calls @extas/payments, which checks the permission and the owner's switch again and
// writes the audit log in the same transaction. Raising or logging takes an `Idempotency-Key` header. Answers are
// `{ ok: true, … }` or `{ ok: false, error: CODE, details, data }`. Nothing here pays anyone: a claim is a record, and a
// rider's extra is only ever a refund REQUEST that waits for the owner's approval (PR 172).
//
//   GET   /api/admin/delivery/claims?courierAccountId=&open=1|0       the claims, their totals, lost or damaged parcels
//                                                                     still to claim (delivery.read)
//   POST  /api/admin/delivery/claims                                  {shipmentId, kind: LOST|DAMAGED|OTHER, amountMinor?,
//                                                                     note} (delivery.claims; off until delivery.courier.claims)
//   POST  /api/admin/delivery/claims/:id/move                         {to: SENT|SETTLED|REJECTED, settledMinor?, courierRef?,
//                                                                     note?} (delivery.claims)
//   GET   /api/admin/support/rider-issues?status=                     the complaints and their counts (support.read)
//   POST  /api/admin/support/rider-issues                             {orderNumber | orderId, chargedMinor, words,
//                                                                     proofMediaIds} (support.riderIssues.write)
//   POST  /api/admin/support/rider-issues/proof                       multipart `file`: a photo of the proof, checked by its
//                                                                     contents, kept in the media library (folder
//                                                                     "rider-issue-proof"); answers its id (support.riderIssues.write)
//   GET   /api/admin/support/rider-issues/proof/:id                   the proof photo, our stored copy (support.read)
//   POST  /api/admin/support/rider-issues/:id/decide                  {decision: approve|reject, note, confirm} (support.riderIssues.decide)
//   POST  /api/admin/support/rider-issues/:id/refund                  {method} ask the refund of the exact extra — only while
//                                                                     `refundAsk` is on (payments.refunds.request)
// The owner's switches, saved with the value as read (a stale save is refused) and audited:
//   POST  /api/admin/delivery/claims/settings                         {key: delivery.courier.claims | delivery.courier.rtoBook,
//                                                                     value, before} (settings.write)
//   POST  /api/admin/support/rider-issues/settings                    {value, before} support.riderIssues (support.settings)
import { audit, type PermissionKey } from '@extas/auth';
import { MOTHER_STORE_ID, type PrismaClient } from '@extas/db/client';
import { storeGeneratedFile, type MediaDeps } from '@extas/media';
import * as pay from '@extas/payments';
import { courierClaimsSchema, riderIssuesSchema, rtoBookSchema, storeTarget } from '@extas/settings';
import { cleanFileName, sniffFile } from '@extas/support';
import { body, errorResponse, fail, guardAdmin, isUuid, json, type AdminDeps } from './admin-auth';
import { mediaDeps } from './media';
import { paymentsDeps } from './payments-api';

/** The media library folder a rider issue's proof is kept in. */
export const PROOF_FOLDER = 'rider-issue-proof';

interface Ctx {
  deps: pay.PaymentsDeps;
  who: pay.Who;
  key: string | undefined;
  storeId: number;
  staffUserId: string | null;
  admin: AdminDeps;
}

function storeIdOf(url: URL): number | null {
  const raw = url.searchParams.get('storeId');
  const n = raw === null ? MOTHER_STORE_ID : Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

function payFail(e: unknown): Response {
  if (pay.isPaymentsError(e)) return json({ ok: false, error: e.code, ...(e.details.length ? { details: e.details } : {}), ...(e.data ? { data: e.data } : {}) }, { status: e.status });
  return errorResponse(e);
}

async function handle(request: Request, deps: AdminDeps | null, permission: PermissionKey, fn: (c: Ctx) => Promise<Record<string, unknown> | Response>, status = 200): Promise<Response> {
  const storeId = storeIdOf(new URL(request.url));
  if (storeId === null) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission, storeId });
  if (g instanceof Response) return g;
  try {
    const key = request.headers.get('idempotency-key')?.trim() || undefined;
    const out = await fn({ deps: await paymentsDeps(deps!), who: { actor: g.actor, storeId, ctx: g.ctx }, key, storeId, staffUserId: g.actor.staffUserId ?? null, admin: deps! });
    return out instanceof Response ? out : json({ ok: true, ...out }, { status });
  } catch (e) {
    return payFail(e);
  }
}

const notAllowed = () => Promise.resolve(fail(405, 'method-not-allowed'));
const notFound = () => Promise.resolve(fail(404, 'not-found'));

const SWITCHES = {
  'delivery.courier.claims': { schema: courierClaimsSchema, reason: 'Delivery › Couriers › Claims' },
  'delivery.courier.rtoBook': { schema: rtoBookSchema, reason: 'Reports › Delivery & RTO' },
  'support.riderIssues': { schema: riderIssuesSchema, reason: 'Support › Rider issues' },
} as const;
type SwitchKey = keyof typeof SWITCHES;

/** Saves one of the owner's switches: `before` must be the value the page showed (else STALE: someone saved first). */
async function saveSwitch(request: Request, x: Ctx, allowed: readonly SwitchKey[]): Promise<Response> {
  const b = (await body(request)) as { key?: unknown; value?: unknown; before?: unknown };
  const key = (allowed.length === 1 ? allowed[0] : b.key) as SwitchKey;
  if (!allowed.includes(key)) return fail(400, 'INVALID_INPUT', ['key']);
  const spec = SWITCHES[key];
  const ok = spec.schema.safeParse(b.value);
  if (!ok.success) return fail(400, 'INVALID_INPUT', ok.error.issues.map((i) => `${i.path.join('.') || 'value'}: ${i.message}`));
  const at = { storeId: x.storeId };
  const before = await x.admin.resolver.value(key, at);
  if (JSON.stringify(b.before) !== JSON.stringify(before)) return json({ ok: false, error: 'STALE', data: { value: before } }, { status: 409 });
  if (JSON.stringify(ok.data) !== JSON.stringify(before)) {
    await x.admin.resolver.set(key, ok.data as never, storeTarget(x.storeId), { actorId: x.staffUserId, reason: spec.reason });
    await audit(x.admin.db, x.who.actor, { storeId: x.storeId, action: 'setting.save', entityType: 'Setting', entityId: key, before: { ...before }, after: { ...ok.data } }, x.who.ctx);
  }
  return json({ ok: true, key, value: ok.data });
}

/** Courier claims: `path` is what comes after /api/admin/delivery/claims. */
export async function claimsRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  const m = request.method.toUpperCase();
  const [id, action] = path;
  if (id === 'settings' && path.length === 1) {
    if (m !== 'POST') return notAllowed();
    return handle(request, deps, 'settings.write', (x) => saveSwitch(request, x, ['delivery.courier.claims', 'delivery.courier.rtoBook']));
  }
  if (id === undefined) {
    if (m === 'GET') {
      const u = new URL(request.url);
      const open = u.searchParams.get('open');
      const courierAccountId = u.searchParams.get('courierAccountId') ?? undefined;
      return handle(request, deps, 'delivery.read', async (x) => ({ ...(await pay.listClaims(x.deps, x.who, { courierAccountId, ...(open === null ? {} : { open: open === '1' }) })) }));
    }
    if (m !== 'POST') return notAllowed();
    return handle(request, deps, 'delivery.claims', async (x) => ({ ...(await pay.raiseClaim(x.deps, x.who, await body(request), { idempotencyKey: x.key })) }), 201);
  }
  if (path.length !== 2 || action !== 'move') return notFound();
  if (!isUuid(id)) return Promise.resolve(fail(404, 'NOT_FOUND', ['claimId']));
  if (m !== 'POST') return notAllowed();
  return handle(request, deps, 'delivery.claims', async (x) => ({ claim: await pay.moveClaim(x.deps, x.who, id, await body(request)) }));
}

/** A proof photo: a picture only, by its contents, within `support.riderIssues` (off: refused). */
async function uploadProof(request: Request, x: Ctx, media: MediaDeps | null): Promise<Response> {
  const rules = await x.admin.resolver.value('support.riderIssues', { storeId: x.storeId });
  if (!rules.enabled) return fail(422, 'FEATURE_OFF');
  const maxBytes = rules.photoMaxMb * 1024 * 1024;
  if (Number(request.headers.get('content-length') ?? '0') > maxBytes * 1.05 + 64 * 1024) return fail(413, 'TOO_LARGE', [`max:${rules.photoMaxMb}`]);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail(400, 'INVALID_INPUT', ['file']);
  }
  const file = form.get('file');
  if (!(file instanceof File)) return fail(400, 'INVALID_INPUT', ['file']);
  if (file.size === 0) return fail(400, 'EMPTY', ['file']);
  if (file.size > maxBytes) return fail(413, 'TOO_LARGE', [`max:${rules.photoMaxMb}`]);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffFile(bytes);
  if (!kind || kind.kind !== 'image') return fail(422, 'FILE_NOT_ALLOWED', ['file']);
  if (!media) return fail(503, 'database-not-configured');
  const fileName = cleanFileName(file.name);
  const a = await storeGeneratedFile(media, { storeId: x.storeId, kind: kind.mediaKind, body: bytes, contentType: kind.contentType, name: 'rider issue proof', extension: kind.extension, folder: PROOF_FOLDER, fileName, uploadedById: x.staffUserId });
  return json({ ok: true, file: { id: a.id, fileName, contentType: kind.contentType } }, { status: 201 });
}

const proofOf = (db: Pick<PrismaClient, 'mediaAsset'>, storeId: number, id: string) =>
  db.mediaAsset.findFirst({ where: { id, storeId, folder: PROOF_FOLDER }, select: { id: true, storage: true, storageKey: true, mimeType: true, originalFileName: true } });

async function downloadProof(x: Ctx, media: MediaDeps | null, id: string): Promise<Response> {
  const f = await proofOf(x.admin.db, x.storeId, id);
  if (!f) return fail(404, 'NOT_FOUND', ['id']);
  if (!media) return fail(503, 'database-not-configured');
  const got = await (await media.storage(x.storeId, f.storage as Parameters<typeof media.storage>[1])).get(f.storageKey);
  if (!got) return fail(404, 'NOT_FOUND', ['id']);
  const name = (f.originalFileName ?? 'proof').replace(/[^\x20-\x7e]/g, '_').replace(/[\\"]/g, '_');
  return new Response(new Uint8Array(got.body), {
    status: 200,
    headers: { 'content-type': f.mimeType, 'content-disposition': `inline; filename="${name}"`, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'x-robots-tag': 'noindex' },
  });
}

/** Rider issues: `path` is what comes after /api/admin/support/rider-issues; `media` (tests) replaces the app's storage. */
export async function riderIssuesRoute(request: Request, deps: AdminDeps | null, path: string[], media?: MediaDeps | null): Promise<Response> {
  const m = request.method.toUpperCase();
  const [a, b] = path;
  const files = () => (media === undefined ? mediaDeps() : media);
  if (a === undefined) {
    if (m === 'GET') {
      const status = new URL(request.url).searchParams.get('status') ?? undefined;
      return handle(request, deps, 'support.read', async (x) => ({ ...(await pay.listRiderIssues(x.deps, x.who, status ? { status } : {})) }));
    }
    if (m !== 'POST') return notAllowed();
    return handle(
      request,
      deps,
      'support.riderIssues.write',
      async (x) => {
        const raw = (await body(request)) as Record<string, unknown>;
        const { orderNumber, ...rest } = raw;
        let orderId = rest.orderId;
        if (orderId === undefined && typeof orderNumber === 'string' && orderNumber.trim()) {
          const o = await x.deps.db.order.findFirst({ where: { storeId: x.storeId, number: orderNumber.trim() }, select: { id: true } });
          if (!o) throw new pay.PaymentsError('NOT_FOUND', 'no order with this number', ['orderNumber']);
          orderId = o.id;
        }
        return { ...(await pay.logRiderIssue(x.deps, x.who, { ...rest, orderId }, { idempotencyKey: x.key })) };
      },
      201,
    );
  }
  if (a === 'settings' && path.length === 1) {
    if (m !== 'POST') return notAllowed();
    return handle(request, deps, 'support.settings', (x) => saveSwitch(request, x, ['support.riderIssues']));
  }
  if (a === 'proof') {
    if (path.length === 1) {
      if (m !== 'POST') return notAllowed();
      return handle(request, deps, 'support.riderIssues.write', (x) => uploadProof(request, x, files()));
    }
    if (path.length !== 2 || !isUuid(b ?? '')) return notFound();
    if (m !== 'GET') return notAllowed();
    return handle(request, deps, 'support.read', (x) => downloadProof(x, files(), b!));
  }
  if (path.length !== 2 || (b !== 'decide' && b !== 'refund')) return notFound();
  if (!isUuid(a)) return Promise.resolve(fail(404, 'NOT_FOUND', ['issueId']));
  if (m !== 'POST') return notAllowed();
  if (b === 'decide') return handle(request, deps, 'support.riderIssues.decide', async (x) => ({ issue: await pay.decideRiderIssue(x.deps, x.who, a, await body(request)) }));
  return handle(request, deps, 'payments.refunds.request', async (x) => ({ ...(await pay.askRiderRefund(x.deps, x.who, a, await body(request), { idempotencyKey: x.key })) }));
}
