// S16 · PR 347 — Money → Cost ledger → Costs report at /admin/money/cost-ledger/report (B3.9 "a Costs section the
// owner asked for separately: by day, month and year; by service; by module; one click to any period; export. It shows
// spend against the AI caps"). `?period=` (one press: today, week, month, lastMonth, year, lastYear) or `?from=&to=`,
// `by=day|month|year`, `group=service|module`; the period is made safe by `costs.report` (lib/cost-report.ts). The
// table and every row download as CSV (`/api/admin/money/cost-ledger/report`, `/api/admin/money/cost-ledger`).
// Seeing it needs `books.read`. Read-only: nothing here pays or moves money. Words: messages/admin-cost-report.*.json.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { ymdIn } from '@extas/metrics';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { formatMoney, moneyOf } from '@/components/admin/products/model';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { aiAgainstCap, costReport, NO_MODULE, parseReportQuery, QUICK_PERIODS, quickPeriod, REPORT_BY, REPORT_GROUP, type ReportQuery } from '@/lib/cost-report';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../../messages/admin-cost-report.bn.json';
import en from '../../../../../../messages/admin-cost-report.en.json';
import ledgerBn from '../../../../../../messages/admin-cost-ledger.bn.json';
import ledgerEn from '../../../../../../messages/admin-cost-ledger.en.json';
import '../../money.css';

export const dynamic = 'force-dynamic';

const KEY = 'moneyCostReport';
const HERE = '/admin/money/cost-ledger/report';

