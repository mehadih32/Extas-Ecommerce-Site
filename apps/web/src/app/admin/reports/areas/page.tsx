// S16 · PR 568 — Reports → Sales by area at /admin/reports/areas (B3.10 Locked: "sales by district and thana, and by area
// inside Dhaka, as a table and a map, with the return rate per area"; BACKEND-ARCHITECTURE §5 REP-02): for any period
// (one-press or from/to, `costs.report`), by district, upazila/thana or area inside Dhaka City, for the whole shop, a
// category (with its sub-categories) or one product — Sales of delivered orders, pieces, returned orders and the return
// rate of each area, a map of the areas that have a map point, and the CSV. Seeing needs `books.read`. Read-only.
// The figure is lib/area-sales.ts (@extas/metrics salesByArea). Words: messages/admin-areas.*.json.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AREA_LEVELS, type AreaFigures } from '@extas/metrics';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { formatMoney, moneyOf } from '@/components/admin/products/model';
import { AreaMap } from '@/components/admin/reports/AreaMap';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { areaReport, findAreaProducts, ratePct } from '@/lib/area-sales';
import { QUICK_PERIODS, quickPeriod } from '@/lib/cost-report';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../messages/admin-areas.bn.json';
import en from '../../../../../messages/admin-areas.en.json';
import reportBn from '../../../../../messages/admin-cost-report.bn.json';
import reportEn from '../../../../../messages/admin-cost-report.en.json';
import '../../settings-cards.css';
import '../../money/money.css';

export const dynamic = 'force-dynamic';

const KEY = 'reportsAreas';
const HERE = '/admin/reports/areas';
/** How many products "Find a product" lists. */
const FOUND = 10;

