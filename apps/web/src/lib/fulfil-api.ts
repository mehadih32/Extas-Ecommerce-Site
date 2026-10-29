// S08 · PR 179–181 — the Packing & print admin API (Orders → Packing & print; Blueprint B1.4). Every route signs the person
// in (guardAdmin), checks the permission in the store it touches (`?storeId=`, default the mother store), then calls
// @extas/shipping, which checks the permission again and audits. JSON answers are `{ ok: true, … }` or
// `{ ok: false, error: CODE, details, data }`; a PDF answer is the file itself.
//
//   GET   /api/admin/packing/stickers          the print run: booked parcels still with us, in packing order, each with
//                                              its print count and why it cannot be printed (no customer's details)
//                                              (fulfilment.read)
//   POST  /api/admin/packing/stickers          {shipmentIds: [...], reason?, requestKey?} the stickers as one PDF; one
//                                              print job, every print counted, a second print marked REPRINT n (with
//                                              its reason: REASON_REQUIRED without one, when the owner asks why); the
//                                              same requestKey again is the same job (header x-print-replay: 1);
//                                              refused as a whole with each parcel's reason (NOT_PRINTABLE: COD_CHANGED,
//                                              RECEIVER_CHANGED, NOT_WITH_US …) (fulfilment.print)
//   GET   /api/admin/packing/stickers/sample   a sample sticker at the owner's size, to try the printer (fulfilment.print)
//   GET   /api/admin/packing/stickers/recent   the last prints (stickers and handover sheets) (fulfilment.read)
//   GET   /api/admin/packing/handover          PR 180: per courier, the parcels waiting to be handed over, each with why
//                                              it cannot go yet, and the open batch (fulfilment.read)
//   POST  /api/admin/packing/handover/sheet    {courierAccountId, requestKey?} the rider's handover sheet as a PDF: the
//                                              ready parcels on the courier's open batch, counted (fulfilment.handover)
//   POST  /api/admin/packing/handover/done     {batchId, receivedBy} the batch handed over: its ready orders move to
//                                              "handed over"; the rest are named (fulfilment.handover)
//   GET   /api/admin/packing/picking           PR 181: the daily picking list (?from=&to= days, optional): orders and
//                                              pieces, category → style → colour → size, shortages, held orders apart
//                                              (fulfilment.read; no customer's details)
//   POST  /api/admin/packing/picking           {from?, to?} the picking list as a PDF; the list is kept with a print
//                                              job (fulfilment.read)
//   GET   /api/admin/packing/orders            PR 182: the packing steps with their counts and one step's orders
//                                              (?step=pick|pack|ready|done; no customer's details) (fulfilment.read)
//   POST  /api/admin/packing/orders/pick-all   "Start picking" for every order on the Pick step: the list's own filter,
//                                              never a cancelled, held or in-review order (SIM-F-002) (fulfilment.pack)
//   GET   /api/admin/packing/orders/{id}       one order at the packing table: its lines and checks, open packing
//                                              cards, photos, weight, parcel, and what stops "Mark packed" (fulfilment.read)
//   POST  …/orders/{id}/start                  confirmed → picking started, through the order service [Idempotency-Key]
//   POST  …/orders/{id}/piece                  {code, source: scan|typed} or {lineId, source: tick}: one piece checked;
//                                              a code on no line or a complete line is refused (fulfilment.pack)
//   POST  …/orders/{id}/pack                   {weighedGrams?, weightConfirmed?} "Mark packed" through the order service
//                                              [Idempotency-Key]: refused NOT_CHECKED, PACKING_ISSUE_OPEN, PHOTO_REQUIRED,
//                                              WEIGHT_REQUIRED, WEIGHT_GAP (fulfilment.pack)
//   POST  …/orders/{id}/photo                  multipart `file`: the packing photo, its metadata stripped, kept in the
//                                              media library for the owner's days (fulfilment.pack; PHOTO_OFF when off)
//   POST  …/orders/{id}/waive                  {reason} the owner's override of a required photo (fulfilment.photoWaive)
import sharp from 'sharp';
import { storeGeneratedFile } from '@extas/media';
import { isOrdersError } from '@extas/orders';
import * as sh from '@extas/shipping';
import { body, fail, guardAdmin, isUuid, json, type AdminDeps } from './admin-auth';
import { handoverPdf, type Letterhead } from './admin-fulfil/handover';
import { pickingPdf } from './admin-fulfil/picking';
import { sampleParcel, stickerInput, stickersPdf, pdfName, type StickerContext } from './admin-fulfil/sticker';
import { fulfilDicts } from './admin-fulfil/i18n';
import { mediaDeps } from './media';
import { shippingDeps, shippingFail, storeIdOf } from './shipping-api';