function withScreen(view: AdminView): AdminView {
  const b = view.lang === 'bn';
  return { ...view, dict: { ...view.dict, moneyCostReport: (b ? bn : en).moneyCostReport as unknown as Dict, moneyCostLedger: (b ? ledgerBn : ledgerEn).moneyCostLedger as unknown as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'moneyCostReport.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

const qs = (q: ReportQuery) => new URLSearchParams({ from: q.from, to: q.to, by: q.by, group: q.group }).toString();

export default async function CostReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
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
  const c = (k: string, vars?: Record<string, string | number>) => t(d, `moneyCostReport.${k}`, vars);
  const svc = (s: string) => {
    const k = `moneyCostLedger.service.${s}`;
    const v = t(d, k);
    return v === k ? s : v;
  };
  const mod = (s: string) => {
    const k = `moneyCostReport.module.${s === NO_MODULE ? 'none' : s}`;
    const v = t(d, k);
    return v === k ? s : v;
  };
  const at = { storeId: MOTHER_STORE_ID };
  const [currency, timeZone, limits, cap] = await Promise.all([
    access.deps.resolver.value('store.currency', at),
    access.deps.resolver.value('store.timeZone', at),
    access.deps.resolver.value('costs.report', at),
    access.deps.resolver.value('ai.monthlyCapMinor', at),
  ]);
  const now = new Date();
  const today = ymdIn(now, timeZone);
  const { q, notes } = parseReportQuery(sp, today, limits);
  const [r, ai] = await Promise.all([costReport(access.deps.db, MOTHER_STORE_ID, q, timeZone), aiAgainstCap(access.deps.db, MOTHER_STORE_ID, timeZone, cap, now)]);
  const money = moneyOf(currency, view.locale);
  const m = (minor: number) => formatMoney(minor, money);
  const name = q.group === 'service' ? svc : mod;
  const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(view.locale, { ...o, timeZone: 'UTC', numberingSystem: 'latn' });
  const dayText = (day: string) => fmt({ day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${day}T00:00:00Z`));
  const bucketText = (b: string) => (b.length === 10 ? dayText(b) : b.length === 7 ? fmt({ month: 'long', year: 'numeric' }).format(new Date(`${b}-01T00:00:00Z`)) : b);
  // the period pressed, else the first one-press period that is exactly the chosen days
  const asked = QUICK_PERIODS.find((p) => p === sp.period);
  const current = asked ?? QUICK_PERIODS.find((p) => {
    const x = quickPeriod(p, today);
    return x.from === q.from && x.to === q.to;
  });

  return (
    <div className="a2-z" data-testid="cost-report" data-from={q.from} data-to={q.to} data-by={q.by} data-group={q.group}>
      <PageHead view={view} place={locateKey(KEY)} title={c('title')} sub={c('sub')} />
      <SectionTabs view={view} current={KEY} />

      <nav className="ct-actions a2-mt12" aria-label={c('quick.label')} data-testid="cr-quick">
        {QUICK_PERIODS.map((p) => (
          <Link key={p} className={`a2-btn${current === p ? ' pri' : ''}`} href={`${HERE}?period=${p}&by=${q.by === 'day' && (p === 'year' || p === 'lastYear') ? 'month' : q.by}&group=${q.group}`} aria-current={current === p ? 'true' : undefined} data-testid={`cr-quick-${p}`}>
            {c(`quick.${p}`)}
          </Link>
        ))}
      </nav>

      <form className="a2-card a2-mt12" action={HERE} method="get" aria-label={c('form.label')} data-testid="cr-form">
        <div className="ct-grid">
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor="cr-from">
              {c('form.from')}
            </label>
            <input id="cr-from" name="from" type="date" className="a2-inp" max={today} defaultValue={q.from} />
          </div>
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor="cr-to">
              {c('form.to')}
            </label>
            <input id="cr-to" name="to" type="date" className="a2-inp" max={today} defaultValue={q.to} />
          </div>
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor="cr-by">
              {c('form.by')}
            </label>
            <select id="cr-by" name="by" className="a2-sel" defaultValue={q.by}>
              {REPORT_BY.map((b) => (
                <option key={b} value={b}>
                  {c(`by.${b}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="a2-fld">
            <label className="a2-lbl" htmlFor="cr-group">
              {c('form.group')}
            </label>
            <select id="cr-group" name="group" className="a2-sel" defaultValue={q.group}>
              {REPORT_GROUP.map((g) => (
                <option key={g} value={g}>
                  {c(`group.${g}`)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="ct-actions a2-mt12">
          <button type="submit" className="a2-btn pri" data-testid="cr-show">
            {c('form.show')}
          </button>
        </div>
        {notes.map((n) => (
          <p key={n} className="a2-xs bk-warn a2-mt12" data-testid={`cr-note-${n}`}>
            {c(`note.${n}`, { days: limits.maxDays, rows: limits.maxDayRows })}
          </p>
        ))}
      </form>

      <section className="a2-card a2-mt12" aria-labelledby="cr-total" data-testid="cr-total">
        <div className="a2-ch">
          <div>
            <h2 className="a2-h3" id="cr-total">
              {c('total.title')}
            </h2>
            <div className="a2-cs">{c('total.sub', { from: dayText(q.from), to: dayText(q.to) })}</div>
          </div>
          <span className="a2-pill" data-testid="cr-total-amount">
            {m(r.total.minor)}
          </span>
        </div>
        <p className="a2-xs a2-mute">{c('total.rows', { n: r.total.count })}</p>
        <h3 className="a2-h3 a2-mt12">{c(`groups.${q.group}`)}</h3>
        {r.groups.length ? (
          r.groups.map((g) => (
            <div key={g.key} className="a2-rule" data-testid="cr-group">
              <span>{name(g.key)}</span>
              <span className="a2-xs a2-mute">{c('total.rows', { n: g.count })}</span>
              <b>{m(g.minor)}</b>
            </div>
          ))
        ) : (
          <p className="a2-xs a2-mute">{c('groups.none')}</p>
        )}
      </section>

      {r.buckets.length ? (
        <section className="a2-card a2-mt12" aria-labelledby="cr-buckets" data-testid="cr-buckets">
          <h2 className="a2-h3" id="cr-buckets">
            {c(`buckets.${q.by}`)}
          </h2>
          <p className="a2-cs">{c('buckets.sub')}</p>
          {r.buckets.map((b) => (
            <div key={b.bucket} className="a2-rule" data-testid="cr-bucket" data-bucket={b.bucket}>
              <span>
                <b>{bucketText(b.bucket)}</b>
                <span className="a2-xs a2-mute cl-sub">{b.parts.map((p) => `${name(p.key)} ${m(p.minor)}`).join(' · ')}</span>
              </span>
              <span className="a2-xs a2-mute">{c('total.rows', { n: b.count })}</span>
              <b>{m(b.minor)}</b>
            </div>
          ))}
        </section>
      ) : null}

      <section className="a2-card a2-mt12" aria-labelledby="cr-ai" data-testid="cr-ai" data-capped={ai.capMinor === null ? 'no' : 'yes'}>
        <h2 className="a2-h3" id="cr-ai">
          {c('ai.title')}
        </h2>
        <p className="a2-cs">{c('ai.sub')}</p>
        <div className="a2-rule">
          <span>{c('ai.spent')}</span>
          <span />
          <b>{m(ai.spentMinor)}</b>
        </div>
        <div className="a2-rule">
          <span>{c('ai.cap')}</span>
          <span className="a2-xs a2-mute">{ai.usedPct === null ? '' : c('ai.used', { pct: ai.usedPct })}</span>
          {ai.capMinor === null ? <b className="a2-pill">{c('ai.noCap')}</b> : <b className={`a2-pill ${ai.over ? 'warn' : 'ok'}`}>{ai.over ? c('ai.over') : m(ai.capMinor)}</b>}
        </div>
        {ai.capMinor === null ? <p className="a2-xs a2-mute a2-mt12">{c('ai.noCapHelp')}</p> : null}
      </section>

      <section className="a2-card a2-mt12" aria-labelledby="cr-export" data-testid="cr-export">
        <h2 className="a2-h3" id="cr-export">
          {c('export.title')}
        </h2>
        <p className="a2-cs">{c('export.sub')}</p>
        <div className="ct-actions a2-mt12">
          <a className="a2-btn" href={`/api/admin/money/cost-ledger/report?${qs(q)}`} download data-testid="cr-export-table">
            {c('export.table')}
          </a>
          <a className="a2-btn" href={`/api/admin/money/cost-ledger?from=${q.from}&to=${q.to}`} download data-testid="cr-export-rows">
            {c('export.rows')}
          </a>
        </div>
      </section>

      <p className="a2-xs a2-mt12">
        <Link href="/admin/money/cost-ledger" className="bk-act">
          {c('ledgerLink')}
        </Link>
      </p>
    </div>
  );
}
