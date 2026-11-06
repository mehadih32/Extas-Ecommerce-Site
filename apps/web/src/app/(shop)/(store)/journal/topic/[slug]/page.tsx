// S12 · PR 241 (demo 73-blog.js #/journal/topic/<id>) — one journal topic at /journal/topic/<link> (and /bn/…): its
// introduction and the live articles of it and its sub-topics, in the page's language. Off: "Coming soon"; a topic that
// does not exist or is put away: the shop's "page not found".
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ComingSoon } from '@/components/shop/ComingSoon';
import { JournalList } from '@/components/shop/journal/JournalViews';
import { journalPage, journalSettings, pageOf } from '@/lib/journal/shop';
import { shopContext } from '@/lib/shop/context';
import { shopMetadata } from '@/lib/shop/meta';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string | string[] }> };

export async function generateMetadata(props: Props): Promise<Metadata> {
  const [c, { slug }] = await Promise.all([shopContext(), props.params]);
  if (!(await journalSettings(c.storeId)).on) return shopMetadata(c, 'soon-journal', c.t('soon.title'), { index: false });
  const data = await journalPage(c, 1, slug);
  const name = data?.topic ? (c.lang === 'bn' && data.topic.nameBn ? data.topic.nameBn : data.topic.nameEn) : c.t('journal.title');
  return shopMetadata(c, `journal/topic/${slug}`, name, { index: false });
}

export default async function JournalTopic(props: Props) {
  const [c, { slug }, sp] = await Promise.all([shopContext(), props.params, props.searchParams]);
  if (!(await journalSettings(c.storeId)).on) return <ComingSoon c={c} soonKey="journal" />;
  const data = await journalPage(c, pageOf(sp.page), slug);
  if (!data) notFound();
  return <JournalList c={c} posts={data.posts} total={data.total} page={data.page} pages={data.pages} topics={data.topics} topic={data.topic} />;
}
