// CN-028 · PR 616 — Money → Books → Match (docs/RETAIL-ERP-MODEL.md §4): the shop's books against the ERP's, day by day,
// zero tolerance. At a glance: days matched, open differences, months closed, the last check and whether the chain of
// closes is intact; the days (newest first) with their result, balances and what the tie left over; and one day opened
// to its parts (`?day=YYYY-MM-DD`: the tie formula, every row group with our entries and the ERP's rows, the six checks,
// the differences and every version of the day). "Check now" (`books.reconcile`) runs the match at once; it only reads
// the ERP. Seeing needs `books.read`. In v5 the page says the books start at the switch.
import type { Metadata } from 'next';
import Link from 'next/link';
import * as inv from '@extas/inventory';
import { BooksForm } from '@/components/admin/books/BooksForm';
import { withBooks } from '@/lib/admin-books/i18n';
import { BooksOff, openBooksPage, storeOfSearch, ResultPill } from '@/lib/admin-books/page';
import { adminView } from '@/lib/admin-page';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const HERE = '/admin/money/books/match';
const TIE_ORDER = ['balanceStartMinor', 'goodsMinor', 'returnLossesMinor', 'pipelineStartMinor', 'pipelineEndMinor', 'switchTransferMinor', 'paymentsMinor', 'adjustmentsMinor', 'priorPeriodMinor', 'balanceEndMinor', 'remainderMinor'] as const;

