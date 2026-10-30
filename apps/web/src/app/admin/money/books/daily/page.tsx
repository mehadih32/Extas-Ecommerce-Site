// CN-028 · PR 617 (CN-029 Phase 1) — Money → Daily summary at /admin/money/books/daily (docs/RETAIL-ERP-MODEL.md §3.4,
// §4, §5): the Books status card (PR 616's `booksStatus`, components/admin/money/BooksStatusCard.tsx: "not run yet"
// until the nightly match runs), the "Needs you now" rows about the summaries and fixed costs (`booksSummaryStatus`:
// refused, missing and incomplete days, a month without fixed costs, old unchecked returns, open differences and a
// broken tie), and the daily summaries the shop sent the ERP with how each was taken (accepted, waiting, trying again,
// refused). Before the store's switch-over to contract v6 the page says the books start then. Read-only: nothing here
// moves money. Needs `books.read`. Money → Books and its match, differences and closes pages are PR 615/616's.
// Words: messages/admin-books-daily.*.json (`booksDaily.*`).
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as inv from '@extas/inventory';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { BooksStatusCard } from '@/components/admin/money/BooksStatusCard';
import { formatMoney, formatNumber, moneyOf } from '@/components/admin/products/model';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { loadBooksStatus } from '@/lib/books-status-view';
import { inventoryDeps } from '@/lib/inventory-api';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../../messages/admin-books-daily.bn.json';
import en from '../../../../../../messages/admin-books-daily.en.json';
import '../../money.css';

export const dynamic = 'force-dynamic';

const KEY = 'booksDaily';
const HERE = '/admin/money/books/daily';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, booksDaily: (view.lang === 'bn' ? bn : en).booksDaily as unknown as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'booksDaily.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

const sendTone = (s: string) => (s === 'ACCEPTED' ? 'ok' : s === 'REFUSED' ? 'bad' : s === 'RETRYING' ? 'warn' : 'line');

