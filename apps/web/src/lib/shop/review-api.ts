// S02 · PR 65 — the customer's own review, from My account (demo 60-account.js `ord_revHTML`, SIM-F-008).
//
//   POST /api/account/review   (multipart or JSON)   → {id, status: 'PENDING', rewardMinor}
//
// The form sends: `number` (his order), `orderItemId` (the line), `rating` 1–5, `body`, and, when the shop asks for
// them, `fit` (SMALL · RIGHT · BIG), `heightCm`, `weightKg` and one `photo` file. Multipart, because of the photo; a
// body with no photo may be plain JSON. Same site only, and only for the signed-in customer whose order it is — a
// guest's order is not reviewed, because a review needs a wallet and a name to come back to.
//
// Nothing of the review is shown anywhere until a member of staff approves it, and the answer says so in those words
// (the page's toast: "Thanks! Your review will appear after our check."). `rewardMinor` is only a number to show when
// the owner has switched the photo perk on with his own amount; the money itself moves at approval, never here.
import { reviewChance, submitCustomerReview, type ReviewPublicDeps } from '@extas/catalogue';
import { MediaError, mediaHttpStatus, uploadCustomerImage, type MediaDeps } from '@extas/media';
import { errorResponse, fail, json, sameOrigin } from '../admin-auth';
import { customerOfRequest } from './account';
import { accountRefusal, type AccountApiDeps } from './account-api';

/** The review's own body limit without its photo (the text, the numbers and the form around them). */
export const REVIEW_BODY_MAX = 32_768;

export interface ReviewApiDeps {
  account: AccountApiDeps;
  media: MediaDeps | null;
}

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const int = (v: unknown): number | undefined => {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isInteger(n) ? n : -1;
};
const FITS = ['SMALL', 'RIGHT', 'BIG'] as const;

interface Fields {
  number: string;
  orderItemId: string;
  rating: number | undefined;
  body: string;
  title: string;
  displayName: string;
  fit: string;
  heightCm: number | undefined;
  weightKg: number | undefined;
  photo: File | null;
}

async function fieldsOf(request: Request): Promise<Fields | null> {
  const type = request.headers.get('content-type') ?? '';
  const read = async (): Promise<{ get: (k: string) => unknown; photo: File | null }> => {
    if (type.includes('multipart/form-data')) {
      const form = await request.formData();
      const file = form.get('photo');
      return { get: (k) => form.get(k), photo: file instanceof File && file.size > 0 ? file : null };
    }
    const b = (await request.json()) as Record<string, unknown>;
    return { get: (k) => b[k], photo: null };
  };
  try {
    const { get, photo } = await read();
    return {
      number: str(get('number'), 40),
      orderItemId: str(get('orderItemId'), 60),
      rating: int(get('rating')),
      body: str(get('body'), 5_000),
      title: str(get('title'), 120),
      displayName: str(get('displayName'), 80),
      fit: str(get('fit'), 10).toUpperCase(),
      heightCm: int(get('heightCm')),
      weightKg: int(get('weightKg')),
      photo,
    };
  } catch {
    return null;
  }
}

/** POST /api/account/review. */
export async function reviewHandler(request: Request, deps: ReviewApiDeps | null): Promise<Response> {
  if (request.method.toUpperCase() !== 'POST') return fail(405, 'method-not-allowed');
  if (!deps) return fail(503, 'database-not-configured');
  if (!sameOrigin(request)) return fail(403, 'cross-site-request');
  const a = deps.account.accounts;
  const storeId = deps.account.storeId;
  const cat: ReviewPublicDeps = { db: a.db, settings: a.settings, ...(a.now ? { now: a.now } : {}) };
  try {
    const submit = await a.settings.value('reviews.submit', { storeId });
    if (!submit.enabled) return fail(403, 'REVIEWS_OFF');
    const photoMax = submit.photos.enabled ? submit.photos.maxMb * 1_024 * 1_024 : 0;
    const declared = Number(request.headers.get('content-length') ?? '0');
    if (declared > photoMax + REVIEW_BODY_MAX) return fail(413, 'TOO_LARGE', [`max:${photoMax + REVIEW_BODY_MAX}`]);
    const auth = await customerOfRequest(request, a, storeId);
    if (!auth) return fail(401, 'SIGNED_OUT');
    const f = await fieldsOf(request);
    if (!f) return fail(400, 'INVALID_INPUT', ['body']);
    const bad = [
      ...(f.number ? [] : ['number']),
      ...(f.orderItemId ? [] : ['orderItemId']),
      ...(f.rating !== undefined && f.rating >= 1 && f.rating <= 5 ? [] : ['rating']),
      ...(f.fit && !(FITS as readonly string[]).includes(f.fit) ? ['fit'] : []),
      ...(f.heightCm === -1 ? ['heightCm'] : []),
      ...(f.weightKg === -1 ? ['weightKg'] : []),
    ];
    if (bad.length) return fail(400, 'INVALID_INPUT', bad);

    // The photo goes into the library first (its own checks: a real picture, an accepted type, within this page's MB).
    const photoAssetIds: string[] = [];
    if (f.photo && submit.photos.enabled) {
      if (!deps.media) return fail(503, 'database-not-configured');
      if (f.photo.size > photoMax) return fail(413, 'TOO_LARGE', [`max:${photoMax}`]);
      const up = await uploadCustomerImage(deps.media, {
        storeId,
        body: new Uint8Array(await f.photo.arrayBuffer()),
        fileName: f.photo.name || null,
        maxBytes: photoMax,
        folder: 'review-photos',
        name: 'review photo',
      });
      photoAssetIds.push(up.asset.id);
    }
    const saved = await submitCustomerReview(cat, { storeId, customerId: auth.customer.id }, {
      orderNumber: f.number,
      orderItemId: f.orderItemId,
      rating: f.rating,
      ...(f.body ? { body: f.body } : {}),
      ...(f.title ? { title: f.title } : {}),
      ...(f.displayName ? { displayName: f.displayName } : {}),
      ...(submit.askFit && f.fit ? { fit: f.fit } : {}),
      ...(submit.askBody && f.heightCm !== undefined ? { heightCm: f.heightCm } : {}),
      ...(submit.askBody && f.weightKg !== undefined ? { weightKg: f.weightKg } : {}),
      photoAssetIds,
    });
    return json({ ok: true, ...saved }, { status: 201 });
  } catch (e) {
    if (e instanceof MediaError) return fail(mediaHttpStatus(e.code), e.code, e.details);
    return accountRefusal(e);
  }
}

/** POST /api/account/review-state {number} — which lines of his order he may still review (the page asks before it asks him). */
export async function reviewStateHandler(request: Request, deps: ReviewApiDeps | null): Promise<Response> {
  if (request.method.toUpperCase() !== 'POST') return fail(405, 'method-not-allowed');
  if (!deps) return fail(503, 'database-not-configured');
  if (!sameOrigin(request)) return fail(403, 'cross-site-request');
  const a = deps.account.accounts;
  const storeId = deps.account.storeId;
  try {
    const auth = await customerOfRequest(request, a, storeId);
    if (!auth) return fail(401, 'SIGNED_OUT');
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const number = str(b.number, 40);
    if (!number) return fail(400, 'INVALID_INPUT', ['number']);
    const state = await reviewChance({ db: a.db, settings: a.settings, ...(a.now ? { now: a.now } : {}) }, { storeId, customerId: auth.customer.id, orderNumber: number });
    return json({ ok: true, ...state });
  } catch (e) {
    return errorResponse(e);
  }
}
