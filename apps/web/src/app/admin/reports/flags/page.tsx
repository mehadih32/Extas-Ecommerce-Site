// S06 · PR 562 — Reports › Flag outcomes at /admin/reports/flags (register PR 562, the flag outcome report: "of the
// customers flagged: how many paid the advance, how many abandoned. This is the number that tunes the parameter";
// SIM-F-016 its acceptance test). For the last `risk.flagReport.days` days (30 as shipped): the four figures, the layers
// losing customers (only once the owner sets a share), the table per checkout layer (paid, still waiting, left the
// checkout, cancelled unpaid, ordered without the ask, sent on without it, what the paid ones became, the advance
// collected) and the table per way the advance was asked after ordering. Off as shipped: the page says so and the card
// turns it on. Seeing needs `risk.report`; the card `settings.write`. The page only reads and points out.
// Words: messages/admin-flags.*.json (`flg.*`); model: lib/admin-reports/flag-view.ts.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as od from '@extas/orders';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { readDeps } from '@/components/admin/orders/OrderListPage';
import { formatMoney, formatNumber, moneyOf } from '@/components/admin/products/model';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { flagReportCard } from '@/lib/admin-reports/flag-report-api';
import { flagScreen, type FlagTable } from '@/lib/admin-reports/flag-view';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../messages/admin-flags.bn.json';
import en from '../../../../../messages/admin-flags.en.json';
import '../../settings-cards.css';
import '../fraud/fraud.css';
import '../learning/learning.css';
import './flags.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/reports/flags';
const API = '/api/admin/risk/flag-report';
const KEY = 'reportsFlags';
const LAYERS = '/admin/orders/risk-rules/checkout';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'flg.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