export default async function BooksDailyPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('books.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="books.read" />
      </div>
    );
  const who: inv.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const idep = await inventoryDeps(access.deps);
  const at = { storeId: MOTHER_STORE_ID };
  const [status, books, log, currency, sendAt] = await Promise.all([
    loadBooksStatus(idep, who),
    inv.booksSummaryStatus(idep, who),
    inv.summaryLog(idep, who, { days: 31 }),
    access.deps.resolver.value('store.currency', at),
    access.deps.resolver.value('erp.summary.sendAt', at),
  ]);
  const d = view.dict;
  const b = (key: string, vars?: Record<string, string | number>) => t(d, `booksDaily.${key}`, vars);
  const money = moneyOf(currency, view.locale);
  const m = (minor: number) => formatMoney(minor, money);
  const n = (x: number) => formatNumber(x, view.locale);
  const dayFmt = new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeZone: 'UTC', numberingSystem: 'latn' });
  const monthFmt = new Intl.DateTimeFormat(view.locale, { month: 'long', year: 'numeric', timeZone: 'UTC', numberingSystem: 'latn' });
  const day = (ymd: string) => dayFmt.format(new Date(`${ymd}T00:00:00Z`));
  const month = (ym: string) => monthFmt.format(new Date(`${ym}-01T00:00:00Z`));
  const card = books.card;
  const linked = card.state !== 'NOT_LINKED';
  const lines = (keys: string[]) => keys.map((k) => b(`line.${k}`)).join(', ');
  const needText = (x: inv.NeedRow) => {
    const v = x.vars;
    switch (x.kind) {
      case 'DIFFERENCES':
        return b('need.DIFFERENCES', { n: n(Number(v.n)), kind: b(`kind.${v.kind}`) });
      case 'TIE_BROKEN':
        return b('need.TIE_BROKEN', { date: day(String(v.date)), amount: m(Number(v.amountMinor)), order: String(v.order ?? '') });
      case 'SUMMARY_REFUSED':
        return b('need.SUMMARY_REFUSED', { date: day(String(v.date)), error: String(v.error ?? '') });
      case 'SUMMARY_MISSING':
      case 'SUMMARY_INCOMPLETE':
        return b(`need.${x.kind}`, { n: n(Number(v.n)), first: day(String(v.first)) });
      case 'FIXED_COSTS_MISSING':
        return b('need.FIXED_COSTS_MISSING', { month: month(String(v.month)) });
      case 'WAITING_CHECK_OLD':
        return b('need.WAITING_CHECK_OLD', { pieces: n(Number(v.pieces)), days: n(Number(v.days)) });
    }
  };

  return (
    <div className="a2-z" data-testid="bd-page" data-state={card.state}>
      <PageHead view={view} place={locateKey(KEY)} title={b('title')} sub={b('sub')} />
      <SectionTabs view={view} current={KEY} />
      <div className="a2-row a2-r21 a2-start">
        <BooksStatusCard dict={d} locale={view.locale} timeZone={view.timeZone} money={money} status={status} linked={linked} />
        <section className="a2-card" data-testid="bd-needs" aria-label={b('needsTitle')}>
          <h2 className="a2-h3">{b('needsTitle')}</h2>
          {card.needs.length ? (
            <ul className="bk-needs">
              {card.needs.map((x, i) => (
                <li key={`${x.kind}-${i}`} data-testid="bd-need" data-kind={x.kind}>
                  <ShellIcon name="info" size={15} />
                  <span>{needText(x)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="a2-sm a2-mute a2-mt6">{linked ? b('needsNone') : b('notLinked')}</p>
          )}
          <div className="a2-note">
            <ShellIcon name="info" size={15} />
            <span>{b('never')}</span>
          </div>
        </section>
      </div>
      <section className="a2-card" data-testid="bd-summaries" aria-label={b('summaries')}>
        <h2 className="a2-h3">{b('summaries')}</h2>
        <p className="a2-cs">{b('summariesSub', { time: sendAt, last: books.summaries.lastAccepted ? day(books.summaries.lastAccepted) : b('summariesNone') })}</p>
        {log.length ? (
          <div className="a2-tblw a2-mt12">
            <table className="a2-tbl">
              <thead>
                <tr>
                  <th>{b('col.day')}</th>
                  <th>{b('col.state')}</th>
                  <th className="r">{b('col.profit')}</th>
                  <th>{b('col.incomplete')}</th>
                  <th className="r">{b('col.tries')}</th>
                  <th>{b('col.version')}</th>
                </tr>
              </thead>
              <tbody>
                {log.map((r) => (
                  <tr key={r.date} data-testid="bd-summary-row" data-state={r.state}>
                    <td className="a2-tdh">
                      <b>{day(r.date)}</b>
                    </td>
                    <td data-l={b('col.state')}>
                      <span className={`a2-pill ${sendTone(r.state)}`} title={r.lastError ?? undefined}>
                        {b(`sendState.${r.state}`)}
                      </span>
                    </td>
                    <td className="r" data-l={b('col.profit')}>
                      <span className="a2-num">{m(r.netProfitMinor)}</span>
                    </td>
                    <td className="bk-inc" data-l={b('col.incomplete')}>
                      {r.incomplete.length ? <span className="a2-pill warn">{lines(r.incomplete)}</span> : <span className="a2-xs a2-mute">{b('complete')}</span>}
                    </td>
                    <td className="r" data-l={b('col.tries')}>
                      <span className="a2-num">{n(r.tries)}</span>
                    </td>
                    <td data-l={b('col.version')}>
                      <span className="a2-xs">{b('versions', { n: n(r.version), reason: b(`reason.${r.reason}`) })}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="a2-state a2-mt12" data-testid="bd-summaries-empty">
            <div className="a2-sti">
              <ShellIcon name="info" size={26} />
            </div>
            <h3>{b('summariesNone')}</h3>
            <p>{b('summariesEmpty')}</p>
          </div>
        )}
      </section>
    </div>
  );
}
