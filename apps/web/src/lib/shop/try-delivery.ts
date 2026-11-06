// PR 72 follow-up (104) — test servers only (EXTAS_SHOP_TEST_PAGES=1): a browser that asked for it (the cookie below,
// set by POST /api/shop/try-delivery) sees the help pages as if the store's delivery rule were live, so the device
// gate measures the delivery answer in search and on /help/delivery (in the sample shop that rule is a draft: the page
// says "Coming soon" and search never offers it). Only while the delivery page's own rules say nothing; the words are
// sample text that promises no amount and no time. On the live shop the door answers 404 and the cookie is never read.
import { cookies } from 'next/headers';
import { fail, json, sameOrigin } from '../admin-auth';
import type { RuleWords } from './help-pages';

export const TRY_DELIVERY_COOKIE = 'extas_try_delivery';
/** The delivery rule's sample words (sample data, test servers only). */
export const TRY_DELIVERY_WORDS = {
  en: { short: 'Sample delivery rule', full: 'Sample delivery rule: the charge for your area is shown in the bag before you order.' }, // hardcode-ok: sample text, test servers only
  bn: { short: 'নমুনা ডেলিভারি নিয়ম', full: 'নমুনা ডেলিভারি নিয়ম: আপনার এলাকার চার্জ অর্ডারের আগে ব্যাগে দেখানো হয়।' }, // hardcode-ok: sample text, test servers only
} as const;
/** The rule the help pages list for delivery (`pages.help` pages.delivery.rules). */
export const TRY_DELIVERY_KEY = 'delivery';

const testPagesOn = () => process.env.EXTAS_SHOP_TEST_PAGES === '1';

/** Whether this browser asked for the sample delivery rule (always false on the live shop: the cookie is not read). */
export async function tryDeliveryOn(): Promise<boolean> {
  if (!testPagesOn()) return false;
  return (await cookies()).get(TRY_DELIVERY_COOKIE)?.value === '1';
}

/**
 * The delivery page's rule words with the sample rule in place of the delivery rule, only while none of them says
 * anything (a rule the store really has live is never covered).
 */
export function withSampleDelivery(rules: readonly RuleWords[], lang: 'en' | 'bn'): RuleWords[] {
  if (rules.some((r) => r.short || r.full)) return [...rules];
  const w = TRY_DELIVERY_WORDS[lang];
  const sample: RuleWords = { key: TRY_DELIVERY_KEY, short: w.short, full: w.full };
  return rules.some((r) => r.key === TRY_DELIVERY_KEY) ? rules.map((r) => (r.key === TRY_DELIVERY_KEY ? sample : r)) : [sample, ...rules];
}

/** POST /api/shop/try-delivery — test servers only: this browser sees the sample delivery rule live. */
export function tryDeliveryHandler(request: Request): Response {
  if (!testPagesOn()) return fail(404, 'not-found');
  if (request.method.toUpperCase() !== 'POST') return fail(405, 'method-not-allowed');
  if (!sameOrigin(request)) return fail(403, 'cross-site-request');
  return json({ ok: true }, { headers: { 'set-cookie': `${TRY_DELIVERY_COOKIE}=1; Path=/; SameSite=Lax; Max-Age=3600` } });
}
