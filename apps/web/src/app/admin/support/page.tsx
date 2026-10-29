// S22 · PR 425 — Support › Inbox (docs/ADMIN-ARCHITECTURE.md §4.7; Blueprint B4.2, B4.4): every customer conversation
// from every channel in one list. Views: Open (the customer waits; the longest wait first), Waiting for customer,
// Mine, Not taken, Solved, All — each with its count; a search by name, number, reference or subject and a channel
// filter. Each row shows who, the channel, the first words of the last message, who has it and how long the customer
// has waited, and opens the conversation. While no channel is connected (PR 426) the page says replies cannot go out.
//
// `support.read` opens it; a number is masked by `customers.phoneMask` (PR 284) unless the person holds
// `customers.phone`. Nothing here sends anything, moves money or changes an order.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as sp from '@extas/support';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { formatNumber } from '@/components/admin/products/model';
import { adminDeps } from '@/lib/admin-auth';
import { ago, kindName, withInbox } from '@/lib/admin-support/i18n';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t } from '@/lib/i18n';
import { supportDeps } from '@/lib/support-api';
import './support.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/support';

export async function generateMetadata(): Promise<Metadata> {
  const view = withInbox(await adminView());
  return { title: `${t(view.dict, 'sup.title')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

type Search = { view?: string; q?: string; channel?: string; page?: string };

const statusTone = (s: string) => (s === 'OPEN' ? 'warn' : s === 'SOLVED' ? 'ok' : 'info');

export default async function InboxPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sq = await searchParams;
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('support.read', deps, MOTHER_STORE_ID)]);
  const view = withInbox(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current="supportInbox" text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="support.read" />
      </div>
    );
  const who: sp.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const current: sp.InboxView = (sp.INBOX_VIEWS as readonly string[]).includes(sq.view ?? '') ? (sq.view as sp.InboxView) : 'open';
  const q = (sq.q ?? '').trim().slice(0, 80);
  const channel = sp.isChannelKind(sq.channel ?? '') ? sq.channel : undefined;
  const sd = supportDeps(access.deps);
  const box = await sp.supportInbox(sd, who, { view: current, q: q || undefined, channel, page: sq.page && /^\d{1,5}$/.test(sq.page) ? sq.page : undefined });
  const n = (x: number) => formatNumber(x, view.locale);
  const now = new Date();
  const link = (over: Partial<Search>) => {
    const p = new URLSearchParams();
    const v = { view: current, q: q || undefined, channel, ...over };
    for (const [k, val] of Object.entries(v)) if (val) p.set(k, String(val));
    return `${HERE}?${p.toString()}`;
  };
  const kinds = [...new Set(box.channels.map((c) => c.kind))];
  const me = who.actor.staffUserId;

  return (
    <div className="a2-z" data-testid="support-inbox">
      <PageHead view={view} place={locateKey('supportInbox')} title={t(d, 'sup.title')} sub={t(d, 'sup.sub')} />
      <SectionTabs view={view} current="supportInbox" />
      {!Object.keys(sd.channels ?? {}).length ? (
        <div className="a2-note warn" data-testid="support-no-channel">
          <ShellIcon name="info" size={15} />
          <span>{t(d, 'sup.noChannel')}</span>
        </div>
      ) : null}
      <div className="a2-between a2-mt12" style={{ flexWrap: 'wrap', gap: 8 }}>
        <nav className="a2-seg" aria-label={t(d, 'sup.views.label')} style={{ flexWrap: 'wrap' }}>
          {sp.INBOX_VIEWS.map((v) => (
            <Link key={v} className={v === current ? 'on' : undefined} href={link({ view: v, page: undefined })} scroll={false} aria-current={v === current ? 'page' : undefined} data-testid={`support-view-${v}`}>
              {t(d, `sup.views.${v}`)} · {n(box.counts[v])}
            </Link>
          ))}
        </nav>
        <form method="get" action={HERE} className="sp-filters" role="search" data-testid="support-search">
          <input type="hidden" name="view" value={current} />
          <input className="a2-inp" name="q" defaultValue={q} maxLength={80} placeholder={t(d, 'sup.search')} aria-label={t(d, 'sup.search')} />
          {kinds.length > 1 ? (
            <select className="a2-sel" name="channel" defaultValue={channel ?? ''} aria-label={t(d, 'sup.channelLabel')}>
              <option value="">{t(d, 'sup.channelAll')}</option>
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {kindName(d, k)}
                </option>
              ))}
            </select>
          ) : null}
          <button type="submit" className="a2-btn">
            {t(d, 'sup.searchGo')}
          </button>
          {q || channel ? (
            <Link className="a2-btn ghost" href={`${HERE}?view=${current}`}>
              {t(d, 'sup.clear')}
            </Link>
          ) : null}
        </form>
      </div>
      {box.rows.length ? (
        <ul className="sp-list" data-testid="support-list">
          {box.rows.map((r) => {
            const name = r.contact.name ?? r.contact.phone ?? t(d, 'sup.unnamed');
            const preview = r.lastPreview ? (r.lastDirection === 'OUT' ? t(d, 'sup.lastOut', { text: r.lastPreview }) : r.lastPreview) : (r.subject ?? '');
            return (
              <li key={r.id}>
                <Link className="sp-row" href={`${HERE}/c/${r.id}`} data-testid="support-row" data-status={r.status}>
                  <span className="sp-av" aria-hidden="true">
                    {name.trim().charAt(0).toUpperCase() || '?'}
                  </span>
                  <span className="sp-body">
                    <span className="sp-top">
                      <b>{name}</b>
                      {r.contact.name && r.contact.phone ? <span className="a2-xs a2-mute a2-mono">{r.contact.phone}</span> : null}
                      <span className="sp-when">{ago(d, view.locale, r.lastMessageAt, now)}</span>
                    </span>
                    <span className="sp-prev">{preview}</span>
                    <span className="sp-meta">
                      <span className={`a2-pill ${statusTone(r.status)}`}>{t(d, `sup.status.${r.status}`)}</span>
                      <span className="a2-pill line">{kindName(d, r.channel.kind)}</span>
                      <span>{r.assignedTo ? (r.assignedTo.id === me ? t(d, 'sup.you') : r.assignedTo.name) : t(d, 'sup.nobody')}</span>
                      {r.waitingSince && r.status !== 'SOLVED' ? <span>· {t(d, 'sup.waitingFor', { time: ago(d, view.locale, r.waitingSince, now) })}</span> : null}
                      <span className="a2-mono">· {r.refCode}</span>
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="a2-state a2-mt12" data-testid="support-empty">
          <div className="a2-sti">
            <ShellIcon name="inbox" size={26} />
          </div>
          <h3>{t(d, 'sup.empty')}</h3>
          <p>{q || channel ? t(d, 'sup.emptySearch') : t(d, 'sup.emptySub')}</p>
        </div>
      )}
      {box.pages > 1 ? (
        <nav className="sp-pages" aria-label={t(d, 'sup.pageOf', { n: n(box.page), of: n(box.pages) })}>
          {box.page > 1 ? (
            <Link className="a2-btn" href={link({ page: String(box.page - 1) })}>
              {t(d, 'sup.prev')}
            </Link>
          ) : (
            <span />
          )}
          <span className="a2-sm a2-mute">{t(d, 'sup.pageOf', { n: n(box.page), of: n(box.pages) })}</span>
          {box.page < box.pages ? (
            <Link className="a2-btn" href={link({ page: String(box.page + 1) })}>
              {t(d, 'sup.next')}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
