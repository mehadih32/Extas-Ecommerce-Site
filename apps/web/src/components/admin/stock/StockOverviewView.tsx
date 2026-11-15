// PR 785 (lane D1, prototype v5 parity, m-products.js renderStock): the Stock page's top part as the prototype draws it: five
// figures, the ERP stock sync card with "Sync now", "Running out soon", the stuck-stock note, and "Stock by product" with a search,
// the All / Low / Has sold-out sizes chips and, per product, every colour and size (the prototype's heat table). Server drawn: the
// search is a plain form and each product opens with the browser's own <details>. Nothing here writes.
import Link from 'next/link';
import { Icon } from '@/components/admin/Icon';
import { formatMoney, formatNumber, moneyOf, nameIn } from '@/components/admin/products/model';
import { productHref } from '@/lib/admin-products';
import type { StockOverview, StockProductRow } from '@/lib/admin-stock-overview';
import { STOCK_HOME } from '@/components/admin/stock/text';
import { ResyncButtons } from '@/components/admin/stock/StockActions';
import { t, type Dict } from '@/lib/i18n';

export interface StockFilter {
  q: string;
  f: 'all' | 'low' | 'out';
}

interface Props {
  d: Dict;
  lang: 'en' | 'bn';
  locale: string;
  currency: string;
  data: StockOverview;
  filter: StockFilter;
  lastSyncText: string;
  nextSyncMin: number | null;
  recent: string[];
  canSync: boolean;
}

const heat = (n: number, low: number) => (n === 0 ? 'out' : n <= low ? 'low' : n <= low * 4 ? 'mid' : 'ok');

