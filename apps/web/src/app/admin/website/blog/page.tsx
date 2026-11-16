// S12 · PR 240 (Blueprint WEB-03, demo 94-admin-blog.js) — Website › Blog & journal at /admin/website/blog: the board
// of articles by where they are (ideas, writing, in review, scheduled, published, taken down, put away) with a count on
// each, every article's language, category, author, state and reading time; "New article"; "Categories & authors";
// and the journal's card (`blog.journal`: off as it ships). Seeing needs `blog.read`; a new article `blog.write`; the
// card `blog.publish`. Guide: docs/admin-guide/pages/website/blog.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { FieldsCard, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { formatNumber } from '@/components/admin/products/model';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { journalChoices, journalList } from '@/lib/journal/journal';
import { performanceReport } from '@/lib/journal/performance';
import { BLOG_COLUMNS, type BlogColumn } from '@/lib/journal/model';
import bn from '../../../../../messages/admin-blog.bn.json';
import en from '../../../../../messages/admin-blog.en.json';
import '../../settings-cards.css';
import './blog.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/website/blog';
const API = '/api/admin/blog/posts';
const KEY = 'blog';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'jr.metaTitle'), robots: { index: false, follow: false } };
}

type Props = { searchParams: Promise<{ c?: string }> };

/** The prototype's "Drafts": the three stages before an article is scheduled. */
const DRAFT_COLUMNS: readonly BlogColumn[] = ['ideas', 'writing', 'review'];

