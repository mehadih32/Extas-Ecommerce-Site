// S12 · PR 241 (Blueprint C11.4, demo 73-blog.js #/journal) — the journal at /journal and /bn/journal: the live articles
// of the page's language, featured first, then the newest, one page at a time (`blog.journal.perPage`), with the topic
// chips. While `blog.journal` is off (as it ships) the address keeps saying "Coming soon". Not listed by search engines
// yet (Article SEO, PR 249, gives the journal its page kind).
import type { Metadata } from 'next';
import { ComingSoon } from '@/components/shop/ComingSoon';
import { JournalList } from '@/components/shop/journal/JournalViews';
import { journalPage, journalSettings, pageOf } from '@/lib/journal/shop';
import { shopContext } from '@/lib/shop/context';
import { shopMetadata } from '@/lib/shop/meta';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ page?: string | string[] }> };

export async function generateMetadata(): Promise<Metadata> {
  const c = await shopContext();
  const on = (await journalSettings(c.storeId)).on;
  return shopMetadata(c, on ? 'journal' : 'soon-journal', on ? c.t('journal.title') : c.t('soon.title'), { index: false });
}

export default async function Journal(props: Props) {
  const [c, sp] = await Promise.all([shopContext(), props.searchParams]);
  if (!(await journalSettings(c.storeId)).on) return <ComingSoon c={c} soonKey="journal" />;
  const data = (await journalPage(c, pageOf(sp.page), null))!;
  return <JournalList c={c} posts={data.posts} total={data.total} page={data.page} pages={data.pages} topics={data.topics} topic={null} />;
}
