// S12 · PR 530 (register "Seasonal page lifecycle — archived and live are states, never deletion. A seasonal page
// returns on its own when the occasion comes round"; ADMIN-ARCHITECTURE "Landing pages … 246, 530") — Marketing ›
// Landing pages › Seasonal pages › Each year at /admin/marketing/landing/seasonal/yearly, drawn in Lumen (CN-036: the
// shared patterns, --lm-* tokens only, data-lm-ready): the counts (back now, coming back, without dates), the switch
// card `marketing.seasonalReturn` (off as it ships: nothing comes back by itself) with its days before and after, one
// card per seasonal page not put away with its "comes back each year" tick and where it stands, and the occasions'
// dates (the owner's own). Nothing here makes a page live by itself while the switch is off; turning it off takes every
// returned page back at once. Seeing needs `marketing.landing.read`; the cards and the dates `marketing.landing.write`.
// Guide: docs/admin-guide/pages/marketing/seasonal-yearly.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { SettingCards, type SettingCardDef } from '@/components/admin/lumen/SettingCards';
import { SummaryTiles, type SummaryTile } from '@/components/admin/lumen/SummaryTiles';
import { SeasonDates } from '@/components/admin/marketing/SeasonDates';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { occasionName } from '@/lib/marketing/seasonal-model';
import { returnScreen, type ReturnRow } from '@/lib/marketing/seasonal-return';
import bn from '../../../../../../../messages/admin-seasonal.bn.json';
import en from '../../../../../../../messages/admin-seasonal.en.json';
import './yearly.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/marketing/landing/seasonal/yearly';
const LIST = '/admin/marketing/landing/seasonal';
const API = '/api/admin/marketing/seasonal-return';
const KEY = 'marketingSeasonalYearly';
/** The most date rows the setting keeps (registry-seasonal-return.ts). */
const DATES_MAX = 60; // hardcode-ok: the setting's own list bound, not a business number

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'sy.meta'), robots: { index: false, follow: false } };
}

