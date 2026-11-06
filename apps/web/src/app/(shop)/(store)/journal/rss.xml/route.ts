// S12 · PR 592 follow-up (register "Blog as a complete, standard section … RSS"; demo 73-blog.js bfRss "live:
// /journal/rss.xml") — the journal's RSS 2.0 feed at /journal/rss.xml (English) and /bn/journal/rss.xml (Bengali): the
// newest live articles of the language (`blog.journal.rssItems`), each with its title, link, summary, date, topic and
// author. Answered only while `blog.journal` and its `rss` switch are on (off as shipped) and the shop knows its own
// address; otherwise "not found". Public, read-only, nothing sent anywhere.
import { headers } from 'next/headers';
import { getPrisma } from '@extas/db/client';
import { rssPosts } from '@/lib/journal/browse';
import { rssXml } from '@/lib/journal/browse-model';
import { siteAddress } from '@/lib/seo/site';
import { settingsResolver } from '@/lib/settings';
import { hrefIn, LANG_HEADER } from '@/lib/shop/lang';
import { ROUTES } from '@/lib/shop/routes';
import { shopStoreId } from '@/lib/shop/store-id';
import { absolute } from '@/lib/shop/structured-data';

export const dynamic = 'force-dynamic';

const XML = { 'content-type': 'application/rss+xml; charset=utf-8', 'cache-control': 'public, max-age=0, s-maxage=900', 'x-robots-tag': 'noindex' };
const none = () => new Response('Not found\n', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });

export async function GET(): Promise<Response> {
  const resolver = settingsResolver();
  if (!process.env.DATABASE_URL || !resolver) return none();
  const storeId = shopStoreId();
  try {
    const lang = (await headers()).get(LANG_HEADER) === 'bn' ? 'bn' : 'en';
    const [s, site, name] = await Promise.all([resolver.value('blog.journal', { storeId }), siteAddress(storeId), resolver.value('store.name', { storeId })]);
    if (!s.on || !s.rss || !site.origin) return none();
    const posts = await rssPosts(getPrisma(), storeId, lang, s.rssItems);
    const shop = typeof name === 'string' ? name.trim() : '';
    const at = (href: string) => absolute(site.origin!, hrefIn(lang, href));
    const items = posts.map((p) => ({
      title: p.title,
      link: at(ROUTES.article(p.slug)),
      description: p.metaDescription ?? p.quickAnswer ?? p.excerpt,
      published: p.publishedAt,
      category: p.category ? (lang === 'bn' && p.category.nameBn ? p.category.nameBn : p.category.nameEn) : null,
      author: p.author?.displayName ?? null,
    }));
    const title = shop || site.origin.host;
    return new Response(rssXml({ title, link: at(ROUTES.journal), self: at(ROUTES.journalRss), description: title, lang }, items), { headers: XML });
  } catch {
    return none();
  }
}
