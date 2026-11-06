// S12 · PR 241 (Blueprint C11.4, demo 73-blog.js the article page) — one article at /journal/<link> (English) or
// /bn/journal/<link> (Bengali): live only (published, or scheduled and its time has come), in the page's own language,
// with its honest byline and the product block of live products (`blog.journal.relatedProducts` at most). Off: "Coming
// soon"; no such live article: the shop's "page not found" (one only in the other language: this language's journal). Not listed by search engines until PR 249 (Article SEO).
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { ComingSoon } from '@/components/shop/ComingSoon';
import { JournalArticle } from '@/components/shop/journal/JournalViews';
import { journalArticle, journalHasOther, journalSettings } from '@/lib/journal/shop';
import { hrefIn } from '@/lib/shop/lang';
import { ROUTES } from '@/lib/shop/routes';
import { shopContext } from '@/lib/shop/context';
import { shopMetadata } from '@/lib/shop/meta';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata(props: Props): Promise<Metadata> {
  const [c, { slug }] = await Promise.all([shopContext(), props.params]);
  if (!(await journalSettings(c.storeId)).on) return shopMetadata(c, 'soon-journal', c.t('soon.title'), { index: false });
  const a = await journalArticle(c, slug);
  return shopMetadata(c, `journal/${slug}`, a ? a.post.title : c.t('journal.title'), { index: false });
}

export default async function JournalPost(props: Props) {
  const [c, { slug }] = await Promise.all([shopContext(), props.params]);
  if (!(await journalSettings(c.storeId)).on) return <ComingSoon c={c} soonKey="journal" />;
  const a = await journalArticle(c, slug);
  // The language switch on an article that is only in the other language opens this language's journal instead.
  if (!a && (await journalHasOther(c, slug))) redirect(hrefIn(c.lang, ROUTES.journal));
  if (!a) notFound();
  return <JournalArticle c={c} post={a.post} cards={a.cards} aiNote={a.settings.aiNote} />;
}
