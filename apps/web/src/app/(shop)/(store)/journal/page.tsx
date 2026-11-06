// S12 · PR 241 (Blueprint C11.4, demo 73-blog.js #/journal) — the journal at /journal and /bn/journal: the live articles
// of the page's language, featured first, then the newest, one page at a time (`blog.journal.perPage`), with the topic
// chips. While `blog.journal` is off (as it ships) the address keeps saying "Coming soon". ~~Not listed by search engines
// yet (Article SEO, PR 249, gives the journal its page kind).~~ PR 249: listed only while the journal's page kind is
// ticked in `seo.indexing` (off as shipped), with the journal's own line as its description; a later page (?page=2) never.
// PR 592: the house ads at the top and between the cards (`blog.houseAds`, off as shipped: none).
import type { Metadata } from 'next';
import { ComingSoon } from '@/components/shop/ComingSoon';
import { JournalList } from '@/components/shop/journal/JournalViews';
import { journalAds, journalPage, journalSettings, pageOf } from '@/lib/journal/shop';
import { shopContext } from '@/lib/shop/context';
import { shopMetadata } from '@/lib/shop/meta';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ page?: string | string[] }> };

export async function generateMetadata(props: Props): Promise<Metadata> {
  const [c, sp] = await Promise.all([shopContext(), props.searchParams]);
  if (!(await journalSettings(c.storeId)).on) return shopMetadata(c, 'soon-journal', c.t('soon.title'), { index: false });
  return shopMetadata(c, 'journal', c.t('journal.title'), { index: pageOf(sp.page) === 1, own: { body: c.t('journal.dek', c.vars) } });
}

export default async function Journal(props: Props) {
  const [c, sp] = await Promise.all([shopContext(), props.searchParams]);
  if (!(await journalSettings(c.storeId)).on) return <ComingSoon c={c} soonKey="journal" />;
  const [data, ads] = await Promise.all([journalPage(c, pageOf(sp.page), null).then((d) => d!), journalAds(c, {}, ['listTop', 'listBetween'])]);
  return <JournalList c={c} posts={data.posts} total={data.total} page={data.page} pages={data.pages} topics={data.topics} topic={null} ads={ads.list} />;
}