/** One of the two tables (the first column names the row; a row pointed out carries its tag). */
function Table({ id, table, empty, tag }: { id: string; table: FlagTable; empty: string; tag: string }) {
  if (!table.rows.length) return <div className="a2-sm a2-mute">{empty}</div>;
  return (
    <div className="fr-tw">
      <table className="a2-tbl fr-tbl flg-tbl" data-testid={`flags-${id}-table`}>
        <thead>
          <tr>
            {table.cols.map((c, i) => (
              <th key={c} scope="col" className={i ? 'fr-n' : undefined}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r) => (
            <tr key={r.key} data-row={r.key} data-warn={r.warn ? 'yes' : undefined}>
              <th scope="row">
                {r.label}
                {r.warn ? <span className="a2-pill warn flg-tag">{tag}</span> : null}
              </th>
              {r.cells.map((c, i) => (
                <td key={i} className="fr-n a2-num" data-l={table.cols[i + 1]}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function FlagOutcomesPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('risk.report', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="risk.report" />
      </div>
    );
  const who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const [report, card, currency] = await Promise.all([od.flagReport(readDeps(access.deps), who), flagReportCard(access.deps, MOTHER_STORE_ID), access.deps.resolver.value('store.currency', { storeId: MOTHER_STORE_ID })]);
  const pct = new Intl.NumberFormat(view.locale, { style: 'percent', maximumFractionDigits: 0, numberingSystem: 'latn' });
  const day = new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeZone: view.timeZone, numberingSystem: 'latn' });
  const money = moneyOf(currency, view.locale);
  const w = (k: string, vars?: Record<string, string | number>) => t(d, `flg.${k}`, vars);
  const screen = flagScreen(report, { w, num: (n) => formatNumber(n, view.locale), pct: (x) => pct.format(x), money: (m) => formatMoney(m, money) });
  const canEdit = access.guard.permissions?.has('settings.write') ?? false;

  const texts: FieldsCardTexts = {
    h: w('card.h'),
    d: w('card.d'),
    save: w('save'),
    saving: w('saving'),
    saved: w('saved'),
    discard: w('discard'),
    unsaved: w('unsaved'),
    readOnly: w('readOnly'),
    pairHelp: '',
    err: Object.fromEntries(['STALE', 'INVALID_INPUT', 'FORBIDDEN', 'forbidden', 'unauthorized', 'network', 'other'].map((c) => [c, w(`err.${c}`)])),
  };
  const fields: FieldsCardField[] = [
    { kind: 'switch', path: 'enabled', label: w('card.enabled') },
    { kind: 'number', path: 'days', label: w('card.days'), help: w('card.daysHelp'), min: 7, max: 366 },
    { kind: 'number', path: 'warnLeftPercent', label: w('card.warnLeftPercent'), help: w('card.warnLeftPercentHelp'), min: 1, max: 100 },
    { kind: 'number', path: 'minFlags', label: w('card.minFlags'), help: w('card.minFlagsHelp'), min: 1, max: 1000 },
    { kind: 'number', path: 'maxRows', label: w('card.maxRows'), help: w('card.maxRowsHelp'), min: 100, max: 20_000 },
  ];

  return (
    <div className="a2-z" data-testid="flags-page">
      <PageHead view={view} place={locateKey(KEY)} title={w('title')} sub={w('sub')} />
      <SectionTabs view={view} current={KEY} />
      <p className="a2-cs fr-showing" data-testid="flags-showing">
        {w('showing', { from: day.format(new Date(report.from)), to: day.format(new Date(report.to)), days: formatNumber(report.days, view.locale) })}
      </p>
      {screen.notes.map((n) => (
        <div key={n} className="a2-note warn" role="note" data-testid="flags-note">
          <ShellIcon name="alert" size={15} />
          <span>{n}</span>
        </div>
      ))}

      <div className="a2-kpis a2-mt12" data-testid="flags-kpis">
        {screen.kpis.map((k) => (
          <div key={k.id} className="a2-card a2-kpi" data-kpi={k.id}>
            <div className="a2-kl">{k.label}</div>
            <div className="a2-kv">{k.value}</div>
            <div className="a2-kf">
              <span className="a2-kn">{k.foot}</span>
            </div>
          </div>
        ))}
      </div>

      <section className="a2-card" aria-labelledby="flg-point-h" data-testid="flags-pointers">
        <div className="a2-ch">
          <div>
            <h2 className="a2-h3" id="flg-point-h">
              {w('point.h')}
            </h2>
            <div className="a2-cs">{screen.pointNote}</div>
          </div>
        </div>
        {screen.pointers.length ? (
          <ul className="lrn-sug">
            {screen.pointers.map((p) => (
              <li key={p.key} className="a2-note warn" data-row={p.key}>
                <ShellIcon name="alert" size={15} />
                <span>{p.text}</span>
              </li>
            ))}
          </ul>
        ) : report.warnLeftPercent !== null ? (
          <div className="a2-sm a2-mute">{w('point.none')}</div>
        ) : null}
      </section>

      <section className="a2-card a2-mt12" aria-labelledby="flg-co-h" data-testid="flags-checkout">
        <div className="a2-ch">
          <div>
            <h2 className="a2-h3" id="flg-co-h">
              {w('checkout.h')}
            </h2>
            <div className="a2-cs">{w('checkout.d')}</div>
          </div>
        </div>
        <Table id="checkout" table={screen.checkout} empty={w('empty')} tag={w('warnTag')} />
      </section>

      <section className="a2-card a2-mt12" aria-labelledby="flg-or-h" data-testid="flags-order">
        <div className="a2-ch">
          <div>
            <h2 className="a2-h3" id="flg-or-h">
              {w('order.h')}
            </h2>
            <div className="a2-cs">{w('order.d')}</div>
          </div>
        </div>
        <Table id="order" table={screen.order} empty={w('empty')} tag={w('warnTag')} />
      </section>

      <div className="a2-note a2-mt12" role="note">
        <ShellIcon name="info" size={15} />
        <span>
          {w('note')}{' '}
          <Link href={LAYERS} className="lrn-link">
            {w('layersLink')}
          </Link>
        </span>
      </div>

      <div className="a2-mt12">
        <FieldsCard url={API} screen={{ key: card.key, value: card.value, version: card.version }} fields={fields} texts={texts} canEdit={canEdit} testId="flags-settings" />
      </div>
    </div>
  );
}
