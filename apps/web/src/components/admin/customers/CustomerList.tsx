// S14 · PR 285 — Customers → All customers (CUS-01; demo V12.4 #/admin/customers): the header, the section's tabs, four
// numbers (customers, returning, at risk, refused before), PR 264: on "Refused before" a note and a link to the exclusion
// list sent to the ad platforms (Marketing › Audiences), the owner's views with their counts, the search and filters
// (a plain GET form shared with the order list), the table (one card per person on a phone) and "More". Each row is one
// person: his name and number as this viewer may see it (masked without `customers.phone`), where he first came from,
// orders, Sales (delivered only) with Ordered value under it (CN-022), true deliveries, refusals that were not the
// shop's fault, last order and whether he takes offers. Never his address (it stays inside an order). PR 299: "Export"
// above the table for a person allowed it (the owner's switch and `customers.export`), with a reason.
import Link from 'next/link';
import type { CustomerList as ListData, CustomerRow } from '@extas/customers';
import { OrderFilters, type FilterSelect } from '@/components/admin/orders/OrderFilters';
import { formatMoney, formatNumber, type Money } from '@/components/admin/products/model';
import { customersHref, CUSTOMERS_BASE, share, type CustomerQuery } from '@/lib/admin-customers/model';
import type { CountFormat } from '@/lib/admin-lumen/model';
import type { AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { PageHead, SectionTabs } from '../shell/ShellParts';
import { ShellIcon } from '../shell/ShellIcon';
import { SummaryTiles, type SummaryTile } from '../lumen/SummaryTiles';
import { CustomerExport } from './CustomerExport';
import { GradePill } from './GradePill';
import { initials } from './PairCard';

export interface ListSettings {
  returningMinOrders: number;
  atRiskDays: number;
  /** PR 801: the owner's VIP figure (null or left out: none), so the Group column can say VIP. */
  vipMinSalesMinor?: number | null;
}

/** Where a person first came from, in words (the order channels' names), else as stored. */
export function sourceLabel(view: AdminView, s: string | null): string {
  if (!s) return '';
  const key = `orders.source.${s}`;
  const v = t(view.dict, key);
  return v === key ? s : v;
}

/** The person's name cell; `href` (PR 286) makes the name his page's link. */
export function PersonCell({ view, r, href }: { view: AdminView; r: Pick<CustomerRow, 'name' | 'phone' | 'source' | 'members' | 'codPolicy'> & Partial<Pick<CustomerRow, 'mark'>>; href?: string | null }) {
  const d = view.dict;
  const name = r.name ?? t(d, 'cus.side.noName');
  return (
    <div className="a2-prow" style={{ padding: 0 }}>
      <span className="a2-av g" aria-hidden="true">
        {initials(r.name)}
      </span>
      <div className="a2-prt">
        <b>
          {href ? (
            <Link className="a2-b" href={href}>
              {name}
            </Link>
          ) : (
            name
          )}
          {r.members ? <span className="a2-pill line" style={{ marginLeft: 6 }}>{t(d, 'cus.list.merged', { n: formatNumber(r.members, view.locale) })}</span> : null}
          {r.codPolicy ? <span className="a2-pill warn" style={{ marginLeft: 6 }}>{t(d, 'cus.list.codPolicy')}</span> : null}
          {/* PR 534: the grade and verified mark his counts earn (only while the owner's grading is on) */}
          <GradePill mark={r.mark ?? null} lang={view.lang} verified={t(d, 'cus.grade.verified')} />
        </b>
        <span>{[r.phone?.text ?? t(d, 'cus.side.noPhone'), sourceLabel(view, r.source)].filter(Boolean).join(' · ')}</span>
      </div>
    </div>
  );
}

/** PR 636 (CN-036): the four figures as Lumen summary tiles (components/admin/lumen/SummaryTiles.tsx); every tile but
 *  "People" opens the list on its view, as before. */
export function customerKpiTiles(view: AdminView, data: ListData, s: ListSettings, segment?: string, money?: Money): SummaryTile[] {
  const d = view.dict;
  const n = (x: number) => formatNumber(x, view.locale);
  const c = data.counts;
  const all = c.all ?? 0;
  const pct = share(c.returning ?? 0, all);
  const num: CountFormat = { kind: 'number', locale: view.locale };
  const x = data.extra ?? { newThisMonth: 0, newLastMonth: 0, avgSalesMinor: 0, top10Pct: 0 };
  // PR 801: the prototype's four figures — Customers, New this month (against the same days last month), Repeat customers, Average spend
  const delta = x.newLastMonth > 0 ? (x.newThisMonth - x.newLastMonth) / x.newLastMonth : null;
  const tiles: SummaryTile[] = [
    { key: 'people', label: t(d, 'cus.list.kpi.people'), value: all, shown: n(all), format: num, vs: t(d, 'cus.list.kpi.peopleNote'), icon: 'users' },
    { key: 'newmonth', label: t(d, 'cus.list.kpi.newMonth'), value: x.newThisMonth, shown: n(x.newThisMonth), format: num, delta, vs: t(d, 'cus.list.kpi.newMonthNote'), icon: 'plus' },
    {
      key: 'returning',
      label: t(d, 'cus.list.kpi.repeat'),
      value: (pct ?? 0) / 100,
      shown: pct === null ? t(d, 'cus.list.none') : `${n(pct)}%`,
      format: { kind: 'percent', locale: view.locale },
      vs: t(d, 'cus.list.kpi.repeatNote', { n: n(s.returningMinOrders) }),
      icon: 'refresh',
      href: customersHref({ segment }, { view: 'returning' }),
    },
    {
      key: 'avg',
      label: t(d, 'cus.list.kpi.avg'),
      value: x.avgSalesMinor,
      shown: money ? formatMoney(x.avgSalesMinor, money) : n(x.avgSalesMinor),
      format: money ? { kind: 'money', locale: view.locale, currency: money.currency, digits: money.digits } : num,
      vs: t(d, 'cus.list.kpi.avgNote'),
      icon: 'wallet',
    },
  ];
  return tiles;
}

function Kpis({ view, data, s, segment, money }: { view: AdminView; data: ListData; s: ListSettings; segment?: string; money?: Money }) {
  return <SummaryTiles tiles={customerKpiTiles(view, data, s, segment, money)} label={t(view.dict, 'cus.list.kpi.people')} testId="cus-kpis" />;
}

/** PR 801: the prototype's one-paragraph note under the figures — the top 10's share, the quiet regulars, the refusers. */
export function CustomerNote({ view, data, s }: { view: AdminView; data: ListData; s: ListSettings }) {
  const d = view.dict;
  const n = (x: number) => formatNumber(x, view.locale);
  const x = data.extra;
  if (!x || !data.counts.all) return null;
  const risk = data.counts.atrisk ?? 0;
  const refused = data.counts.refused ?? 0;
  return (
    <div className="a2-note a2-mt12" role="note" data-testid="cus-note">
      <p>
        {[
          t(d, 'cus.list.noteTop', { pct: n(Math.round(x.top10Pct)) }),
          risk ? t(d, 'cus.list.noteRisk', { n: n(risk), days: n(s.atRiskDays) }) : t(d, 'cus.list.noteNoRisk'),
          refused ? t(d, 'cus.list.noteRefused', { n: n(refused) }) : '',
        ]
          .filter(Boolean)
          .join(' ')}
      </p>
    </div>
  );
}

const VIEW_ORDER: readonly string[] = ['all', 'vip', 'atrisk', 'returning', 'new', 'refused', 'exchanged', 'nooffers'];
const GROUP_TONE = { vip: 'info', risk: 'warn', repeat: 'ok', new: 'line' } as const;

/** PR 801: the Group column's pill — VIP, At risk, Repeat or New, as the prototype's segOf says. */
export function groupOf(r: Pick<CustomerRow, 'orders' | 'salesMinor' | 'delivered' | 'lastOrderAt'>, s: ListSettings, now: number): keyof typeof GROUP_TONE {
  if (s.vipMinSalesMinor != null && r.salesMinor >= s.vipMinSalesMinor) return 'vip';
  if (r.delivered > 0 && r.lastOrderAt && now - r.lastOrderAt.getTime() >= s.atRiskDays * 86_400_000) return 'risk';
  if (r.orders >= s.returningMinOrders) return 'repeat';
  return 'new';
}

export function CustomerTable({ view, rows, money, when, hrefOf, settings, nowMs = 0 }: { view: AdminView; rows: CustomerRow[]; money: Money; when: Intl.DateTimeFormat; hrefOf?: (id: string) => string; settings?: ListSettings; nowMs?: number }) {
  const d = view.dict;
  const col = (k: string) => t(d, `cus.list.cols.${k}`);
  const dash = t(d, 'cus.list.none');
  const n = (x: number) => formatNumber(x, view.locale);
  const now = nowMs;
  const s: ListSettings = settings ?? { returningMinOrders: 2, atRiskDays: 45 };
  // PR 801: the prototype's columns — Customer, District, Orders, Delivered / refused, Spent, Last order, Group
  return (
    <div className="a2-tblw a2-mt12">
      <table className="a2-tbl" data-testid="cus-table">
        <thead>
          <tr>
            <th>{col('customer')}</th>
            <th>{col('district')}</th>
            <th className="r">{col('orders')}</th>
            <th className="r">{col('dr')}</th>
            <th className="r">{col('spent')}</th>
            <th>{col('last')}</th>
            <th>{col('group')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const g = groupOf(r, s, now);
            const district = r.place ? (view.lang === 'bn' && r.place.districtBn ? r.place.districtBn : r.place.districtEn) : null;
            return (
              <tr key={r.id} data-testid="cus-row">
                <td className="a2-tdh">
                  <PersonCell view={view} r={r} href={hrefOf ? hrefOf(r.id) : null} />
                </td>
                <td data-l={col('district')}>
                  {district ?? dash}
                  {r.place?.areaEn && r.place.areaEn !== r.place.districtEn ? <span className="a2-xs a2-mute a2-blk">{r.place.areaEn}</span> : null}
                </td>
                <td className="r" data-l={col('orders')}>
                  <b className="a2-num">{n(r.orders)}</b>
                </td>
                <td className="r" data-l={col('dr')}>
                  <span className="a2-num">
                    {n(r.delivered)} / {r.refused ? <span className="a2-pill bad">{n(r.refused)}</span> : n(0)}
                  </span>
                </td>
                <td className="r" data-l={col('spent')}>
                  <b className="a2-num">{formatMoney(r.salesMinor, money)}</b>
                </td>
                <td data-l={col('last')}>{r.lastOrderAt ? when.format(r.lastOrderAt) : dash}</td>
                <td data-l={col('group')}>
                  <span className="a2-gap8" style={{ display: 'inline-flex', flexWrap: 'wrap' }}>
                    <span className={`a2-pill ${GROUP_TONE[g]}`}>{t(d, `cus.list.group.${g}`)}</span>
                    {r.refused ? <span className="a2-pill bad">{t(d, 'cus.list.refusedN', { n: n(r.refused) })}</span> : null}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** `exportLimits` (PR 299): the reason's limits when this person may export the list (switched on and the key held); null hides Export. */
export function CustomerListPage({ view, data, query, settings, money, hrefOf, exportLimits = null }: { view: AdminView; data: ListData; query: CustomerQuery; settings: ListSettings; money: Money; hrefOf?: (id: string) => string; exportLimits?: { min: number; max: number } | null }) {
  const d = view.dict;
  const n = (x: number) => formatNumber(x, view.locale);
  const when = new Intl.DateTimeFormat(view.locale, { timeZone: view.timeZone, numberingSystem: 'latn', dateStyle: 'medium' });
  const filtered = !!(query.q || query.source || query.district);
  const sourceSel: FilterSelect = { name: 'source', label: t(d, 'cus.list.source'), any: t(d, 'cus.list.anySource'), value: query.source ?? '', options: data.sources.map((s) => ({ value: s, label: sourceLabel(view, s) })) };
  // follow-up 473: the district of each person's latest order with a resolved place (only the districts orders reached)
  const districtSel: FilterSelect | null = data.districts.length
    ? { name: 'district', label: t(d, 'cus.list.district'), any: t(d, 'cus.list.anyDistrict'), value: query.district ?? '', options: data.districts.map((x) => ({ value: x.id, label: view.lang === 'bn' && x.nameBn ? x.nameBn : x.nameEn })) }
    : null;
  const sortSel: FilterSelect = {
    name: 'sort',
    label: t(d, 'cus.list.sort'),
    any: t(d, 'cus.list.sortLast'),
    value: query.sort ?? '',
    options: (['new', 'spend', 'orders', 'name'] as const).map((s) => ({ value: s, label: t(d, `cus.list.sort${s[0]!.toUpperCase()}${s.slice(1)}`) })),
  };
  const current = data.query.view;
  const all = current === 'all' && !filtered;
  return (
    <div className="a2-z" data-testid="customers-list" data-lm-ready="">
      <PageHead view={view} place={locateKey('customers')} title={t(d, 'cus.list.title')} sub={t(d, 'cus.list.sub')} />
      <SectionTabs view={view} current="customers" />
      {query.segment ? (
        <section className="a2-card tight a2-mt12" data-testid="cus-segment">
          <div className="a2-between">
            <span className="a2-sm">{data.segment ? t(d, 'cus.seg.listShowsName', { name: data.segment.name }) : t(d, 'cus.seg.listGone')}</span>
            <span className="a2-gap8">
              {data.segment ? (
                <Link className="a2-btn sm" href={`/admin/customers/segments/${data.segment.id}`}>
                  {t(d, 'cus.seg.listOpen')}
                </Link>
              ) : null}
              <Link className="a2-btn sm" href={customersHref({ ...query, segment: undefined, page: undefined })}>
                {t(d, 'cus.seg.listClear')}
              </Link>
            </span>
          </div>
        </section>
      ) : null}
      <Kpis view={view} data={data} s={settings} segment={query.segment} money={money} />
      <CustomerNote view={view} data={data} s={settings} />
      <nav className="a2-views" aria-label={t(d, 'cus.list.viewsAria')} data-testid="cus-views">
        {/* PR 801: the prototype's chip order — All, VIP, At risk, Repeat, New, Refuser — the extra views after them */}
        {[...data.views].sort((a, b) => VIEW_ORDER.indexOf(a) - VIEW_ORDER.indexOf(b)).map((v) => {
          const on = v === current;
          return (
            <Link key={v} className={`a2-view${on ? ' on' : ''}`} href={customersHref({ q: query.q, source: query.source, district: query.district, sort: query.sort, segment: query.segment }, { view: v })} aria-current={on ? 'page' : undefined} scroll={false} data-view={v}>
              {t(d, `cus.list.view.${v}`)}
              <span className="a2-cnt">{n(data.counts[v] ?? 0)}</span>
            </Link>
          );
        })}
      </nav>
      {current === 'refused' ? (
        <div className="a2-note a2-mt12" role="note" data-testid="cus-excl-note">
          <p>{t(d, 'cus.list.exclNote')}</p>
          <Link className="a2-btn" href="/admin/marketing/audiences">
            {t(d, 'cus.list.exclLink')}
          </Link>
        </div>
      ) : null}
      <OrderFilters
        key={customersHref(query)}
        action={CUSTOMERS_BASE}
        view={current}
        defaultView="all"
        q={query.q ?? ''}
        search={t(d, 'cus.list.search')}
        go={t(d, 'cus.list.searchGo')}
        aria={t(d, 'cus.list.filtersAria')}
        selects={districtSel ? [sourceSel, districtSel, sortSel] : [sourceSel, sortSel]}
        keep={{ segment: query.segment ?? '' }}
        clear={filtered || query.sort ? { href: customersHref({ view: query.view, segment: query.segment }), label: t(d, 'cus.list.clear') } : null}
      />
      {exportLimits && data.rows.length ? <CustomerExport dict={{ cus: d.cus as Dict }} query={{ view: data.query.view, q: data.query.q, source: data.query.source, district: data.query.district, sort: query.sort, segment: data.query.segment }} limits={exportLimits} /> : null}
      {data.rows.length ? (
        <>
          <CustomerTable view={view} rows={data.rows} money={money} when={when} hrefOf={hrefOf} settings={settings} nowMs={data.extra?.now ?? 0} />
          <div className="a2-tblf a2-tblf-o" data-testid="cus-foot">
            <span>{t(d, 'cus.list.shown', { n: n(data.rows.length) })}</span>
            <span className="a2-gap8">
              {data.query.page > 1 ? (
                <Link className="a2-btn sm" href={customersHref(query, { page: undefined })}>
                  {t(d, 'cus.list.first')}
                </Link>
              ) : null}
              {data.hasMore ? (
                <Link className="a2-btn sm" href={customersHref(query, { page: data.query.page + 1 })} data-testid="cus-next">
                  {t(d, 'cus.list.next')}
                </Link>
              ) : null}
            </span>
          </div>
        </>
      ) : (
        <div className="a2-state" data-testid="cus-empty">
          <div className="a2-sti">
            <ShellIcon name={filtered ? 'search' : 'users'} size={26} />
          </div>
          <h3>{t(d, `cus.list.empty.${filtered ? 'title' : all ? 'none' : 'view'}`)}</h3>
          <p>{t(d, `cus.list.empty.${filtered ? 'body' : all ? 'noneBody' : 'viewBody'}`)}</p>
          {filtered ? (
            <div className="a2-gap8">
              <Link className="a2-btn" href={customersHref({ view: query.view })}>
                {t(d, 'cus.list.clear')}
              </Link>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
