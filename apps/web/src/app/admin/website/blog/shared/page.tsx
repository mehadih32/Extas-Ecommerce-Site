// S12 · PR 252 (register "Content calendar shared with the social studio") — Website › Blog & journal › Shared calendar
// at /admin/website/blog/shared, drawn in Lumen (CN-036: the shared patterns, --lm-* tokens only, data-lm-ready): the one
// calendar the journal, the social studio and Marketing › Calendar share (lib/journal/shared-calendar.ts) — the counts by
// lane, then every item day by day with lane chips and a search: the journal's articles beside the owner's plan lines,
// campaigns, ads, message sends, seasonal home windows and festive cut-offs; social posts only while the social studio
// (S23) is shown. Earlier / Today / Later move the view by its length. Read-only; each item links to where it is managed.
// Seeing needs `blog.read`. Guide: docs/admin-guide/pages/website/blog-shared.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { ListView, type ListRow } from '@/components/admin/lumen/ListView';
import { SummaryTiles, type SummaryTile } from '@/components/admin/lumen/SummaryTiles';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { sharedCalendar } from '@/lib/journal/shared-calendar';
import { addDays, type CalendarItem } from '@/lib/marketing/calendar-model';
import bn from '../../../../../../messages/admin-blog.bn.json';
import en from '../../../../../../messages/admin-blog.en.json';
import calBn from '../../../../../../messages/admin-calendar.bn.json';
import calEn from '../../../../../../messages/admin-calendar.en.json';
import './shared.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/website/blog/shared';
const KEY = 'blogShared';

function withScreen(view: AdminView): AdminView {
  const extra = view.lang === 'bn' ? { ...calBn, ...bn } : { ...calEn, ...en };
  return { ...view, dict: { ...view.dict, ...(extra as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'jr.sc.meta'), robots: { index: false, follow: false } };
}

export default async function SharedCalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([adminView(deps), pageAccess('blog.read', deps, MOTHER_STORE_ID), searchParams]);
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
  const l = (k: string, vars?: Record<string, string | number>) => s(`sc.${k}`, vars);
  const mc = (k: string, vars?: Record<string, string | number>) => t(d, `mc.${k}`, vars);
  const cal = await sharedCalendar(access.deps.db, access.deps.resolver, new Date(), { from: typeof sp.from === 'string' ? sp.from : undefined });
  const num = (n: number) => new Intl.NumberFormat(view.locale, { numberingSystem: 'latn' }).format(n);
  const day = (ymd: string) => new Intl.DateTimeFormat(view.locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC', numberingSystem: 'latn' }).format(new Date(`${ymd}T00:00:00Z`));
  const fmt = { kind: 'number', locale: view.locale } as const;
  const others = cal.shownLanes.filter((x) => x !== 'content' && x !== 'social').reduce((n, x) => n + cal.lanes[x], 0);
  const tiles: SummaryTile[] = [
    { key: 'content', label: mc('lane.content'), value: cal.lanes.content, shown: num(cal.lanes.content), format: fmt, icon: 'file' },
    ...(cal.socialShown ? [{ key: 'social', label: mc('lane.social'), value: cal.lanes.social, shown: num(cal.lanes.social), format: fmt, icon: 'msg' as const }] : []),
    { key: 'others', label: l('others'), value: others, shown: num(others), format: fmt, icon: 'cal' },
  ];
  const title = (i: CalendarItem) => (view.lang === 'bn' && i.title.bn ? i.title.bn : i.title.en);
  const when = (i: CalendarItem) => (i.ends && i.ends !== i.starts ? `${day(i.starts)} – ${day(i.ends)}` : i.open ? `${day(i.starts)} – ${mc('openEnd')}` : day(i.starts));
  const rows: ListRow[] = cal.items.map((i) => ({
    id: i.id,
    chips: [i.lane],
    text: `${i.title.en} ${i.title.bn ?? ''} ${mc(`lane.${i.lane}`)}`,
    cells: (
      <div className="sc-row" data-lane={i.lane}>
        <span className="sc-when">{when(i)}</span>
        <span className="sc-t">{title(i)}</span>
        <span className="sc-meta">
          <span className="sc-pill">{mc(`lane.${i.lane}`)}</span>
          <span className={`sc-pill ${i.state}`}>{mc(`state.${i.state}`)}</span>
          {i.detail ? <span className="sc-when">{i.detail}</span> : null}
          {i.href ? <Link href={i.href}>{l('open')}</Link> : null}
        </span>
      </div>
    ),
  }));
  const step = cal.range.days;
  const nav: [string, string][] = [
    [mc('earlier'), addDays(cal.range.from, -step)],
    [mc('today'), cal.today],
    [mc('later'), addDays(cal.range.from, step)],
  ];

  return (
    <div className="a2-z sc-page" data-testid="blog-shared" data-lm-ready="">
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
      <nav className="sc-nav" aria-label={l('move')} data-testid="sc-nav">
        {nav.map(([label, from]) => (
          <Link key={label} className={`lm-btn${from === cal.range.from ? ' pri' : ''}`} href={from === cal.today ? HERE : `${HERE}?from=${from}`} aria-current={from === cal.range.from ? 'page' : undefined}>
            {label}
          </Link>
        ))}
      </nav>
      <p className="sc-span" data-testid="sc-span">
        {mc('range', { from: day(cal.range.from), to: day(cal.range.to), days: num(cal.range.days) })} · {cal.timeZone}
      </p>
      <SummaryTiles tiles={tiles} label={l('tiles')} testId="sc-tiles" />
      <section className="lm-card" aria-labelledby="sc-list-h" data-testid="sc-list-card">
        <h2 className="lm-h2" id="sc-list-h">
          {l('list')}
        </h2>
        <ListView
          rows={rows}
          chips={cal.shownLanes.map((x) => ({ key: x, label: mc(`lane.${x}`) }))}
          allLabel={mc('all')}
          searchLabel={l('search')}
          empty={{ title: l('empty'), text: l('emptyText') }}
          testId="sc-list"
        />
      </section>
      <p className="lm-card sc-note" data-testid="sc-note">
        {cal.socialShown ? l('noteSocial') : l('noteClosed')}
      </p>
    </div>
  );
}
