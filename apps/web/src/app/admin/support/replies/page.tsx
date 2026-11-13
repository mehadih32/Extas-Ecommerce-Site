// S28 · PR 692 (CN-048; prototype v5 Inbox › Quick replies; gap I6, N1) — Inbox › Quick replies at
// /admin/support/replies. A short name with an English and a Bengali text, typed as `/name` in a chat's reply box. Never
// deleted: archive hides it from chats and it can come back. The 8 starters are the shop's to edit. Off as shipped:
// "More options" holds the switch and the longest text (`support.settings`). `?view=active|archived`. Seeing needs
// `support.reply`; adding, editing and archiving `support.settings`.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as sp from '@extas/support';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { ReplyForm, ReplyRowActions } from '@/components/admin/v5/ReplyManager';
import { V5Number, V5Switch } from '@/components/admin/v5/Parts';
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

const KEY = 'supportReplies';
const HERE = '/admin/support/replies';
const API = '/api/admin/support/replies';

export async function generateMetadata(): Promise<Metadata> {
  const view = withW5a(await adminView());
  return { title: `${t(view.dict, 'w5a.replies.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function RepliesPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const deps = adminDeps();
  const [plain, access, sp0] = await Promise.all([adminView(deps), pageAccess('support.reply', deps, MOTHER_STORE_ID), searchParams]);
  const view = withW5a(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="quick-replies" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="support.reply" />
      </div>
    );
  const c = (k: string, v?: Record<string, string | number>) => t(d, `w5a.replies.${k}`, v);
  const who: sp.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const list = await sp.listSavedReplies(supportDeps(access.deps), who);
  const perms = access.guard.permissions;
  const canEdit = perms?.has('support.settings') ?? false;
  const showArchived = sp0.view === 'archived';
  const shown = showArchived ? list.archived : list.active;
  const switchValue = await access.deps.resolver.value('support.savedReplies', { storeId: MOTHER_STORE_ID });
  const lang = view.lang === 'bn' ? 'bn' : 'en';

  return (
    <div className="a2-z" data-testid="quick-replies" data-lm-ready="" data-on={list.enabled ? 'yes' : 'no'}>
      <PageHead view={view} place={locateKey(KEY)} title={c('title')} sub={c('sub')} />
      {!list.enabled ? <div className="a2-note a2-mt12">{c('off')}</div> : null}
      {list.enabled && list.top ? <div className="a2-note a2-mt12">{c('top', { name: list.top.shortcut, n: list.top.usedCount })}</div> : null}
      {list.enabled && canEdit ? (
        <section className="a2-card a2-mt12" aria-label={c('add')}>
          <h2 className="a2-h3" style={{ marginBottom: 10 }}>
            {c('add')}
          </h2>
          <ReplyForm dict={d} edit={null} maxChars={list.maxChars} />
        </section>
      ) : null}
      {list.enabled ? (
        <>
          <nav className="a2-views a2-mt12" aria-label={c('title')}>
            <Link className={`a2-view${!showArchived ? ' on' : ''}`} href={HERE} aria-current={!showArchived ? 'page' : undefined}>
              {c('inUse')}
              <span className="a2-cnt">{list.active.length}</span>
            </Link>
            <Link className={`a2-view${showArchived ? ' on' : ''}`} href={`${HERE}?view=archived`} aria-current={showArchived ? 'page' : undefined}>
              {c('archived')}
              <span className="a2-cnt">{list.archived.length}</span>
            </Link>
          </nav>
          <section className="a2-card" data-testid="reply-list">
            {shown.length ? (
              <ul className="cr-rows" style={{ marginTop: 0 }}>
                {shown.map((r) => (
                  <li key={r.id} data-testid="reply-row" data-short={r.shortcut}>
                    <div>
                      <div className="a2-gap8" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                        <b className="a2-mono">/{r.shortcut}</b>
                        <span className="a2-xs a2-mute">
                          {c('colUsed')}: {r.usedCount}
                        </span>
                      </div>
                      <div className="a2-sm a2-mt6" style={{ whiteSpace: 'pre-wrap' }}>
                        {lang === 'bn' ? sp.replyBody(r, 'bn') : sp.replyBody(r, 'en')}
                      </div>
                    </div>
                    {canEdit ? <ReplyRowActions dict={d} row={r} archived={showArchived} maxChars={list.maxChars} /> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="a2-sm a2-mute">{showArchived ? c('noneArchived') : c('none')}</p>
            )}
          </section>
          <p className="a2-xs a2-mute a2-mt6">{c('never')}</p>
        </>
      ) : null}
      {canEdit ? (
        <details className="a2-card a2-mt12" data-testid="replies-more">
          <summary className="a2-h4">{t(d, 'w5a.more')}</summary>
          <div className="a2-stack a2-mt12" style={{ gap: 12 }}>
            <V5Switch dict={d} url={`${API}/settings`} before={switchValue} label={switchValue.enabled ? t(d, 'w5a.turnOff') : t(d, 'w5a.turnOn')} tone={switchValue.enabled ? '' : 'pri'} testId="replies-switch" />
            <V5Number dict={d} url={`${API}/settings`} before={switchValue} field="maxChars" label={c('longest')} min={50} max={4000} save={c('save')} testId="replies-max" />
          </div>
        </details>
      ) : null}
    </div>
  );
}