function withScreen(view: AdminView): AdminView {
  const b = view.lang === 'bn';
  return { ...view, dict: { ...view.dict, reportsAreas: (b ? bn : en).reportsAreas as unknown as Dict, moneyCostReport: (b ? reportBn : reportEn).moneyCostReport as unknown as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'reportsAreas.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function AreasPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([adminView(deps), pageAccess('books.read', deps, MOTHER_STORE_ID), searchParams]);
  const view = withScreen(plain);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="books.read" />
      </div>
    );
  const d = view.dict;
  const c = (k: string, vars?: Record<string, string | number>) => t(d, `reportsAreas.${k}`, vars);
  const cr = (k: string) => t(d, `moneyCostReport.${k}`);
  const at = { storeId: MOTHER_STORE_ID };
  const db = access.deps.db;
  const [currency, timeZone, limits] = await Promise.all([access.deps.resolver.value('store.currency', at), access.deps.resolver.value('store.timeZone', at), access.deps.resolver.value('costs.report', at)]);
  const findText = typeof sp.find === 'string' ? sp.find : '';
  const [r, categories, found] = await Promise.all([
    areaReport(access.deps, MOTHER_STORE_ID, sp, limits, timeZone),
    db.category.findMany({ where: { storeId: MOTHER_STORE_ID, archivedAt: null }, select: { id: true, nameEn: true, nameBn: true, parentId: true }, orderBy: { nameEn: 'asc' } }),
    findAreaProducts(db, MOTHER_STORE_ID, findText, FOUND),
  ]);
  const { q, notes } = r.period;
  const bnLang = view.lang === 'bn';
  const nameOf = (x: { nameEn: string; nameBn: string | null }) => (bnLang && x.nameBn ? x.nameBn : x.nameEn);
  const catName = new Map(categories.map((x) => [x.id, nameOf(x)]));
  const money = moneyOf(currency, view.locale);
  const m = (minor: number) => formatMoney(minor, money);
  const dayText = (day: string) => new Intl.DateTimeFormat(view.locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC', numberingSystem: 'latn' }).format(new Date(`${day}T00:00:00Z`));
  const today = r.today;
  const current = QUICK_PERIODS.find((p) => p === sp.period) ?? QUICK_PERIODS.find((p) => {
    const x = quickPeriod(p, today);
    return x.from === q.from && x.to === q.to;
  });
  // keep the level, category and product when the period changes, and the other way round
  const keep = (extra: Record<string, string | null>) => {
    const u = new URLSearchParams();
    const base: Record<string, string | null> = { level: r.area.level, category: r.area.categoryId, product: r.area.productId, ...extra };
    for (const [k, v] of Object.entries(base)) if (v) u.set(k, v);
    return `${HERE}?${u.toString()}`;
  };
  const s = r.sales;
  const rateText = (f: AreaFigures) => (f.returnRate === null ? c('table.noRate') : c('table.rate', { pct: ratePct(f.returnRate)! }));
  const kpis = [
    { key: 'sales', value: m(s.total.salesMinor), sub: c('kpi.orders', { n: s.total.delivered }) },
    { key: 'pieces', value: String(s.total.pieces) },
    { key: 'returned', value: String(s.total.returned) },
    { key: 'rate', value: s.total.returnRate === null ? '—' : `${ratePct(s.total.returnRate)}%` },
    { key: 'areas', value: String(s.rows.length) },
  ];
  const cut = s.rows.length > limits.maxDayRows;
  const extraRows: { key: string; label: string; how: string; f: AreaFigures }[] = [
    ...(s.unknown.delivered || s.unknown.returned ? [{ key: 'unknown', label: c('table.unknown'), how: c('table.unknownHow'), f: s.unknown }] : []),
    ...(s.level === 'dhaka' && (s.outside.delivered || s.outside.returned) ? [{ key: 'outside', label: c('table.outside'), how: c('table.outsideHow'), f: s.outside }] : []),
  ];
  const csv = `/api/admin/reports/areas?from=${q.from}&to=${q.to}&level=${r.area.level}${r.area.categoryId ? `&category=${r.area.categoryId}` : ''}${r.area.productId ? `&product=${r.area.productId}` : ''}`;

  return (
    <div className="a2-z" data-testid="areas-page" data-from={q.from} data-to={q.to} data-level={r.area.level}>
      <PageHead view={view} place={locateKey(KEY)} title={c('title')} sub={c('sub')} />
      <SectionTabs view={view} current={KEY} />

      <nav className="ct-actions a2-mt12" aria-label={cr('quick.label')} data-testid="ar-quick">
        {QUICK_PERIODS.map((p) => (
          <Link key={p} className={`a2-btn${current === p ? ' pri' : ''}`} href={keep({ period: p })} aria-current={current === p ? 'true' : undefined} data-testid={`ar-quick-${p}`}>
            {cr(`quick.${p}`)}
          </Link>
        ))}
      </nav>

      <form className="a2-card a2-mt12" action={HERE} method="get" aria-label={cr('form.label')} data-testid="ar-form">
        <div className="ct-grid">
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor="ar-from">
              {cr('form.from')}
            </label>
            <input id="ar-from" name="from" type="date" className="a2-inp" max={today} defaultValue={q.from} />
          </div>
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor="ar-to">
              {cr('form.to')}
            </label>
            <input id="ar-to" name="to" type="date" className="a2-inp" max={today} defaultValue={q.to} />
          </div>
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor="ar-level">
              {c('level.label')}
            </label>
            <select id="ar-level" name="level" className="a2-inp" defaultValue={r.area.level} data-testid="ar-level">
              {AREA_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {c(`level.${l}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor="ar-cat">
              {c('filter.category')}
            </label>
            <select id="ar-cat" name="category" className="a2-inp" defaultValue={r.area.categoryId ?? ''} data-testid="ar-cat">
              <option value="">{c('filter.all')}</option>
              {categories.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.parentId && catName.has(x.parentId) ? `${nameOf(x)} (${catName.get(x.parentId)})` : nameOf(x)}
                </option>
              ))}
            </select>
          </div>
        </div>
        {r.product ? <input type="hidden" name="product" value={r.product.id} /> : null}
        <div className="ct-actions a2-mt12">
          <button type="submit" className="a2-btn pri" data-testid="ar-show">
            {cr('form.show')}
          </button>
          <a className="a2-btn" href={csv} download data-testid="ar-export">
            {c('export')}
          </a>
        </div>
        {notes
          .filter((n) => n !== 'byMonth')
          .map((n) => (
            <p key={n} className="a2-xs bk-warn a2-mt12" data-testid={`ar-note-${n}`}>
              {t(d, `moneyCostReport.note.${n}`, { days: limits.maxDays, rows: limits.maxDayRows })}
            </p>
          ))}
      </form>

      <section className="a2-card a2-mt12" aria-labelledby="ar-prod" data-testid="ar-product">
        <h2 className="a2-h3" id="ar-prod">
          {c('filter.product')}
        </h2>
        {r.product ? (
          <div className="a2-rule" data-testid="ar-product-on">
            <span>
              <b>{nameOf(r.product)}</b>
            </span>
            <span />
            <Link className="a2-btn" href={keep({ product: null, from: q.from, to: q.to })} data-testid="ar-product-clear">
              {c('filter.clear')}
            </Link>
          </div>
        ) : null}
        <form className="a2-mt12" action={HERE} method="get" role="search" aria-label={c('filter.find')}>
          {Object.entries({ from: q.from, to: q.to, level: r.area.level, category: r.area.categoryId ?? '' })
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor="ar-find">
              {c('filter.find')}
            </label>
            <input id="ar-find" name="find" className="a2-inp" placeholder={c('filter.findPh')} defaultValue={findText} data-testid="ar-find" />
          </div>
          <div className="ct-actions a2-mt12">
            <button type="submit" className="a2-btn" data-testid="ar-find-btn">
              {c('filter.findBtn')}
            </button>
          </div>
        </form>
        {findText.trim().length >= 2 && !found.length ? <p className="a2-xs a2-mute a2-mt12">{c('filter.none')}</p> : null}
        {found.map((p) => (
          <div key={p.id} className="a2-rule" data-testid="ar-found">
            <span>{nameOf(p)}</span>
            <span />
            <Link className="a2-btn" href={keep({ product: p.id, from: q.from, to: q.to })} data-testid="ar-found-pick">
              {c('filter.pick')}
            </Link>
          </div>
        ))}
      </section>

      <p className="a2-xs a2-mute a2-mt12">
        {c('period', { from: dayText(q.from), to: dayText(q.to) })}
        {r.category ? ` · ${nameOf(r.category)}` : ''}
        {r.product ? ` · ${nameOf(r.product)}` : ''}
      </p>
      <div className="a2-kpis k3 a2-mt12" data-testid="ar-kpis">
        {kpis.map((k) => (
          <div key={k.key} className="a2-kpi" data-testid={`ar-kpi-${k.key}`}>
            <span className="a2-xs a2-mute">{c(`kpi.${k.key}`)}</span>
            <b className="a2-kv">{k.value}</b>
            {k.sub ? <span className="a2-xs a2-mute">{k.sub}</span> : null}
          </div>
        ))}
      </div>

      <section className="a2-card a2-mt12" aria-labelledby="ar-map" data-testid="ar-map">
        <h2 className="a2-h3" id="ar-map">
          {c('map.title')}
        </h2>
        <p className="a2-cs">{c('map.sub')}</p>
        <AreaMap
          rows={s.rows}
          none={c('map.none')}
          label={(x) => c('map.label', { name: x.parentNameEn ? `${nameOf(x)}, ${bnLang && x.parentNameBn ? x.parentNameBn : x.parentNameEn}` : nameOf(x), sales: m(x.salesMinor), pct: rateText(x) })}
        />
      </section>

      <section className="a2-card a2-mt12" aria-labelledby="ar-table" data-testid="ar-table">
        <h2 className="a2-h3" id="ar-table">
          {c('table.title')}
        </h2>
        <p className="a2-cs">{c('table.sub')}</p>
        {cut ? <p className="a2-xs a2-mute">{c('table.cut', { n: limits.maxDayRows })}</p> : null}
        {s.rows.length || extraRows.length ? null : <p className="a2-xs a2-mute">{c('table.empty')}</p>}
        {s.rows.slice(0, limits.maxDayRows).map((x) => (
          <div key={x.areaId} className="a2-rule" data-testid="ar-row">
            <span>
              <b>{x.parentNameEn ? `${nameOf(x)}, ${bnLang && x.parentNameBn ? x.parentNameBn : x.parentNameEn}` : nameOf(x)}</b>
              <span className="a2-xs a2-mute cl-sub">{c('table.line', { n: x.delivered, pieces: x.pieces, ret: x.returned })}</span>
            </span>
            <span className={`a2-xs${x.returnRate !== null && x.returnRate > (s.total.returnRate ?? 1) ? ' bk-warn' : ' a2-mute'}`}>{rateText(x)}</span>
            <b>{m(x.salesMinor)}</b>
          </div>
        ))}
        {extraRows.map((x) => (
          <div key={x.key} className="a2-rule" data-testid={`ar-${x.key}`}>
            <span>
              {x.label}
              <span className="a2-xs a2-mute cl-sub">
                {x.how} {c('table.line', { n: x.f.delivered, pieces: x.f.pieces, ret: x.f.returned })}
              </span>
            </span>
            <span className="a2-xs a2-mute">{rateText(x.f)}</span>
            <b>{m(x.f.salesMinor)}</b>
          </div>
        ))}
        {s.rows.length ? (
          <div className="a2-rule" data-testid="ar-total">
            <span>
              <b>{c('table.total')}</b>
            </span>
            <span className="a2-xs a2-mute">{rateText(s.total)}</span>
            <b>{m(s.total.salesMinor)}</b>
          </div>
        ) : null}
        <p className="a2-xs a2-mute a2-mt12">{c('how')}</p>
      </section>
    </div>
  );
}
