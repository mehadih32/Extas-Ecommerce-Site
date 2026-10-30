// CN-028 · PR 617 — the Books status card (docs/RETAIL-ERP-MODEL.md §3.4, §4), drawn from PR 616's `booksStatus`
// (lib/books-status-view.ts): the match's state (starts at the switch-over · not run yet · matched · n open
// differences), days matched of the days closed, the open differences by check A–F (a check v6 can only partly make is
// marked), what Retail owes the ERP in the shop's books and at the ERP, the returned pieces waiting for the owner's
// check, the exchanges at risk, the months closed and whether the closed records are unchanged. A number the books do
// not have yet shows "—", never 0. Words: messages/admin-books-daily.*.json (`booksDaily.status.*`, `booksDaily.check.*`).
import * as inv from '@extas/inventory';
import { formatMoney, formatNumber, type Money } from '@/components/admin/products/model';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import type { BooksStatusView } from '@/lib/books-status-view';
import { t, type Dict } from '@/lib/i18n';

export function BooksStatusCard({ dict, locale, timeZone, money, status, linked: linkedHere }: { dict: Dict; locale: string; timeZone: string; money: Money; status: BooksStatusView | null; linked: boolean }) {
  const s = (key: string, vars?: Record<string, string | number>) => t(dict, `booksDaily.status.${key}`, vars);
  const m = (minor: number | null) => (minor === null ? s('none') : formatMoney(minor, money));
  const n = (x: number) => formatNumber(x, locale);
  const when = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone, numberingSystem: 'latn' });
  // Without PR 616's numbers in this build, whether the store's books have started comes from this page's own read.
  const linked = status ? status.model === 'v6' && !!status.link : linkedHere;
  const ran = linked && !!status?.lastRun;
  const state = !linked ? 'off' : !ran ? 'notRun' : status!.open.total ? 'differs' : 'matched';
  const tone = state === 'matched' ? 'ok' : state === 'differs' ? 'bad' : 'line';
  const fact = (label: string, value: string, testId?: string) => (
    <div data-testid={testId}>
      <div className="a2-kl">{label}</div>
      <div className="bk-fv">{value}</div>
    </div>
  );
  return (
    <section className="a2-card" data-testid="bd-status-card" data-state={state} aria-label={s('title')}>
      <div className="a2-ch">
        <div>
          <h2 className="a2-h3">{s('title')}</h2>
          <div className="a2-cs">{ran && status!.lastRun!.finishedAt ? s('ranAt', { when: when.format(new Date(status!.lastRun!.finishedAt)) }) : linked ? s('notRunNote') : t(dict, 'booksDaily.notLinked')}</div>
        </div>
        <span className={`a2-pill ${tone}`} data-testid="bd-status">
          {state === 'differs' ? s('differs', { n: n(status!.open.total) }) : s(state)}
        </span>
      </div>
      <ul className="bk-checks" data-testid="bd-checks">
        {inv.BOOKS_CHECK_ORDER.map(({ check, letter }) => {
          const open = ran ? (status!.open.byCheck[check as keyof BooksStatusView['open']['byCheck']] ?? 0) : 0;
          const partial = ran && status!.partialChecks.includes(check as BooksStatusView['partialChecks'][number]);
          return (
            <li key={check} data-testid={`bd-check-${letter}`}>
              <span className="bk-letter" aria-hidden="true">
                {letter}
              </span>
              <span className="bk-name">{t(dict, `booksDaily.check.${check}`)}</span>
              <span className={`a2-pill ${!ran ? 'line' : open ? 'bad' : partial ? 'info' : 'ok'}`}>
                {!linked ? s('off') : !ran ? s('notRun') : open ? s('differs', { n: n(open) }) : partial ? `${s('matched')} · ${s('partial')}` : s('matched')}
              </span>
            </li>
          );
        })}
      </ul>
      {ran && status!.partialChecks.length ? (
        <div className="a2-note">
          <ShellIcon name="info" size={15} />
          <span>{t(dict, 'booksDaily.partialNote')}</span>
        </div>
      ) : null}
      <div className="bk-facts a2-mt12" data-testid="bd-facts">
        {fact(s('matchedDays'), ran ? s('matchedDaysValue', { n: n(status!.matchedDays), total: n(status!.totalDays) }) : s('none'))}
        {fact(s('balance'), m(linked ? (status?.balanceMinor ?? null) : null))}
        {fact(s('erpBalance'), m(linked ? (status?.erpBalanceMinor ?? null) : null))}
        {fact(s('waiting'), m(linked ? (status?.waitingCheckMinor ?? null) : null))}
        {fact(s('atRisk'), m(linked ? (status?.exchangesAtRiskMinor ?? null) : null))}
        {fact(s('monthsClosed'), linked && status ? n(status.monthsClosed) : s('none'))}
        {fact(s('chain'), ran ? s(status!.closesChain.ok ? 'chainOk' : 'chainBroken') : s('none'), 'bd-chain')}
      </div>
    </section>
  );
}
