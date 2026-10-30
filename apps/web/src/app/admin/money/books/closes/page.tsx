// CN-028 · PR 616 — Money → Books → Closes (docs/RETAIL-ERP-MODEL.md §4.4): the days close themselves each night and roll
// up into weeks and the lifetime check; a month is closed here with `books.close` and the owner's PIN once it has ended —
// only when every day matched and its fixed costs are in (`books.close.requireMatched`), else only with a reason (the
// owner's decision, kept on the close and on every report of that month). A closed month can be opened again (PIN and
// reason: a new version, the old one stays). A financial year is signed off once it has ended and every month is closed.
// The owner sets his books PIN here with his password; it is never shown or kept as typed. Seeing needs `books.read`.
import type { Metadata } from 'next';
import Link from 'next/link';
import { isOwner } from '@extas/auth';
import * as inv from '@extas/inventory';
import { BooksForm } from '@/components/admin/books/BooksForm';
import { withBooks } from '@/lib/admin-books/i18n';
import { BooksOff, openBooksPage, storeOfSearch, ResultPill } from '@/lib/admin-books/page';
import { adminView } from '@/lib/admin-page';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const HERE = '/admin/money/books/closes';

export async function generateMetadata(): Promise<Metadata> {
  const view = withBooks(await adminView());
  return { title: `${t(view.dict, 'bk.title.closes')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export default async function BooksClosesPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const plain = withBooks(await adminView());
  const ctx = await openBooksPage({ perm: 'books.read', here: HERE, storeId: storeOfSearch(sp), current: 'booksCloses', title: t(plain.dict, 'bk.title.closes'), sub: t(plain.dict, 'bk.sub.closes') });
  if ('el' in ctx) return ctx.el;
  const { d, bd, m, n, day, at, idp, who } = ctx;
  const month = /^\d{4}-\d{2}$/.test(one(sp.month)) ? one(sp.month) : null;
  const view = await inv.booksCloses(idp, who, { month });
  const owner = !!who.actor.staffUserId && (await isOwner(ctx.deps.db, who.actor.staffUserId));
  const canClose = ctx.perms.has('books.close');

  const pinCard = owner ? (
    <section className="a2-card tight a2-mt12" data-testid="books-pin">
      <div className="a2-gap8" style={{ flexWrap: 'wrap' }}>
        <b className="a2-sm">{t(d, 'bk.close.pinCard')}</b>
        <span className={`a2-pill ${view.pinSet ? 'ok' : 'gold'}`} style={{ whiteSpace: 'normal' }}>{t(d, view.pinSet ? 'bk.close.pinSet' : 'bk.close.pinNotSet')}</span>
      </div>
      <div className="a2-mt6">
        <BooksForm
          dict={bd}
          url={ctx.api(`/pin`)}
          label={t(d, 'bk.close.pinSetBtn')}
          busyLabel={t(d, 'bk.close.pinBusy')}
          sendLabel={t(d, 'bk.close.pinSend')}
          warn={t(d, 'bk.close.pinWarn')}
          tone="ghost"
          testId="books-pin-set"
          done={t(d, 'bk.close.pinDone')}
          fields={[
            { name: 'password', label: t(d, 'bk.close.pinPassword'), kind: 'pin', min: 1, maxLength: 200 },
            { name: 'pin', label: t(d, 'bk.close.pinNew'), kind: 'pin', min: 1 },
          ]}
        />
      </div>
    </section>
  ) : view.model === 'v6' && !view.pinSet ? (
    <section className="a2-card tight a2-mt12" data-testid="books-pin">
      <span className="a2-pill gold" style={{ whiteSpace: 'normal' }}>{t(d, 'bk.close.pinNotSet')}</span>
    </section>
  ) : null;

  if (view.model === 'v5' || !view.today) return <BooksOff ctx={ctx} model={view.model} testId="books-closes" />;
  const stateOf = (x: inv.MonthState) => (x.closed ? (x.override ? 'override' : 'closed') : x.versions > 0 ? 'reopened' : x.ended ? 'ended' : 'open');
  const lastYear = Number(view.today.slice(0, 4)) - 1;

  return (
    <div className="a2-z" data-testid="books-closes">
      {ctx.head}
      {pinCard}
      {view.months.length ? (
        <section className="a2-card a2-mt12" data-testid="books-months">
          <h2 className="a2-h4">{t(d, 'bk.close.months')}</h2>
          <div className="a2-tblw a2-mt6">
            <table className="a2-tbl">
              <thead>
                <tr>
                  <th>{t(d, 'bk.close.col.month')}</th>
                  <th>{t(d, 'bk.close.col.state')}</th>
                  <th>{t(d, 'bk.close.col.days')}</th>
                  <th>{t(d, 'bk.close.col.action')}</th>
                </tr>
              </thead>
              <tbody>
                {view.months.map((x) => {
                  const st = stateOf(x);
                  return (
                    <tr key={x.month} data-testid="books-month" data-state={st}>
                      <td className="a2-tdh">
                        <Link href={ctx.href(`${HERE}?month=${x.month}`)} className="a2-b a2-lnk">
                          {day(x.start)} – {day(x.end)}
                        </Link>
                        {x.versions ? (
                          <div className="a2-xs a2-mute">
                            {t(d, 'bk.close.col.versions')} {n(x.versions)}
                          </div>
                        ) : null}
                      </td>
                      <td data-l={t(d, 'bk.close.col.state')}>
                        <span className={`a2-pill ${st === 'closed' ? 'ok' : st === 'override' ? 'gold' : st === 'ended' ? 'bad' : 'line'}`} style={{ whiteSpace: 'normal' }}>{t(d, `bk.close.state.${st}`)}</span>
                        {x.closed && x.overrideReason ? <div className="a2-xs a2-mute a2-mt6">{x.overrideReason}</div> : null}
                        {x.closedAt ? <div className="a2-xs a2-mute">{at(x.closedAt)}</div> : null}
                      </td>
                      <td data-l={t(d, 'bk.close.col.days')}>{x.totalDays ? t(d, 'bk.match.kpi.daysSub', { n: n(x.matchedDays), total: n(x.totalDays) }) : '—'}</td>
                      <td data-l={t(d, 'bk.close.col.action')}>
                        {canClose && x.ended && !x.closed ? (
                          <BooksForm
                            dict={bd}
                            url={ctx.api(`/closes/month`)}
                            body={{ month: x.month }}
                            label={t(d, 'bk.close.close')}
                            busyLabel={t(d, 'bk.close.closeBusy')}
                            sendLabel={t(d, 'bk.close.closeSend')}
                            warn={t(d, 'bk.close.closeWarn')}
                            testId="books-month-close"
                            done={t(d, 'bk.close.closeDone')}
                            fields={[
                              { name: 'overrideReason', label: t(d, 'bk.close.overrideReason'), kind: 'text', maxLength: 1000 },
                              { name: 'pin', label: t(d, 'bk.diff.pin'), kind: 'pin', min: 1 },
                            ]}
                          />
                        ) : null}
                        {canClose && x.closed ? (
                          <BooksForm
                            dict={bd}
                            url={ctx.api(`/closes/month/reopen`)}
                            body={{ month: x.month }}
                            label={t(d, 'bk.close.reopen')}
                            busyLabel={t(d, 'bk.close.reopenBusy')}
                            sendLabel={t(d, 'bk.close.reopenSend')}
                            warn={t(d, 'bk.close.reopenWarn')}
                            tone="ghost"
                            testId="books-month-reopen"
                            done={t(d, 'bk.close.reopenDone')}
                            fields={[
                              { name: 'reason', label: t(d, 'bk.close.reopenReason'), kind: 'text', min: 3, maxLength: 1000 },
                              { name: 'pin', label: t(d, 'bk.diff.pin'), kind: 'pin', min: 1 },
                            ]}
                          />
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <div className="a2-state a2-mt12" data-testid="books-empty">
          <h3>{t(d, 'bk.close.none')}</h3>
          <p>{t(d, 'bk.close.noneSub')}</p>
        </div>
      )}

      {view.days ? (
        <section className="a2-card tight a2-mt12" data-testid="books-month-days">
          <ul className="a2-stack">
            {view.days.map((x) => (
              <li key={x.date} className="a2-between a2-sm" style={{ gap: 8 }}>
                <Link href={ctx.href(`/admin/money/books/match?day=${x.date}`)} className="a2-b a2-lnk">
                  {day(x.date)}
                </Link>
                <ResultPill d={d} result={x.matched ? x.result : x.result === 'MATCHED' || x.result === 'PARTIAL' ? 'PENDING' : x.result} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="a2-card tight a2-mt12" data-testid="books-year">
        <b className="a2-sm">{t(d, 'bk.close.year')}</b>
        {view.years.map((y) => (
          <p key={y.id} className="a2-xs a2-mt6">
            {day(y.start)} – {day(y.end)} · <ResultPill d={d} result={y.result} />
          </p>
        ))}
        {canClose ? (
          <div className="a2-mt6">
            <BooksForm
              dict={bd}
              url={ctx.api(`/closes/year`)}
              label={t(d, 'bk.close.yearSend')}
              busyLabel={t(d, 'bk.close.yearBusy')}
              sendLabel={t(d, 'bk.close.yearSend')}
              warn={t(d, 'bk.close.yearWarn')}
              tone="ghost"
              testId="books-year-close"
              done={t(d, 'bk.close.yearDone')}
              fields={[
                { name: 'year', label: t(d, 'bk.close.yearNum'), kind: 'text', min: 4, maxLength: 4, value: String(lastYear) },
                { name: 'pin', label: t(d, 'bk.diff.pin'), kind: 'pin', min: 1 },
              ]}
            />
          </div>
        ) : null}
      </section>

      {view.weeks.length || view.lifetime ? (
        <section className="a2-card tight a2-mt12" data-testid="books-weeks">
          {view.lifetime ? <p className="a2-sm">{t(d, 'bk.close.lifetime', { ours: m(view.lifetime.closingMinor), erp: m(view.lifetime.erpClosingMinor) })}</p> : null}
          {view.weeks.length ? (
            <>
              <b className="a2-sm">{t(d, 'bk.close.weeks')}</b>
              <ul className="a2-stack a2-mt6">
                {view.weeks.map((w) => (
                  <li key={w.id} className="a2-between a2-xs" style={{ gap: 8 }}>
                    <span>
                      {day(w.start)} – {day(w.end)}
                    </span>
                    <ResultPill d={d} result={w.result} />
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
