// S12 · PR 592 follow-up (register "Blog as a complete, standard section … author/reviewer pages"; C11.3 the honest
// byline; demo 73-blog.js bfAuthorPage) — one person's page at /journal/author/<link> (and /bn/…): their name, an AI
// author always labelled as one (with the owner's honest line), their bio in the page's language (else English), the
// reviewer line the owner entered, the live articles they wrote (one page at a time) and the ones they checked as the
// expert reviewer. Off (`blog.journal`): "Coming soon"; author pages off (`blog.journal.authorPages`, as shipped), no
// such person or one put away: the shop's "page not found". Listed by search engines only while the journal's page kind
// is ticked in `seo.indexing` (off as shipped), on its first page, with live articles.
import type { Metadata } from 'next';
import { shopNotFound } from '@/lib/shop/not-found';
import { getPrisma } from '@extas/db/client';
import { ComingSoon } from '@/components/shop/ComingSoon';
import { JournalList } from '@/components/shop/journal/JournalViews';
import { liveByPerson } from '@/lib/journal/browse';
import { journalLinks, journalSettings, pageOf } from '@/lib/journal/shop';
import { hrefIn } from '@/lib/shop/lang';
import { shopContext, type ShopContext } from '@/lib/shop/context';
import { shopMetadata } from '@/lib/shop/meta';
import { ROUTES } from '@/lib/shop/routes';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string | string[] }> };

async function read(c: ShopContext, slug: string, page: number) {
  const s = await journalSettings(c.storeId);
  if (!s.on) return { s, data: null };
  if (!s.authorPages) return { s, data: undefined };
  const data = await liveByPerson(getPrisma(), c.storeId, c.lang, slug, page, s.perPage);
  return { s, data: data ?? undefined };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const [c, { slug }, sp] = await Promise.all([shopContext(), props.params, props.searchParams]);
  const page = pageOf(sp.page);
  const { data } = await read(c, slug, page);
  if (data === null) return shopMetadata(c, 'soon-journal', c.t('soon.title'), { index: false });
  if (!data) return shopMetadata(c, `journal/author/${slug}`, c.t('journal.title'), { index: false });
  const any = data.written.total + data.reviewed.total > 0;
  return shopMetadata(c, `journal/author/${slug}`, data.person.displayName, { index: any && page === 1, own: { body: data.person.bio } });
}

export default async function JournalPersonPage(props: Props) {
  const [c, { slug }, sp] = await Promise.all([shopContext(), props.params, props.searchParams]);
  const page = pageOf(sp.page);
  const { s, data } = await read(c, slug, page);
  if (data === null) return <ComingSoon c={c} soonKey="journal" />;
  if (!data) shopNotFound(c);
  const t = c.t;
  const { person, written, reviewed } = data;
  const links = journalLinks(s);
  const aiLine = s.aiNote[c.lang] || t('journal.aiNote', { shop: c.storeName });
  const lead = (
    <div className="jn-person" data-testid="jn-person">
      {person.isAiAuthor ? (
        <p className="small text2">
          <span className="jn-pill">{t('journal.aiPill')}</span> {aiLine}
        </p>
      ) : null}
      {person.reviewerLine ? <p className="small text2">{t('journal.person.reviewerLine', { line: person.reviewerLine })}</p> : null}
      {written.total ? <h2 className="h3 jn-sub">{t('journal.person.wrote', { name: person.displayName })}</h2> : null}
    </div>
  );
  const checked = reviewed.posts.length ? (
    <section className="jn-related" aria-labelledby="jn-rev-h" data-testid="jn-reviewed">
      <h2 className="h3" id="jn-rev-h">
        {t('journal.person.reviewed', { name: person.displayName })}
      </h2>
      <ul>
        {reviewed.posts.map((r) => (
          <li key={r.id}>
            <a href={hrefIn(c.lang, ROUTES.article(r.slug))}>
              <span className="jn-rel-t">{r.title}</span>
              <span className="jn-rel-m small text2">{t('journal.readMin', { n: c.num(r.readingMinutes) })}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  ) : null;
  return (
    <JournalList
      c={c}
      posts={written.posts}
      total={written.total}
      page={page}
      pages={Math.max(1, Math.ceil(written.total / s.perPage))}
      topics={[]}
      topic={null}
      links={{ ...links, search: false }}
      heading={{
        title: person.displayName,
        intro: person.bio,
        base: ROUTES.journalAuthor(person.slug),
        testId: 'journal-author',
        lead,
        empty: reviewed.posts.length ? <></> : <p className="text2 jn-resc">{t('journal.person.none')}</p>,
      }}
      foot={checked}
    />
  );
}
