// S12 · PR 592 follow-up (register "Blog as a complete, standard section … search"; demo 73-blog.js bfSearchPage, "noindex
// in the live build") — the journal's own search at /journal/search?q=… (and /bn/…): the live articles of the page's
// language whose title, tags, keyword, topic, summary or text hold a word of the search, best first, one page at a
// time; nothing found: a few popular tags to try. Never listed by search engines. Off (`blog.journal`): "Coming soon";
// search off (`blog.journal.search`, as shipped): the shop's "page not found".
import type { Metadata } from 'next';
import { shopNotFound } from '@/lib/shop/not-found';
import { getPrisma } from '@extas/db/client';
import { ComingSoon } from '@/components/shop/ComingSoon';
import { JournalBrowse, JournalList } from '@/components/shop/journal/JournalViews';
import { searchJournal } from '@/lib/journal/browse';
import { QUERY_MAX } from '@/lib/journal/browse-model';
import { liveCategories } from '@/lib/journal/journal';
import { journalBrowseFoot, journalLinks, journalSettings, pageOf } from '@/lib/journal/shop';
import { shopContext } from '@/lib/shop/context';
import { shopMetadata } from '@/lib/shop/meta';
import { ROUTES } from '@/lib/shop/routes';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ q?: string | string[]; page?: string | string[] }> };

const queryOf = (v: string | string[] | undefined) => String((Array.isArray(v) ? v[0] : v) ?? '').trim().slice(0, QUERY_MAX);

export async function generateMetadata(): Promise<Metadata> {
  const c = await shopContext();
  const s = await journalSettings(c.storeId);
  if (!s.on) return shopMetadata(c, 'soon-journal', c.t('soon.title'), { index: false });
  return shopMetadata(c, 'journal/search', c.t('journal.search.title'), { index: false, path: ROUTES.journalSearch });
}

export default async function JournalSearchPage(props: Props) {
  const [c, sp] = await Promise.all([shopContext(), props.searchParams]);
  const s = await journalSettings(c.storeId);
  if (!s.on) return <ComingSoon c={c} soonKey="journal" />;
  if (!s.search) shopNotFound(c);
  const t = c.t;
  const q = queryOf(sp.q);
  const page = pageOf(sp.page);
  const links = journalLinks(s);
  const db = getPrisma();
  const [found, topics] = await Promise.all([searchJournal(db, c.storeId, c.lang, q, page, s.perPage), liveCategories(db, c.storeId)]);
  const searched = found.words.length > 0;
  const line = !searched ? t('journal.search.start') : found.total === 1 ? t('journal.search.result1', { q }) : found.total ? t('journal.search.results', { n: c.num(found.total), q }) : t('journal.search.none', { q });
  // nothing found (or nothing typed): the popular tags and the people to try instead
  const foot = !found.total ? await journalBrowseFoot(c, { ...links, rss: false }) : null;
  return (
    <JournalList
      c={c}
      posts={found.posts}
      total={found.total}
      page={page}
      pages={Math.max(1, Math.ceil(found.total / s.perPage))}
      topics={topics}
      topic={null}
      links={links}
      q={q}
      heading={{
        title: t('journal.search.title'),
        intro: null,
        base: ROUTES.journalSearch,
        query: q ? { q } : {},
        testId: 'journal-search',
        chips: false,
        lead: (
          <p className="text2 jn-resc" role="status" data-testid="jn-results">
            {line}
          </p>
        ),
        empty: <></>,
      }}
      foot={foot ? <JournalBrowse c={c} links={{ ...links, rss: false }} tags={foot.tags} people={foot.people} /> : null}
    />
  );
}
