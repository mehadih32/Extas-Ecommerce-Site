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
import { HourChart } from '@/components/admin/lane-f/HourChart';
import { Kpi, KpiGrid } from '@/components/admin/lane-f/Parts';
import { adminDeps } from '@/lib/admin-auth';
import { loadInboxStats, peakHour } from '@/lib/lane-f/inbox-stats';
import { withLaneF } from '@/lib/admin-lane-f';
import { ago, kindName, span, withInbox } from '@/lib/admin-support/i18n';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t } from '@/lib/i18n';
import '@/components/admin/lane-f/lane-f.css';
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
  const view = withLaneF(withInbox(plain));
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
  // prototype v5: the quick tiles, the hour charts and who is waiting
  const now = new Date();
  const tz = await access.deps.resolver.value('store.timeZone', { storeId: MOTHER_STORE_ID });
  const [hourly, openBox] = await Promise.all([loadInboxStats(access.deps.db, MOTHER_STORE_ID, tz, now), sp.supportInbox(sd, who, { view: 'open' }).catch(() => null)]);
  const waiting = (openBox?.rows ?? []).filter((x) => x.waitingSince && x.status !== 'SOLVED').sort((x, y) => x.waitingSince!.getTime() - y.waitingSince!.getTime());
  const longestMin = waiting.length ? (now.getTime() - waiting[0]!.waitingSince!.getTime()) / 60_000 : null; // hardcode-ok: ms per minute
  const peak = peakHour(hourly.orders, hourly.hours);
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
      <PageHead view={view} place={locateKey(KEY)} title={t(d, 'lf.st.title')} sub={t(d, 'lf.st.sub')} />
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

      <KpiGrid cols={5}>
        <Kpi label={t(d, 'lf.st.kFirst')} value={mins(tot.firstAverage)} testId="st-first" />
        <Kpi label={t(d, 'lf.st.kFast')} value={hourly.fastPct === null ? '—' : pct(hourly.fastPct / 100, view.locale)} testId="st-fast" />
        <Kpi label={t(d, 'lf.st.kOpen')} value={n(openBox?.counts.open ?? 0)} sub={<Link href="/admin/support">{t(d, 'lf.st.kOpenGo')} →</Link>} testId="st-open" />
        <Kpi label={t(d, 'lf.st.kLongest')} value={mins(longestMin)} testId="st-longest" />
        <Kpi label={t(d, 'lf.st.kDone')} value={n(hourly.doneToday)} testId="st-done" />
      </KpiGrid>
      {peak !== null ? (
        <p className="a2-note a2-mt12 lf-st-callout" data-testid="st-peak">
          {t(d, 'lf.st.peak', { h: n(peak), h2: n(peak + 1) })}
        </p>
      ) : null}
      <div className="lf-st-g2">
        <HourChart title={t(d, 'lf.st.byHour')} sub={t(d, 'lf.st.byHourSub')} hours={hourly.hours} values={hourly.messages} testId="st-hours-msgs" />
        <HourChart title={t(d, 'lf.st.ordHour')} sub={t(d, 'lf.st.ordHourSub')} hours={hourly.hours} values={hourly.orders} tone="ok" testId="st-hours-orders" />
      </div>

      <div className="a2-kpis a2-mt12" data-testid="support-analytics-kpis">
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

      <section className="a2-card a2-mt12" data-testid="st-waiting">
        <h2 className="a2-h3">{t(d, 'lf.st.waiting')}</h2>
        <p className="a2-xs a2-mute">{t(d, 'lf.st.waitingSub')}</p>
        {waiting.length ? (
          <ul className="sp-same">
            {waiting.slice(0, 8).map((x) => (
              <li key={x.id}>
                <Link className="sp-same-row" href={`/admin/support/c/${x.id}`}>
                  <span>{x.contact.name ?? x.contact.phone ?? t(d, 'sup.unnamed')}</span>
                  <span className="a2-mute">{x.lastPreview ?? ''}</span>
                  <span className="a2-pill line">{kindName(d, x.channel.kind)}</span>
                  <span className={`a2-pill ${now.getTime() - x.waitingSince!.getTime() > 3_600_000 /* hardcode-ok: an hour in ms */ ? 'bad' : 'warn'}`}>{ago(d, view.locale, x.waitingSince, now)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="a2-sm a2-mute">{t(d, 'lf.st.nobody')}</p>
        )}
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