export function StockOverviewView({ d, lang, locale, currency, data, filter, lastSyncText, nextSyncMin, recent, canSync, lowPieces }: Props & { lowPieces: number }) {
  const num = (n: number) => formatNumber(n, locale);
  const money = (minor: number) => formatMoney(minor, moneyOf(currency, locale));
  const s = filter.q.trim().toLowerCase();
  const rows = data.products.filter((p) => (!s || p.nameEn.toLowerCase().includes(s) || (p.nameBn ?? '').toLowerCase().includes(s) || (p.style ?? '').toLowerCase().includes(s)) && (filter.f === 'all' || (filter.f === 'low' ? p.low : p.hasOut)));
  const lowList = data.products.filter((p) => p.lowSizes.length).slice(0, 8);
  const nm = (p: StockProductRow) => nameIn(lang, { nameEn: p.nameEn, nameBn: p.nameBn });
  const chipHref = (f: StockFilter['f']) => `${STOCK_HOME}?${new URLSearchParams({ ...(filter.q ? { q: filter.q } : {}), ...(f !== 'all' ? { f } : {}) }).toString()}`.replace(/\?$/, '');
  const days = (n: number | null) => (n === null ? '—' : num(n));
  return (
    <>
      <div className="pa-kpis" data-testid="stock-kpis">
        <div className="pa-kpi">
          <div className="pa-kpi-v">{num(data.pieces)}</div>
          <div className="pa-kpi-l">{t(d, 'stock.ov.pieces')}</div>
        </div>
        {data.valueMinor !== null ? (
          <div className="pa-kpi">
            <div className="pa-kpi-v">{money(data.valueMinor)}</div>
            <div className="pa-kpi-l">{t(d, 'stock.ov.value')}</div>
          </div>
        ) : null}
        <div className="pa-kpi">
          <div className="pa-kpi-v">{t(d, 'stock.ov.pcs', { n: num(data.held) })}</div>
          <div className="pa-kpi-l">{t(d, 'stock.ov.held')}</div>
          <div className="pa-kpi-s">{t(d, 'stock.ov.heldSub')}</div>
        </div>
        <div className="pa-kpi">
          <div className={`pa-kpi-v${data.lowSizes ? ' warn' : ''}`}>{num(data.lowSizes)}</div>
          <div className="pa-kpi-l">{t(d, 'stock.ov.low')}</div>
          <div className="pa-kpi-s">{t(d, 'stock.ov.lowSub', { n: num(lowPieces) })}</div>
        </div>
        <div className="pa-kpi">
          <div className={`pa-kpi-v${data.outSizes ? ' warn' : ''}`}>{num(data.outSizes)}</div>
          <div className="pa-kpi-l">{t(d, 'stock.ov.out')}</div>
        </div>
      </div>

      <div className="sk-top">
        <section className="ad-card st-card" aria-labelledby="sk-sync">
          <h2 id="sk-sync">{t(d, 'stock.ov.sync')}</h2>
          <div className="ad-row">
            <div className="ad-row-main">
              <div className="ad-row-name">{t(d, 'stock.ov.lastSync')}</div>
            </div>
            <b>{lastSyncText}</b>
          </div>
          <div className="ad-row">
            <div className="ad-row-main">
              <div className="ad-row-name">{t(d, 'stock.ov.nextSync')}</div>
            </div>
            <b>{nextSyncMin === null ? '—' : t(d, 'stock.ov.inMin', { n: num(nextSyncMin) })}</b>
          </div>
          {data.warehouse ? (
            <div className="ad-row">
              <div className="ad-row-main">
                <div className="ad-row-name">{t(d, 'stock.ov.warehouse')}</div>
              </div>
              <span>{data.warehouse}</span>
            </div>
          ) : null}
          {canSync ? (
            <div className="st-card-acts">
              <ResyncButtons dict={d} locale={locale} />
            </div>
          ) : null}
          {recent.length ? (
            <p className="ad-mini pa-gap">
              {recent.map((r) => (
                <span key={r} className="st-block">
                  {r}
                </span>
              ))}
            </p>
          ) : null}
        </section>
        <section className="ad-card st-card sk-soon" aria-labelledby="sk-soon">
          <h2 id="sk-soon">{t(d, 'stock.ov.soon')}</h2>
          {lowList.length ? (
            <ul className="st-list">
              {lowList.map((p) => (
                <li key={p.id} className="st-li">
                  <span className="st-li-main">
                    <Link className="st-name" href={productHref(p.id)}>
                      {nm(p)}
                    </Link>
                    <span className="ad-mini st-block">
                      {p.lowSizes.slice(0, 4).map((v) => `${v.colour} ${v.size}: ${num(v.available)}`).join(' · ')}
                      {p.lowSizes.length > 4 ? ` +${num(p.lowSizes.length - 4)}` : ''}
                    </span>
                  </span>
                  <span className={`ad-tag${p.days !== null && p.days <= 14 ? ' bad' : ''}`}>{p.days === null ? t(d, 'stock.ov.noSales') : t(d, 'stock.ov.daysLeft', { n: num(p.days) })}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="pa-empty">{t(d, 'stock.ov.soonNone')}</p>
          )}
        </section>
      </div>

      {data.deadCount ? (
        <div className="ad-note ad-note-top" role="note" data-testid="stock-dead">
          <Icon name="info" size={16} />
          <span>{data.deadValueMinor !== null ? t(d, 'stock.ov.deadValue', { n: num(data.deadCount), v: money(data.deadValueMinor) }) : t(d, 'stock.ov.dead', { n: num(data.deadCount) })}</span>
        </div>
      ) : null}

      <section className="ad-card st-card sk-byp" aria-labelledby="sk-byp" data-testid="stock-by-product">
        <h2 id="sk-byp">{t(d, 'stock.ov.byProduct')}</h2>
        <p className="ad-sub">{t(d, 'stock.ov.byProductSub')}</p>
        <form className="sk-tools" role="search" action={STOCK_HOME} method="get">
          <input className="ad-input" type="search" name="q" defaultValue={filter.q} placeholder={t(d, 'stock.ov.search')} aria-label={t(d, 'stock.ov.search')} maxLength={100} />
          {filter.f !== 'all' ? <input type="hidden" name="f" value={filter.f} /> : null}
          <button type="submit" className="ad-btn ad-btn-ghost ad-btn-sm">
            {t(d, 'stock.ov.searchGo')}
          </button>
        </form>
        <nav className="ad-tabs" aria-label={t(d, 'stock.ov.filters')}>
          {(['all', 'low', 'out'] as const).map((f) => (
            <Link key={f} className="ad-chip" href={chipHref(f)} aria-current={filter.f === f ? 'page' : undefined}>
              {t(d, `stock.ov.f.${f}`)}
            </Link>
          ))}
        </nav>
        <div className="sk-head" aria-hidden="true">
          <span>{t(d, 'stock.ov.col.product')}</span>
          <span className="r">{t(d, 'stock.ov.col.stock')}</span>
          <span className="r sk-hm">{t(d, 'stock.ov.col.held')}</span>
          <span className="r sk-hm">{t(d, 'stock.ov.col.sold')}</span>
          <span className="r">{t(d, 'stock.ov.col.days')}</span>
          {data.valueMinor !== null ? <span className="r sk-hm">{t(d, 'stock.ov.col.value')}</span> : null}
        </div>
        {rows.length ? (
          rows.slice(0, 60).map((p) => (
            <details key={p.id} className="sk-prod" data-testid="stock-row">
              <summary className="sk-row">
                <span className="sk-name">
                  <b>{nm(p)}</b>
                  {p.style ? <span className="ad-mini a2-mono">{p.style}</span> : null}
                </span>
                <span className={`r${p.low ? ' sk-lowv' : ''}`}>{num(p.stock)}</span>
                <span className="r sk-hm">{p.held ? num(p.held) : '—'}</span>
                <span className="r sk-hm">{num(p.sold30)}</span>
                <span className="r">{days(p.days)}</span>
                {p.valueMinor !== null ? <span className="r sk-hm">{money(p.valueMinor)}</span> : null}
              </summary>
              <div className="sk-heat">
                <div className="ad-mini">{t(d, 'stock.ov.heatNote', { days: p.days === null ? '—' : num(p.days) })}</div>
                <div className="sk-heatw">
                  <table className="sk-ht">
                    <thead>
                      <tr>
                        <th />
                        {p.sizes.map((z) => (
                          <th key={z}>{z}</th>
                        ))}
                        <th>{t(d, 'stock.ov.total')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.colours.map((c) => (
                        <tr key={c.name}>
                          <th className="sk-cn">
                            {c.hex ? <i className="sk-sw" style={{ background: c.hex }} aria-hidden="true" /> : null}
                            {lang === 'bn' && c.nameBn ? c.nameBn : c.name}
                          </th>
                          {c.cells.map((cell, i) =>
                            cell ? (
                              <td key={i} className={`sk-h-${heat(cell.available, lowPieces)}`}>
                                {num(cell.available)}
                                {cell.held ? <small>{t(d, 'stock.ov.heldN', { n: num(cell.held) })}</small> : null}
                              </td>
                            ) : (
                              <td key={i}>—</td>
                            ),
                          )}
                          <th>{num(c.cells.reduce((n, x) => n + (x?.available ?? 0), 0))}</th>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Link className="ad-btn ad-btn-ghost ad-btn-sm" href={productHref(p.id)}>
                  {t(d, 'stock.ov.openProduct')}
                </Link>
              </div>
            </details>
          ))
        ) : (
          <p className="pa-empty">{t(d, 'stock.ov.none')}</p>
        )}
      </section>
    </>
  );
}
