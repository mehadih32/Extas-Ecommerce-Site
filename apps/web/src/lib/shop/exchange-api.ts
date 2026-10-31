// S08 · PR 186 — the exchange request from the customer's own account (demo 61-exchange.js; @extas/orders
// exchange-customer.ts). Same site only, and only for the signed-in customer whose order it is: an exchange is asked for
// from the account, so the shop can find the order and come back to him.
//
//   POST /api/account/exchange {action: 'state', number}                         → {open, closed, lines, exchanges, rules, …}
//   POST /api/account/exchange {action: 'choices', number, orderItemId, reason, sizeKey?}
//                                                                                  → {closed, tier, options: [{…, money}], sizes, …}
//   POST /api/account/exchange (multipart or JSON) {action: 'request', number, orderItemId, reason, newVariantId, note?,
//        claimNote?, key?} with `photo` files (a faulty, damaged or wrong piece) and `claimPhoto` files (a claim)
//                                                                                  → {exchangeId, number, status, money, claimState}
//
// The photos go into the library first (a real picture, an accepted type, within the owner's MB), and only those ids
// are passed on — never ids typed into the form. Off until the owner turns `orders.exchange.account` on; a person approves
// every request, so nothing here books a parcel or moves money.
import { customerExchangeChoices, customerExchangeState, customerRequestExchange, isOrdersError, OrdersError, type CustomerRef } from '@extas/orders';
import { MediaError, mediaHttpStatus, uploadCustomerImage, type MediaDeps } from '@extas/media';
import type { ImageSource } from '@extas/media';
import { errorResponse, fail, json, sameOrigin } from '../admin-auth';
import { customerOfRequest } from './account';
import type { AccountApiDeps } from './account-api';
import { cardsByIds, photoFor } from './catalogue';
import { cardsTrialSettings, tryCardsOnRequest } from './try-cards';

/** The request's own body limit without its photos (the form's fields). */
export const EXCHANGE_BODY_MAX = 16_384;

export interface ExchangeApiDeps {
  account: AccountApiDeps;
  media: MediaDeps | null;
}

/** The picture of an offered piece: its colour's photo, else the drawing of its garment in the colour's hex. */
export interface OptionPicture {
  garment: string | null;
  hex: string;
  photo: ImageSource | null;
}

/** The pictures of the offered pieces, by variant (a piece with no colour or card is drawn plain; never fails the answer). */
export async function optionPictures(db: AccountApiDeps['accounts']['db'], storeId: number, options: readonly { variantId: string; productId: string }[]): Promise<Record<string, OptionPicture>> {
  if (!options.length) return {};
  const [variants, cards] = await Promise.all([
    db.productVariant.findMany({ where: { storeId, id: { in: options.map((o) => o.variantId) } }, select: { id: true, colour: { select: { key: true, hex: true } } } }),
    cardsByIds(storeId, options.map((o) => o.productId)),
  ]);
  const colourOf = new Map(variants.map((v) => [v.id, v.colour]));
  return Object.fromEntries(
    options.map((o) => {
      const colour = colourOf.get(o.variantId) ?? null;
      const card = cards.get(o.productId);
      return [o.variantId, { garment: card?.garment ?? null, hex: colour?.hex ?? '', photo: card ? photoFor(card, colour?.key) : null }];
    }),
  );
}

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

interface Form {
  get: (k: string) => unknown;
  photos: File[];
  claimPhotos: File[];
}

async function formOf(request: Request): Promise<Form | null> {
  const type = request.headers.get('content-type') ?? '';
  try {
    if (type.includes('multipart/form-data')) {
      const form = await request.formData();
      const files = (k: string) => form.getAll(k).filter((f): f is File => f instanceof File && f.size > 0);
      return { get: (k) => form.get(k), photos: files('photo'), claimPhotos: files('claimPhoto') };
    }
    const b = (await request.json()) as Record<string, unknown>;
    return { get: (k) => b[k], photos: [], claimPhotos: [] };
  } catch {
    return null;
  }
}

/** A refusal with what the page needs to say why (the exchange's own `why`, the window's `closed`). */
export function exchangeRefusal(e: unknown): Response {
  if (isOrdersError(e)) {
    const data = (e.data ?? {}) as Record<string, unknown>;
    const extra = Object.fromEntries(['why', 'closed', 'maxPhotos'].filter((k) => k in data).map((k) => [k, data[k]]));
    return json({ ok: false, error: e.code, ...(e.details.length ? { details: e.details } : {}), ...extra }, { status: e.status });
  }
  if (e instanceof MediaError) return fail(mediaHttpStatus(e.code), e.code, e.details);
  return errorResponse(e);
}

