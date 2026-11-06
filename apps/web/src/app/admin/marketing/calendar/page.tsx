// S13 · PR 282 — Marketing › Calendar at /admin/marketing/calendar (register "Marketing calendar across ads, content and
// social"; ADMIN-ARCHITECTURE 4.8 More options; demo 97x-adm2-marketing.js x2Cal): one calendar, day by day on the
// shop's clock, of what the other marketing pages keep — campaigns, ads running, message sends, seasonal home windows,
// festive cut-offs, blog and social posts — and the owner's own plan lines ("Eid", "Winter sale"), with the bars at a
// glance, a day-by-day list, lane chips (?lane=) and earlier/later views (?from=). Only the plan lines are written here;
// everything else links to its own page. Writes `marketing.calendar` (registry v217, off as shipped). Seeing needs
// `marketing.campaigns.read`, changing `marketing.campaigns.write`. Guide: docs/admin-guide/pages/marketing/calendar.md.
// Follow-up 656: a plan line may name its campaign (shown with it, linking there), and `?view=month` shows the whole
// month as a grid of weeks (the store locale's first weekday), earlier/later by a month.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { CALENDAR_DAYS_MAX, CALENDAR_DAYS_MIN } from '@extas/settings';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { CalendarAct, PlanForm, type CalendarFormTexts, type PlanFormWords } from '@/components/admin/marketing/CalendarForms';
import { CalendarBars, CalendarMonth, calendarWords, itemTitle } from '@/components/admin/marketing/CalendarView';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { calendarOverview } from '@/lib/marketing/calendar';
import { addDays, CALENDAR_LANES, monthStep, monthWeeks, PLAN_NOTE_MAX, PLAN_TITLE_MAX, type CalendarItem } from '@/lib/marketing/calendar-model';
import bn from '../../../../../messages/admin-calendar.bn.json';
import en from '../../../../../messages/admin-calendar.en.json';
import '../../settings-cards.css';
import '../../messages/email/email.css';
import '../ad-platforms/ad-platforms.css';
import './calendar.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/marketing/calendar';
const API = '/api/admin/marketing/calendar';
const KEY = 'marketingCalendar';

type Props = { searchParams: Promise<{ from?: string; lane?: string; view?: string }> };
/** Items one day of the month view shows before "+n more" (a cell-length guard). */
const MONTH_PER_DAY = 3; // hardcode-ok: a cell-length guard

/** The first day of the week in the store's locale (1 = Monday … 7 = Sunday; ISO Monday when the runtime cannot say). */
function weekStart(locale: string): number {
  try {
    const l = new Intl.Locale(locale) as Intl.Locale & { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } };
    const day = (l.getWeekInfo?.() ?? l.weekInfo)?.firstDay;
    return typeof day === 'number' && day >= 1 && day <= 7 ? day : 1;
  } catch {
    return 1;
  }
}

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'mc.metaTitle'), robots: { index: false, follow: false } };
}

