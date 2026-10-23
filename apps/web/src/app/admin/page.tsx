// PR 12 (CN-018, CN-022), PR 155 (follow-up 90), PR 495 — DSH-01, the Dashboard at /admin (docs/BACKEND-ARCHITECTURE.md
// §5.2, demo V12.3 #/admin): the greeting, today's date and the store, the date choice (`admin.dashboard.ranges`), the
// two money tiles through @extas/metrics — Delivered sales (M1: goods value of delivered orders, by the delivered day;
// provisional until settlements are matched, PR 155) and Ordered value (every placed order's total, by the placed day,
// never called sales) — each with its status, ▲/▼ against the period before and a small line, then "Needs you now"
// from the real waiting lists (lib/admin-shell/queues.ts). Nothing is a sample: an empty shop shows zeros and "All
// clear". Reading needs `dashboard.read`; the money tiles need `metrics.read` too. The other demo cards (Orders by
// stage, the sales trend, top products, delivery success by courier, Customize) come with their PRs (follow-ups).
// PR 495: /admin opens on the person's role start page (`admin.startPages`) unless they chose the Dashboard (?home=1).
// `?state=denied|error|notfound|empty` shows the shell's system states here, for the smoke test and the guide.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import type { AdminSectionId } from '@extas/settings';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { formatMoney, formatNumber, moneyOf } from '@/components/admin/products/model';
import { PageHead, ShellState, type StateKind } from '@/components/admin/shell/ShellParts';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { Spark } from '@/components/admin/shell/Spark';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { ageOf, hourIn, moneyPair, partOfDay, rangeOf, startHref, startSection, trend, type DashboardSettings, type MoneyPair } from '@/lib/admin-shell/dashboard';
import { cachedQueues, visibleQueues, type QueueRow } from '@/lib/admin-shell/queues';
import { SHELL_SECTIONS, sectionById, sectionHome, sectionVisible, visibleTabs, type ShellViewer } from '@/lib/admin-shell/sections';
import { shellSession } from '@/lib/admin-shell/session';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const PREVIEW_STATES: readonly StateKind[] = ['denied', 'error', 'notfound', 'empty'];

export async function generateMetadata(): Promise<Metadata> {
  const view = await adminView();
  return { title: t(view.dict, 'dash.metaTitle'), robots: { index: false, follow: false } };
}

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Someone without the Dashboard: the first section they may open that has a built page. */
function firstOpenable(v: ShellViewer): string | null {
  const s = SHELL_SECTIONS.find((x) => x.id !== 'dashboard' && sectionVisible(x, v) && visibleTabs(x, v).length > 0);
  return s ? sectionHome(s, v) : null;
}

function Trend({ view, cur, prev, days }: { view: AdminView; cur: number; prev: number; days: number }) {
  const tr = trend(cur, prev);
  if (tr === null) return null;
  const up = tr >= 0;
  const flat = Math.abs(tr) < 0.0005;
  const pct = new Intl.NumberFormat(view.locale, { style: 'percent', maximumFractionDigits: 1, numberingSystem: 'latn' }).format(Math.abs(tr));
  const vs = days === 1 ? t(view.dict, 'dash.range.vsYesterday') : t(view.dict, 'dash.range.vsDays', { n: formatNumber(days, view.locale) });
  return (
    <span className={`a2-trend ${flat ? 'flat' : up ? 'up' : 'down'}`} title={vs}>
      {up ? '▲' : '▼'} {pct}
      <span className="a2-sr">{vs}</span>
    </span>
  );
}

function MoneyStatus({ view, status }: { view: AdminView; status: 'provisional' | 'final' }) {
  const word = t(view.dict, `dash.status.${status}`);
  return (
    <span className={`a2-ms ${status}`} title={t(view.dict, 'dash.status.title', { status: word })}>
      {word}
    </span>
  );
}

