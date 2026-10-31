// S06 · PR 164 — Reports › Fraud & RTO at /admin/reports/fraud (register PR 164; CN-014 idea 8, the RTO cost book;
// CN-017 SIM-F-027): for a period (`?from=&to=`, shop days; without them the owner's last `risk.report.days` days) what
// the risk steps caught and what became of it, what was wrong (caught, yet delivered) and what was missed (refused, never
// caught), the cost the stopped orders probably saved (an estimate, marked so), and what refused parcels really cost in
// taka by district, campaign, product, courier and reason — real parcels only, a missing cost named. The report's own
// card (days, size) sits at the bottom. Seeing needs `risk.report`; the card `settings.write`. The page only reads.
// Words: messages/admin-fraud.*.json (`frd.*`); model: lib/admin-reports/fraud-view.ts.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { daysPeriod, lastDays, ymdIn } from '@extas/metrics';
import * as sh from '@extas/shipping';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { formatMoney, formatNumber, moneyOf } from '@/components/admin/products/model';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { reportCard } from '@/lib/admin-reports/fraud-api';
import { fraudScreen } from '@/lib/admin-reports/fraud-view';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { shippingDeps } from '@/lib/shipping-api';
import bn from '../../../../../messages/admin-fraud.bn.json';
import en from '../../../../../messages/admin-fraud.en.json';
import '../../settings-cards.css';
import './fraud.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/reports/fraud';
const API = '/api/admin/risk/report';
const KEY = 'reportsFraud';
const YMD = /^\d{4}-\d{2}-\d{2}$/;

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || null;

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'frd.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function FraudReportPage({ searchParams }: { searchParams: Search }) {
  const deps = adminDeps();
  const [plain, sp, access] = await Promise.all([adminView(deps), searchParams, pageAccess('risk.report', deps, MOTHER_STORE_ID)]);
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
  const at = { storeId: MOTHER_STORE_ID };
  const [card, reasons, currency] = await Promise.all([reportCard(access.deps, MOTHER_STORE_ID), access.deps.resolver.value('orders.refusal.reasons', at), access.deps.resolver.value('store.currency', at)]);
  const tz = view.timeZone;
  const now = access.deps.now?.() ?? new Date();
  const today = ymdIn(now, tz);
  // the shop days asked for; a day after today is today, an end before the start falls back to the default days
  const wantFrom = one(sp.from);
  const wantTo = one(sp.to);
  const fallback = lastDays(card.value.days, now, tz);
  const asked = wantFrom && YMD.test(wantFrom) ? { from: wantFrom, to: wantTo && YMD.test(wantTo) && wantTo < today ? wantTo : today } : null;
  const bad = !!asked && asked.to < asked.from;
  const days = asked && !bad ? { from: asked.from, to: asked.to, period: daysPeriod(asked.from, asked.to, tz) } : fallback;

  const who: sh.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const report = await sh.fraudReport(await shippingDeps(access.deps), who, { from: days.period.from.toISOString(), to: days.period.to.toISOString() });
  const money = moneyOf(currency, view.locale);
  const pct = new Intl.NumberFormat(view.locale, { style: 'percent', maximumFractionDigits: 0, numberingSystem: 'latn' });
  const w = (k: string, vars?: Record<string, string | number>) => t(d, `frd.${k}`, vars);
  const lang = view.lang === 'bn' ? 'bn' : 'en';
  const screen = fraudScreen(report, {
    w,
    money: (m) => formatMoney(m, money),
    num: (n) => formatNumber(n, view.locale),
    pct: (x) => pct.format(x),
    reason: (key) => reasons.find((r) => r.key === key)?.[lang] ?? key,
    lang,
  });
  const dayFmt = new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeZone: 'UTC', numberingSystem: 'latn' });
  const day = (ymd: string) => dayFmt.format(new Date(`${ymd}T00:00:00Z`));
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
    pairHelp: w('pairHelp'),
    err: Object.fromEntries(['STALE', 'INVALID_INPUT', 'FORBIDDEN', 'forbidden', 'unauthorized', 'network', 'other'].map((c) => [c, w(`err.${c}`)])),
  };
  const fields: FieldsCardField[] = [
    { kind: 'number', path: 'days', label: w('card.days'), help: w('card.daysHelp'), min: 1, max: 366 },
    { kind: 'number', path: 'maxRows', label: w('card.maxRows'), help: w('card.maxRowsHelp'), min: 100, max: 20_000 },
  ];

  return (
    <div className="a2-z" data-testid="fraud-page">
      <PageHead view={view} place={locateKey(KEY)} title={w('title')} sub={w('sub')} />
      <SectionTabs view={view} current={KEY} />

      <form className="a2-fbar fr-period" action={HERE} method="get" data-testid="fraud-period">
        <label className="fr-day">
          <span>{w('period.from')}</span>
          <input className="a2-inp" type="date" name="from" defaultValue={days.from} max={today} required />
        </label>
        <label className="fr-day">
          <span>{w('period.to')}</span>
          <input className="a2-inp" type="date" name="to" defaultValue={days.to} max={today} />
        </label>
        <button type="submit" className="a2-btn pri">
          {w('period.go')}
        </button>
      </form>
      <p className="a2-cs fr-showing" data-testid="fraud-showing">
        {w('period.showing', { from: day(days.from), to: day(days.to) })}
      </p>
      {bad ? (
        <div className="a2-note warn" role="note" data-testid="fraud-bad-period">
          <ShellIcon name="alert" size={15} />
          <span>{w('period.bad', { days: formatNumber(card.value.days, view.locale) })}</span>
        </div>
      ) : null}
      {screen.notes.map((n) => (
        <div key={n} className="a2-note warn" role="note" data-testid="fraud-cut">
          <ShellIcon name="alert" size={15} />
          <span>{n}</span>
        </div>
      ))}

      <div className="a2-kpis a2-mt12" data-testid="fraud-kpis">
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

      <section className="a2-card" aria-labelledby="fr-caught-h" data-testid="fraud-caught">
        <div className="a2-ch">
          <div>
            <h2 className="a2-h3" id="fr-caught-h">
              {w('caught.h')}
            </h2>
            <div className="a2-cs">{w('caught.d')}</div>
          </div>
        </div>
        <div className="fr-tw">
          <table className="a2-tbl fr-tbl">
            <thead>
              <tr>
                {screen.caughtCols.map((c, i) => (
                  <th key={c} scope="col" className={i ? 'fr-n' : undefined}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {screen.caught.map((r) => (
                <tr key={r.id} data-catch={r.id} className={r.total ? 'fr-total' : undefined}>
                  <th scope="row">{r.label}</th>
                  {r.cells.map((c, i) => (
                    <td key={i} className="fr-n a2-num" data-l={screen.caughtCols[i + 1]}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {screen.advancePaid ? <p className="a2-cs a2-mt12">{screen.advancePaid}</p> : null}
        <div className="a2-note">
          <ShellIcon name="info" size={15} />
          <span>{w('caughtNote')}</span>
        </div>
      </section>

      <section className="a2-card a2-mt12" aria-labelledby="fr-rto-h" data-testid="fraud-rto">
        <div className="a2-ch">
          <div>
            <h2 className="a2-h3" id="fr-rto-h">
              {w('rto.h')}
            </h2>
            <div className="a2-cs">{w('rto.d')}</div>
          </div>
          <div className="fr-sum" data-testid="fraud-rto-total">
            <b className="a2-num">{screen.rto.total}</b>
            <span className="a2-cs">{screen.rto.foot}</span>
          </div>
        </div>
        {screen.rto.floor ? (
          <div className="a2-note warn" role="note" data-testid="fraud-rto-floor">
            <ShellIcon name="alert" size={15} />
            <span>{screen.rto.floor}</span>
          </div>
        ) : null}
        {report.rto.real.parcels ? (
          <div className="fr-groups a2-mt12">
            {screen.rto.groups.map((g) => (
              <div key={g.id} className="fr-group" data-group={g.id}>
                <h3 className="fr-gh">{g.title}</h3>
                <div className="fr-tw">
                  <table className="a2-tbl fr-tbl">
                    <thead>
                      <tr>
                        {screen.rto.cols.map((c, i) => (
                          <th key={c} scope="col" className={i ? 'fr-n' : undefined}>
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {g.rows.map((r, i) => (
                        <tr key={`${r.name}-${i}`} className={r.unknown ? 'fr-unknown' : undefined}>
                          <th scope="row">
                            {r.name}
                            {r.incomplete ? <span className="fr-inc">{` · ${w('rto.incomplete')}`}</span> : null}
                          </th>
                          <td className="fr-n a2-num" data-l={screen.rto.cols[1]}>
                            {r.parcels}
                          </td>
                          <td className="fr-n a2-num" data-l={screen.rto.cols[2]}>
                            {r.cost}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="a2-sm a2-mute a2-mt12" data-testid="fraud-rto-empty">
            {w('rto.empty')}
          </div>
        )}
        <div className="a2-note">
          <ShellIcon name="info" size={15} />
          <span>{w('rto.productNote')}</span>
        </div>
      </section>

      <div className="a2-note a2-mt12" role="note">
        <ShellIcon name="info" size={15} />
        <span>{w('estimateNote')}</span>
      </div>

      <div className="a2-mt12">
        <FieldsCard url={API} screen={{ key: card.key, value: card.value, version: card.version }} fields={fields} texts={texts} canEdit={canEdit} testId="fraud-settings" />
      </div>
    </div>
  );
}
