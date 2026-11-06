// S12 · PR 245 (Blueprint C11.1, C11.2 "ready → scheduled → published"; demo 94-admin-blog.js schedule tab) — Website ›
// Blog & journal › Calendar at /admin/website/blog/calendar: the days ahead with each publishing time and its article
// or free, the day's count against its target (a day under its least flagged), "Fill the free times" with the finished
// articles, the month view (?month=YYYY-MM, a day opens with ?day=YYYY-MM-DD), the finished articles still waiting
// with what stops them, and the card `blog.schedule` (placing by itself off as it ships).
// Seeing needs `blog.read`; filling and the card `blog.publish`. Guide: docs/admin-guide/pages/website/blog-calendar.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { FieldsCard, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { CalendarFill } from '@/components/admin/website/CalendarFill';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { publishCalendar, type CalendarPost } from '@/lib/journal/schedule';
import bn from '../../../../../../messages/admin-blog.bn.json';
import en from '../../../../../../messages/admin-blog.en.json';
import '../../../settings-cards.css';
import '../blog.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/website/blog/calendar';
const KEY = 'blogCalendar';
const SUNDAY = Date.UTC(1970, 0, 4); // hardcode-ok: a known Sunday, to name the week's days
const DAY_MS = 86_400_000; // hardcode-ok: the length of a day
const WEEK = [0, 1, 2, 3, 4, 5, 6]; // hardcode-ok: the seven days of a week

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'jr.cal.meta'), robots: { index: false, follow: false } };
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
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
  const l = (k: string, vars?: Record<string, string | number>) => s(`cal.${k}`, vars);
  const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : null);
  const canPublish = access.guard.permissions?.has('blog.publish') ?? false;
  const cal = await publishCalendar(access.deps.db, access.deps.resolver, new Date(), { month: one(sp.month), day: one(sp.day) });
  const words = { jr: (d as Record<string, Dict>).jr ?? {} } as Dict;
  const set = cal.card.value;
  const locale = view.lang === 'bn' ? 'bn-BD-u-nu-latn' : 'en-GB';
  const dayName = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
  const monthName = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const nameOf = (day: string, i: number) => (i === 0 ? l('today') : i === 1 ? l('tomorrow') : dayName.format(Date.parse(`${day}T00:00:00Z`)));
  const tomorrow = cal.days[1];
  const texts: FieldsCardTexts = {
    h: l('card.h'),
    d: l('card.d'),
    save: s('card.save'),
    saving: s('card.saving'),
    saved: s('card.saved'),
    discard: s('card.discard'),
    unsaved: s('card.unsaved'),
    readOnly: s('card.readOnly'),
    pairHelp: s('card.pairHelp'),
    err: Object.fromEntries(['STALE', 'INVALID_INPUT', 'forbidden', 'unauthorized', 'network', 'other'].map((k) => [k, s(`err.${k}`)])),
  };
  const kpis: [string, string, string, string][] = [
    ['kTomorrow', tomorrow ? `${tomorrow.count} / ${set.perDayMin}` : '—', l('kTomorrowS', { n: set.perDayMin }), tomorrow?.low ? ' warn' : ' ok'],
    ['kReady', String(cal.ready.length), l('kReadyS'), ''],
    ['kSlots', String(cal.slots.length), cal.slots.join(' · ') || '—', cal.slots.length < set.perDayTarget ? ' warn' : ''],
    ['kFree', String(cal.free), l('kFreeS', { n: set.daysAhead }), ''],
  ];
  const postLine = (p: CalendarPost) => (
    <>
      <Link className="cal-title" href={p.href} lang={p.locale}>
        {p.title}
      </Link>
      <span className={`a2-pill${p.live ? ' ok' : ' info'}`}>{l(p.live ? 'live' : 'scheduled')}</span>
    </>
  );
  const crumb = (
    <Link className="bd-crumb" href="/admin/website/blog">
      {s('e.back')}
    </Link>
  );
  const heads = WEEK.map((i) => weekday.format(SUNDAY + ((set.weekStart + i) % 7) * DAY_MS));

  return (
    <div className="a2-z" data-testid="blog-calendar">
      <PageHead view={view} place={locateKey(KEY)} crumb={crumb} title={l('title')} sub={l('sub')} />
      <SectionTabs view={view} current={KEY} />
      <div className="pl-kpis a2-mt12" data-testid="cal-kpis">
        {kpis.map(([k, v, sub, tone]) => (
          <div key={k} className={`a2-card pl-k${tone}`}>
            <div className="pl-v">{v}</div>
            <div className="a2-sm">{l(k)}</div>
            <div className="a2-xs a2-mute cal-sub">{sub}</div>
          </div>
        ))}
      </div>
      {cal.slots.length < set.perDayTarget ? (
        <p className="a2-card a2-sc a2-sm a2-mt12" role="note">
          {l('fewSlots', { n: cal.slots.length, target: set.perDayTarget })}
        </p>
      ) : null}
      <div className="jr-grid a2-mt12">
        <div className="jr-stack">
          <section className="a2-card a2-sc" aria-labelledby="cal-ahead" data-testid="cal-days">
            <div className="cal-head">
              <h2 className="a2-h3" id="cal-ahead">
                {l('ahead')}
              </h2>
              {canPublish ? <CalendarFill words={words} label={l('fill')} primary testId="cal-fill" /> : null}
            </div>
            <p className="a2-sm a2-mute">{l('aheadSub', { tz: cal.timeZone })}</p>
            <div className="cal-days">
              {cal.days.map((day, i) => (
                <div key={day.day} className="cal-day" data-testid={`cal-day-${day.day}`}>
                  <div className="cal-dh">
                    <b>{nameOf(day.day, i)}</b>
                    <span className={`a2-pill${day.low ? ' warn' : day.count >= set.perDayTarget ? ' ok' : ''}`}>
                      {day.count} / {set.perDayTarget}
                      {day.low ? ` · ${l('low')}` : ''}
                    </span>
                  </div>
                  {day.rows.length ? (
                    <ul className="cal-rows">
                      {day.rows.map((r, j) => (
                        <li key={`${r.time}-${r.post?.id ?? j}`} className={r.post ? '' : 'free'}>
                          <span className="cal-time">{r.time}</span>
                          {r.post ? postLine(r.post) : <span className="a2-mute">{l('free')}</span>}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="a2-xs a2-mute">{l('noTimes')}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
          <section className="a2-card a2-sc" aria-labelledby="cal-month" data-testid="cal-month">
            <div className="cal-head">
              <h2 className="a2-h3" id="cal-month">
                {monthName.format(Date.parse(`${cal.month.key}-01T00:00:00Z`))}
              </h2>
              <div className="cal-nav">
                <Link className="a2-btn" href={`${HERE}?month=${cal.month.prev}`} aria-label={l('prev')}>
                  ‹
                </Link>
                <Link className="a2-btn" href={HERE}>
                  {l('thisMonth')}
                </Link>
                <Link className="a2-btn" href={`${HERE}?month=${cal.month.next}`} aria-label={l('next')}>
                  ›
                </Link>
              </div>
            </div>
            <div className="cal-grid" role="grid" aria-labelledby="cal-month">
              <div className="cal-row" role="row">
                {heads.map((h, i) => (
                  <span key={i} className="cal-wd a2-xs a2-mute" role="columnheader">
                    {h}
                  </span>
                ))}
              </div>
              {cal.month.weeks.map((w, wi) => (
                <div key={wi} className="cal-row" role="row">
                  {w.map((day, di) => {
                    if (!day) return <span key={di} className="cal-cell none" role="gridcell" />;
                    const c = cal.month.counts[day];
                    const n = (c?.live ?? 0) + (c?.scheduled ?? 0);
                    const cls = `cal-cell${day === cal.today ? ' today' : ''}${day === cal.day?.key ? ' on' : ''}`;
                    return (
                      <Link key={day} role="gridcell" className={cls} href={`${HERE}?month=${cal.month.key}&day=${day}`} aria-label={`${day}: ${l('nPosts', { n })}`}>
                        <span className="cal-dn">{Number(day.slice(8))}</span>
                        {n ? <span className={`cal-n${c?.scheduled ? ' sch' : ''}`}>{n}</span> : null}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </div>
            <p className="a2-xs a2-mute">{l('legend')}</p>
            {cal.day ? (
              <div className="cal-picked" data-testid="cal-picked">
                <h3 className="a2-h4">{dayName.format(Date.parse(`${cal.day.key}T00:00:00Z`))}</h3>
                {cal.day.posts.length ? (
                  <ul className="cal-rows">
                    {cal.day.posts.map((p) => (
                      <li key={p.id}>
                        <span className="cal-time">{p.time}</span>
                        {postLine(p)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="a2-sm a2-mute">{l('dayEmpty')}</p>
                )}
              </div>
            ) : null}
          </section>
        </div>
        <div className="jr-stack">
          <section className="a2-card a2-sc" aria-labelledby="cal-ready" data-testid="cal-ready">
            <h2 className="a2-h3" id="cal-ready">
              {l('ready')}
            </h2>
            <p className="a2-sm a2-mute">{l('readySub')}</p>
            {cal.ready.length ? (
              <ul className="cal-ready">
                {cal.ready.map((r) => (
                  <li key={r.id}>
                    <Link className="cal-title" href={r.href} lang={r.locale}>
                      {r.title}
                    </Link>
                    {r.gaps.length ? (
                      <span className="a2-xs cal-bad">{l('blocked', { what: r.gaps.map((g) => (g.startsWith('/') ? g : l(`gap.${g}`))).join(', ') })}</span>
                    ) : canPublish ? (
                      <CalendarFill words={words} postId={r.id} label={l('placeOne')} testId={`cal-place-${r.id}`} />
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="a2-sm">{l('readyNone')}</p>
            )}
          </section>
          <FieldsCard
            url="/api/admin/blog/calendar"
            screen={{ key: cal.card.key, value: set, version: cal.card.version }}
            fields={[
              { kind: 'text', path: 'slots', label: l('card.slots'), help: l('card.slotsHelp'), max: 200 },
              { kind: 'number', path: 'perDayMin', label: l('card.perDayMin'), min: 1, max: 24 },
              { kind: 'number', path: 'perDayTarget', label: l('card.perDayTarget'), min: 1, max: 24 },
              { kind: 'number', path: 'perDayMax', label: l('card.perDayMax'), min: 1, max: 24 },
              { kind: 'number', path: 'daysAhead', label: l('card.daysAhead'), min: 1, max: 60 },
              { kind: 'number', path: 'leadMinutes', label: l('card.leadMinutes'), min: 0, max: 1440 },
              { kind: 'switch', path: 'autoFill', label: l('card.autoFill'), help: l('card.autoFillHelp') },
              {
                kind: 'select',
                path: 'weekStart',
                label: l('card.weekStart'),
                numeric: true,
                options: WEEK.map((i) => ({ value: String(i), label: new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(SUNDAY + i * DAY_MS) })),
              },
            ]}
            texts={texts}
            canEdit={canPublish}
            testId="cal-settings"
          />
          <section className="a2-card a2-sc" aria-labelledby="cal-how">
            <h2 className="a2-h3" id="cal-how">
              {l('how')}
            </h2>
            <ol className="pl-how a2-sm">
              {['how1', 'how2', 'how3', 'how4'].map((k) => (
                <li key={k}>{l(k)}</li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