export async function generateMetadata(): Promise<Metadata> {
  const view = withBooks(await adminView());
  return { title: `${t(view.dict, 'bk.title.match')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export default async function BooksMatchPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const plain = withBooks(await adminView());
  const ctx = await openBooksPage({ perm: 'books.read', here: HERE, storeId: storeOfSearch(sp), current: 'booksMatch', title: t(plain.dict, 'bk.title.match'), sub: t(plain.dict, 'bk.sub.match') });
  if ('el' in ctx) return ctx.el;
  const { d, bd, m, n, day, at, idp, who } = ctx;
  const status = await inv.booksStatus(idp, who);
  if (status.model === 'v5' || !status.link) return <BooksOff ctx={ctx} model={status.model} testId="books-match" />;
  const canRun = ctx.perms.has('books.reconcile');
  const asked = one(sp.day);
  const explain = /^\d{4}-\d{2}-\d{2}$/.test(asked) ? await inv.explainDay(idp, who, asked) : null;

  const kpis = (
    <div className="a2-kpis a2-mt12" data-testid="books-match-kpis">
      <div className="a2-card a2-kpi">
        <div className="a2-kl">{t(d, 'bk.match.kpi.days')}</div>
        <div className="a2-kv">{n(status.matchedDays)}</div>
        <div className="a2-xs a2-mute a2-mt6">{t(d, 'bk.match.kpi.daysSub', { n: n(status.matchedDays), total: n(status.totalDays) })}</div>
      </div>
      <div className="a2-card a2-kpi">
        <div className="a2-kl">{t(d, 'bk.match.kpi.open')}</div>
        <div className="a2-kv" data-testid="books-open">
          {n(status.open.total)}
        </div>
        <div className="a2-xs a2-mt6">
          {status.open.total ? (
            <Link className="a2-lnk" href={ctx.href('/admin/money/books/differences')}>
              <span className="a2-pill bad">{t(d, 'bk.title.differences')}</span>
            </Link>
          ) : (
            <span className="a2-pill ok">{t(d, 'bk.result.MATCHED')}</span>
          )}
        </div>
      </div>
      <div className="a2-card a2-kpi">
        <div className="a2-kl">{t(d, 'bk.match.kpi.months')}</div>
        <div className="a2-kv">{n(status.monthsClosed)}</div>
      </div>
      <div className="a2-card a2-kpi">
        <div className="a2-kl">{t(d, 'bk.match.kpi.last')}</div>
        {/* a date and time is long: plain text that wraps, not the big one-line figure */}
        <div className="a2-sm a2-mt6" style={{ fontWeight: 650 }}>
          {status.lastRun ? at(status.lastRun.finishedAt ?? status.lastRun.startedAt) : t(d, 'bk.match.kpi.never')}
        </div>
        <div className="a2-xs a2-mute a2-mt6">{status.lastRun ? `${day(status.lastRun.from)} – ${day(status.lastRun.through)}` : null}</div>
      </div>
    </div>
  );

  const bar = (
    <section className="a2-card tight a2-mt12" data-testid="books-match-bar">
      <div className="a2-gap8" style={{ flexWrap: 'wrap' }}>
        <span className={`a2-pill ${status.closesChain.ok ? 'line' : 'bad'}`} data-testid="books-closes-chain">
          {status.closesChain.ok ? t(d, 'bk.match.chainOk', { n: n(status.closesChain.days) }) : t(d, 'bk.match.chainBroken')}
        </span>
      </div>
      {status.partialChecks.length ? <p className="a2-xs a2-mute a2-mt6">{t(d, 'bk.match.partly', { checks: status.partialChecks.map((c) => t(d, `bk.check.${c}`)).join(', ') })}</p> : null}
      {canRun ? (
        <div className="a2-mt6">
          <BooksForm dict={bd} url={ctx.api(`/run`)} label={t(d, 'bk.match.run')} busyLabel={t(d, 'bk.match.runBusy')} sendLabel={t(d, 'bk.match.runSend')} warn={t(d, 'bk.match.runWarn')} fields={[]} testId="books-run" done={t(d, 'bk.match.runDone')} />
        </div>
      ) : null}
    </section>
  );

  if (explain) {
    const tie = explain.tie as Record<string, number | boolean>;
    return (
      <div className="a2-z" data-testid="books-match">
        {ctx.head}
        <section className="a2-card a2-mt12" data-testid="books-explain">
          <div className="a2-between" style={{ flexWrap: 'wrap', gap: 8 }}>
            <h2 className="a2-h4">{t(d, 'bk.explain.title', { date: day(explain.date) })}</h2>
            <Link className="a2-btn sm ghost" href={ctx.href(HERE)}>
              {t(d, 'bk.match.back')}
            </Link>
          </div>
          <div className="a2-gap8 a2-mt6" style={{ flexWrap: 'wrap' }}>
            <ResultPill d={d} result={explain.result} />
            <span className="a2-pill line">{t(d, 'bk.explain.versions', { n: n(explain.versions.length) })}</span>
          </div>
          <div className="a2-kpis a2-mt12">
            <div className="a2-card a2-kpi">
              <div className="a2-kl">{t(d, 'bk.explain.opening')}</div>
              <div className="a2-kv">{m(explain.openingMinor)}</div>
            </div>
            <div className="a2-card a2-kpi">
              <div className="a2-kl">{t(d, 'bk.explain.closing')}</div>
              <div className="a2-kv">{m(explain.closingMinor)}</div>
            </div>
            <div className="a2-card a2-kpi">
              <div className="a2-kl">{t(d, 'bk.explain.erp')}</div>
              <div className="a2-kv">{m(explain.erpClosingMinor)}</div>
            </div>
          </div>
        </section>
        <section className="a2-card a2-mt12" data-testid="books-explain-tie">
          <h2 className="a2-h4">{t(d, 'bk.explain.tie')}</h2>
          <ul className="a2-stack a2-mt6">
            {TIE_ORDER.filter((k) => typeof tie[k] === 'number').map((k) => (
              <li key={k} data-part={k} className="a2-between a2-sm" style={{ gap: 8 }}>
                <span>{k === 'remainderMinor' ? <b>{t(d, `bk.explain.tieParts.${k}`)}</b> : t(d, `bk.explain.tieParts.${k}`)}</span>
                <b className={`a2-num${k === 'remainderMinor' && tie[k] !== 0 ? ' a2-bad' : ''}`}>{m(tie[k] as number)}</b>
              </li>
            ))}
          </ul>
        </section>
        <section className="a2-card a2-mt12" data-testid="books-explain-checks">
          <h2 className="a2-h4">{t(d, 'bk.explain.checks')}</h2>
          <ul className="a2-stack a2-mt6">
            {explain.checks.map((c) => (
              <li key={c.check} className="a2-between a2-sm" style={{ gap: 8 }}>
                <span>{t(d, `bk.check.${c.check}`)}</span>
                <ResultPill d={d} result={c.result} />
              </li>
            ))}
          </ul>
        </section>
        <section className="a2-card a2-mt12" data-testid="books-explain-groups">
          <h2 className="a2-h4">{t(d, 'bk.explain.groups')}</h2>
          <div className="a2-tblw a2-mt6">
            <table className="a2-tbl">
              <thead>
                <tr>
                  <th>{t(d, 'bk.explain.col.group')}</th>
                  <th>{t(d, 'bk.explain.col.check')}</th>
                  <th className="r">{t(d, 'bk.explain.col.ours')}</th>
                  <th className="r">{t(d, 'bk.explain.col.erp')}</th>
                </tr>
              </thead>
              <tbody>
                {explain.groups.map((g) => (
                  <tr key={g.group} data-testid="books-group" data-same={g.shopMinor === g.erpMinor ? 'yes' : 'no'}>
                    <td className="a2-tdh">
                      <span className="a2-mono">{g.group}</span>
                      {g.entries.map((e) => (
                        <div key={e.eventId} className="a2-xs a2-mute">
                          {t(d, `bk.kind.${e.kind}`)} · <span className="a2-num">{m(e.amountMinor)}</span>
                        </div>
                      ))}
                      {g.erpRows.map((r, i) => (
                        <div key={`${r.id ?? i}`} className="a2-xs a2-mute">
                          {t(d, 'bk.explain.col.erp')} · <span className="a2-mono">{r.id ?? r.eventId ?? '—'}</span> · <span className="a2-num">{m(r.amountMinor)}</span>
                        </div>
                      ))}
                    </td>
                    <td data-l={t(d, 'bk.explain.col.check')}>{t(d, `bk.check.${g.check}`)}</td>
                    <td className="r" data-l={t(d, 'bk.explain.col.ours')}>
                      <b className="a2-num">{m(g.shopMinor)}</b>
                    </td>
                    <td className="r" data-l={t(d, 'bk.explain.col.erp')}>
                      <b className={`a2-num${g.shopMinor === g.erpMinor ? '' : ' a2-bad'}`}>{m(g.erpMinor)}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        {explain.differences.length ? (
          <section className="a2-card tight a2-mt12" data-testid="books-explain-diffs">
            <h2 className="a2-h4">{t(d, 'bk.title.differences')}</h2>
            <ul className="a2-stack a2-mt6">
              {explain.differences.map((x) => (
                <li key={x.id} className="a2-sm">
                  {t(d, `bk.class.${x.kind}`)} · {t(d, `bk.check.${x.check}`)} · <b className="a2-num">{m(x.amountMinor)}</b> · <span className="a2-pill line">{t(d, `bk.dstatus.${x.status}`)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    );
  }

  const pageSize = await inv.setting(idp, who.storeId, 'books.ledger.pageSize');
  const lastDay = status.lastRun?.through ?? null;
  const from = lastDay ? new Date(new Date(`${lastDay}T00:00:00Z`).getTime() - (pageSize - 1) * 86_400_000).toISOString().slice(0, 10) : null;
  const link = await inv.storeErpLink(idp.db, who.storeId);
  const [states, figures] = lastDay && from && link ? await Promise.all([inv.dayStates(idp.db, link, from, lastDay), inv.booksDaysForSummary(idp, who.storeId, from, lastDay)]) : [[], []];
  const fig = new Map(figures.map((f) => [f.date, f]));
  const days = states.filter((s) => s.version != null).reverse();

  return (
    <div className="a2-z" data-testid="books-match">
      {ctx.head}
      {kpis}
      {bar}
      {days.length ? (
        <section className="a2-card a2-mt12" data-testid="books-days">
          <h2 className="a2-h4">{t(d, 'bk.match.days')}</h2>
          <div className="a2-tblw a2-mt6">
            <table className="a2-tbl">
              <thead>
                <tr>
                  <th>{t(d, 'bk.match.col.date')}</th>
                  <th>{t(d, 'bk.match.col.result')}</th>
                  <th className="r">{t(d, 'bk.match.col.closing')}</th>
                  <th className="r">{t(d, 'bk.match.col.tie')}</th>
                  <th>{t(d, 'bk.match.col.open')}</th>
                </tr>
              </thead>
              <tbody>
                {days.map((s) => {
                  const f = fig.get(s.date);
                  return (
                    <tr key={s.date} data-testid="books-day" data-matched={s.matched ? 'yes' : 'no'}>
                      <td className="a2-tdh">
                        <Link href={ctx.href(`${HERE}?day=${s.date}`)} className="a2-b a2-lnk">
                          {day(s.date)}
                        </Link>
                        <div className="a2-xs a2-mute">
                          {t(d, 'bk.match.col.version')} {n(s.version ?? 0)}
                        </div>
                      </td>
                      <td data-l={t(d, 'bk.match.col.result')}>
                        <ResultPill d={d} result={s.matched ? s.result : s.result === 'MATCHED' || s.result === 'PARTIAL' ? 'PENDING' : s.result} />
                      </td>
                      <td className="r" data-l={t(d, 'bk.match.col.closing')}>
                        <b className="a2-num">{m(s.closingMinor)}</b>
                      </td>
                      <td className="r" data-l={t(d, 'bk.match.col.tie')}>
                        <span className={`a2-num${f && f.tieRemainderMinor !== 0 ? ' a2-bad' : ''}`}>{m(f?.tieRemainderMinor ?? 0)}</span>
                      </td>
                      <td data-l={t(d, 'bk.match.col.open')}>
                        {s.open ? (
                          <Link className="a2-lnk" href={ctx.href(`/admin/money/books/differences?status=open&date=${s.date}`)}>
                            <span className="a2-pill bad">{n(s.open)}</span>
                          </Link>
                        ) : (
                          <span className="a2-xs a2-mute">{n(0)}</span>
                        )}
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
          <h3>{t(d, 'bk.match.none')}</h3>
          <p>{t(d, 'bk.match.noneSub')}</p>
        </div>
      )}
    </div>
  );
}
