// S16 · PR 346 — Money → Month-end at /admin/money/month-end (B3.9; BACKEND-ARCHITECTURE §5 MNY-05): the month-end
// close sheet, read-only — the total per service, what the ERP has (each day's summary and the month's fixed costs),
// what is still not posted, the month's differences and its close. `?month=YYYY-MM` (default this month). Sending,
// closing and fixing stay on Money → Books. Seeing it needs `books.read`. Words: messages/admin-month-end.*.json.
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
import { t, type Dict } from '@/lib/i18n';
import { monthSheet } from '@/lib/month-sheet';
import bn from '../../../../../messages/admin-month-end.bn.json';
import en from '../../../../../messages/admin-month-end.en.json';
import ledgerBn from '../../../../../messages/admin-cost-ledger.bn.json';
import ledgerEn from '../../../../../messages/admin-cost-ledger.en.json';
import '../money.css';

export const dynamic = 'force-dynamic';

const KEY = 'moneyMonthEnd';
const HERE = '/admin/money/month-end';
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

function withScreen(view: AdminView): AdminView {
  const b = view.lang === 'bn';
  return { ...view, dict: { ...view.dict, moneyMonthEnd: (b ? bn : en).moneyMonthEnd as unknown as Dict, moneyCostLedger: (b ? ledgerBn : ledgerEn).moneyCostLedger as unknown as Dict } };
}

const shift = (month: string, by: number) => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
};

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'moneyMonthEnd.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function MonthEndPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
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
  const c = (k: string, vars?: Record<string, string | number>) => t(d, `moneyMonthEnd.${k}`, vars);
  const svc = (s: string) => {
    const k = `moneyCostLedger.service.${s}`;
    const v = t(d, k);
    return v === k ? s : v;
  };
  const at = { storeId: MOTHER_STORE_ID };
  const [currency, timeZone] = await Promise.all([access.deps.resolver.value('store.currency', at), access.deps.resolver.value('store.timeZone', at)]);
  const today = ymdIn(new Date(), timeZone);
  const thisMonth = today.slice(0, 7);
  const month = sp.month && MONTH.test(sp.month) && sp.month <= thisMonth ? sp.month : thisMonth;
  const s = await monthSheet(access.deps.db, MOTHER_STORE_ID, month, timeZone, today);
  const money = moneyOf(currency, view.locale);
  const m = (minor: number) => formatMoney(minor, money);
  const monthText = new Intl.DateTimeFormat(view.locale, { month: 'long', year: 'numeric', timeZone: 'UTC', numberingSystem: 'latn' }).format(new Date(`${month}-01T00:00:00Z`));
  const dayText = (day: string) => new Intl.DateTimeFormat(view.locale, { day: 'numeric', month: 'short', timeZone: 'UTC', numberingSystem: 'latn' }).format(new Date(`${day}T00:00:00Z`));
  const tone = (ok: boolean) => (ok ? 'ok' : 'warn');

  return (
    <div className="a2-z" data-testid="month-end" data-month={month} data-linked={s.linked ? 'yes' : 'no'}>
      <PageHead view={view} place={locateKey(KEY)} title={c('title')} sub={c('sub')} />
      <SectionTabs view={view} current={KEY} />
      <div className="ct-actions a2-mt12">
        <Link className="a2-btn" href={`${HERE}?month=${shift(month, -1)}`} data-testid="me-prev">
          {c('prev')}
        </Link>
        <b className="me-month">{monthText}</b>
        {month < thisMonth ? (
          <Link className="a2-btn" href={`${HERE}?month=${shift(month, 1)}`} data-testid="me-next">
            {c('next')}
          </Link>
        ) : null}
      </div>

      <section className="a2-card a2-mt12" aria-labelledby="me-svc" data-testid="me-services">
        <div className="a2-ch">
          <div>
            <h2 className="a2-h3" id="me-svc">
              {c('services.title')}
            </h2>
            <div className="a2-cs">{c('services.sub')}</div>
          </div>
          <span className="a2-pill">{m(s.totals.minor)}</span>
        </div>
        {s.services.length ? (
          s.services.map((x) => (
            <div key={`${x.service}|${x.toErp}`} className="a2-rule" data-testid="me-service">
              <span>{svc(x.service)}</span>
              <span className="a2-xs a2-mute">{x.toErp ? c('services.toErp') : c('services.shopOnly')}</span>
              <b>{m(x.minor)}</b>
            </div>
          ))
        ) : (
          <p className="a2-xs a2-mute">{c('services.none')}</p>
        )}
        <p className="a2-xs a2-mute a2-mt12">{c('services.split', { erp: m(s.totals.toErpMinor), shop: m(s.totals.shopOnlyMinor) })}</p>
      </section>

      {!s.linked ? (
        <p className="a2-xs bk-warn a2-mt12">{c('notLinked')}</p>
      ) : (
        <>
          <section className="a2-card a2-mt12" aria-labelledby="me-erp" data-testid="me-erp">
            <h2 className="a2-h3" id="me-erp">
              {c('erp.title')}
            </h2>
            <p className="a2-cs">{c('erp.sub')}</p>
            <div className="a2-rule" data-testid="me-days">
              <span>{c('erp.days')}</span>
              <span className="a2-xs a2-mute">{c('erp.daysParts', { waiting: s.days.waiting, refused: s.days.refused, none: s.days.none })}</span>
              <b className={`a2-pill ${tone(s.days.accepted === s.days.total)}`}>{c('erp.daysOf', { n: s.days.accepted, of: s.days.total })}</b>
            </div>
            <div className="a2-rule" data-testid="me-fixed" data-state={s.fixedCosts}>
              <span>{c('erp.fixed')}</span>
              <span />
              <b className={`a2-pill ${tone(s.fixedCosts === 'ACCEPTED')}`}>{c(`send.${s.fixedCosts}`)}</b>
            </div>
            {s.days.notPosted.length ? (
              <p className="a2-xs a2-mt12" data-testid="me-not-posted">
                {c('erp.notPosted', { days: s.days.notPosted.map(dayText).join(', ') })}
              </p>
            ) : (
              <p className="a2-xs a2-mute a2-mt12">{c('erp.allPosted')}</p>
            )}
            <p className="a2-xs a2-mute">
              <Link href="/admin/money/books/daily" className="bk-act">
                {c('erp.link')}
              </Link>
            </p>
          </section>

          <section className="a2-card a2-mt12" aria-labelledby="me-close" data-testid="me-close" data-state={s.close.state}>
            <h2 className="a2-h3" id="me-close">
              {c('close.title')}
            </h2>
            <div className="a2-rule">
              <span>{c('close.differences')}</span>
              <span className="a2-xs a2-mute">{c('close.diffParts', { fixed: s.differences.fixed, overridden: s.differences.overridden })}</span>
              <b className={`a2-pill ${tone(s.differences.open === 0)}`}>{c('close.open', { n: s.differences.open })}</b>
            </div>
            <div className="a2-rule">
              <span>{c('close.month')}</span>
              <span className="a2-xs a2-mute">{s.close.override ? c('close.override') : ''}</span>
              <b className={`a2-pill ${tone(s.close.state === 'CLOSED')}`}>{c(`close.state.${s.close.state}`)}</b>
            </div>
            <p className="a2-xs a2-mute a2-mt12">
              <Link href="/admin/money/books/differences" className="bk-act">
                {c('close.diffLink')}
              </Link>
              {' · '}
              <Link href="/admin/money/books/closes" className="bk-act">
                {c('close.closeLink')}
              </Link>
            </p>
          </section>
        </>
      )}
    </div>
  );
}
