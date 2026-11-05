// S11 · PR 230 — /llms.txt, the shop's summary for AI assistants (lib/seo/llms; Blueprint C4.3, `seo.answerPack`):
// answered only while it is switched on and the shop is open to search engines on its own domain (as robots.txt);
// otherwise "not found". Everything in it is what the shop already shows, in English.
import { loadHelp } from '@/lib/shop/help-data';
import { HELP_SLUGS } from '@/lib/shop/help-pages';
import { readCategories, readPageSettings, shopContextFor } from '@/lib/shop/context';
import { ROUTES } from '@/lib/shop/routes';
import { shopStoreId } from '@/lib/shop/store-id';
import { llmsTxt, type LlmsPage } from '@/lib/seo/llms';
import { siteAddress } from '@/lib/seo/site';

export const dynamic = 'force-dynamic';

const KEYS = ['seo.indexing', 'seo.answerPack', 'category.seo'] as const;
const TEXT = { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=0, s-maxage=300' };

export async function GET(): Promise<Response> {
  const storeId = shopStoreId();
  const [set, site] = await Promise.all([readPageSettings(KEYS, storeId), siteAddress(storeId)]);
  const pack = set['seo.answerPack'];
  if (!pack.llmsTxt || !set['seo.indexing'].searchEngines || !site.onPrimary || !site.origin) return new Response('Not found\n', { status: 404, headers: TEXT });
  const [c, { cats }] = await Promise.all([shopContextFor(storeId, 'en'), readCategories(storeId)]);
  // the shop's own name (its setting, else the store's record), never the shell's stand-in word; none: nothing to say
  const name = c.storeName === c.t('brand.fallback') ? '' : c.storeName.trim();
  if (!name) return new Response('Not found\n', { status: 404, headers: TEXT });
  const help = await loadHelp(c);
  const seoLine = (slug: string) => set['category.seo']?.[slug]?.meta?.en ?? null;
  const pages: LlmsPage[] = HELP_SLUGS.flatMap((slug) => {
    const m = help.models[slug];
    if (m.soon) return [];
    const lines = [...m.qa.map((q) => q.q), ...m.sections.flatMap((s) => (s.title ? [s.title] : []))];
    return [{ title: m.title, href: ROUTES.help(slug), lines }];
  });
  const hours = c.s['contact.hours']?.en ?? null;
  const text = llmsTxt({
    name,
    origin: site.origin.toString(),
    summary: pack.summary,
    currency: c.s['store.currency'],
    bengali: Boolean(c.s['language.bengali.enabled']),
    collections: cats
      .filter((k) => k.count > 0)
      .map((k) => ({
        name: k.nameEn,
        href: ROUTES.category(k.slug),
        line: seoLine(k.slug),
        children: k.children.filter((x) => x.count > 0).map((x) => ({ name: x.nameEn, href: ROUTES.category(x.slug), line: seoLine(x.slug) })),
      })),
    pages,
    contact: { phone: c.s['contact.phone'], whatsapp: c.s['contact.whatsapp'], email: c.s['contact.email'], hours, address: help.facts.address },
  });
  return new Response(text, { headers: TEXT });
}
