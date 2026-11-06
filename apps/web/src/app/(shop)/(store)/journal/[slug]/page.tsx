// S12 · PR 241 (Blueprint C11.4, demo 73-blog.js the article page) — one article at /journal/<link> (English) or
// /bn/journal/<link> (Bengali): live only (published, or scheduled and its time has come), in the page's own language,
// with its honest byline and the product block of live products (`blog.journal.relatedProducts` at most). Off: "Coming
// soon"; no such live article: the shop's "page not found" (one only in the other language: this language's journal).
// ~~Not listed by search engines until PR 249 (Article SEO).~~
// S12 · PR 249 (C11.2, C12.1, C12.4) — Article SEO: the journal's page kind (`seo.indexing`, off as shipped) decides
// listing; the search description is the article's own (else its one-line answer or summary, cut to the limit); the
// canonical is its own address and hreflang names its live twin at the twin's own address; Open Graph as an article
// with its dates; BlogPosting and the trail as JSON-LD (`seo.structuredData.article` / `.breadcrumbs`); "Read next"
// links (`blog.journal.relatedArticles`, 0 as shipped).
// S12 · PR 250 — while `blog.performance.count` is on (off as shipped) the page tells the shop it was opened
// (ArticleRead: the article's id and where the reader came from), for Website › Blog & journal › Performance.
// S12 · PR 251 — while `blog.comments.on` (off as shipped: the journal runs without comments) the comments a person has
// shown and the comment box (JournalComments); nothing a reader writes shows before a person presses Show.
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getPrisma } from '@extas/db/client';
import { ComingSoon } from '@/components/shop/ComingSoon';
import { JsonLd } from '@/components/shop/JsonLd';
import { ArticleRead } from '@/components/shop/journal/ArticleRead';
import { JournalComments } from '@/components/shop/journal/JournalComments';
import { JournalArticle } from '@/components/shop/journal/JournalViews';
import { shownComments } from '@/lib/journal/comments';
import { articlePhoto } from '@/lib/journal/images';
import { journalArticle, journalHasOther, journalSettings } from '@/lib/journal/shop';
import { byline } from '@/lib/journal/model';
import { settingsResolver } from '@/lib/settings';
import { signedIn } from '@/lib/shop/account';
import { readPageSettings, shopContext, type ShopContext } from '@/lib/shop/context';
import { hrefIn } from '@/lib/shop/lang';
import { ROUTES } from '@/lib/shop/routes';
import { shopMetadata, shopOrigin } from '@/lib/shop/meta';
import { articleLd, breadcrumbLd } from '@/lib/shop/structured-data';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

const topicName = (c: ShopContext, x: { nameEn: string; nameBn: string | null } | null) => (x ? (c.lang === 'bn' && x.nameBn ? x.nameBn : x.nameEn) : null);

export async function generateMetadata(props: Props): Promise<Metadata> {
  const [c, { slug }] = await Promise.all([shopContext(), props.params]);
  if (!(await journalSettings(c.storeId)).on) return shopMetadata(c, 'soon-journal', c.t('soon.title'), { index: false });
  const a = await journalArticle(c, slug);
  if (!a) return shopMetadata(c, `journal/${slug}`, c.t('journal.title'), { index: false });
  const { post } = a;
  const here = ROUTES.article(post.slug);
  const there = a.twin ? ROUTES.article(a.twin) : null;
  return shopMetadata(c, `journal/${post.slug}`, post.title, {
    path: here,
    own: { description: post.metaDescription, body: post.quickAnswer ?? post.excerpt },
    twins: c.lang === 'en' ? { en: here, bn: there } : { en: there, bn: here },
    article: { publishedTime: post.publishedAt, modifiedTime: post.contentUpdatedAt, section: topicName(c, post.category) },
  });
}

export default async function JournalPost(props: Props) {
  const [c, { slug }] = await Promise.all([shopContext(), props.params]);
  if (!(await journalSettings(c.storeId)).on) return <ComingSoon c={c} soonKey="journal" />;
  const a = await journalArticle(c, slug);
  // The language switch on an article that is only in the other language opens this language's journal instead.
  if (!a && (await journalHasOther(c, slug))) redirect(hrefIn(c.lang, ROUTES.journal));
  if (!a) notFound();
  const { post } = a;
  const page = await readPageSettings(['seo.structuredData', 'blog.performance', 'blog.comments'] as const, c.storeId);
  const talk = page['blog.comments'];
  const [comments, me] = talk.on ? await Promise.all([shownComments(getPrisma(), c.storeId, post.id, talk.shown), talk.who === 'signedIn' ? signedIn() : Promise.resolve(null)]) : [[], null];
  // PR 547: the main photo while the owner shows them (Website › Blog & journal › Main photo); never fails the page
  const resolver = settingsResolver();
  const photo = resolver ? await articlePhoto(getPrisma(), resolver, c.storeId, post.heroAssetId, c.lang).catch(() => null) : null;
  const sd = page['seo.structuredData'];
  const origin = sd.article || sd.breadcrumbs ? await shopOrigin() : undefined;
  const href = hrefIn(c.lang, ROUTES.article(post.slug));
  const topic = topicName(c, post.category);
  const b = byline(post.author, c.lang, { en: '', bn: '' }, '');
  const crumbs = [
    { name: c.t('journal.home'), href: hrefIn(c.lang, ROUTES.home) },
    { name: c.t('journal.title'), href: hrefIn(c.lang, ROUTES.journal) },
    ...(post.category && topic ? [{ name: topic, href: hrefIn(c.lang, ROUTES.journalTopic(post.category.slug)) }] : []),
    { name: post.title, href },
  ];
  const ld = origin
    ? [
        sd.article
          ? articleLd(origin, {
              href,
              headline: post.title,
              description: post.metaDescription ?? post.quickAnswer ?? post.excerpt,
              lang: c.lang,
              published: post.publishedAt,
              modified: post.contentUpdatedAt,
              section: topic,
              author: b.name ? { name: b.name, ai: b.ai } : null,
              shop: c.storeName,
            })
          : null,
        sd.breadcrumbs ? breadcrumbLd(origin, crumbs) : null,
      ]
    : [];
  return (
    <>
      <JsonLd data={ld} />
      <JournalArticle c={c} post={post} cards={a.cards} aiNote={a.settings.aiNote} related={a.related} photo={photo} />
      {/* PR 250: counted only while the owner counts readers (Website › Blog & journal › Performance) */}
      {page['blog.performance'].count ? <ArticleRead postId={post.id} /> : null}
      {/* PR 251: only while the owner has switched comments on (Website › Blog & journal › Comments) */}
      {talk.on ? (
        <div className="container jn-page">
          <JournalComments c={c} postId={post.id} slug={post.slug} settings={talk} comments={comments} canWrite={talk.who === 'anyone' || !!me} />
        </div>
      ) : null}
    </>
  );
}
