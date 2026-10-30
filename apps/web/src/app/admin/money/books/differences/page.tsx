// CN-028 · PR 616 — Money → Books → Differences (docs/RETAIL-ERP-MODEL.md §4.3): what the books match did not find equal,
// newest day first — open by default, or all, put right, or left in a month the owner closed. Each row names the check,
// the class, the day, the amount and what it points at (our books against the ERP's). A row of a row group (checks A and
// F) is put right only by "Put right": a reversing entry for our row plus a new entry with the ERP's amount, with
// `books.adjust`, the owner's PIN, a reason and the ERP's matching row — nothing is edited or deleted. Other classes say
// how they are put right (they are found again from the books). Notes need `books.reconcile`. Seeing needs `books.read`.
import type { Metadata } from 'next';
import Link from 'next/link';
import * as inv from '@extas/inventory';
import { BooksForm } from '@/components/admin/books/BooksForm';
import { withBooks } from '@/lib/admin-books/i18n';
import { BooksOff, openBooksPage, storeOfSearch } from '@/lib/admin-books/page';
import { adminView } from '@/lib/admin-page';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const HERE = '/admin/money/books/differences';

export async function generateMetadata(): Promise<Metadata> {
  const view = withBooks(await adminView());
  return { title: `${t(view.dict, 'bk.title.differences')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
type Filter = (typeof inv.BOOKS_DIFFERENCE_FILTERS)[number];

export default async function BooksDifferencesPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const plain = withBooks(await adminView());
  const ctx = await openBooksPage({ perm: 'books.read', here: HERE, storeId: storeOfSearch(sp), current: 'booksDifferences', title: t(plain.dict, 'bk.title.differences'), sub: t(plain.dict, 'bk.sub.differences') });
  if ('el' in ctx) return ctx.el;
  const { d, bd, m, n, day, at, idp, who } = ctx;
  const status = await inv.booksStatus(idp, who);
  if (status.model === 'v5' || !status.link) return <BooksOff ctx={ctx} model={status.model} testId="books-differences" />;
  const filter: Filter = (inv.BOOKS_DIFFERENCE_FILTERS as readonly string[]).includes(one(sp.status)) ? (one(sp.status) as Filter) : 'open';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(one(sp.date)) ? one(sp.date) : undefined;
  const page = Math.max(1, Math.min(100_000, Number.parseInt(one(sp.page), 10) || 1));
  const list = await inv.booksDifferences(idp, who, { status: filter, date, page });
  const canAdjust = ctx.perms.has('books.adjust');
  const canNote = ctx.perms.has('books.reconcile');
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const href = (o: { status?: Filter; page?: number }) => {
    const q = new URLSearchParams();
    const s = o.status ?? filter;
    if (s !== 'open') q.set('status', s);
    if (date) q.set('date', date);
    if (o.page && o.page > 1) q.set('page', String(o.page));
    const qs = q.toString();
    return ctx.href(qs ? `${HERE}?${qs}` : HERE);
  };
  // A row whose ERP event has not reached the shop yet waits for the pull (qa-gate round 2): it says so.
  const groupOf = (r: inv.BooksDifferenceRow) => (r.detail as { group?: unknown } | null)?.group;
  const howOf = (r: inv.BooksDifferenceRow) => {
    const g = groupOf(r);
    if (r.check === 'RETURNS') return 'RETURNS';
    if (!(typeof g === 'string' && (r.check === 'ACCOUNT' || r.check === 'ORDERS') && inv.waitsForPull(r.kind, g, r.detail))) return r.kind;
    // Round 3 (money review): why it waits, when the match knows more — a payment the catch-up held back, a guessed pair.
    const det = r.detail as { heldBy?: unknown; guessed?: unknown } | null;
    return det?.heldBy ? 'WAITING_HELD' : det?.guessed === true ? 'WAITING_GUESS' : 'WAITING_EVENT';
  };

  return (
    <div className="a2-z" data-testid="books-differences">
      {ctx.head}
      <nav className="a2-views a2-mt12" aria-label={t(d, 'bk.title.differences')} data-testid="books-diff-views">
        {inv.BOOKS_DIFFERENCE_FILTERS.map((v) => (
          <Link key={v} className={`a2-view${v === filter ? ' on' : ''}`} href={href({ status: v })} aria-current={v === filter ? 'page' : undefined} scroll={false} data-view={v} style={{ minWidth: 44, justifyContent: 'center' }}>
            {t(d, `bk.diff.filter.${v}`)}
            {v === 'open' ? ` · ${n(status.open.total)}` : null}
          </Link>
        ))}
      </nav>
      {date ? (
        <p className="a2-xs a2-mute a2-mt6">
          {day(date)} ·{' '}
          <Link href={ctx.href(HERE)} className="a2-b a2-lnk">
            {t(d, 'bk.match.back')}
          </Link>
        </p>
      ) : null}
      {list.rows.length ? (
        <section className="a2-card a2-mt12" data-testid="books-diffs">
          <div className="a2-tblw">
            <table className="a2-tbl">
              <thead>
                <tr>
                  <th>{t(d, 'bk.diff.col.date')}</th>
                  <th>{t(d, 'bk.diff.col.what')}</th>
                  <th className="r">{t(d, 'bk.diff.col.amount')}</th>
                  <th>{t(d, 'bk.diff.col.ref')}</th>
                  <th>{t(d, 'bk.diff.col.status')}</th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((r) => {
                  const det = r.detail as { shopMinor?: number; erpMinor?: number; erpRefs?: string[]; shopRefs?: string[]; billedAtMissing?: boolean };
                  // The rows of this difference (qa-gate: the ERP's event must belong to it): the ERP's, or — when the ERP
                  // has none — the group's own entries; free text only when neither is there (an ERP event of the order).
                  const erpRefs = (det.erpRefs ?? []).filter((x) => typeof x === 'string');
                  const refs = erpRefs.length ? erpRefs : (det.shopRefs ?? []).filter((x) => typeof x === 'string');
                  return (
                    <tr key={r.id} data-testid="books-diff" data-kind={r.kind} data-status={r.status}>
                      <td className="a2-tdh">
                        <Link href={ctx.href(`/admin/money/books/match?day=${r.date}`)} className="a2-b a2-lnk">
                          {day(r.date)}
                        </Link>
                        <div className="a2-xs a2-mute">{t(d, 'bk.diff.firstSeen', { at: at(r.firstSeenAt) })}</div>
                      </td>
                      <td data-l={t(d, 'bk.diff.col.what')}>
                        <b>{t(d, `bk.class.${r.kind}`)}</b>
                        <div className="a2-xs a2-mute">{t(d, `bk.check.${r.check}`)}</div>
                        {typeof det.shopMinor === 'number' && typeof det.erpMinor === 'number' ? (
                          <div className="a2-xs a2-mute">
                            {t(d, 'bk.diff.ours', { amount: m(det.shopMinor) })} · {t(d, 'bk.diff.erp', { amount: m(det.erpMinor) })}
                          </div>
                        ) : null}
                        {det.billedAtMissing && (r.status === 'PENDING' || r.status === 'MISMATCH') ? <div className="a2-xs a2-note a2-mt6">{t(d, 'bk.diff.billedAtMissing')}</div> : null}
                        {r.notes.map((x) => (
                          <div key={x.id} className="a2-xs a2-note a2-mt6">
                            {x.text}
                          </div>
                        ))}
                      </td>
                      <td className="r" data-l={t(d, 'bk.diff.col.amount')}>
                        <b className="a2-num">{m(r.amountMinor)}</b>
                      </td>
                      <td data-l={t(d, 'bk.diff.col.ref')}>
                        <span className="a2-mono">{r.externalOrderId ?? r.eventId ?? '—'}</span>
                      </td>
                      <td data-l={t(d, 'bk.diff.col.status')}>
                        <span className={`a2-pill ${r.status === 'FIXED' ? 'ok' : r.status === 'PENDING' ? 'gold' : r.status === 'OVERRIDDEN' ? 'line' : 'bad'}`}>{t(d, `bk.dstatus.${r.status}`)}</span>
                        {r.adjustable && canAdjust ? (
                          <div className="a2-mt6">
                            <BooksForm
                              dict={bd}
                              url={ctx.api(`/differences/${r.id}/adjust`)}
                              label={t(d, 'bk.diff.adjust')}
                              busyLabel={t(d, 'bk.diff.adjustBusy')}
                              sendLabel={t(d, 'bk.diff.adjustSend')}
                              warn={t(d, 'bk.diff.adjustWarn')}
                              testId="books-adjust"
                              done={t(d, 'bk.diff.adjustDone')}
                              fields={[
                                refs.length ? { name: 'erpEventId', label: t(d, 'bk.diff.event'), kind: 'select', value: refs[0], options: refs.map((x) => ({ value: x, label: x })) } : { name: 'erpEventId', label: t(d, 'bk.diff.event'), kind: 'text', min: 1, maxLength: 240 },
                                { name: 'reason', label: t(d, 'bk.diff.reason'), kind: 'text', min: 3, maxLength: 1000 },
                                { name: 'pin', label: t(d, 'bk.diff.pin'), kind: 'pin', min: 1 },
                              ]}
                            />
                          </div>
                        ) : !r.adjustable && (r.status === 'MISMATCH' || r.status === 'PENDING') && t(d, `bk.diff.how.${howOf(r)}`) !== `bk.diff.how.${howOf(r)}` ? (
                          <div className="a2-xs a2-mute a2-mt6">{t(d, `bk.diff.how.${howOf(r)}`)}</div>
                        ) : null}
                        {canNote ? (
                          <div className="a2-mt6">
                            <BooksForm dict={bd} url={ctx.api(`/differences/${r.id}/note`)} label={t(d, 'bk.diff.note')} busyLabel={t(d, 'bk.diff.noteBusy')} sendLabel={t(d, 'bk.diff.noteSend')} tone="ghost" testId="books-note" done={t(d, 'bk.diff.noteDone')} fields={[{ name: 'text', label: t(d, 'bk.diff.noteText'), kind: 'text', min: 1, maxLength: 1000 }]} />
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {pages > 1 ? (
            <nav className="a2-between a2-mt12" aria-label={t(d, 'bk.page', { page: n(page), pages: n(pages) })}>
              {page > 1 ? (
                <Link className="a2-btn sm ghost" href={href({ page: page - 1 })}>
                  {t(d, 'bk.newer')}
                </Link>
              ) : (
                <span />
              )}
              <span className="a2-xs a2-mute">{t(d, 'bk.page', { page: n(page), pages: n(pages) })}</span>
              {page < pages ? (
                <Link className="a2-btn sm ghost" href={href({ page: page + 1 })}>
                  {t(d, 'bk.older')}
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </section>
      ) : (
        <div className="a2-state a2-mt12" data-testid="books-empty">
          <h3>{t(d, 'bk.diff.none')}</h3>
          <p>{t(d, 'bk.diff.noneSub')}</p>
        </div>
      )}
    </div>
  );
}