function MoneyTiles({ view, pair, currency }: { view: AdminView; pair: MoneyPair; currency: string }) {
  const money = moneyOf(currency, view.locale);
  const range = pair.days === 1 ? t(view.dict, 'dash.range.todayWord') : t(view.dict, 'dash.range.daysWord', { n: formatNumber(pair.days, view.locale) });
  const n = (x: number) => formatNumber(x, view.locale);
  const sales = pair.current.sales;
  const ordered = pair.current.ordered;
  return (
    <div className="a2-kpis k2" data-testid="dash-kpis">
      <div className="a2-card a2-kpi" data-testid="dash-kpi-sales" title={t(view.dict, 'dash.tile.salesTitle')}>
        <div className="a2-kl">
          {t(view.dict, 'dash.tile.sales', { range })}
          <MoneyStatus view={view} status="provisional" />
        </div>
        <div className="a2-kv">{formatMoney(sales.itemsMinor, money)}</div>
        <div className="a2-kspark">
          <Spark id="dash-sp-sales" values={pair.spark.sales} />
        </div>
        <div className="a2-kf">
          <Trend view={view} cur={sales.itemsMinor} prev={pair.previous.sales.itemsMinor} days={pair.days} />
          <span className="a2-kn">{t(view.dict, 'dash.tile.salesNote', { n: n(sales.orders) })}</span>
        </div>
      </div>
      <div className="a2-card a2-kpi" data-testid="dash-kpi-ordered" title={t(view.dict, 'dash.tile.orderedTitle')}>
        <div className="a2-kl">
          {t(view.dict, 'dash.tile.ordered', { range })}
          <MoneyStatus view={view} status="final" />
        </div>
        <div className="a2-kv">{formatMoney(ordered.valueMinor, money)}</div>
        <div className="a2-kspark gold">
          <Spark id="dash-sp-ordered" values={pair.spark.ordered} />
        </div>
        <div className="a2-kf">
          <Trend view={view} cur={ordered.valueMinor} prev={pair.previous.ordered.valueMinor} days={pair.days} />
          <span className="a2-kn">{t(view.dict, 'dash.tile.orderedNote', { n: n(ordered.orders) })}</span>
        </div>
      </div>
    </div>
  );
}

function NeedsYou({ view, rows, now }: { view: AdminView; rows: QueueRow[]; now: Date }) {
  const d = view.dict;
  const age = (iso: string | null) => {
    const a = ageOf(iso, now);
    if (!a) return null;
    return a.unit === 'now' ? t(d, 'dash.age.now') : t(d, `dash.age.${a.unit}`, { n: formatNumber(a.n, view.locale) });
  };
  return (
    <section className="a2-card a2-needs" aria-labelledby="dash-needs" data-testid="dash-needs">
      <div className="a2-ch">
        <div>
          <h2 className="a2-h3" id="dash-needs">
            {t(d, 'dash.needs.title')}
          </h2>
          <div className="a2-cs">{rows.length ? t(d, 'dash.needs.some', { n: formatNumber(rows.length, view.locale) }) : t(d, 'dash.needs.none')}</div>
        </div>
      </div>
      {rows.map((r) => {
        const old = age(r.oldest);
        return (
          <Link key={r.id} className="a2-task" href={r.def.href} data-testid="a2-task" data-queue={r.id}>
            <span className={`a2-tki ${r.def.tone}`}>
              <ShellIcon name={r.def.icon} size={16} />
            </span>
            <span className="a2-tkt">
              <b>{t(d, `dash.queue.${r.id}`)}</b>
              <span>{old ? t(d, 'dash.queue.sub', { n: formatNumber(r.n, view.locale), age: old }) : t(d, 'shell.nav.waiting', { n: formatNumber(r.n, view.locale) })}</span>
            </span>
            <span className="a2-tkl a2-hide-ph">{t(d, `shell.sec.${r.def.section}`)}</span>
            <ShellIcon name="cr" size={15} />
          </Link>
        );
      })}
      {rows.length ? null : (
        <div className="a2-state" data-testid="dash-clear">
          <div className="a2-sti">
            <ShellIcon name="check" size={26} />
          </div>
          <h3>{t(d, 'dash.needs.clear')}</h3>
        </div>
      )}
    </section>
  );
}

