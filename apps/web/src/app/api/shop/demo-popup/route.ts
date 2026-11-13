// S28 · PR 684 — public: the "coming soon" words a customer sees on Add to bag of a demo product (Products › Demo
// products), in the language asked (?lang=en|bn). Read-only, no personal data.
import { shopT } from '@/lib/shop/dict';
import { accountApiDeps } from '@/lib/shop/account';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const a = accountApiDeps();
  const lang = new URL(request.url).searchParams.get('lang') === 'bn' ? 'bn' : 'en';
  const words = shopT(lang);
  const fallback = { text: words('pdpx.demo.soon') };
  const close = words('pdpx.demo.close');
  if (!a) return Response.json({ ok: true, ...fallback, close }, { headers: { 'cache-control': 'no-store' } });
  try {
    const set = await a.accounts.settings.value('catalogue.demo', { storeId: a.storeId });
    return Response.json({ ok: true, text: lang === 'bn' ? set.popupBn : set.popupEn, close }, { headers: { 'cache-control': 'no-store' } });
  } catch {
    return Response.json({ ok: true, ...fallback, close }, { headers: { 'cache-control': 'no-store' } });
  }
}