export default async function BlogBoardPage(props: Props) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([adminView(deps), pageAccess('blog.read', deps, MOTHER_STORE_ID), props.searchParams]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="blog-board" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="blog.read" />
      </div>
    );
  const s = (k: string, vars?: Record<string, string | number>) => t(d, `jr.${k}`, vars);
  const num = (n: number) => formatNumber(n, view.locale);
  const perms = access.guard.permissions;
  const canWrite = perms?.has('blog.write') ?? false;
  const canPublish = perms?.has('blog.publish') ?? false;
  const drafts = sp.c === 'drafts';
  const col = (BLOG_COLUMNS as readonly string[]).includes(sp.c ?? '') ? (sp.c as BlogColumn) : null;
  const [l, choices, perf, tagCount] = await Promise.all([
    journalList(access.deps.db, access.deps.resolver),
    journalChoices(access.deps.db),
    performanceReport(access.deps.db, access.deps.resolver, new Date()).catch(() => null),
    access.deps.db.blogTag.count({ where: { storeId: MOTHER_STORE_ID } }).catch(() => 0),
  ]);
  const rows = l.rows.filter((r) => (drafts ? DRAFT_COLUMNS.includes(r.column) : col ? r.column === col : r.column !== 'archived'));
  const perfOf = new Map((perf?.rows ?? []).map((r) => [r.id, r]));
  const publishedRows = l.rows.filter((r) => r.column === 'published');
  const avgSeo = publishedRows.length ? Math.round(publishedRows.reduce((n, r) => n + r.seo, 0) / publishedRows.length) : null;
  const seoTone = (n: number) => (n >= 70 ? 'ok' : n >= 40 ? 'warn' : 'bad'); // hardcode-ok: colour bands of the score
  const kpis: [string, string][] = [
    [s('kpi.published'), num(l.counts.published)],
    [s('kpi.readers', { n: num(perf?.days ?? 0) }), num(perf?.totals.readers ?? 0)],
    [s('kpi.orders'), num(perf?.fromArticles.ordered.orders ?? 0)],
    [s('kpi.seo'), avgSeo === null ? '—' : num(avgSeo)],
  ];
  const railCount = { all: l.rows.length - l.counts.archived, drafts: DRAFT_COLUMNS.reduce((n, c) => n + l.counts[c], 0), scheduled: l.counts.scheduled, published: l.counts.published };
  const railOn = (k: string) => (k === 'all' ? !drafts && !col : k === 'drafts' ? drafts : !drafts && col === k);
  const catName = new Map(choices.categories.map((c) => [c.id, view.lang === 'bn' && c.nameBn ? c.nameBn : c.nameEn]));
  const authorName = new Map(choices.authors.map((a) => [a.id, a.displayName]));
  const when = (iso: string) => new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeZone: view.timeZone, numberingSystem: 'latn' }).format(new Date(iso));
  const texts: FieldsCardTexts = {
    h: s('card.h'),
    d: s('card.d'),
    save: s('card.save'),
    saving: s('card.saving'),
    saved: s('card.saved'),
    discard: s('card.discard'),
    unsaved: s('card.unsaved'),
    readOnly: s('card.readOnly'),
    pairHelp: s('card.pairHelp'),
    err: Object.fromEntries(['STALE', 'INVALID_INPUT', 'forbidden', 'unauthorized', 'network', 'other'].map((k) => [k, s(`err.${k}`)])),
  };
  const views: (BlogColumn | 'all')[] = ['all', ...BLOG_COLUMNS];
  const pill = (c: BlogColumn) => (c === 'published' ? ' ok' : c === 'off' || c === 'review' ? ' warn' : '');

  return (
    <div className="a2-z" data-testid="blog-board" data-lm-ready="">
      <PageHead
        view={view}
        place={locateKey(KEY)}
        title={s('title')}
        sub={s('sub')}
        right={
          <div className="jr-acts">
            <Link className="a2-btn" href={`${HERE}/plan`} data-testid="jr-plan-link">
              {s('plan')}
            </Link>
            <Link className="a2-btn" href={`${HERE}/shelves`} data-testid="jr-shelves-link">
              {s('shelves')}
            </Link>
            {canWrite ? (
              <Link className="a2-btn" href={`${HERE}/source`} data-testid="jr-source-link">
                {s('src.title')}
              </Link>
            ) : null}
          </div>
        }
      />
      <SectionTabs view={view} current={KEY} />
      {!l.card.value.on ? (
        <div className="a2-note a2-mt12" role="note" data-testid="jr-off">
          {s('off')}
        </div>
      ) : null}
      <div className="jr-kpis a2-mt12" data-testid="jr-kpis">
        {kpis.map(([label, value]) => (
          <div key={label} className="a2-card jr-kpi">
            <span className="a2-xs a2-mute">{label}</span>
            <b>{value}</b>
          </div>
        ))}
      </div>
      <div className="jr-board a2-mt12">
        <aside className="a2-card jr-rail" data-testid="jr-views" aria-label={s('rail.posts')}>
          {canWrite ? (
            <Link className="a2-btn pri jr-newside" href={`${HERE}/new`}>
              + {s('newPost')}
            </Link>
          ) : null}
          <div className="jr-rh">{s('rail.posts')}</div>
          {(['all', 'drafts', 'scheduled', 'published'] as const).map((k) => (
            <Link key={k} className={`jr-ri${railOn(k) ? ' on' : ''}`} href={k === 'all' ? HERE : `${HERE}?c=${k}`} aria-current={railOn(k) ? 'page' : undefined} data-testid={`jr-view-${k}`}>
              <span>{s(`rail.${k}`)}</span>
              <b>{num(railCount[k])}</b>
            </Link>
          ))}
          <div className="jr-rh">{s('rail.organise')}</div>
          <Link className="jr-ri" href={`${HERE}/shelves`}>
            <span>{s('rail.categories')}</span>
            <b>{num(choices.categories.length)}</b>
          </Link>
          <Link className="jr-ri" href={`${HERE}/shelves`}>
            <span>{s('rail.tags')}</span>
            <b>{num(tagCount)}</b>
          </Link>
          <Link className="jr-ri" href={`${HERE}/shelves`}>
            <span>{s('rail.authors')}</span>
            <b>{num(choices.authors.length)}</b>
          </Link>
          <details className="jr-stage">
            <summary className="a2-xs a2-mute">{s('rail.stage')}</summary>
            {views.filter((n) => n !== 'all').map((n) => (
              <Link key={n} className={`jr-ri${railOn(n) ? ' on' : ''}`} href={`${HERE}?c=${n}`} data-testid={`jr-view-${n}`}>
                <span>{s(`views.${n}`)}</span>
                <b>{num(l.counts[n as BlogColumn])}</b>
              </Link>
            ))}
          </details>
        </aside>
        <section className="a2-card jr-main" aria-labelledby="jr-posts-h">
          <div className="jr-mh">
            <h2 className="a2-h3" id="jr-posts-h">
              {s('posts')}
            </h2>
            {canWrite ? (
              <Link className="a2-btn pri" href={`${HERE}/new`} data-testid="jr-create">
                + {s('newPost')}
              </Link>
            ) : null}
          </div>
          {rows.length ? (
            <div className="a2-tblw">
              <table className="a2-tbl" data-testid="jr-table">
                <thead>
                  <tr>
                    <th>{s('tcol.title')}</th>
                    <th>{s('tcol.status')}</th>
                    <th className="r">{s('tcol.seo')}</th>
                    <th className="r">{s('tcol.readers')}</th>
                    <th className="r">{s('tcol.orders')}</th>
                    <th>{s('tcol.date')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const pf = perfOf.get(r.id);
                    const cat = (r.categoryId && catName.get(r.categoryId)) || '';
                    const au = (r.authorId && authorName.get(r.authorId)) || '';
                    return (
                      <tr key={r.id} data-testid="jr-row">
                        <td>
                          <Link className="a2-b jr-name" href={`${HERE}/${r.id}`} lang={r.locale}>
                            {r.title}
                          </Link>
                          <span className="a2-xs a2-mute jr-slug">{[cat, au].filter(Boolean).join(' · ') || s('none')}</span>
                        </td>
                        <td>
                          <span className={`a2-pill${pill(r.column)}`}>{s(`state.${r.status}`)}</span>
                          {r.live ? <span className="a2-xs a2-mute jr-live"> {s('live')}</span> : null}
                        </td>
                        <td className="r a2-num">
                          <b className={`jr-seo ${seoTone(r.seo)}`}>{num(r.seo)}</b>
                        </td>
                        <td className="r a2-num">{num(pf?.readers ?? 0)}</td>
                        <td className="r a2-num">{num(pf?.ordered.orders ?? 0)}</td>
                        <td className="a2-sm">{r.publishedAt || r.scheduledAt ? when((r.publishedAt ?? r.scheduledAt)!) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="jr-empty" data-testid="jr-empty">
              <b>{s('empty')}</b>
              <p className="a2-sm a2-mute">{s('emptySub')}</p>
            </div>
          )}
        </section>
      </div>
      <div className="a2-mt12">
        <FieldsCard
          url={API}
          screen={{ key: l.card.key, value: l.card.value, version: l.card.version }}
          fields={[
            { kind: 'switch', path: 'on', label: s('card.on') },
            { kind: 'number', path: 'perPage', label: s('card.perPage'), min: 6, max: 48 },
            { kind: 'number', path: 'relatedProducts', label: s('card.relatedProducts'), min: 0, max: 8 },
            // PR 249: "Read next" links under an article (0 as shipped)
            { kind: 'number', path: 'relatedArticles', label: s('card.relatedArticles'), min: 0, max: 6 },
            { kind: 'number', path: 'minMinutes', label: s('card.minMinutes'), min: 1, max: 10 },
            { kind: 'number', path: 'wordsPerMinuteEn', label: s('card.wpmEn'), min: 60, max: 400 },
            { kind: 'number', path: 'wordsPerMinuteBn', label: s('card.wpmBn'), min: 60, max: 400 },
            { kind: 'switch', path: 'reviewByAnother', label: s('card.reviewByAnother') },
            { kind: 'pair', path: 'aiNote', label: { en: s('card.aiNote'), bn: s('card.aiNote') }, max: 200 },
            // PR 592 follow-up: tags, author and reviewer pages, search and RSS (each off as shipped)
            { kind: 'switch', path: 'tags', label: s('card.tags') },
            { kind: 'switch', path: 'authorPages', label: s('card.authorPages') },
            { kind: 'switch', path: 'search', label: s('card.search') },
            { kind: 'switch', path: 'rss', label: s('card.rss') },
            { kind: 'number', path: 'rssItems', label: s('card.rssItems'), min: 5, max: 100 },
          ]}
          texts={texts}
          canEdit={canPublish}
          testId="jr-settings"
        />
      </div>
    </div>
  );
}
