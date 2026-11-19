// S22 · PR 425 — Support › Inbox (docs/ADMIN-ARCHITECTURE.md §4.7; Blueprint B4.2, B4.4): every customer conversation
// from every channel in one list. Views: Open (the customer waits; the longest wait first), Waiting for customer,
// Mine, Not taken, Solved, All — each with its count; a search by name, number, reference or subject and a channel
// filter. Each row shows who, the channel, the first words of the last message, who has it and how long the customer
// has waited, and opens the conversation. While no channel is connected (PR 426) the page says replies cannot go out.
// PR 431: the "Late" view (chats whose ticket timer ran out, the most late first) and each row's timer — the first
// answer or the solution, due in or late by — while `support.tickets` opened a ticket.
// PR 433: the "Follow-ups" view (chats with a follow-up waiting for a person) while `support.followUp` is on.
// PR 434: the "Blocked" view (people on the support block list) while `support.blockList` is on; other employees'
// chats left out under "own chats only" (`support.privacy`); numbers in previews masked when switched on.
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
import { kindName, span, withInbox } from '@/lib/admin-support/i18n';
import { Chips } from '@/components/admin/lane-f/Parts';
import { InboxRows } from '@/components/admin/lane-f/InboxRows';
import { withLaneF } from '@/lib/admin-lane-f';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t } from '@/lib/i18n';
import { supportDeps } from '@/lib/support-api';
import '@/components/admin/lane-f/lane-f.css';
import './support.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/support';

export async function generateMetadata(): Promise<Metadata> {
  const view = withInbox(await adminView());
  return { title: `${t(view.dict, 'sup.title')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

type Search = { view?: string; q?: string; channel?: string; page?: string };

export default async function InboxPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sq = await searchParams;
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('support.read', deps, MOTHER_STORE_ID)]);
  const view = withLaneF(withInbox(plain));
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current="supportInbox" text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="support-inbox" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="support.read" />
      </div>
    );
  const who: sp.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const current: sp.InboxView = (sp.INBOX_VIEWS as readonly string[]).includes(sq.view ?? '') ? (sq.view as sp.InboxView) : 'open';
  const q = (sq.q ?? '').trim().slice(0, 80);
  const channel = sp.isChannelKind(sq.channel ?? '') ? sq.channel : undefined;
  const sd = supportDeps(access.deps);
  const [box, desk] = await Promise.all([
    sp.supportInbox(sd, who, { view: current, q: q || undefined, channel, page: sq.page && /^\d{1,5}$/.test(sq.page) ? sq.page : undefined }),
    // PR 538: the desk's hours (null while they are off: always open)
    sp.supportDesk(sd, MOTHER_STORE_ID),
  ]);
  // prototype v5: the head's one line (open, not assigned, first reply on average, longest wait)
  const an = await sp.supportAnalytics(sd, who, {}).catch(() => null);
  const deskTime = (at: Date, tz: string) => {
    const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(view.locale, { timeZone: tz, numberingSystem: 'latn', ...o }).format(at);
    // a time later today shows the hour only; another day shows the day too
    const day = (x: Date) => x.toLocaleDateString('en-CA', { timeZone: tz });
    return day(at) === day(now) ? f({ hour: 'numeric', minute: '2-digit' }) : f({ weekday: 'short', hour: 'numeric', minute: '2-digit' });
  };
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
  const longest = box.rows.reduce((m, r) => (r.waitingSince && r.status !== 'SOLVED' ? Math.max(m, (now.getTime() - new Date(r.waitingSince).getTime()) / 60_000) : m), 0); // hardcode-ok: ms per minute
  const mins = (x: number | null) => (x === null || x <= 0 ? '—' : span(d, view.locale, x));
  const headLine = t(d, 'lf.ib.sub', { open: n(box.counts.open), un: n(box.counts.unassigned), avg: mins(an?.total.firstAverage ?? null), wait: mins(longest) });
  const viewLabel = (v: string) => (['open', 'mine', 'unassigned', 'solved', 'all'].includes(v) ? t(d, `lf.ib.view.${v}`) : t(d, `sup.views.${v}`));

  return (
    <div className="a2-z" data-testid="support-inbox" data-lm-ready="">
      <PageHead view={view} place={locateKey('supportInbox')} title={t(d, 'lf.ib.title')} sub={headLine} />
      <SectionTabs view={view} current="supportInbox" />
      <div className="lf-viewbar a2-mt12" data-testid="support-viewbar">
        <nav className="lf-seg" aria-label={t(d, 'lf.ib.title')}>
          <Link className="on" href={HERE} aria-current="page">
            {t(d, 'lf.ib.viewMsgs')}
          </Link>
          <Link href={`${HERE}/comments`}>{t(d, 'lf.ib.viewComments')}</Link>
        </nav>
        <span className="a2-xs a2-mute">{t(d, 'lf.ib.viewNoteMsgs')}</span>
      </div>
      {desk ? (
        <p className={`sp-desk${desk.open ? '' : ' closed'}`} data-testid="support-desk">
          <ShellIcon name="clock" size={14} />
          <span>{!desk.next ? t(d, 'sup.desk.never') : t(d, desk.open ? 'sup.desk.open' : 'sup.desk.closed', { time: deskTime(desk.next, desk.timeZone) })}</span>
        </p>
      ) : null}
      {/* PR 426: ~~no adapter connected~~ no channel switched on yet (Support settings → Channels) */}
      {!box.channels.some((c) => c.enabled) ? (
        <div className="a2-note warn" data-testid="support-no-channel">
          <ShellIcon name="info" size={15} />
          <span>{t(d, 'sup.noChannel')}</span>
        </div>
      ) : null}
      <div className="lf-ibx a2-mt12" data-testid="support-panes">
      <div className="lf-ibx-list">
      <div className="a2-between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <nav className="a2-seg" aria-label={t(d, 'sup.views.label')} style={{ flexWrap: 'wrap' }}>
          {sp.INBOX_VIEWS.filter((v) => (v !== 'followup' || box.followUps || current === 'followup') && (v !== 'blocked' || box.blockList || current === 'blocked')).map((v) => (
            <Link key={v} className={v === current ? 'on' : undefined} href={link({ view: v, page: undefined })} scroll={false} aria-current={v === current ? 'page' : undefined} data-testid={`support-view-${v}`}>
              {viewLabel(v)} · {n(box.counts[v])}
            </Link>
          ))}
        </nav>
        <form method="get" action={HERE} className="sp-filters" role="search" data-testid="support-search">
          <input type="hidden" name="view" value={current} />
          {channel ? <input type="hidden" name="channel" value={channel} /> : null}
          <input className="a2-inp" name="q" defaultValue={q} maxLength={80} placeholder={t(d, 'lf.ib.search')} aria-label={t(d, 'lf.ib.search')} />
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
      {kinds.length > 0 ? (
        <Chips
          label={t(d, 'sup.channelLabel')}
          current={channel ?? ''}
          testId="support-channels"
          items={[{ key: '', label: t(d, 'lf.ib.channels'), href: link({ channel: undefined, page: undefined }) }, ...kinds.map((k) => ({ key: k, label: kindName(d, k), href: link({ channel: k, page: undefined }) }))]}
        />
      ) : null}
      {box.rows.length ? (
        <InboxRows rows={box.rows} d={d} locale={view.locale} me={me} now={now} />
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
      <aside className="lf-ibx-pick" data-testid="support-pick" aria-hidden="true">
        <ShellIcon name="inbox" size={26} />
        <p>{t(d, 'lf.ib.pick')}</p>
      </aside>
      </div>
    </div>
  );
}
