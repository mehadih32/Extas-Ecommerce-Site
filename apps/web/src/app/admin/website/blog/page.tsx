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

export default async function BlogBoardPage(props: Props) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([adminView(deps), pageAccess('blog.read', deps, MOTHER_STORE_ID), props.searchParams]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="blog.read" />
      </div>
    );
  const s = (k: string, vars?: Record<string, string | number>) => t(d, `jr.${k}`, vars);
  const num = (n: number) => formatNumber(n, view.locale);
  const perms = access.guard.permissions;
  const canWrite = perms?.has('blog.write') ?? false;
  const canPublish = perms?.has('blog.publish') ?? false;
  const col = (BLOG_COLUMNS as readonly string[]).includes(sp.c ?? '') ? (sp.c as BlogColumn) : null;
  const [l, choices] = await Promise.all([journalList(access.deps.db, access.deps.resolver), journalChoices(access.deps.db)]);
  const rows = l.rows.filter((r) => (col ? r.column === col : r.column !== 'archived'));
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
    <div className="a2-z" data-testid="blog-board">
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
              <Link className="a2-btn pri" href={`${HERE}/new`} data-testid="jr-create">
                {s('create')}
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
      <nav className="a2-views jr-views a2-mt12" aria-label={s('title')} data-testid="jr-views">
        {views.map((n) => {
          const on = (col ?? 'all') === n;
          const count = n === 'all' ? l.rows.length - l.counts.archived : l.counts[n];
          return (
            <Link key={n} className={`a2-view${on ? ' on' : ''}`} href={n === 'all' ? HERE : `${HERE}?c=${n}`} aria-current={on ? 'page' : undefined} data-testid={`jr-view-${n}`}>
              {s(`views.${n}`)} <span className="a2-mute">{num(count)}</span>
            </Link>
          );
        })}
      </nav>
      {rows.length ? (
        <div className="a2-tblw a2-mt12">
          <table className="a2-tbl" data-testid="jr-table">
            <thead>
              <tr>
                <th>{s('col.article')}</th>
                <th>{s('col.category')}</th>
                <th>{s('col.author')}</th>
                <th>{s('col.state')}</th>
                <th className="r">{s('col.read')}</th>
                <th>{s('col.updated')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} data-testid="jr-row">
                  <td>
                    <Link className="a2-b jr-name" href={`${HERE}/${r.id}`} lang={r.locale}>
                      {r.title}
                    </Link>
                    <span className="a2-mono a2-xs a2-mute jr-slug">
                      {r.locale === 'bn' ? '/bn' : ''}/journal/{r.slug} · {s(`lang.${r.locale}`)}
                    </span>
                  </td>
                  <td className="a2-sm">{(r.categoryId && catName.get(r.categoryId)) || s('none')}</td>
                  <td className="a2-sm">{(r.authorId && authorName.get(r.authorId)) || s('none')}</td>
                  <td>
                    <span className={`a2-pill${pill(r.column)}`}>{s(`state.${r.status}`)}</span>
                    {r.live ? <span className="a2-xs a2-mute jr-live"> {s('live')}</span> : null}
                  </td>
                  <td className="r a2-num">{s('min', { n: num(r.readingMinutes) })}</td>
                  <td className="a2-sm">{when(r.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="a2-card a2-mt12 jr-empty" data-testid="jr-empty">
          <b>{s('empty')}</b>
          <p className="a2-sm a2-mute">{s('emptySub')}</p>
        </div>
      )}
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
          ]}
          texts={texts}
          canEdit={canPublish}
          testId="jr-settings"
        />
      </div>
    </div>
  );
}
