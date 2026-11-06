// S12 · PR 592 follow-up (register "Blog as a complete, standard section … tags"; demo 73-blog.js bfTag) — one tag's
// page at /journal/tag/<link> (and /bn/…): the live articles of the page's language that carry the tag, newest first,
// one page at a time. Off (`blog.journal`): "Coming soon"; tags off (`blog.journal.tags`, as shipped) or no such tag:
// the shop's "page not found". A tag page is never listed by search engines (the topic pages are the ones that rank).
import type { Metadata } from 'next';
import { shopNotFound } from '@/lib/shop/not-found';
import { getPrisma } from '@extas/db/client';
import { ComingSoon } from '@/components/shop/ComingSoon';
import { JournalList } from '@/components/shop/journal/JournalViews';
import { liveByTag } from '@/lib/journal/browse';
import { liveCategories } from '@/lib/journal/journal';
import { journalLinks, journalSettings, pageOf } from '@/lib/journal/shop';
import { shopContext, type ShopContext } from '@/lib/shop/context';
import { shopMetadata } from '@/lib/shop/meta';
import { ROUTES } from '@/lib/shop/routes';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string | string[] }> };

async function read(c: ShopContext, slug: string, page: number) {
  const s = await journalSettings(c.storeId);
  if (!s.on) return { s, data: null };
  if (!s.tags) return { s, data: undefined };
  const data = await liveByTag(getPrisma(), c.storeId, c.lang, slug, page, s.perPage);
  return { s, data: data ?? undefined };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const [c, { slug }, sp] = await Promise.all([shopContext(), props.params, props.searchParams]);
  const { data } = await read(c, slug, pageOf(sp.page));
  if (data === null) return shopMetadata(c, 'soon-journal', c.t('soon.title'), { index: false });
  return shopMetadata(c, `journal/tag/${slug}`, data ? c.t('journal.tagged', { tag: data.tag.name }) : c.t('journal.title'), { index: false });
}

export default async function JournalTagPage(props: Props) {
  const [c, { slug }, sp] = await Promise.all([shopContext(), props.params, props.searchParams]);
  const page = pageOf(sp.page);
  const { s, data } = await read(c, slug, page);
  if (data === null) return <ComingSoon c={c} soonKey="journal" />;
  if (!data) shopNotFound(c);
  const topics = await liveCategories(getPrisma(), c.storeId);
  return (
    <JournalList
      c={c}
      posts={data.posts}
      total={data.total}
      page={page}
      pages={Math.max(1, Math.ceil(data.total / s.perPage))}
      topics={topics}
      topic={null}
      links={journalLinks(s)}
      heading={{ title: c.t('journal.tagged', { tag: data.tag.name }), intro: c.t('journal.taggedDek', { tag: data.tag.name }), base: ROUTES.journalTag(data.tag.slug), testId: 'journal-tag', chips: true }}
    />
  );
}
