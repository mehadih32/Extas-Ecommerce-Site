// PR 12 (CN-018, CN-022), PR 155 (follow-up 90), PR 495 — DSH-01, the Dashboard at /admin (docs/BACKEND-ARCHITECTURE.md
// §5.2). PR 12 (CN-025): drawn in one of its designs from the admin look registry (components/admin/look/registry.ts,
// demo V12.4): A "Classic cards" (the V12.3 page), B "Calm overview" (the V12.4 default) and C "Command center". Which one
// is shown: `?design=X` (a preview, never saved) → the person's own choice (the "…" menu, while `admin.look.perPerson`
// is on) → the team's (Settings → Admin look, `admin.look.pages`) → the registry's standard (B). Every design reads its
// figures through the one loader (lib/admin-look/dashboard-data.ts), only the parts it draws and only those the person
// may see: Sales = delivered orders only (M1, through @extas/metrics, provisional until settlements are matched), with
// Ordered value beside it and never called sales. Nothing is a sample; a figure with no store yet says which stage
// brings it. The date choice is a preset (`admin.dashboard.ranges`, `?range=N`) or the person's own two dates
// (`?from=&to=`, at most `admin.dashboardDesigns.customMaxDays`).
// PR 495: /admin opens on the person's role start page (`admin.startPages`) unless they chose the Dashboard (?home=1).
// `?state=denied|error|notfound|empty` shows the shell's system states here, for the smoke test and the guide.
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { ymdIn } from '@extas/metrics';
import type { AdminSectionId } from '@extas/settings';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { csvOf, type DashProps } from '@/components/admin/look/dashboard/common';
import { fmtOf } from '@/components/admin/look/fmt';
import type { LookMenuProps } from '@/components/admin/look/LookMenu';
import type { RangeSegProps } from '@/components/admin/look/RangeSeg';
import { lookPage } from '@/components/admin/look/registry';
import { wordsIn } from '@/components/admin/look/types';
import { ShellState, type StateKind } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { loadDashboard, mayRead, type DashDesignSettings, type DashPart } from '@/lib/admin-look/dashboard-data';
import { pickDesign } from '@/lib/admin-look/pick';
import { lookState } from '@/lib/admin-look/prefs';
import { rangeFrom, rangeHref } from '@/lib/admin-look/range';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { hourIn, partOfDay, startHref, startSection, type DashboardSettings } from '@/lib/admin-shell/dashboard';
import { cachedQueues, visibleQueues } from '@/lib/admin-shell/queues';
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
  const [startPages, settings, designs, shell, currency, look] = await Promise.all([
    resolver.value('admin.startPages', scope) as Promise<Record<string, AdminSectionId>>,
    resolver.value('admin.dashboard', scope) as Promise<DashboardSettings>,
    resolver.value('admin.dashboardDesigns', scope) as Promise<DashDesignSettings>,
    resolver.value('admin.shell', scope) as Promise<{ badgeCacheSeconds: number }>,
    resolver.value('store.currency', scope) as Promise<string>,
    lookState(),
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

  // Which design: a preview, the person's own, the team's, the registry's standard.
  const page = lookPage('dashboard')!;
  const keys = page.designs.map((x) => x.key);
  const picked = pickDesign(keys, page.standard, { preview: one(sp.design), mine: look.prefs.look.dashboard, team: look.team, page: page.id });
  const design = page.designs.find((x) => x.key === picked.key)!;
  const previewKey = picked.from === 'preview' ? picked.key : null;

  const now = (access.deps.now ?? (() => new Date()))();
  const today = ymdIn(now, view.timeZone);
  const range = rangeFrom({ range: one(sp.range), from: one(sp.from), to: one(sp.to) }, settings.ranges, today, designs.customMaxDays);
  const data = await loadDashboard(
    {
      db,
      settings: resolver,
      storeId: MOTHER_STORE_ID,
      now,
      timeZone: view.timeZone,
      viewer,
      s: designs,
      range,
      queues: async () => visibleQueues(await cachedQueues({ db, settings: resolver, now: access.deps.now }, MOTHER_STORE_ID, shell.badgeCacheSeconds), viewer),
    },
    design.parts as readonly DashPart[],
  );

  const f = fmtOf(view, currency, now);
  const d = view.dict;
  const greet = t(d, `dash.greet.${partOfDay(hourIn(now, view.timeZone), settings)}`);
  const first = session.guard.auth.staff.displayName.trim().split(/\s+/)[0];
  const title = first ? t(d, 'dash.greet.named', { greet, name: first }) : greet;
  const date = new Intl.DateTimeFormat(view.locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: view.timeZone, numberingSystem: 'latn' }).format(now);
  const time = new Intl.DateTimeFormat(view.locale, { hour: 'numeric', minute: '2-digit', timeZone: view.timeZone, numberingSystem: 'latn' }).format(now);

  const rangeSeg: RangeSegProps | null = mayRead('money', viewer)
    ? {
        options: settings.ranges.map((n) => ({
          days: n,
          label: n === 1 ? f.t('dash.range.today') : f.t('dash.range.days', { n: f.n(n) }),
          href: rangeHref({ kind: 'preset', days: n }, previewKey),
          on: range.kind === 'preset' && range.days === n,
        })),
        custom: { on: range.kind === 'custom', label: f.t('dsh.range.custom'), from: range.from, to: range.to, today, min: '', maxDays: designs.customMaxDays },
        design: previewKey,
        labels: {
          aria: f.t('dash.range.aria'),
          pick: f.t('dsh.range.pick'),
          from: f.t('dsh.range.from'),
          to: f.t('dsh.range.to'),
          show: f.t('dsh.range.show'),
          cancel: f.t('dsh.range.cancel'),
          bad: f.t('dsh.range.bad', { n: f.n(designs.customMaxDays) }),
        },
      }
    : null;
  const csv = csvOf(f, data, today);
  const menu: LookMenuProps = {
    page: page.id,
    designs: page.designs.map((x) => ({ key: x.key, name: wordsIn(view.lang, x.name) })),
    current: picked.key,
    mine: look.team.perPerson && !!look.prefs.look[page.id],
    perPerson: look.team.perPerson,
    settingsHref: viewer.owner || viewer.perms.has('settings.read') ? '/admin/settings/look' : null,
    items: [],
    csv,
    labels: {
      more: f.t('look.menu.more'),
      design: f.t('look.menu.design'),
      team: f.t('look.menu.team'),
      all: f.t('look.menu.all'),
      csv: f.t('look.menu.csv'),
      saved: f.t('look.menu.saved'),
      failed: f.t('look.menu.failed'),
    },
  };
  const props: DashProps = {
    f,
    view,
    data,
    s: designs,
    viewer,
    head: { title, date, time, place, range: rangeSeg, menu, csv },
    sparkDays: settings.sparkDays,
    q: { view: one(sp.view), design: previewKey ?? undefined },
    design: picked.key,
  };
  const Render = design.Render as unknown as (p: DashProps) => ReactNode;
  return <Render {...props} />;
}
