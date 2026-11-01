// S14 · PR 285 — Customers → All customers (CUS-01; demo V12.4 #/admin/customers): the header, the section's tabs, four
// numbers (customers, returning, at risk, refused before), the owner's views with their counts, the search and filters
// (a plain GET form shared with the order list), the table (one card per person on a phone) and "More". Each row is one
// person: his name and number as this viewer may see it (masked without `customers.phone`), where he first came from,
// orders, Sales (delivered only) with Ordered value under it (CN-022), true deliveries, refusals that were not the
// shop's fault, last order and whether he takes offers. Never his address (it stays inside an order).
import Link from 'next/link';
import type { CustomerList as ListData, CustomerRow, CustomerView } from '@extas/customers';
import { OrderFilters, type FilterSelect } from '@/components/admin/orders/OrderFilters';
import { formatMoney, formatNumber, type Money } from '@/components/admin/products/model';
import { customersHref, CUSTOMERS_BASE, share, type CustomerQuery } from '@/lib/admin-customers/model';
import type { AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t } from '@/lib/i18n';
import { PageHead, SectionTabs } from '../shell/ShellParts';
import { ShellIcon } from '../shell/ShellIcon';
import { initials } from './PairCard';

export interface ListSettings {
  returningMinOrders: number;
  atRiskDays: number;
}

/** Where a person first came from, in words (the order channels' names), else as stored. */
export function sourceLabel(view: AdminView, s: string | null): string {
  if (!s) return '';
  const key = `orders.source.${s}`;
  const v = t(view.dict, key);
  return v === key ? s : v;
}

/** The person's name cell; `href` (PR 286) makes the name his page's link. */
export function PersonCell({ view, r, href }: { view: AdminView; r: Pick<CustomerRow, 'name' | 'phone' | 'source' | 'members' | 'codPolicy'>; href?: string | null }) {
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
        </b>
        <span>{[r.phone?.text ?? t(d, 'cus.side.noPhone'), sourceLabel(view, r.source)].filter(Boolean).join(' · ')}</span>
      </div>
    </div>
  );
}

function Kpis({ view, data, s, segment }: { view: AdminView; data: ListData; s: ListSettings; segment?: string }) {
  const d = view.dict;
  const n = (x: number) => formatNumber(x, view.locale);
  const c = data.counts;
  const all = c.all ?? 0;
  const pct = share(c.returning ?? 0, all);
  const tile = (id: CustomerView | 'people', label: string, value: string, note: string) => {
    const body = (
      <>
        <div className="a2-kl">{label}</div>
        <div className="a2-kv">{value}</div>
        <div className="a2-kf">
          <span className="a2-kn">{note}</span>
        </div>
      </>
    );
    return id === 'people' ? (
      <div key={id} className="a2-card a2-kpi" data-testid={`cus-kpi-${id}`}>
        {body}
      </div>
    ) : (
      <Link key={id} className="a2-card a2-kpi" href={customersHref({ segment }, { view: id })} data-testid={`cus-kpi-${id}`}>
        {body}
      </Link>
    );
  };
  return (
    <div className="a2-kpis" data-testid="cus-kpis">
      {tile('people', t(d, 'cus.list.kpi.people'), n(all), t(d, 'cus.list.kpi.peopleNote'))}
      {tile('returning', t(d, 'cus.list.kpi.returning'), pct === null ? t(d, 'cus.list.none') : `${n(pct)}%`, t(d, 'cus.list.kpi.returningNote', { n: n(s.returningMinOrders) }))}
      {tile('atrisk', t(d, 'cus.list.kpi.atrisk'), n(c.atrisk ?? 0), t(d, 'cus.list.kpi.atriskNote', { n: n(s.atRiskDays) }))}
      {tile('refused', t(d, 'cus.list.kpi.refused'), n(c.refused ?? 0), t(d, 'cus.list.kpi.refusedNote'))}
    </div>
  );
}