export default async function MarketingCalendarPage(props: Props) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([adminView(deps), pageAccess('marketing.campaigns.read', deps, MOTHER_STORE_ID), props.searchParams]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="mc-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="marketing.campaigns.read" />
      </div>
    );
  const o = await calendarOverview({ db: access.deps.db, resolver: access.deps.resolver }, { from: sp.from, view: sp.view });
  const month = o.view === 'month';
  const storeLocale = (await access.deps.resolver.value('store.locale', { storeId: MOTHER_STORE_ID }).catch(() => null)) as string | null;
  const canWrite = access.guard.permissions?.has('marketing.campaigns.write') ?? false;
  const on = o.settings.enabled;
  const g = (k: string, vars?: Record<string, string | number>) => t(d, `mc.${k}`, vars);
  const isBn = view.lang === 'bn';
  const lane = (CALENDAR_LANES as readonly string[]).includes(sp.lane ?? '') ? sp.lane! : null;
  const shown = lane ? o.items.filter((i) => i.lane === lane) : o.items;
  const long = (day: string) => new Intl.DateTimeFormat(view.locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC', numberingSystem: 'latn' }).format(new Date(`${day}T00:00:00Z`));
  const monthName = (day: string) => new Intl.DateTimeFormat(view.locale, { month: 'long', year: 'numeric', timeZone: 'UTC', numberingSystem: 'latn' }).format(new Date(`${day}T00:00:00Z`));
  const short = (day: string) => new Intl.DateTimeFormat(view.locale, { day: 'numeric', month: 'short', weekday: 'short', timeZone: 'UTC', numberingSystem: 'latn' }).format(new Date(`${day}T00:00:00Z`));
  const href = (q: { from?: string | null; lane?: string | null; view?: 'bars' | 'month' }) => {
    const p = new URLSearchParams();
    const vw = q.view ?? o.view;
    const from = q.from === undefined ? (sp.from && vw === o.view ? o.range.from : null) : q.from;
    const ln = q.lane === undefined ? lane : q.lane;
    if (vw === 'month') p.set('view', 'month');
    if (from) p.set('from', from);
    if (ln) p.set('lane', ln);
    const s = p.toString();
    return s ? `${HERE}?${s}` : HERE;
  };
  const err = Object.fromEntries(['INVALID_INPUT', 'STALE', 'SWITCHED_OFF', 'NOT_FOUND', 'SET_ASIDE', 'NOT_SET_ASIDE', 'forbidden', 'unauthorized', 'network', 'other'].map((k) => [k, g(`err.${k}`)]));
  const formTexts: CalendarFormTexts = { err, fields: Object.fromEntries(['title', 'titleBn', 'starts', 'ends', 'note', 'id', 'action', 'marketing.calendar', 'campaignId'].map((k) => [k, g(`f.${k}`)])) };
  const pw = (k: string) => g(`plan.${k}`);
  const planWords: PlanFormWords = { title: pw('title'), titleBn: pw('titleBn'), titleBnHelp: pw('titleBnHelp'), starts: pw('starts'), ends: pw('ends'), endsHelp: pw('endsHelp'), note: pw('note'), save: pw('save'), saved: pw('saved'), campaign: pw('campaign'), campaignNone: pw('campaignNone'), campaigns: o.campaigns, titleMax: PLAN_TITLE_MAX, noteMax: PLAN_NOTE_MAX };
  const c = (k: string) => g(`card.${k}`);
  const cardTexts: FieldsCardTexts = { h: c('h'), d: c('d'), save: c('save'), saving: c('saving'), saved: c('saved'), discard: c('discard'), unsaved: c('unsaved'), readOnly: c('readOnly'), pairHelp: c('pairHelp'), err };
  const cardFields: FieldsCardField[] = [
    { kind: 'switch', path: 'enabled', label: c('on'), help: c('onHelp') },
    { kind: 'number', path: 'days', label: c('days'), help: c('daysHelp'), min: CALENDAR_DAYS_MIN, max: CALENDAR_DAYS_MAX },
  ];
  const plans = new Map(o.plans.map((p) => [p.id, p]));

  const when = (i: CalendarItem) => {
    if (i.marks?.length) return g('list.marks', { list: i.marks.map((m) => `${m.label} ${short(m.day)}`).join(' · ') });
    if (i.ends) return `${short(i.starts)} – ${short(i.ends)}`;
    return i.open ? `${g('list.from', { day: short(i.starts) })} · ${g('list.until')}` : short(i.starts);
  };
  const pill = (s: string) => (s === 'live' ? 'ok' : s === 'scheduled' ? 'info' : 'line');
  const item = (i: CalendarItem) => {
    const own = i.own ? plans.get(i.id.slice('plan:'.length)) : undefined;
    return (
      <li key={i.id} className="mc-item" data-testid="mc-item" data-lane={i.lane}>
        <p className="a2-sm mc-break">
          <span className="a2-b">{itemTitle(i, isBn)}</span> <span className={`a2-pill ${pill(i.state)}`}>{g(`state.${i.state}`)}</span>
        </p>
        <p className="a2-xs a2-mute mc-break">
          {g(`lane.${i.lane}`)} · {when(i)}
          {i.detail && !i.own?.campaign ? ` · ${i.detail}` : ''}
        </p>
        {i.own?.campaign ? (
          <p className="a2-xs mc-break" data-testid="mc-item-campaign">
            {g('list.campaign', { name: i.own.campaign.name })}
          </p>
        ) : null}
        {i.counts ? <p className="a2-xs a2-mute">{g('counts', { pages: i.counts.pages ?? 0, orders: i.counts.orders ?? 0, delivered: i.counts.delivered ?? 0 })}</p> : null}
        {i.own?.note ? <p className="a2-xs mc-break">{i.own.note}</p> : null}
        {i.href ? (
          <Link className="a2-lnk" href={i.href}>
            {g('list.open')}
          </Link>
        ) : null}
        {own && canWrite ? (
          <span className="a2-gap8">
            <details className="mc-fold a2-more-opts">
              <summary className="a2-sm">{pw('edit')}</summary>
              <PlanForm texts={formTexts} w={planWords} value={own} testId={`mc-edit-${own.id}`} />
            </details>
            <CalendarAct texts={formTexts} body={{ action: 'plan.archive', id: own.id }} label={pw('archive')} testId={`mc-archive-${own.id}`} />
          </span>
        ) : null}
      </li>
    );
  };

  return (
    <div className="a2-z" data-testid="mc-page" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={g('title')} sub={g('sub')} />
      <SectionTabs view={view} current={KEY} />
      <div className="a2-note a2-mt12" role="note">
        <span>{g('note')}</span>
      </div>
      {!on ? (
        <section className="a2-card a2-mt12" data-testid="mc-off">
          <h2 className="a2-h3">{g('offTitle')}</h2>
          <p className="a2-sm a2-mute a2-mt6">{g(canWrite ? 'offBody' : 'offAsk')}</p>
        </section>
      ) : (
        <>
          <nav className="a2-views mc-chips a2-mt12" aria-label={g('view.label')} data-testid="mc-views">
            {(['bars', 'month'] as const).map((v) => (
              <Link key={v} className={`a2-view${o.view === v ? ' on' : ''}`} href={href({ view: v, from: null })} aria-current={o.view === v ? 'page' : undefined} data-testid={`mc-view-${v}`}>
                {g(`view.${v}`)}
              </Link>
            ))}
          </nav>
          <div className="mc-nav a2-mt12" data-testid="mc-nav">
            <Link className="a2-btn" href={href({ from: month ? monthStep(o.range, -1) : addDays(o.range.from, -o.range.days) })} data-testid="mc-earlier">
              {month ? g('month.earlier') : g('earlier')}
            </Link>
            <Link className="a2-btn" href={href({ from: null })} data-testid="mc-today">
              {month ? g('month.this') : g('today')}
            </Link>
            <Link className="a2-btn" href={href({ from: month ? monthStep(o.range, 1) : addDays(o.range.from, o.range.days) })} data-testid="mc-later">
              {month ? g('month.later') : g('later')}
            </Link>
            <span className="a2-sm a2-mute" data-testid="mc-range">
              {month ? g('month.range', { month: monthName(o.range.from) }) : g('range', { from: long(o.range.from), to: long(o.range.to), days: o.range.days })}
            </span>
          </div>
          <nav className="a2-views mc-chips a2-mt12" aria-label={g('lanesLabel')}>
            <Link className={`a2-view${lane ? '' : ' on'}`} href={href({ lane: null })} aria-current={lane ? undefined : 'page'}>
              {g('all')} · {o.items.length}
            </Link>
            {CALENDAR_LANES.filter((l) => o.lanes[l] > 0 || l === lane).map((l) => (
              <Link key={l} className={`a2-view${lane === l ? ' on' : ''}`} href={href({ lane: l })} aria-current={lane === l ? 'page' : undefined} data-testid={`mc-lane-${l}`}>
                {g(`lane.${l}`)} · {o.lanes[l]}
              </Link>
            ))}
          </nav>
          <section className="a2-card a2-mt12" aria-labelledby="mc-bars-h">
            <h2 className="a2-h3" id="mc-bars-h">
              {month ? g('month.h') : g('bars.h')}
            </h2>
            <div className="a2-mt12">
              {month ? (
                <CalendarMonth items={shown} weeks={monthWeeks(o.range, weekStart(storeLocale ?? view.locale))} today={o.today} locale={view.locale} bn={isBn} w={calendarWords(d)} mw={{ more: (n) => g('month.more', { n }), empty: g('month.empty') }} perDay={MONTH_PER_DAY} />
              ) : (
                <CalendarBars items={shown} range={o.range} locale={view.locale} bn={isBn} w={calendarWords(d)} />
              )}
            </div>
            {o.undated ? (
              <p className="a2-xs a2-mute a2-mt12" data-testid="mc-undated">
                {g('undated', { n: o.undated })}{' '}
                <Link className="a2-lnk mc-open" href="/admin/marketing/campaigns?v=planned">
                  {g('undatedOpen')}
                </Link>
              </p>
            ) : null}
          </section>
          <section className="a2-card a2-mt12" aria-labelledby="mc-list-h" data-testid="mc-list">
            <h2 className="a2-h3" id="mc-list-h">
              {g('list.h')}
            </h2>
            {shown.length ? <ul className="mc-list">{shown.map(item)}</ul> : <p className="a2-sm a2-mute a2-mt6">{g('list.empty')}</p>}
          </section>
          {canWrite ? (
            <section className="a2-card a2-mt12" aria-labelledby="mc-plan-h" data-testid="mc-plan">
              <h2 className="a2-h3" id="mc-plan-h">
                {pw('h')}
              </h2>
              <p className="a2-sm a2-mute a2-mt6">{pw('d')}</p>
              <div className="a2-mt12">
                <PlanForm texts={formTexts} w={planWords} testId="mc-add" />
              </div>
              <details className="mc-fold a2-more-opts a2-mt12" data-testid="mc-aside">
                <summary className="a2-sm">
                  {pw('asideH')} · {o.setAside.length}
                </summary>
                {o.setAside.length ? (
                  <ul className="mc-list">
                    {o.setAside.map((p) => (
                      <li key={p.id} className="mc-item">
                        <p className="a2-sm mc-break">{(isBn && p.titleBn) || p.title}</p>
                        <p className="a2-xs a2-mute">{p.ends ? `${short(p.starts)} – ${short(p.ends)}` : short(p.starts)}</p>
                        <CalendarAct texts={formTexts} body={{ action: 'plan.restore', id: p.id }} label={pw('restore')} testId={`mc-restore-${p.id}`} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="a2-sm a2-mute">{pw('asideEmpty')}</p>
                )}
              </details>
            </section>
          ) : null}
        </>
      )}

      <div className="a2-mt12">
        <FieldsCard url={API} screen={{ key: o.card.key, value: o.card.value, version: o.card.version }} fields={cardFields} texts={cardTexts} canEdit={canWrite} testId="mc-card" />
      </div>
    </div>
  );
}
