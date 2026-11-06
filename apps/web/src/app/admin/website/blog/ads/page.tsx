// S12 · PR 592 (register "Blog as a complete, standard section of the shop, with our own ad placements"; Blueprint
// C11.5 "House ads and popup rules") — Website › Blog & journal › House ads at /admin/website/blog/ads, drawn in Lumen
// (CN-036: the shared patterns, --lm-* tokens only, data-lm-ready): the counts, the period (7/30/90 shop days), every
// ad by chip with Switch on / off and Set aside / Bring back for the ticked ones (Undo), clicks and orders by ad and
// place (Ordered value and Sales with `reports.read`), and the card `blog.houseAds` (off as shipped). An ad opens its
// own page (`/admin/website/blog/ads/<id>`, `new`). Seeing needs `blog.read`; every change `blog.publish`. Never money:
// nothing here changes a price or an offer. Guide: docs/admin-guide/pages/website/blog-ads.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { ListView, type ListRow } from '@/components/admin/lumen/ListView';
import { SettingCards } from '@/components/admin/lumen/SettingCards';
import { SummaryTiles, type SummaryTile } from '@/components/admin/lumen/SummaryTiles';
import { formatMoney, moneyOf } from '@/components/admin/products/model';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import type { LmCall } from '@/lib/admin-lumen/safety';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { AD_REPORT_DAYS, adsScreen, type AdRow } from '@/lib/journal/house-ads';
import bn from '../../../../../../messages/admin-house-ads.bn.json';
import en from '../../../../../../messages/admin-house-ads.en.json';
import './ads.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/website/blog/ads';
const KEY = 'blogAds';
const API = '/api/admin/blog/ads';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'ha.meta'), robots: { index: false, follow: false } };
}

const sw = (what: 'ad' | 'place', patch: { on?: boolean; aside?: boolean }): LmCall => ({ method: 'POST', url: API, body: { op: 'switch', what, ...patch } });

