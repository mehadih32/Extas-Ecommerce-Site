// S08 · PR 179 — the Packing & print admin API (Orders → Packing & print; Blueprint B1.4). Every route signs the person
// in (guardAdmin), checks the permission in the store it touches (`?storeId=`, default the mother store), then calls
// @extas/shipping, which checks the permission again and audits. JSON answers are `{ ok: true, … }` or
// `{ ok: false, error: CODE, details, data }`; a PDF answer is the file itself.
//
//   GET   /api/admin/packing/stickers          the print run: booked parcels still with us, in packing order, each with
//                                              its print count and why it cannot be printed (no customer's details)
//                                              (fulfilment.print)
//   POST  /api/admin/packing/stickers          {shipmentIds: [...]} the stickers as one PDF; every print counted, a
//                                              second print marked REPRINT n; refused as a whole with each parcel's
//                                              reason (NOT_PRINTABLE: COD_CHANGED, RECEIVER_CHANGED, NOT_WITH_US …)
//                                              (fulfilment.print)
//   GET   /api/admin/packing/stickers/sample   a sample sticker at the owner's size, to try the printer (fulfilment.print)
import * as sh from '@extas/shipping';
import { body, fail, guardAdmin, json, type AdminDeps } from './admin-auth';
import { sampleParcel, stickerInput, stickersPdf, pdfName, type StickerContext } from './admin-fulfil/sticker';
import { fulfilDicts } from './admin-fulfil/i18n';
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
    return shippingFail(e);
  }
}

function pdf(bytes: Buffer, name: string): Response {
  return new Response(new Uint8Array(bytes), { status: 200, headers: { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="${name}"`, 'cache-control': 'no-store' } });
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
  if (path.length) return fail(404, 'not-found');
  if (m === 'GET') return guarded(request, deps, 'fulfilment.print', async (x) => json({ ok: true, ...(await sh.printRun(x.deps, x.who)) }));
  if (m === 'POST')
    return guarded(request, deps, 'fulfilment.print', async (x) => {
      const parcels = await sh.printStickers(x.deps, x.who, await body(request));
      const c = await stickerContext(x.deps, x.who.storeId);
      const title = parcels.length === 1 ? `Sticker ${parcels[0]!.orderNumber}` : `Stickers ${parcels.length}`;
      return pdf(await stickersPdf(parcels.map((p) => stickerInput(p, c)), c.layout, title), pdfName(title));
    });
  return fail(405, 'method-not-allowed');
}
