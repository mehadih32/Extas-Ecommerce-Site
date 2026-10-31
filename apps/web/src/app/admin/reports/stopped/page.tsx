// S06 · PR 524 — Reports › Stopped by the engine at /admin/reports/stopped (register PR 524, false-positive protection: "a
// weekly report lists everything the engine stopped so a wrong rule is caught within days, not months"). For the last
// `risk.stopReport.days` days (a week as shipped): the four figures, the table per rule (stops, how they ended, the wrong
// rate, flagged at the owner's share), and every stop with its order, rule, what fired, how sure and what became of it.
// The report's own card (days, the warning share, the fewest stops, the most rows) sits at the bottom. Seeing needs
// `risk.report`; the card `settings.write`. The page only reads. Words: messages/admin-stopped.*.json (`stp.*`); model:
// lib/admin-reports/stop-view.ts.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as od from '@extas/orders';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { readDeps } from '@/components/admin/orders/OrderListPage';
import { formatNumber } from '@/components/admin/products/model';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { stopReportCard } from '@/lib/admin-reports/stop-report-api';
import { stopScreen } from '@/lib/admin-reports/stop-view';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../messages/admin-stopped.bn.json';
import en from '../../../../../messages/admin-stopped.en.json';
import '../../settings-cards.css';
import '../fraud/fraud.css';
import './stopped.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/reports/stopped';
const API = '/api/admin/risk/stopped';
const KEY = 'reportsStopped';
const RULES = '/admin/orders/risk-rules';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'stp.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function StoppedReportPage() {
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
  const [report, card, bands] = await Promise.all([od.stopReport(readDeps(access.deps), who), stopReportCard(access.deps, MOTHER_STORE_ID), access.deps.resolver.value('risk.bands', { storeId: MOTHER_STORE_ID })]);
  const lang = view.lang === 'bn' ? 'bn' : 'en';
  const pct = new Intl.NumberFormat(view.locale, { style: 'percent', maximumFractionDigits: 0, numberingSystem: 'latn' });
  const at = new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: view.timeZone, numberingSystem: 'latn' });
  const day = new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeZone: view.timeZone, numberingSystem: 'latn' });
  const w = (k: string, vars?: Record<string, string | number>) => t(d, `stp.${k}`, vars);
  const screen = stopScreen(report, {
    w,
    num: (n) => formatNumber(n, view.locale),
    pct: (x) => pct.format(x),
    when: (iso) => at.format(new Date(iso)),
    band: (key) => bands.find((b) => b.key === key)?.[lang] ?? key,
    dupRule: (letter) => {
      const k = `orders.alert.rule.${letter}`;
      const v = t(d, k);
      return v === k ? null : v;
    },
  });
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
    { kind: 'number', path: 'days', label: w('card.days'), help: w('card.daysHelp'), min: 1, max: 92 },
    { kind: 'number', path: 'warnWrongPercent', label: w('card.warn'), help: w('card.warnHelp'), min: 1, max: 100 },
    { kind: 'number', path: 'minStops', label: w('card.minStops'), help: w('card.minStopsHelp'), min: 1, max: 1000 },
    { kind: 'number', path: 'maxRows', label: w('card.maxRows'), help: w('card.maxRowsHelp'), min: 10, max: 5000 },
  ];

  return (
    <div className="a2-z" data-testid="stopped-page">
      <PageHead view={view} place={locateKey(KEY)} title={w('title')} sub={w('sub')} />
      <SectionTabs view={view} current={KEY} />
      <p className="a2-cs fr-showing" data-testid="stopped-showing">
        {w('showing', { from: day.format(new Date(report.from)), to: day.format(new Date(report.to)), days: formatNumber(report.days, view.locale) })}
      </p>
      {screen.notes.map((n) => (
        <div key={n} className="a2-note warn" role="note" data-testid="stopped-cut">
          <ShellIcon name="alert" size={15} />
          <span>{n}</span>
        </div>
      ))}

      <div className="a2-kpis a2-mt12" data-testid="stopped-kpis">
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

      <section className="a2-card" aria-labelledby="stp-rules-h" data-testid="stopped-rules">
        <div className="a2-ch">
          <div>
            <h2 className="a2-h3" id="stp-rules-h">
              {w('rules.h')}
            </h2>
            <div className="a2-cs">{w('rules.d')}</div>
          </div>
        </div>
        <div className="fr-tw">
          <table className="a2-tbl fr-tbl">
            <thead>
              <tr>
                {screen.ruleCols.map((c, i) => (
                  <th key={c} scope="col" className={i ? 'fr-n' : undefined}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {screen.rules.map((r) => (
                <tr key={r.id} data-rule={r.id} className={r.flagged ? 'stp-flagged' : undefined}>
                  <th scope="row">
                    {r.label}
                    {r.flagged ? (
                      <span className="a2-pill warn stp-flag" data-testid="stopped-flag">
                        <ShellIcon name="alert" size={12} />
                        {screen.flagWord}
                      </span>
                    ) : null}
                  </th>
                  {r.cells.map((c, i) => (
                    <td key={i} className="fr-n a2-num" data-l={screen.ruleCols[i + 1]}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="a2-card a2-mt12" aria-labelledby="stp-list-h" data-testid="stopped-list">
        <div className="a2-ch">
          <div>
            <h2 className="a2-h3" id="stp-list-h">
              {w('list.h')}
            </h2>
            <div className="a2-cs">{w('list.d')}</div>
          </div>
        </div>
        {screen.list.length ? (
          <div className="fr-tw">
            <table className="a2-tbl fr-tbl stp-list">
              <thead>
                <tr>
                  {screen.listCols.map((c) => (
                    <th key={c} scope="col">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {screen.list.map((r) => (
                  <tr key={r.key}>
                    <th scope="row">
                      <Link href={r.href} className="stp-order">
                        {r.number}
                      </Link>
                    </th>
                    <td data-l={screen.listCols[1]}>{r.rule}</td>
                    <td data-l={screen.listCols[2]}>{r.why}</td>
                    <td className="a2-num" data-l={screen.listCols[3]}>
                      {r.sure}
                    </td>
                    <td data-l={screen.listCols[4]}>{r.when}</td>
                    <td data-l={screen.listCols[5]}>
                      <span className={`a2-pill ${r.tone}`}>{r.outcome}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="a2-sm a2-mute" data-testid="stopped-empty">
            {w('list.empty')}
          </div>
        )}
      </section>

      <div className="a2-note a2-mt12" role="note">
        <ShellIcon name="info" size={15} />
        <span>
          {w('note')}{' '}
          <Link href={RULES} className="stp-link">
            {w('rulesLink')}
          </Link>
        </span>
      </div>

      <div className="a2-mt12">
        <FieldsCard url={API} screen={{ key: card.key, value: card.value, version: card.version }} fields={fields} texts={texts} canEdit={canEdit} testId="stopped-settings" />
      </div>
    </div>
  );
}