export default async function HouseAdsPage(props: { searchParams: Promise<{ days?: string | string[] }> }) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([adminView(deps), pageAccess('blog.read', deps, MOTHER_STORE_ID), props.searchParams]);
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
  const l = (k: string, vars?: Record<string, string | number>) => t(d, `ha.${k}`, vars);
  const canPublish = access.guard.permissions?.has('blog.publish') ?? false;
  const canMoney = access.guard.permissions?.has('reports.read') ?? false;
  const asked = typeof sp.days === 'string' ? Number(sp.days) : null;
  const [r, currency] = await Promise.all([adsScreen(access.deps.db, access.deps.resolver, new Date(), { days: asked }), access.deps.resolver.value('store.currency', { storeId: MOTHER_STORE_ID })]);
  const set = r.card.value;
  const num = (n: number) => new Intl.NumberFormat(view.locale, { numberingSystem: 'latn' }).format(n);
  const money = moneyOf(currency, view.locale);
  const m = (minor: number) => formatMoney(minor, money);
  const dayText = (ymd: string) => new Intl.DateTimeFormat(view.locale, { day: 'numeric', month: 'short', timeZone: 'UTC', numberingSystem: 'latn' }).format(new Date(`${ymd}T00:00:00Z`));
  const fmt = { kind: 'number', locale: view.locale } as const;
  const tiles: SummaryTile[] = [
    { key: 'running', label: l('tRunning'), value: r.totals.running, shown: num(r.totals.running), format: fmt, icon: 'check' },
    { key: 'places', label: l('tPlaces'), value: r.totals.placesOn, shown: num(r.totals.placesOn), format: fmt, icon: 'eye' },
    { key: 'clicks', label: l('tClicks'), value: r.totals.clicks, shown: num(r.totals.clicks), format: fmt, icon: 'zap' },
    { key: 'orders', label: l('tOrders'), value: r.totals.orders, shown: num(r.totals.orders), format: fmt, icon: 'bag' },
  ];
  const chipOf: Record<AdRow['state'], string> = { running: 'running', off: 'off', waiting: 'waiting', ended: 'ended', aside: 'aside' };
  const pill: Record<AdRow['state'], string> = { running: 'ok', off: '', waiting: 'warn', ended: '', aside: '' };
  const dates = (a: AdRow) =>
    a.startsOn && a.endsOn ? l('dates', { from: dayText(a.startsOn), to: dayText(a.endsOn) }) : a.startsOn ? l('from', { d: dayText(a.startsOn) }) : a.endsOn ? l('until', { d: dayText(a.endsOn) }) : l('noDates');
  const placesText = (n: number) => (n === 0 ? l('places0') : n === 1 ? l('places1') : l('placesN', { n: num(n) }));
  const rows: ListRow[] = r.ads.map((a) => ({
    id: a.id,
    chips: [chipOf[a.state]],
    text: `${a.name} ${a.headlineEn ?? ''} ${a.headlineBn ?? ''} ${a.targetName ?? ''}`,
    href: `${HERE}/${a.id}`,
    cells: (
      <div className="ha-row" data-state={a.state}>
        <span className="ha-row-h">
          <Link href={`${HERE}/${a.id}`} className="ha-name">
            {a.name}
          </Link>
          <span className={`ha-pill ${pill[a.state]}`}>{l(`state_${a.state}`)}</span>
        </span>
        <span className="ha-meta">
          <span>{l(`kind_${a.kind}`)}</span>
          {a.targetName ? <span className="ha-tg">{a.targetName}</span> : null}
          <span>{dates(a)}</span>
          <span>{l('weight', { n: num(a.weight) })}</span>
          <span>{placesText(a.places.filter((p) => !p.aside).length)}</span>
          <span>{l('clicksN', { n: num(a.clicks) })}</span>
          <span>{l('ordersN', { n: num(a.ordered.orders) })}</span>
        </span>
      </div>
    ),
  }));
  const reportRows = r.ads.flatMap((a) => a.places.filter((p) => p.clicks > 0 || p.ordered.orders > 0).map((p) => ({ a, p })));

  return (
    <div className="a2-z ha-page" data-testid="blog-ads" data-lm-ready="">
      <PageHead
        view={view}
        place={locateKey(KEY)}
        crumb={
          <Link className="ha-crumb" href="/admin/website/blog">
            {l('back')}
          </Link>
        }
        title={l('title')}
        sub={l('sub')}
        right={
          canPublish ? (
            <Link className="lm-btn pri" href={`${HERE}/new`} data-testid="ha-new">
              {l('new')}
            </Link>
          ) : undefined
        }
      />
      <SectionTabs view={view} current={KEY} />
      {set.on ? null : (
        <p className="lm-card ha-off" role="note" data-testid="ha-off">
          {l('off')}
        </p>
      )}
      <nav className="ha-nav" aria-label={l('period')} data-testid="ha-periods">
        {AD_REPORT_DAYS.map((n) => (
          <Link key={n} className={`lm-btn${n === r.days ? ' pri' : ''}`} href={`${HERE}?days=${n}`} aria-current={n === r.days ? 'page' : undefined}>
            {l('days', { n: num(n) })}
          </Link>
        ))}
      </nav>
      <p className="ha-span">{l('range', { from: dayText(r.from), to: dayText(r.to), tz: r.timeZone })}</p>
      <SummaryTiles tiles={tiles} label={l('tiles')} testId="ha-tiles" />
      <div className="ha-grid">
        <div className="ha-stack">
          <section className="lm-card" aria-labelledby="ha-list-h" data-testid="ha-list-card">
            <h2 className="lm-h2" id="ha-list-h">
              {l('list')}
            </h2>
            <ListView
              rows={rows}
              chips={[
                { key: 'running', label: l('chipRunning') },
                { key: 'off', label: l('chipOff') },
                { key: 'waiting', label: l('chipWaiting') },
                { key: 'ended', label: l('chipEnded') },
                { key: 'aside', label: l('chipAside') },
              ]}
              allLabel={l('all')}
              searchLabel={l('search')}
              bulk={
                canPublish
                  ? [
                      { kind: 'show', label: l('on'), call: sw('ad', { on: true }), undo: sw('ad', { on: false }), done: l('bulkOn') },
                      { kind: 'hide', label: l('offBtn'), call: sw('ad', { on: false }), undo: sw('ad', { on: true }), done: l('bulkOff') },
                      { kind: 'archive', label: l('aside'), call: sw('ad', { aside: true }), undo: sw('ad', { aside: false }), done: l('bulkAside') },
                      { kind: 'unarchive', label: l('backBtn'), call: sw('ad', { aside: false }), undo: sw('ad', { aside: true }), done: l('bulkBack') },
                    ]
                  : []
              }
              empty={{ title: l('listEmpty'), text: l('listEmptyText') }}
              testId="ha-list"
            />
          </section>
          <section className="lm-card" aria-labelledby="ha-rep-h" data-testid="ha-report">
            <h2 className="lm-h2" id="ha-rep-h">
              {l('report')}
            </h2>
            <p className="ha-span">{l('reportSub', { n: num(set.creditDays) })}</p>
            {canMoney ? null : <p className="ha-span">{l('noMoney')}</p>}
            {reportRows.length ? (
              <div className="ha-table-w">
                <table className="ha-table">
                  <thead>
                    <tr>
                      <th scope="col">{l('colAd')}</th>
                      <th scope="col">{l('colClicks')}</th>
                      <th scope="col">{l('colOrders')}</th>
                      {canMoney ? <th scope="col">{l('colOrdered')}</th> : null}
                      {canMoney ? <th scope="col">{l('colSales')}</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {reportRows.map(({ a, p }) => (
                      <tr key={p.id}>
                        <th scope="row">
                          <span className="ha-name">{a.name}</span>
                          <span className="ha-meta">{t(d, `ha.e.slot_${p.slot}`)}</span>
                        </th>
                        <td>{num(p.clicks)}</td>
                        <td>{num(p.ordered.orders)}</td>
                        {canMoney ? <td>{m(p.ordered.valueMinor)}</td> : null}
                        {canMoney ? <td>{m(p.sales.valueMinor)}</td> : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="ha-span" data-testid="ha-report-empty">
                {l('reportEmpty')}
              </p>
            )}
          </section>
        </div>
        <div className="ha-stack">
          {canPublish ? (
            <SettingCards
              save={{ method: 'PUT', url: API }}
              cards={[
                {
                  key: r.card.key,
                  title: l('card'),
                  text: l('cardText'),
                  on: set.on,
                  fields: [
                    { name: 'maxPerPage', label: l('maxPerPage'), kind: 'number', value: set.maxPerPage, min: 1, max: 6, step: 1, unit: l('unitAds') },
                    { name: 'inlineMax', label: l('inlineMax'), kind: 'number', value: set.inlineMax, min: 0, max: 3, step: 1, unit: l('unitAds') },
                    { name: 'popupScrollPct', label: l('popupScrollPct'), kind: 'number', value: set.popupScrollPct, min: 10, max: 95, step: 5, unit: l('unitPct') },
                    { name: 'popupSeconds', label: l('popupSeconds'), kind: 'number', value: set.popupSeconds, min: 0, max: 600, step: 5, unit: l('unitSec') },
                    { name: 'capTimes', label: l('capTimes'), kind: 'number', value: set.capTimes, min: 1, max: 20, step: 1, unit: l('unitTimes') },
                    { name: 'capDays', label: l('capDays'), kind: 'number', value: set.capDays, min: 1, max: 90, step: 1, unit: l('unitDays') },
                    {
                      name: 'searchGuard',
                      label: l('searchGuard'),
                      kind: 'select',
                      value: set.searchGuard ? 'on' : 'off',
                      options: [
                        { value: 'on', label: l('guardOn') },
                        { value: 'off', label: l('guardOff') },
                      ],
                    },
                    { name: 'creditDays', label: l('creditDays'), kind: 'number', value: set.creditDays, min: 1, max: 30, step: 1, unit: l('unitDays') },
                  ],
                },
              ]}
              testId="ha-card"
            />
          ) : (
            <p className="lm-card ha-ro" data-testid="ha-readonly">
              {l('readOnly')}
            </p>
          )}
          <section className="lm-card" aria-labelledby="ha-how-h">
            <h2 className="lm-h2" id="ha-how-h">
              {l('how')}
            </h2>
            <ol className="ha-how">
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