export function CustomerTable({ view, rows, money, when, hrefOf }: { view: AdminView; rows: CustomerRow[]; money: Money; when: Intl.DateTimeFormat; hrefOf?: (id: string) => string }) {
  const d = view.dict;
  const col = (k: string) => t(d, `cus.list.cols.${k}`);
  const dash = t(d, 'cus.list.none');
  const n = (x: number) => formatNumber(x, view.locale);
  return (
    <div className="a2-tblw a2-mt12">
      <table className="a2-tbl" data-testid="cus-table">
        <thead>
          <tr>
            <th>{col('customer')}</th>
            <th className="r">{col('orders')}</th>
            <th className="r">{col('sales')}</th>
            <th className="r">{col('delivery')}</th>
            <th className="r">{col('refused')}</th>
            <th>{col('last')}</th>
            <th>{col('offers')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const pct = share(r.delivered, r.orders);
            const offers = [r.consent.sms ? t(d, 'cus.list.offerSms') : null, r.consent.whatsapp ? t(d, 'cus.list.offerWa') : null].filter(Boolean).join(' · ');
            return (
              <tr key={r.id} data-testid="cus-row">
                <td className="a2-tdh">
                  <PersonCell view={view} r={r} href={hrefOf ? hrefOf(r.id) : null} />
                </td>
                <td className="r" data-l={col('orders')}>
                  <b className="a2-num">{n(r.orders)}</b>
                </td>
                <td className="r" data-l={col('sales')}>
                  <span className="a2-num">{formatMoney(r.salesMinor, money)}</span>
                  <span className="a2-xs a2-mute a2-blk">
                    {col('ordered')} {formatMoney(r.orderedMinor, money)}
                  </span>
                </td>
                <td className="r" data-l={col('delivery')}>
                  {pct === null ? dash : `${n(pct)}%`}
                </td>
                <td className="r" data-l={col('refused')}>
                  {r.refused ? <span className={`a2-pill ${r.refused > 1 ? 'bad' : 'warn'}`}>{n(r.refused)}</span> : n(0)}
                </td>
                <td data-l={col('last')}>{r.lastOrderAt ? when.format(r.lastOrderAt) : dash}</td>
                <td data-l={col('offers')}>{offers || <span className="a2-faint">{t(d, 'cus.list.offerNone')}</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function CustomerListPage({ view, data, query, settings, money, hrefOf }: { view: AdminView; data: ListData; query: CustomerQuery; settings: ListSettings; money: Money; hrefOf?: (id: string) => string }) {
  const d = view.dict;
  const n = (x: number) => formatNumber(x, view.locale);
  const when = new Intl.DateTimeFormat(view.locale, { timeZone: view.timeZone, numberingSystem: 'latn', dateStyle: 'medium' });
  const filtered = !!(query.q || query.source);
  const sourceSel: FilterSelect = { name: 'source', label: t(d, 'cus.list.source'), any: t(d, 'cus.list.anySource'), value: query.source ?? '', options: data.sources.map((s) => ({ value: s, label: sourceLabel(view, s) })) };
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
    <div className="a2-z" data-testid="customers-list">
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
      <Kpis view={view} data={data} s={settings} segment={query.segment} />
      <nav className="a2-views" aria-label={t(d, 'cus.list.viewsAria')} data-testid="cus-views">
        {data.views.map((v) => {
          const on = v === current;
          return (
            <Link key={v} className={`a2-view${on ? ' on' : ''}`} href={customersHref({ q: query.q, source: query.source, sort: query.sort, segment: query.segment }, { view: v })} aria-current={on ? 'page' : undefined} scroll={false} data-view={v}>
              {t(d, `cus.list.view.${v}`)}
              <span className="a2-cnt">{n(data.counts[v] ?? 0)}</span>
            </Link>
          );
        })}
      </nav>
      <OrderFilters
        key={customersHref(query)}
        action={CUSTOMERS_BASE}
        view={current}
        defaultView="all"
        q={query.q ?? ''}
        search={t(d, 'cus.list.search')}
        go={t(d, 'cus.list.searchGo')}
        aria={t(d, 'cus.list.filtersAria')}
        selects={[sourceSel, sortSel]}
        keep={{ segment: query.segment ?? '' }}
        clear={filtered || query.sort ? { href: customersHref({ view: query.view, segment: query.segment }), label: t(d, 'cus.list.clear') } : null}
      />
      {data.rows.length ? (
        <>
          <CustomerTable view={view} rows={data.rows} money={money} when={when} hrefOf={hrefOf} />
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