export default async function Dashboard({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const deps = adminDeps();
  const [view, access] = await Promise.all([adminView(deps), pageAccess('dashboard.read', deps, MOTHER_STORE_ID)]);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent('/admin')}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current="dashboard" text={t(view.dict, 'page.noDb')} />;
  const session = await shellSession();
  if (session.kind !== 'ok') return <AdminNotice view={view} current="dashboard" text={t(view.dict, 'page.noDb')} />;
  const viewer: ShellViewer = { perms: session.perms, owner: session.owner };
  const home = one(sp.home) === '1';

  if (access.kind === 'forbidden') {
    // No Dashboard for this role: their first section instead (also from "Back to Dashboard" links, ?home=1).
    const to = firstOpenable(viewer);
    if (to) redirect(to);
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="dashboard.read" />
      </div>
    );
  }

  const { db, resolver } = access.deps;
  const scope = { storeId: MOTHER_STORE_ID };
  const [startPages, settings, shell, currency] = await Promise.all([
    resolver.value('admin.startPages', scope) as Promise<Record<string, AdminSectionId>>,
    resolver.value('admin.dashboard', scope) as Promise<DashboardSettings>,
    resolver.value('admin.shell', scope) as Promise<{ badgeCacheSeconds: number }>,
    resolver.value('store.currency', scope) as Promise<string>,
  ]);
  if (!home) {
    const to = startHref(startSection(startPages, session.roles), viewer);
    if (to) redirect(to);
  }

  const dashboard = sectionById('dashboard')!;
  const place = { section: dashboard, tab: null, page: null };
  const preview = PREVIEW_STATES.find((k) => k === one(sp.state));
  if (preview)
    return (
      <div className="a2-z">
        <ShellState view={view} kind={preview} permission={preview === 'denied' ? 'dashboard.read' : null} errorId={preview === 'error' ? 'preview' : null} />
      </div>
    );

  const now = (access.deps.now ?? (() => new Date()))();
  const days = rangeOf(one(sp.range), settings.ranges);
  const canMoney = viewer.owner || viewer.perms.has('metrics.read');
  const [pair, counts] = await Promise.all([
    canMoney ? moneyPair(db, MOTHER_STORE_ID, days, now, view.timeZone, settings.sparkDays) : Promise.resolve(null),
    cachedQueues({ db, settings: resolver, now: access.deps.now }, MOTHER_STORE_ID, shell.badgeCacheSeconds),
  ]);
  const rows = visibleQueues(counts, viewer);

  const d = view.dict;
  const greet = t(d, `dash.greet.${partOfDay(hourIn(now, view.timeZone), settings)}`);
  const first = session.guard.auth.staff.displayName.trim().split(/\s+/)[0];
  const title = first ? t(d, 'dash.greet.named', { greet, name: first }) : greet;
  const date = new Intl.DateTimeFormat(view.locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: view.timeZone, numberingSystem: 'latn' }).format(now);
  const time = new Intl.DateTimeFormat(view.locale, { hour: 'numeric', minute: '2-digit', timeZone: view.timeZone, numberingSystem: 'latn' }).format(now);
  const seg = canMoney ? (
    <div className="a2-seg" role="group" aria-label={t(d, 'dash.range.aria')}>
      {settings.ranges.map((n) => (
        <Link key={n} className={n === days ? 'on' : ''} href={`/admin?home=1&range=${n}`} aria-current={n === days ? 'true' : undefined} scroll={false}>
          {n === 1 ? t(d, 'dash.range.today') : t(d, 'dash.range.days', { n: formatNumber(n, view.locale) })}
        </Link>
      ))}
    </div>
  ) : null;

  return (
    <div className="a2-z" data-testid="dash">
      <PageHead view={view} place={place} title={title} sub={view.storeName ? `${date} · ${view.storeName}` : date} right={seg} />
      {pair ? (
        <>
          <div className="a2-fresh">
            <ShellIcon name="clock" size={14} />
            <span>{t(d, 'dash.fresh', { time })}</span>
          </div>
          <MoneyTiles view={view} pair={pair} currency={currency} />
        </>
      ) : null}
      <div className="a2-row">
        <NeedsYou view={view} rows={rows} now={now} />
      </div>
    </div>
  );
}