type FulfilPermission = sh.FulfilPermission;

interface Ctx {
  deps: sh.ShippingDeps;
  admin: AdminDeps;
  who: sh.Who;
  url: URL;
}

async function guarded(request: Request, deps: AdminDeps | null, permission: FulfilPermission, fn: (c: Ctx) => Promise<Response>): Promise<Response> {
  const url = new URL(request.url);
  const storeId = storeIdOf(url);
  if (storeId === null) return fail(400, 'invalid-store-id');
  const g = await guardAdmin(request, deps, { permission, storeId });
  if (g instanceof Response) return g;
  try {
    return await fn({ deps: await shippingDeps(deps!), admin: deps!, who: { actor: g.actor, storeId, ctx: g.ctx }, url });
  } catch (e) {
    // PR 182: a step through the order service answers with the order machine's own refusal (ILLEGAL_TRANSITION, STALE …)
    if (isOrdersError(e)) return json({ ok: false, error: e.code, ...(e.details.length ? { details: e.details } : {}), ...(e.data ? { data: e.data } : {}) }, { status: e.status });
    return shippingFail(e);
  }
}

function pdf(bytes: Buffer, name: string, extra: Record<string, string> = {}): Response {
  return new Response(new Uint8Array(bytes), { status: 200, headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="${name}"`, 'cache-control': 'no-store', ...extra } });
}

/** The shop's letterhead (name, address in the sheet's language, phone) and its time zone. */
async function letterhead(deps: sh.ShippingDeps, storeId: number, lang: 'en' | 'bn'): Promise<{ head: Letterhead; timeZone: string }> {
  const v = <K extends Parameters<sh.SettingsReader['value']>[0]>(k: K) => deps.settings.value(k, { storeId });
  const [name, address, phone, timeZone] = await Promise.all([v('store.name'), v('contact.address'), v('contact.phone'), v('store.timeZone')]);
  return { head: { name, address: address ? address[lang] || address.en || null : null, phone: phone ?? null }, timeZone };
}

/** The owner's sticker settings and the shop's name and phone, for one store. */
async function stickerContext(deps: sh.ShippingDeps, storeId: number): Promise<StickerContext> {
  const v = <K extends Parameters<sh.SettingsReader['value']>[0]>(k: K) => deps.settings.value(k, { storeId });
  const [layout, exact, shopName, shopPhone] = await Promise.all([v('delivery.sticker.layout'), v('delivery.sticker.exactAmount'), v('store.name'), v('contact.phone')]);
  return { layout, exact, shopName, shopPhone: shopPhone ?? null };
}

/** `path` is what comes after /api/admin/packing/stickers. */
export async function stickersRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  const m = request.method.toUpperCase();
  if (path.length === 1 && path[0] === 'sample') {
    if (m !== 'GET') return fail(405, 'method-not-allowed');
    return guarded(request, deps, 'fulfilment.print', async (x) => {
      const c = await stickerContext(x.deps, x.who.storeId);
      const currency = await x.deps.settings.value('store.currency', { storeId: x.who.storeId });
      const input = stickerInput(sampleParcel(fulfilDicts[c.layout.lang], currency), c);
      return pdf(await stickersPdf([input], c.layout, 'Sample sticker'), pdfName('sample-sticker'));
    });
  }
  if (path.length === 1 && path[0] === 'recent') {
    if (m !== 'GET') return fail(405, 'method-not-allowed');
    return guarded(request, deps, 'fulfilment.read', async (x) => json({ ok: true, jobs: await sh.printJobs(x.deps, x.who) }));
  }
  if (path.length) return fail(404, 'not-found');
  if (m === 'GET') return guarded(request, deps, 'fulfilment.read', async (x) => json({ ok: true, ...(await sh.printRun(x.deps, x.who)) }));
  if (m === 'POST')
    return guarded(request, deps, 'fulfilment.print', async (x) => {
      const done = await sh.printStickers(x.deps, x.who, await body(request));
      const parcels = done.parcels;
      const c = await stickerContext(x.deps, x.who.storeId);
      const title = parcels.length === 1 ? `Sticker ${parcels[0]!.orderNumber}` : `Stickers ${parcels.length}`;
      return pdf(await stickersPdf(parcels.map((p) => stickerInput(p, c)), c.layout, title), pdfName(title), { 'x-print-job': done.jobId, 'x-print-replay': done.replay ? '1' : '0' });
    });
  return fail(405, 'method-not-allowed');
}

/** PR 180 — `path` is what comes after /api/admin/packing/handover. */
export async function handoverRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  const m = request.method.toUpperCase();
  if (!path.length) {
    if (m !== 'GET') return fail(405, 'method-not-allowed');
    return guarded(request, deps, 'fulfilment.read', async (x) => json({ ok: true, couriers: await sh.handoverList(x.deps, x.who) }));
  }
  if (path.length !== 1) return fail(404, 'not-found');
  if (path[0] === 'sheet') {
    if (m !== 'POST') return fail(405, 'method-not-allowed');
    return guarded(request, deps, 'fulfilment.handover', async (x) => {
      const sheet = await sh.printHandover(x.deps, x.who, await body(request));
      const cfg = await x.deps.settings.value('delivery.handover.sheet', { storeId: x.who.storeId });
      const { head, timeZone } = await letterhead(x.deps, x.who.storeId, cfg.lang);
      const name = pdfName(`handover-${sheet.courierName}-${sheet.printCount}`);
      return pdf(await handoverPdf(sheet, cfg, head, timeZone), name, { 'x-print-replay': sheet.replay ? '1' : '0' });
    });
  }
  if (path[0] === 'done') {
    if (m !== 'POST') return fail(405, 'method-not-allowed');
    return guarded(request, deps, 'fulfilment.handover', async (x) => json({ ok: true, ...(await sh.completeHandover(x.deps, x.who, await body(request))) }));
  }
  return fail(404, 'not-found');
}

/** PR 181 — `path` is what comes after /api/admin/packing/picking. */
export async function pickingRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  const m = request.method.toUpperCase();
  if (path.length) return fail(404, 'not-found');
  if (m === 'GET')
    return guarded(request, deps, 'fulfilment.read', async (x) => {
      const q = x.url.searchParams;
      return json({ ok: true, ...(await sh.pickingList(x.deps, x.who, { from: q.get('from') || null, to: q.get('to') || null })) });
    });
  if (m === 'POST')
    return guarded(request, deps, 'fulfilment.read', async (x) => {
      const list = await sh.printPicking(x.deps, x.who, await body(request));
      const cfg = await x.deps.settings.value('delivery.picking.list', { storeId: x.who.storeId });
      const { head, timeZone } = await letterhead(x.deps, x.who.storeId, cfg.lang);
      return pdf(await pickingPdf(list, cfg, head, timeZone, list.printedAt), pdfName(`picking-list-${list.printedAt.slice(0, 10)}`), { 'x-picking-list': list.listId });
    });
  return fail(405, 'method-not-allowed');
}

const keyOf = (request: Request) => request.headers.get('idempotency-key')?.trim() || undefined;

/** PR 182 — the packing photo: an image only, within the media upload limit, its metadata (and the place it was taken)
 * stripped and turned upright, stored in the media library, then added to the order. */
async function packingPhoto(request: Request, x: Ctx, orderId: string): Promise<Response> {
  const cfg = await x.deps.settings.value('fulfilment.packing.photo', { storeId: x.who.storeId });
  if (!cfg.enabled) return json({ ok: false, error: 'PHOTO_OFF' }, { status: 422 });
  const order = await sh.packingOrder(x.deps, x.who, orderId);
  const media = mediaDeps();
  if (!media) return fail(503, 'database-not-configured');
  const maxBytes = await media.settings.value('media.upload.maxBytes', { storeId: x.who.storeId });
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > maxBytes * 1.05 + 64 * 1024) return fail(413, 'TOO_LARGE', [`max:${maxBytes}`]);
  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get('file');
  } catch {
    return fail(400, 'INVALID_INPUT', ['file']);
  }
  if (!(file instanceof File) || file.size > maxBytes) return fail(400, 'INVALID_INPUT', ['file']);
  let jpeg: Buffer;
  try {
    jpeg = await sharp(new Uint8Array(await file.arrayBuffer())).rotate().jpeg().toBuffer();
  } catch {
    return fail(400, 'INVALID_INPUT', ['file']);
  }
  const stored = await storeGeneratedFile(media, { storeId: x.who.storeId, kind: 'IMAGE', body: new Uint8Array(jpeg), contentType: 'image/jpeg', name: `packing ${order.orderNumber}`, extension: 'jpg', folder: 'packing' });
  return json({ ok: true, order: await sh.addPackingPhoto(x.deps, x.who, orderId, { mediaAssetId: stored.id }) });
}

/** PR 182 — `path` is what comes after /api/admin/packing/orders. */
export async function packingRoute(request: Request, deps: AdminDeps | null, path: string[]): Promise<Response> {
  const m = request.method.toUpperCase();
  if (!path.length) {
    if (m !== 'GET') return fail(405, 'method-not-allowed');
    return guarded(request, deps, 'fulfilment.read', async (x) => json({ ok: true, ...(await sh.packingQueue(x.deps, x.who, { step: x.url.searchParams.get('step') || undefined })) }));
  }
  if (path.length === 1 && path[0] === 'pick-all') {
    if (m !== 'POST') return fail(405, 'method-not-allowed');
    return guarded(request, deps, 'fulfilment.pack', async (x) => json({ ok: true, ...(await sh.startPickingAll(x.deps, x.who)) }));
  }
  const [id, action, ...rest] = path;
  if (!isUuid(id) || rest.length) return fail(404, 'not-found');
  if (!action) {
    if (m !== 'GET') return fail(405, 'method-not-allowed');
    return guarded(request, deps, 'fulfilment.read', async (x) => json({ ok: true, order: await sh.packingOrder(x.deps, x.who, id) }));
  }
  if (m !== 'POST') return fail(405, 'method-not-allowed');
  switch (action) {
    case 'start':
      return guarded(request, deps, 'fulfilment.pack', async (x) => json({ ok: true, result: await sh.startPicking(x.deps, x.who, id, { idempotencyKey: keyOf(request) }) }));
    case 'piece':
      return guarded(request, deps, 'fulfilment.pack', async (x) => json({ ok: true, order: await sh.checkPiece(x.deps, x.who, id, await body(request)) }));
    case 'pack':
      return guarded(request, deps, 'fulfilment.pack', async (x) => json({ ok: true, result: await sh.markPacked(x.deps, x.who, id, await body(request), { idempotencyKey: keyOf(request) }) }));
    case 'photo':
      return guarded(request, deps, 'fulfilment.pack', (x) => packingPhoto(request, x, id));
    case 'waive':
      return guarded(request, deps, 'fulfilment.photoWaive', async (x) => json({ ok: true, order: await sh.waivePackingPhoto(x.deps, x.who, id, await body(request)) }));
    default:
      return fail(404, 'not-found');
  }
}
