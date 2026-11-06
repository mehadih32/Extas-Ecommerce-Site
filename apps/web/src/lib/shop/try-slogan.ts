// PR 85 follow-up (111) — test servers only (EXTAS_SHOP_TEST_PAGES=1): a browser that asked for it (the cookie below,
// set by POST /api/shop/try-slogan) sees the shop as if the owner had written a long slogan, so the device gate measures
// the header's slogan steps and the footer's wrap with one (CI's sample database has no slogan: `brand.slogan` is the
// owner's data). The words are sample text near the 120-letter limit, in both languages; a slogan the store already
// has is kept. On the live shop the door answers 404 and the cookie is never read.
import { cookies } from 'next/headers';
import type { Value } from '@extas/settings';
import { fail, json, sameOrigin } from '../admin-auth';

export const TRY_SLOGAN_COOKIE = 'extas_try_slogan';
/** A long sample slogan (sample data, test servers only). */
export const TRY_SLOGAN: NonNullable<Value<'brand.slogan'>> = {
  en: 'Menswear made in Bangladesh for every single day: honest prices, real measurements and easy exchanges, always', // hardcode-ok: sample text, test servers only
  bn: 'বাংলাদেশে তৈরি প্রতিদিনের ছেলেদের পোশাক: ন্যায্য দাম, আসল মাপ আর সহজ বদল — সবসময়, প্রতিটি অর্ডারে, সারা দেশে', // hardcode-ok: sample text, test servers only
};

const testPagesOn = () => process.env.EXTAS_SHOP_TEST_PAGES === '1';

/** The sample slogan to draw with, or null (always null on the live shop: the cookie is not even read there). */
export async function trySlogan(): Promise<NonNullable<Value<'brand.slogan'>> | null> {
  if (!testPagesOn()) return null;
  return (await cookies()).get(TRY_SLOGAN_COOKIE)?.value === '1' ? TRY_SLOGAN : null;
}

/** POST /api/shop/try-slogan — test servers only: this browser draws the shop with the long sample slogan. */
export function trySloganHandler(request: Request): Response {
  if (!testPagesOn()) return fail(404, 'not-found');
  if (request.method.toUpperCase() !== 'POST') return fail(405, 'method-not-allowed');
  if (!sameOrigin(request)) return fail(403, 'cross-site-request');
  return json({ ok: true }, { headers: { 'set-cookie': `${TRY_SLOGAN_COOKIE}=1; Path=/; SameSite=Lax; Max-Age=3600` } });
}
