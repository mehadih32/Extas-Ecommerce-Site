// S12 · PR 251 (register "Comment handling, or the decision to run without comments"; BACKEND-ARCHITECTURE WEB-03
// "More options: … comments") — Website › Blog & journal › Comments at /admin/website/blog/comments, drawn in Lumen
// (CN-036: the shared patterns, --lm-* tokens only, data-lm-ready): the counts (waiting, shown, hidden), the waiting
// queue (Show, with Undo; "Show all"), every comment by chip with Show / Hide for the ticked ones, and the card
// `blog.comments` (off as shipped = the journal runs without comments). Nothing a reader writes is shown before a person
// presses Show; a comment is hidden, never deleted. Seeing needs `blog.read`; Show, Hide and the card `blog.publish`.
// Guide: docs/admin-guide/pages/website/blog-comments.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { BLOG_COMMENT_WHO } from '@extas/settings';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { ListView, type ListRow } from '@/components/admin/lumen/ListView';
import { Queue, type QueueRow } from '@/components/admin/lumen/Queue';
import { SettingCards } from '@/components/admin/lumen/SettingCards';
import { SummaryTiles, type SummaryTile } from '@/components/admin/lumen/SummaryTiles';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import type { LmCall } from '@/lib/admin-lumen/safety';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { commentsScreen, type CommentRow } from '@/lib/journal/comments';
import { shownName } from '@/lib/journal/comments-model';
import bn from '../../../../../../messages/admin-blog.bn.json';
import en from '../../../../../../messages/admin-blog.en.json';
import './comments.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/website/blog/comments';
const KEY = 'blogComments';
const API = '/api/admin/blog/comments';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'jr.cm.meta'), robots: { index: false, follow: false } };
}

const move = (ids: string[], to: 'APPROVED' | 'HIDDEN' | 'back'): LmCall => ({ method: 'POST', url: API, body: { ...(ids.length ? { ids } : {}), to } });