/** POST /api/account/exchange. */
export async function exchangeHandler(request: Request, deps: ExchangeApiDeps | null): Promise<Response> {
  if (request.method.toUpperCase() !== 'POST') return fail(405, 'method-not-allowed');
  if (!deps) return fail(503, 'database-not-configured');
  if (!sameOrigin(request)) return fail(403, 'cross-site-request');
  // a test server's browser that asked for the cards reads the switch as on (never on the live shop)
  const a = tryCardsOnRequest(request) ? { ...deps.account.accounts, settings: cardsTrialSettings(deps.account.accounts.settings) } : deps.account.accounts;
  const storeId = deps.account.storeId;
  try {
    const cfg = await a.settings.value('orders.exchange.account', { storeId });
    const photoMax = cfg.photoMaxMb * 1_024 * 1_024;
    const declared = Number(request.headers.get('content-length') ?? '0');
    if (declared > cfg.maxPhotos * photoMax + EXCHANGE_BODY_MAX) return fail(413, 'TOO_LARGE', [`max:${cfg.maxPhotos * photoMax + EXCHANGE_BODY_MAX}`]);
    const auth = await customerOfRequest(request, a, storeId);
    if (!auth) return fail(401, 'SIGNED_OUT');
    const f = await formOf(request);
    if (!f) return fail(400, 'INVALID_INPUT', ['body']);
    const who: CustomerRef = { storeId, customerId: auth.customer.id, visitorId: null };
    const od = { db: a.db, settings: a.settings, ...(a.now ? { now: a.now } : {}) };
    const number = str(f.get('number'), 40);
    const action = str(f.get('action'), 20);
    if (!number) return fail(400, 'INVALID_INPUT', ['number']);
    if (action === 'state') return json({ ok: true, ...(await customerExchangeState(od, who, number)) });
    const orderItemId = str(f.get('orderItemId'), 60);
    const reason = str(f.get('reason'), 20);
    if (action === 'choices') {
      const sizeKey = str(f.get('sizeKey'), 40);
      const ch = await customerExchangeChoices(od, who, { number, orderItemId, reason, ...(sizeKey ? { sizeKey } : {}) });
      return json({ ok: true, ...ch, pictures: await optionPictures(a.db, storeId, ch.options) });
    }
    if (action !== 'request') return fail(400, 'INVALID_INPUT', ['action']);
    // switched off: refused before any photo is stored
    if (!cfg.enabled) throw new OrdersError('EXCHANGE_CLOSED', 'exchanges are not asked for from the account here', [], { why: 'OFF' });
    if (f.photos.length + f.claimPhotos.length > cfg.maxPhotos) return json({ ok: false, error: 'INVALID_INPUT', details: ['photo'], maxPhotos: cfg.maxPhotos }, { status: 400 });
    // the photos go into the library first; only their ids reach the order service
    const upload = async (files: File[], name: string): Promise<string[]> => {
      const ids: string[] = [];
      for (const file of files) {
        if (!deps.media) throw new MediaError('INVALID_INPUT', 'no photo storage here', ['photo']);
        if (file.size > photoMax) throw new MediaError('TOO_LARGE', 'the photo is larger than this page allows', [`max:${photoMax}`]);
        const up = await uploadCustomerImage(deps.media, { storeId, body: new Uint8Array(await file.arrayBuffer()), fileName: file.name || null, maxBytes: photoMax, folder: 'exchange-photos', name });
        ids.push(up.asset.id);
      }
      return ids;
    };
    const photoAssetIds = await upload(f.photos, 'exchange photo');
    const claimNote = str(f.get('claimNote'), 1_000);
    const claimPhotoIds = claimNote ? await upload(f.claimPhotos, 'exchange claim photo') : [];
    const note = str(f.get('note'), 1_000);
    const key = str(f.get('key'), 80);
    const r = await customerRequestExchange(
      od,
      who,
      {
        number,
        orderItemId,
        reason,
        newVariantId: str(f.get('newVariantId'), 60),
        ...(note ? { note } : {}),
        ...(photoAssetIds.length ? { photoAssetIds } : {}),
        ...(claimNote ? { claim: { note: claimNote, ...(claimPhotoIds.length ? { photoAssetIds: claimPhotoIds } : {}) } } : {}),
      },
      key ? { idempotencyKey: `account-exchange:${auth.customer.id}:${key}` } : {},
    );
    return json({ ok: true, exchangeId: r.exchangeId, number: r.number, status: r.status, money: r.money, claimState: r.claimState, replay: r.replay }, { status: r.replay ? 200 : 201 });
  } catch (e) {
    return exchangeRefusal(e);
  }
}