export default async function SeasonalYearlyPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('marketing.landing.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="marketing.landing.read" />
      </div>
    );
  const l = (k: string, vars?: Record<string, string | number>) => t(d, `sy.${k}`, vars);
  const canWrite = access.guard.permissions?.has('marketing.landing.write') ?? false;
  const r = await returnScreen(access.deps.db, access.deps.resolver, new Date());
  const set = r.card.value;
  const lang = view.lang === 'bn' ? 'bn' : 'en';
  const num = (n: number) => new Intl.NumberFormat(view.locale, { numberingSystem: 'latn' }).format(n);
  const day = (ymd: string) => new Intl.DateTimeFormat(view.locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC', numberingSystem: 'latn' }).format(new Date(`${ymd}T00:00:00Z`));
  const fmt = { kind: 'number', locale: view.locale } as const;
  const tiles: SummaryTile[] = [
    { key: 'back', label: l('tBack'), value: r.counts.back, shown: num(r.counts.back), format: fmt, icon: 'refresh' },
    { key: 'waiting', label: l('tWaiting'), value: r.counts.waiting, shown: num(r.counts.waiting), format: fmt, icon: 'cal' },
    { key: 'noDates', label: l('tNoDates'), value: r.counts.noDates, shown: num(r.counts.noDates), format: fmt, icon: 'alert' },
  ];
  const occ = (k: string | null) => (k ? occasionName(r.occasions, k, lang) : l('noOccasion'));
  // what a page's card says: where it stands as if ticked (the switch beside it shows the tick itself)
  const standing = (row: ReturnRow): string => {
    const { status, span: sp } = row.ticked;
    const span: Record<string, string> = sp ? { from: day(sp.from), to: day(sp.to), ofrom: day(sp.occasionFrom), oto: day(sp.occasionTo), occasion: occ(row.occasion) } : { occasion: occ(row.occasion) };
    return l(`st.${status}`, span);
  };
  const mainCard: SettingCardDef = {
    key: r.card.key,
    title: l('card'),
    text: l('cardText'),
    on: set.on,
    fields: [
      { name: 'leadDays', label: l('leadDays'), kind: 'number', value: set.leadDays, min: 0, max: 90, step: 1, unit: l('days'), hint: l('leadHint') },
      { name: 'afterDays', label: l('afterDays'), kind: 'number', value: set.afterDays, min: 0, max: 30, step: 1, unit: l('days'), hint: l('afterHint') },
    ],
  };
  const pageCards: SettingCardDef[] = r.rows.map((row) => ({ key: `page:${row.id}`, title: `${row.title} · ${occ(row.occasion)}`, text: standing(row), on: row.returns }));

  return (
    <div className="a2-z sy-page" data-testid="seasonal-yearly" data-lm-ready="">
      <PageHead
        view={view}
        place={locateKey(KEY)}
        crumb={
          <Link className="sy-crumb" href={LIST}>
            {l('back')}
          </Link>
        }
        title={l('title')}
        sub={l('sub')}
      />
      <SectionTabs view={view} current={KEY} />
      {r.pagesOn ? null : (
        <p className="lm-card sy-off" role="note" data-testid="sy-pages-off">
          {l('pagesOff')} <Link href={LIST}>{l('openList')}</Link>
        </p>
      )}
      <p className="sy-today" data-testid="sy-today">
        {l('today', { day: day(r.today), tz: r.timeZone })}
      </p>
      <SummaryTiles tiles={tiles} label={l('tiles')} testId="sy-tiles" />
      <div className="sy-grid">
        <div className="sy-stack">
          <section className="lm-card" aria-labelledby="sy-pages-h" data-testid="sy-pages">
            <h2 className="lm-h2" id="sy-pages-h">
              {l('pages')}
            </h2>
            <p className="sy-sub">{l('pagesSub')}</p>
            {pageCards.length ? (
              canWrite ? (
                <SettingCards save={{ method: 'PUT', url: API }} cards={pageCards} testId="sy-page-cards" />
              ) : (
                <ul className="sy-ro-list">
                  {pageCards.map((c) => (
                    <li key={c.key}>
                      <b>{c.title}</b> — {c.on ? l('ticked') : l('notTicked')}
                      <span className="sy-sub">{c.text}</span>
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <p className="sy-sub" data-testid="sy-pages-empty">
                {l('empty')} <Link href={`${LIST}/new`}>{l('create')}</Link>
              </p>
            )}
          </section>
          <SeasonDates
            url={API}
            dates={set.dates}
            version={r.card.version}
            occasions={r.occasions.map((o) => ({ key: o.key, name: o[lang] || o.en }))}
            max={DATES_MAX}
            today={r.today}
            canEdit={canWrite}
            texts={{
              title: l('dates'),
              sub: l('datesSub'),
              occasion: l('occasion'),
              from: l('from'),
              to: l('to'),
              yearly: l('yearly'),
              add: l('add'),
              remove: l('remove'),
              save: l('save'),
              saving: l('saving'),
              saved: l('saved'),
              empty: l('datesEmpty'),
              readOnly: l('readOnly'),
              err: Object.fromEntries(['STALE', 'INVALID_INPUT', 'forbidden', 'unauthorized', 'network', 'other'].map((k) => [k, l(`err.${k}`)])),
            }}
          />
        </div>
        <div className="sy-stack">
          {canWrite ? (
            <SettingCards save={{ method: 'PUT', url: API }} cards={[mainCard]} testId="sy-card" />
          ) : (
            <p className="lm-card sy-sub" data-testid="sy-readonly">
              {l('readOnly')}
            </p>
          )}
          <section className="lm-card" aria-labelledby="sy-how-h">
            <h2 className="lm-h2" id="sy-how-h">
              {l('how')}
            </h2>
            <ol className="sy-how">
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