export default async function CommentsPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('blog.read', deps, MOTHER_STORE_ID)]);
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
  const l = (k: string, vars?: Record<string, string | number>) => s(`cm.${k}`, vars);
  const canPublish = access.guard.permissions?.has('blog.publish') ?? false;
  const r = await commentsScreen(access.deps.db, access.deps.resolver, new Date());
  const set = r.card.value;
  const fmt = { kind: 'number', locale: view.locale } as const;
  const num = (n: number) => new Intl.NumberFormat(view.locale, { numberingSystem: 'latn' }).format(n);
  const when = (at: Date) => new Intl.DateTimeFormat(view.locale, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', numberingSystem: 'latn' }).format(at);
  const who = (c: CommentRow) => shownName(c.name, l('reader'));
  const tiles: SummaryTile[] = [
    { key: 'waiting', label: l('tWaiting'), value: r.counts.waiting, shown: num(r.counts.waiting), format: fmt, icon: 'clock' },
    { key: 'shown', label: l('tShown'), value: r.counts.shown, shown: num(r.counts.shown), format: fmt, icon: 'check' },
    { key: 'hidden', label: l('tHidden'), value: r.counts.hidden, shown: num(r.counts.hidden), format: fmt, icon: 'eye' },
  ];
  const article = (c: CommentRow) =>
    c.post ? (
      <Link href={`/admin/website/blog/${c.post.id}`} lang={c.post.locale}>
        {l('on', { title: c.post.title })}
      </Link>
    ) : (
      <span>{l('gone')}</span>
    );
  const meta = (c: CommentRow) => (
    <span className="cm-meta">
      <span>{when(c.createdAt)}</span>
      <span>{c.customer ? l('signedIn') : l('guest')}</span>
      {article(c)}
      {c.post && !c.post.live ? <span className="cm-pill warn">{l('notLive')}</span> : null}
    </span>
  );
  const waiting = r.rows.filter((c) => c.status === 'PENDING').reverse();
  const queueRows: QueueRow[] = waiting.map((c) => ({
    id: c.id,
    title: who(c),
    sub: (
      <>
        <span className="cm-body">{c.body}</span>
        {meta(c)}
      </>
    ),
    act: canPublish ? { kind: 'show', label: l('show'), call: move([c.id], 'APPROVED'), undo: move([c.id], 'back') } : { kind: 'show', label: l('show') },
    done: l('shownDone'),
  }));
  const chipOf = { PENDING: 'waiting', APPROVED: 'shown', HIDDEN: 'hidden' } as const;
  const pill = { PENDING: 'warn', APPROVED: 'ok', HIDDEN: '' } as const;
  const chipLabel = { PENDING: l('chipWaiting'), APPROVED: l('chipShown'), HIDDEN: l('chipHidden') } as const;
  const listRows: ListRow[] = r.rows.map((c) => ({
    id: c.id,
    chips: [chipOf[c.status]],
    text: `${c.name ?? ''} ${c.body} ${c.post?.title ?? ''}`,
    cells: (
      <div className="cm-row" data-status={c.status}>
        <b>{who(c)}</b> <span className={`cm-pill ${pill[c.status]}`}>{chipLabel[c.status]}</span>
        <p className="cm-body">{c.body}</p>
        {meta(c)}
      </div>
    ),
    detailTitle: who(c),
  }));

  return (
    <div className="a2-z cm-page" data-testid="blog-comments" data-lm-ready="">
      <PageHead
        view={view}
        place={locateKey(KEY)}
        crumb={
          <Link className="bd-crumb" href="/admin/website/blog">
            {s('e.back')}
          </Link>
        }
        title={l('title')}
        sub={l('sub')}
      />
      <SectionTabs view={view} current={KEY} />
      {set.on ? null : (
        <p className="lm-card cm-off" role="note" data-testid="cm-off">
          {l('off')}
        </p>
      )}
      <SummaryTiles tiles={tiles} label={l('tiles')} testId="cm-tiles" />
      <div className="cm-grid">
        <div className="cm-stack">
          <Queue
            title={l('queue')}
            sub={l('queueSub', { n: num(waiting.length) })}
            rows={queueRows}
            doAll={canPublish ? { label: l('showAll'), done: l('allDone') } : undefined}
            empty={{ title: l('empty'), text: l('emptyText') }}
            testId="cm-queue"
          />
          <section className="lm-card" aria-labelledby="cm-list-h" data-testid="cm-list-card">
            <h2 className="lm-h2" id="cm-list-h">
              {l('list')}
            </h2>
            <ListView
              rows={listRows}
              chips={[
                { key: 'waiting', label: l('chipWaiting') },
                { key: 'shown', label: l('chipShown') },
                { key: 'hidden', label: l('chipHidden') },
              ]}
              allLabel={l('all')}
              searchLabel={l('search')}
              bulk={
                canPublish
                  ? [
                      { kind: 'show', label: l('show'), call: move([], 'APPROVED'), undo: move([], 'back'), done: l('bulkShown') },
                      { kind: 'hide', label: l('hide'), call: move([], 'HIDDEN'), undo: move([], 'back'), done: l('bulkHidden') },
                    ]
                  : []
              }
              empty={{ title: l('listEmpty'), text: l('listEmptyText') }}
              testId="cm-list"
            />
          </section>
        </div>
        <div className="cm-stack">
          {canPublish ? (
            <SettingCards
              save={{ method: 'PUT', url: API }}
              cards={[
                {
                  key: r.card.key,
                  title: l('card'),
                  text: l('cardText'),
                  on: set.on,
                  fields: [
                    { name: 'who', label: l('who'), kind: 'select', value: set.who, options: BLOG_COMMENT_WHO.map((v) => ({ value: v, label: l(v === 'signedIn' ? 'whoSignedIn' : 'whoAnyone') })) },
                    { name: 'maxChars', label: l('maxChars'), kind: 'number', value: set.maxChars, min: 40, max: 2000, step: 1, unit: l('chars') },
                    { name: 'perDay', label: l('perDay'), kind: 'number', value: set.perDay, min: 1, max: 50, step: 1 },
                    { name: 'shown', label: l('shown'), kind: 'number', value: set.shown, min: 1, max: 100, step: 1 },
                  ],
                },
              ]}
              testId="cm-card"
            />
          ) : (
            <p className="lm-card cm-ro" data-testid="cm-readonly">
              {l('readOnly')}
            </p>
          )}
          <section className="lm-card" aria-labelledby="cm-how-h">
            <h2 className="lm-h2" id="cm-how-h">
              {l('how')}
            </h2>
            <ol className="cm-how">
              {['how1', 'how2', 'how3', 'how4'].map((k) => (
                <li key={k}>{l(k)}</li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
