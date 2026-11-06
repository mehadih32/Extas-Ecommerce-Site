// S22 · PR 436 (Blueprint B4.13, B4.14 item 12) — Support › Analytics: how fast the team answers and how many chats
// become orders, per channel and per person (and EXTAS AI), for the last 7, 30 or 90 shop days or a from–to. Read with
// `support.read`; a person who gives chats out (`support.assign`) sees the team and every channel, anyone else only their
// own row (@extas/support supportAnalytics decides). Sales are delivered orders only (the shop's one definition).
// Reading changes nothing. Phone: the tables become one card per row (the shell's a2-tbl), the period links 44 px.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as sp from '@extas/support';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { pct } from '@/components/admin/courier-report/PerfTable';
import { formatMoney, moneyOf } from '@/components/admin/products/model';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { SupportAnalyticsTable, type AnalyticsTexts } from '@/components/admin/support/SupportAnalyticsTable';
import { adminDeps } from '@/lib/admin-auth';
import { kindName, span, withInbox } from '@/lib/admin-support/i18n';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t } from '@/lib/i18n';
import '../support.css';

export const dynamic = 'force-dynamic';

const KEY = 'supportAnalytics';
const HERE = '/admin/support/analytics';

export async function generateMetadata(): Promise<Metadata> {
  const view = withInbox(await adminView());
  return { title: `${t(view.dict, 'sup.an.title')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function SupportAnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string; from?: string; to?: string }> }) {
  const deps = adminDeps();
  const [plain, access, q] = await Promise.all([adminView(deps), pageAccess('support.read', deps, MOTHER_STORE_ID), searchParams]);
  const view = withInbox(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="support-analytics" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="support.read" />
      </div>
    );
  const a = (k: string, v?: Record<string, string | number>) => t(d, `sup.an.${k}`, v);
  const who: sp.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const sd = { db: access.deps.db, settings: access.deps.resolver, now: access.deps.now };
  const asked = q.from || q.to ? { from: q.from?.slice(0, 10), to: q.to?.slice(0, 10) } : q.days ? { days: q.days.slice(0, 3) } : {};
  let bad = false;
  let r: sp.SupportAnalytics;
  try {
    r = await sp.supportAnalytics(sd, who, asked);
  } catch (e) {
    if (!(sp.isSupportError(e) && e.code === 'INVALID_INPUT')) throw e;
    bad = true;
    r = await sp.supportAnalytics(sd, who, {});
  }
  const currency = await access.deps.resolver.value('store.currency', { storeId: MOTHER_STORE_ID });
  const money = moneyOf(currency, view.locale);
  const m = (minor: number) => formatMoney(minor, money);
  const n = (x: number) => new Intl.NumberFormat(view.locale, { numberingSystem: 'latn' }).format(x);
  const mins = (x: number | null) => (x === null ? '—' : span(d, view.locale, x));
  const day = new Intl.DateTimeFormat(view.locale, { timeZone: 'UTC', dateStyle: 'medium', numberingSystem: 'latn' });
  const ymd = (s: string) => day.format(new Date(`${s}T00:00:00Z`));
  const tot = r.total;
  const kpis: { id: string; l: string; v: string; note: string }[] = [
    { id: 'chats', l: a('kpi.chats'), v: n(tot.chats), note: a('kpi.chatsNote', { n: n(tot.replies) }) },
    { id: 'first', l: a('kpi.first'), v: mins(tot.firstMedian), note: a('kpi.firstNote', { avg: mins(tot.firstAverage) }) },
    { id: 'resolve', l: a('kpi.resolve'), v: mins(tot.resolveMedian), note: a('kpi.resolveNote', { n: n(tot.solved) }) },
    { id: 'late', l: a('kpi.late'), v: pct(tot.lateRate, view.locale), note: a('kpi.lateNote', { n: n(tot.late), of: n(tot.tickets) }) },
    { id: 'conversion', l: a('kpi.conversion'), v: pct(tot.conversion, view.locale), note: a('kpi.conversionNote', { n: n(tot.orderChats) }) },
    { id: 'sales', l: a('kpi.sales'), v: m(tot.salesMinor), note: a('kpi.salesNote', { n: n(tot.orders), v: m(tot.orderedMinor) }) },
  ];
  const texts: AnalyticsTexts = {
    col: Object.fromEntries(['channel', 'person', 'chats', 'replies', 'tickets', 'first', 'resolve', 'late', 'conversion', 'orders', 'sales', 'followUps'].map((k) => [k, a(`col.${k}`)])) as AnalyticsTexts['col'],
    none: a('none'),
  };
  const cell = {
    n,
    m,
    pct: (x: number | null) => pct(x, view.locale),
    mins,
    avg: (x: number | null) => (x === null ? '' : a('avg', { v: mins(x) })),
    ordered: (x: number) => a('ordered', { n: n(x) }),
    sent: (s: number, o: number) => a('sent', { n: n(s), m: n(o) }),
  };
  const label = (row: sp.SupportAnalyticsRow) => (row.kind === 'ai' ? a('ai') : row.kind === 'channel' ? row.label || kindName(d, row.channelKind ?? '') : row.label || a('unnamed'));
  const sub = (row: sp.SupportAnalyticsRow) => (row.kind === 'channel' && row.label ? kindName(d, row.channelKind ?? '') : '');

  return (
    <div className="a2-z" data-testid="support-analytics" data-lm-ready="" data-scope={r.scope} data-days={r.days ?? ''}>
      <PageHead view={view} place={locateKey(KEY)} title={a('title')} sub={a('sub')} />
      <SectionTabs view={view} current={KEY} />
      <nav className="a2-views a2-mt12" aria-label={a('period.label')}>
        {sp.SUPPORT_ANALYTICS_PERIODS.map((p) => (
          <Link key={p} className={`a2-view sp-an-tap${p === r.days ? ' on' : ''}`} href={`${HERE}?days=${p}`} aria-current={p === r.days ? 'page' : undefined}>
            {a(`period.d${p}`)}
          </Link>
        ))}
      </nav>
      <form className="sp-an-range" method="get" action={HERE} data-testid="support-analytics-range">
        <label>
          <span className="a2-xs a2-mute">{a('period.from')}</span>
          <input className="a2-inp" type="date" name="from" defaultValue={r.from} required />
        </label>
        <label>
          <span className="a2-xs a2-mute">{a('period.to')}</span>
          <input className="a2-inp" type="date" name="to" defaultValue={r.to} required />
        </label>
        <button className="a2-btn" type="submit">
          {a('period.show')}
        </button>
      </form>
      <p className="a2-sm a2-mute" data-testid="support-analytics-span">
        {a('period.span', { from: ymd(r.from), to: ymd(r.to) })}
      </p>
      {bad ? (
        <p className="a2-sm sp-late" role="alert" data-testid="support-analytics-bad">
          {a('period.bad', { n: n(sp.SUPPORT_ANALYTICS_MAX_DAYS), d: n(sp.SUPPORT_ANALYTICS_DEFAULT_DAYS) })}
        </p>
      ) : null}
      {r.scope === 'own' ? <p className="a2-sm a2-mute">{a('own')}</p> : null}

      <div className="a2-kpis" data-testid="support-analytics-kpis">
        {kpis.map((k) => (
          <div key={k.id} className="a2-card a2-kpi" data-kpi={k.id}>
            <div className="a2-kl">{k.l}</div>
            <div className="a2-kv">{k.v}</div>
            <div className="a2-kn">{k.note}</div>
          </div>
        ))}
      </div>

      {r.scope === 'team' ? (
        <section className="a2-card a2-mt12" data-testid="support-analytics-channels">
          <h2 className="a2-h3">{a('byChannel')}</h2>
          <SupportAnalyticsTable rows={r.byChannel} first="channel" texts={texts} cell={cell} label={label} sub={sub} testId="support-analytics-channel-table" />
        </section>
      ) : null}
      <section className="a2-card a2-mt12" data-testid="support-analytics-people">
        <h2 className="a2-h3">{a('byPerson')}</h2>
        <SupportAnalyticsTable rows={r.byPerson} first="person" texts={texts} cell={cell} label={label} sub={sub} testId="support-analytics-person-table" />
      </section>

      <details className="a2-more-opts a2-mt12 sp-an-how">
        <summary>{a('how.h')}</summary>
        <ul className="a2-sm">
          {['chats', 'first', 'late', 'orders', 'sales'].map((k) => (
            <li key={k}>{a(`how.${k}`)}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
