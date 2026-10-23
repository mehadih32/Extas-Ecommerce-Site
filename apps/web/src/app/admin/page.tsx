// PR 12 (CN-018, CN-022) — DSH-01, the Dashboard at /admin (docs/BACKEND-ARCHITECTURE.md §5.2, demo V12.3 #/admin):
// the greeting, today's date and the store, then "Needs you now" from the real waiting lists (lib/admin-shell/queues.ts).
// Nothing is a sample: an empty shop shows "All clear". Reading needs `dashboard.read`. The money tiles (PR 155,
// follow-up 90) and the other demo cards (Orders by stage, the sales trend, top products, delivery success by courier,
// Customize) come with their PRs (follow-ups).
// `?state=denied|error|notfound|empty` shows the shell's system states here, for the smoke test and the guide.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { formatNumber } from '@/components/admin/products/model';
import { PageHead, ShellState, type StateKind } from '@/components/admin/shell/ShellParts';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { ageOf, hourIn, partOfDay, type DashboardSettings } from '@/lib/admin-shell/dashboard';
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
  const [settings, shell] = await Promise.all([
    resolver.value('admin.dashboard', scope) as Promise<DashboardSettings>,
    resolver.value('admin.shell', scope) as Promise<{ badgeCacheSeconds: number }>,
  ]);

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
  const counts = await cachedQueues({ db, settings: resolver, now: access.deps.now }, MOTHER_STORE_ID, shell.badgeCacheSeconds);
  const rows = visibleQueues(counts, viewer);

  const d = view.dict;
  const greet = t(d, `dash.greet.${partOfDay(hourIn(now, view.timeZone), settings)}`);
  const first = session.guard.auth.staff.displayName.trim().split(/\s+/)[0];
  const title = first ? t(d, 'dash.greet.named', { greet, name: first }) : greet;
  const date = new Intl.DateTimeFormat(view.locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: view.timeZone, numberingSystem: 'latn' }).format(now);

  return (
    <div className="a2-z" data-testid="dash">
      <PageHead view={view} place={place} title={title} sub={view.storeName ? `${date} · ${view.storeName}` : date} />
      <div className="a2-row">
        <NeedsYou view={view} rows={rows} now={now} />
      </div>
    </div>
  );
}
