// S28 · PR 693 (CN-048; prototype v5 Inbox › Comments; gap I2, I9, I10, N2) — Inbox › Comments at /admin/support/comments.
// Facebook Page and Instagram public comments in one list with the views All, Need a reply, Hidden and Auto-replied;
// hide or show a comment, "Message privately", and the desk's rules (hide a phone number or abuse, the optional automatic
// private message and public reply). Off as shipped: the rules card holds the switch (`support.settings`). Seeing needs
// `support.read`; hiding and messaging `support.reply`. Hiding and replying go through the Page's connector (a practice
// stand-in until its keys are in). `?view=all|need|hidden|auto`.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as sp from '@extas/support';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { CommentActions, CommentRules } from '@/components/admin/v5/CommentParts';
import { PageHead, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { withW5a } from '@/lib/admin-v5-w5a';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { supportDeps } from '@/lib/support-api';
import { locateKey } from '@/lib/admin-shell/sections';
import { t } from '@/lib/i18n';
import '../../reports/delivery/report.css';

export const dynamic = 'force-dynamic';

const KEY = 'supportComments';
const HERE = '/admin/support/comments';

export async function generateMetadata(): Promise<Metadata> {
  const view = withW5a(await adminView());
  return { title: `${t(view.dict, 'w5a.comments.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function CommentsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const deps = adminDeps();
  const [plain, access, q] = await Promise.all([adminView(deps), pageAccess('support.read', deps, MOTHER_STORE_ID), searchParams]);
  const view = withW5a(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="comment-desk" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="support.read" />
      </div>
    );
  const c = (k: string, v?: Record<string, string | number>) => t(d, `w5a.comments.${k}`, v);
  const who: sp.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const cur = (sp.COMMENT_VIEWS as readonly string[]).includes(q.view ?? '') ? (q.view as sp.CommentView) : 'all';
  const [list, rules] = await Promise.all([sp.listComments(supportDeps(access.deps), who, { view: cur }), access.deps.resolver.value('support.commentDesk', { storeId: MOTHER_STORE_ID })]);
  const perms = access.guard.permissions;
  const canAct = perms?.has('support.reply') ?? false;
  const canRules = perms?.has('support.settings') ?? false;
  const when = new Intl.DateTimeFormat(view.locale, { timeZone: view.timeZone, dateStyle: 'medium', timeStyle: 'short', numberingSystem: 'latn' });
  const n = (x: number) => new Intl.NumberFormat(view.locale, { numberingSystem: 'latn' }).format(x);
  const chip = (v: sp.CommentView) => ({ all: c('vAll'), need: c('vNeed'), hidden: c('vHidden'), auto: c('vAuto') })[v];

  return (
    <div className="a2-z" data-testid="comment-desk" data-lm-ready="" data-on={list.enabled ? 'yes' : 'no'}>
      <PageHead view={view} place={locateKey(KEY)} title={c('title')} sub={c('sub', { need: n(list.counts.need), hidden: n(list.counts.hidden), auto: n(list.counts.auto) })} />
      {!list.enabled ? <div className="a2-note a2-mt12">{c('off')}</div> : null}
      {list.enabled ? (
        <>
          <div className="a2-kpis a2-mt12" data-testid="comment-kpis">
            {(
              [
                ['kAll', list.counts.all],
                ['kNeed', list.counts.need],
                ['kHidden', list.counts.hidden],
                ['kAuto', list.counts.auto],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="a2-card">
                <div className="a2-xs a2-mute">{c(k)}</div>
                <div className="a2-h2">{n(v)}</div>
              </div>
            ))}
          </div>
          <nav className="a2-views a2-mt12" aria-label={c('title')}>
            {sp.COMMENT_VIEWS.map((v) => (
              <Link key={v} className={`a2-view${v === cur ? ' on' : ''}`} href={v === 'all' ? HERE : `${HERE}?view=${v}`} aria-current={v === cur ? 'page' : undefined}>
                {chip(v)}
                <span className="a2-cnt">{n(list.counts[v])}</span>
              </Link>
            ))}
          </nav>
          <section className="a2-card" data-testid="comment-list">
            {list.rows.length ? (
              <ul className="cr-rows" style={{ marginTop: 0 }}>
                {list.rows.map((r) => (
                  <li key={r.id} data-testid="comment-row" data-hidden={r.hiddenAt ? 'yes' : 'no'}>
                    <div>
                      <div className="a2-gap8" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                        <b>{r.name ?? c('unnamed')}</b>
                        <span className="a2-pill line">{r.channelKind === 'instagram' ? c('instagram') : c('facebook')}</span>
                        {r.hiddenAt ? <span className="a2-pill warn">{r.hideReason === 'phone' ? c('hiddenPhone') : r.hideReason === 'abuse' ? c('hiddenAbuse') : c('hiddenManual')}</span> : null}
                        {r.autoRepliedAt ? <span className="a2-pill ok">{c('auto')}</span> : null}
                        {r.needsReply ? <span className="a2-pill info">{c('question')}</span> : null}
                        <span className="a2-xs a2-mute">{when.format(r.at)}</span>
                      </div>
                      <div className="a2-sm a2-mt6" style={r.hiddenAt ? { opacity: 0.6, textDecoration: 'line-through' } : undefined}>
                        {r.words}
                      </div>
                      <div className="a2-mt6">
                        <Link className="cr-link" href={`/admin/support/c/${r.conversationId}`}>
                          {c('open')}
                        </Link>
                      </div>
                    </div>
                    <CommentActions dict={d} id={r.id} hidden={r.hiddenAt !== null} canAct={canAct} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="a2-sm a2-mute">{c('none')}</p>
            )}
          </section>
          <p className="a2-xs a2-mute a2-mt6">{c('note')}</p>
        </>
      ) : null}
      {canRules ? (
        <section className="a2-card a2-mt12" aria-label={c('rules')}>
          <h2 className="a2-h3" style={{ marginBottom: 10 }}>
            {c('rules')}
          </h2>
          <CommentRules dict={d} before={rules} />
        </section>
      ) : null}
    </div>
  );
}
