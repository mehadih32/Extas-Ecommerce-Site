// CN-028 · PR 615 — Money → Books → ERP account (docs/RETAIL-ERP-MODEL.md §3.1, §3.2): what Retail owes the ERP from the
// shop's own append-only ledger beside what the ERP last said, the hold, the pipeline at buying price, and three views —
// the ledger (every entry, newest first, filtered by kind or a reference), "paid to ERP" (Accounts and the owner record a
// payment already made — nothing is sent and no money moves — each matched to the ERP's payment; a wrong record is
// reversed by a new one) and the pieces in the pipeline. Seeing needs `erp.account.read`; recording needs
// `erp.payments.record`, which the API checks again. In `erp.model` v5 the page says the books start at the switch.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as inv from '@extas/inventory';
import { ERP_ACCOUNT_ENTRY_KINDS, ERP_PIECE_STATES } from '@extas/inventory';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { BooksForm } from '@/components/admin/books/BooksForm';
import { formatMoney, formatNumber, moneyOf } from '@/components/admin/products/model';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { adminDeps } from '@/lib/admin-auth';
import { withBooks } from '@/lib/admin-books/i18n';
import { booksApi, booksHref, storeOfSearch } from '@/lib/admin-books/page';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { inventoryDeps } from '@/lib/inventory-api';
import { t, type Dict } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const HERE = '/admin/money/books';
const VIEWS = ['entries', 'payments', 'pipeline'] as const;
type View = (typeof VIEWS)[number];

export async function generateMetadata(): Promise<Metadata> {
  const view = withBooks(await adminView());
  return { title: `${t(view.dict, 'bk.title.account')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

function Empty({ title, body, icon = 'wallet' }: { title: string; body?: string; icon?: 'wallet' | 'truck' }) {
  return (
    <div className="a2-state a2-mt12" data-testid="books-empty">
      <div className="a2-sti">
        <ShellIcon name={icon} size={26} />
      </div>
      <h3>{title}</h3>
      {body ? <p>{body}</p> : null}
    </div>
  );
}

export default async function BooksAccountPage({ searchParams }: { searchParams: Search }) {
  const deps = adminDeps();
  // qa-gate: the page's store is `?storeId=` (as the books API takes it), else the mother store; its key is checked there.
  const sp = await searchParams;
  const storeId = storeOfSearch(sp);
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('erp.account.read', deps, storeId)]);
  const view = withBooks(plain);
  const d = view.dict;
  const go = (path: string) => booksHref(storeId, path);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(go(HERE))}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current="booksAccount" text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="erp.account.read" />
      </div>
    );
  const who: inv.Who = { actor: access.guard.actor, storeId, ctx: access.guard.ctx };
  const idp = await inventoryDeps(access.deps);
  const tab: View = (VIEWS as readonly string[]).includes(one(sp.view)) ? (one(sp.view) as View) : 'entries';
  const kind = (ERP_ACCOUNT_ENTRY_KINDS as readonly string[]).includes(one(sp.kind)) ? (one(sp.kind) as inv.AccountEntryView['kind']) : undefined;
  const state = (ERP_PIECE_STATES as readonly string[]).includes(one(sp.state)) ? (one(sp.state) as inv.PipelinePieceRowView['state']) : undefined;
  const q = one(sp.q).trim().slice(0, 80) || undefined;
  const page = Math.max(1, Math.min(100_000, Number.parseInt(one(sp.page), 10) || 1));
  const [ov, currency] = await Promise.all([inv.accountOverview(idp, who), access.deps.resolver.value('store.currency', { storeId }) as Promise<string>]);
  const money = moneyOf(currency, view.locale);
  const m = (minor: number | null | undefined) => (minor == null ? '—' : formatMoney(minor, money));
  const n = (x: number) => formatNumber(x, view.locale);
  const dateOf = new Intl.DateTimeFormat(view.locale, { timeZone: 'UTC', numberingSystem: 'latn', dateStyle: 'medium' });
  const day = (s: string | null) => (s ? dateOf.format(new Date(`${s}T00:00:00Z`)) : '—');
  const stamp = new Intl.DateTimeFormat(view.locale, { timeZone: view.timeZone, numberingSystem: 'latn', dateStyle: 'medium', timeStyle: 'short' });
  const at = (s: string | null) => (s ? stamp.format(new Date(s)) : '—');
  const canRecord = access.guard.permissions?.has('erp.payments.record') ?? false;
  const bd: Dict = { bk: d.bk as Dict };
  const head = (
    <>
      <PageHead view={view} place={locateKey('booksAccount')} title={t(d, 'bk.title.account')} sub={t(d, 'bk.sub.account')} />
      <SectionTabs view={view} current="booksAccount" />
    </>
  );
  if (ov.model === 'v5' || !ov.link)
    return (
      <div className="a2-z" data-testid="books-account">
        {head}
        <section className="a2-card a2-mt12" data-testid="books-off">
          <p className="a2-sm a2-mute">{t(d, ov.model === 'v5' ? 'bk.v5' : 'bk.noLink')}</p>
        </section>
      </div>
    );

  const diff = ov.erp?.balanceMinor != null && ov.balanceMinor != null ? ov.balanceMinor - ov.erp.balanceMinor : null;
  const [entries, payments, pieces] = await Promise.all([
    tab === 'entries' ? inv.accountEntries(idp, who, { page, kind, q }) : Promise.resolve(null),
    tab === 'payments' ? inv.accountPayments(idp, who) : Promise.resolve(null),
    tab === 'pipeline' ? inv.pipelinePieces(idp, who, { page, state, q }) : Promise.resolve(null),
  ]);
  const pager = (p: { page: number; pageSize: number; total: number }, extra: Record<string, string | undefined>) => {
    const pages = Math.max(1, Math.ceil(p.total / p.pageSize));
    const href = (to: number) => `${HERE}?${new URLSearchParams(Object.entries({ view: tab, ...extra, page: String(to), storeId: storeId === MOTHER_STORE_ID ? '' : String(storeId) }).filter((e): e is [string, string] => !!e[1])).toString()}`;
    return pages > 1 ? (
      <nav className="a2-between a2-mt12" aria-label={t(d, 'bk.page', { page: n(p.page), pages: n(pages) })}>
        {p.page > 1 ? (
          <Link className="a2-btn sm ghost" href={href(p.page - 1)}>
            {t(d, 'bk.newer')}
          </Link>
        ) : (
          <span />
        )}
        <span className="a2-xs a2-mute">{t(d, 'bk.page', { page: n(p.page), pages: n(pages) })}</span>
        {p.page < pages ? (
          <Link className="a2-btn sm ghost" href={href(p.page + 1)}>
            {t(d, 'bk.older')}
          </Link>
        ) : (
          <span />
        )}
      </nav>
    ) : null;
  };
  const today = ov.today ?? '';
  const matchOf = new Map((payments?.match?.matched ?? []).map((x) => [x.recordId, x]));
  const shopOnly = new Set((payments?.match?.shopOnly ?? []).map((x) => x.recordId));

  return (
    <div className="a2-z" data-testid="books-account">
      {head}
      <div className="a2-kpis a2-mt12" data-testid="books-kpis">
        <div className="a2-card a2-kpi">
          <div className="a2-kl">{t(d, 'bk.kpi.shop')}</div>
          <div className="a2-kv" data-testid="books-balance">
            {m(ov.balanceMinor)}
          </div>
          <div className="a2-xs a2-mt6">{diff === null ? null : diff === 0 ? <span className="a2-pill ok">{t(d, 'bk.same')}</span> : <span className="a2-pill bad">{t(d, 'bk.differs', { amount: m(Math.abs(diff)) })}</span>}</div>
        </div>
        <div className="a2-card a2-kpi">
          <div className="a2-kl">{t(d, 'bk.kpi.erp')}</div>
          <div className="a2-kv">{m(ov.erp?.balanceMinor)}</div>
          <div className="a2-xs a2-mute a2-mt6">{ov.erp?.checkedAt ? t(d, 'bk.kpi.checked', { at: at(ov.erp.checkedAt) }) : t(d, 'bk.kpi.never')}</div>
        </div>
        <div className="a2-card a2-kpi">
          <div className="a2-kl">{t(d, 'bk.kpi.pipeline')}</div>
          <div className="a2-kv">{m(ov.pipeline?.totalMinor ?? 0)}</div>
          <div className="a2-xs a2-mute a2-mt6">{t(d, 'bk.kpi.pieces', { n: n(ov.pipeline?.pieces ?? 0) })}</div>
        </div>
        <div className="a2-card a2-kpi">
          <div className="a2-kl">{t(d, 'bk.kpi.waiting')}</div>
          <div className="a2-kv">{m(ov.pipeline?.waitingCheckMinor ?? 0)}</div>
          <div className="a2-xs a2-mute a2-mt6">{t(d, 'bk.kpi.erp')}: {m(ov.erp?.waitingCheckMinor)}</div>
        </div>
      </div>
      <section className="a2-card tight a2-mt12" data-testid="books-hold" data-hold={ov.erp?.onHold ? 'on' : 'off'}>
        <div className="a2-gap8" style={{ flexWrap: 'wrap' }}>
          <span className={`a2-pill ${ov.erp?.onHold ? 'bad' : 'ok'}`}>{t(d, ov.erp?.onHold ? 'bk.hold.on' : 'bk.hold.off')}</span>
          <span className={`a2-pill ${ov.chain.ok ? 'line' : 'bad'}`} data-testid="books-chain">
            {ov.chain.ok ? t(d, 'bk.chain.ok', { n: n(ov.chain.entries) }) : t(d, 'bk.chain.broken', { seq: n(ov.chain.brokenAt ?? 0) })}
          </span>
        </div>
        {ov.erp?.onHold && ov.erp.reason ? <p className="a2-xs a2-mt6">{t(d, 'bk.hold.reason', { reason: ov.erp.reason })}</p> : null}
        {ov.erp?.onHold && ov.erp.heldAt ? <p className="a2-xs a2-mute a2-mt6">{t(d, 'bk.hold.since', { at: at(ov.erp.heldAt) })}</p> : null}
        {!ov.erp?.onHold && ov.erp?.holdsOn ? <p className="a2-xs a2-mt6">{t(d, 'bk.hold.holdsOn', { date: day(ov.erp.holdsOn) })}</p> : null}
        <p className="a2-xs a2-mute a2-mt6">{ov.erp?.lastPaymentAt ? t(d, 'bk.hold.lastPay', { date: day(ov.erp.lastPaymentAt), days: n(ov.erp.daysSinceLastPayment ?? 0) }) : t(d, 'bk.hold.noPay')}</p>
        {ov.link.openingBalanceMinor != null ? <p className="a2-xs a2-mute a2-mt6">{t(d, 'bk.opening', { amount: m(ov.link.openingBalanceMinor), date: day(ov.link.openingBalanceDate) })}</p> : null}
      </section>
      <nav className="a2-views a2-mt12" aria-label={t(d, 'bk.viewsAria')} data-testid="books-views">
        {VIEWS.map((v) => (
          <Link key={v} className={`a2-view${v === tab ? ' on' : ''}`} href={go(v === 'entries' ? HERE : `${HERE}?view=${v}`)} aria-current={v === tab ? 'page' : undefined} scroll={false} data-view={v}>
            {t(d, `bk.view.${v}`)}
          </Link>
        ))}
      </nav>

      {entries ? (
        <>
          <form className="a2-fbar a2-mt12" action={HERE} method="get" role="search" aria-label={t(d, 'bk.view.entries')} data-testid="books-filters">
            {storeId === MOTHER_STORE_ID ? null : <input type="hidden" name="storeId" value={storeId} />}
            <span className="a2-fsel">
              <label className="a2-sr" htmlFor="bk-kind">
                {t(d, 'bk.filter.kind')}
              </label>
              <select id="bk-kind" className="a2-sel" name="kind" defaultValue={kind ?? ''}>
                <option value="">
                  {t(d, 'bk.filter.kind')}: {t(d, 'bk.filter.all')}
                </option>
                {ERP_ACCOUNT_ENTRY_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(d, `bk.kind.${k}`)}
                  </option>
                ))}
              </select>
            </span>
            <label className="a2-fsel">
              <span className="a2-sr">{t(d, 'bk.filter.q')}</span>
              <input className="a2-inp" type="search" name="q" defaultValue={q ?? ''} placeholder={t(d, 'bk.filter.q')} maxLength={80} autoComplete="off" />
            </label>
            <button type="submit" className="a2-btn">
              {t(d, 'bk.filter.go')}
            </button>
          </form>
          {entries.rows.length ? (
            <section className="a2-card a2-mt12" data-testid="books-entries">
              <div className="a2-tblw">
                <table className="a2-tbl">
                  <thead>
                    <tr>
                      <th>{t(d, 'bk.col.seq')}</th>
                      <th>{t(d, 'bk.col.date')}</th>
                      <th>{t(d, 'bk.col.kind')}</th>
                      <th>{t(d, 'bk.col.ref')}</th>
                      <th className="r">{t(d, 'bk.col.amount')}</th>
                      <th>{t(d, 'bk.col.source')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.rows.map((r) => (
                      <tr key={r.id} data-testid="books-entry" data-kind={r.kind}>
                        <td className="a2-tdh">
                          <span className="a2-mono">{n(r.seq)}</span>
                        </td>
                        <td data-l={t(d, 'bk.col.date')}>{day(r.businessDate)}</td>
                        <td data-l={t(d, 'bk.col.kind')}>
                          <b>{t(d, `bk.kind.${r.kind}`)}</b>
                          {r.reversedBy ? <div className="a2-xs a2-mute">{t(d, 'bk.reversedBy')}</div> : null}
                          {r.reverses ? <div className="a2-xs a2-mute">{t(d, 'bk.reverses')}</div> : null}
                        </td>
                        <td data-l={t(d, 'bk.col.ref')}>
                          <span className="a2-mono">{r.externalOrderId ?? r.exchangeId ?? r.paymentRef ?? '—'}</span>
                          {r.lineId ? <div className="a2-xs a2-mute a2-mono">{r.lineId}</div> : null}
                        </td>
                        <td className="r" data-l={t(d, 'bk.col.amount')}>
                          <b className="a2-num">{m(r.amountMinor)}</b>
                        </td>
                        <td data-l={t(d, 'bk.col.source')}>
                          <span className="a2-pill line">{t(d, `bk.source.${r.source}`)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {pager(entries, { kind, q })}
            </section>
          ) : (
            <Empty title={t(d, 'bk.empty.entries')} body={t(d, 'bk.empty.entriesSub')} />
          )}
        </>
      ) : null}

      {payments ? (
        <>
          <section className="a2-card tight a2-mt12" data-testid="books-pay-record">
            <p className="a2-xs a2-mute">{t(d, 'bk.pay.warn')}</p>
            {canRecord ? (
              <div className="a2-mt6">
                <BooksForm
                  dict={bd}
                  url={booksApi(storeId, '/payments')}
                  label={t(d, 'bk.pay.record')}
                  busyLabel={t(d, 'bk.pay.busy')}
                  sendLabel={t(d, 'bk.pay.send')}
                  digits={money.digits}
                  testId="books-pay"
                  done={t(d, 'bk.pay.done')}
                  fields={[
                    { name: 'paidOn', label: t(d, 'bk.pay.paidOn'), kind: 'date', min: 10, value: today },
                    { name: 'amountMinor', label: t(d, 'bk.pay.amount'), kind: 'money' },
                    { name: 'method', label: t(d, 'bk.pay.method'), kind: 'text', maxLength: 40 },
                    { name: 'reference', label: t(d, 'bk.pay.reference'), kind: 'text', maxLength: 200 },
                    { name: 'note', label: t(d, 'bk.pay.note'), kind: 'text', maxLength: 500 },
                  ]}
                />
              </div>
            ) : (
              <p className="a2-xs a2-mt6">{t(d, 'bk.pay.readOnly')}</p>
            )}
          </section>
          {payments.records.length ? (
            <section className="a2-card a2-mt12" data-testid="books-payments">
              <div className="a2-tblw">
                <table className="a2-tbl">
                  <thead>
                    <tr>
                      <th>{t(d, 'bk.pay.col.paidOn')}</th>
                      <th className="r">{t(d, 'bk.pay.col.amount')}</th>
                      <th>{t(d, 'bk.pay.col.method')}</th>
                      <th>{t(d, 'bk.pay.col.reference')}</th>
                      <th>{t(d, 'bk.pay.col.match')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.records.map((r) => {
                      const hit = matchOf.get(r.id);
                      return (
                        <tr key={r.id} data-testid="books-payment">
                          <td className="a2-tdh">{day(r.paidOn)}</td>
                          <td className="r" data-l={t(d, 'bk.pay.col.amount')}>
                            <b className="a2-num">{m(r.amountMinor)}</b>
                          </td>
                          <td data-l={t(d, 'bk.pay.col.method')}>{r.method ?? '—'}</td>
                          <td data-l={t(d, 'bk.pay.col.reference')}>
                            <span className="a2-mono">{r.reference ?? '—'}</span>
                          </td>
                          <td data-l={t(d, 'bk.pay.col.match')}>
                            {r.reversesId ? (
                              <span className="a2-pill line">{t(d, 'bk.pay.reversal')}</span>
                            ) : r.reversedBy ? (
                              <span className="a2-pill line">{t(d, 'bk.pay.reversed')}</span>
                            ) : hit ? (
                              <span className="a2-pill ok">{t(d, 'bk.pay.matched', { date: day(hit.erpDate) })}</span>
                            ) : shopOnly.has(r.id) ? (
                              <span className="a2-pill gold">{t(d, 'bk.pay.shopOnly')}</span>
                            ) : null}
                            {canRecord && !r.reversesId && !r.reversedBy ? (
                              <div className="a2-mt6">
                                <BooksForm
                                  dict={bd}
                                  url={booksApi(storeId, `/payments/${r.id}/reverse`)}
                                  label={t(d, 'bk.pay.reverse')}
                                  busyLabel={t(d, 'bk.pay.reverseBusy')}
                                  sendLabel={t(d, 'bk.pay.reverse')}
                                  tone="ghost"
                                  testId="books-pay-reverse"
                                  done={t(d, 'bk.pay.reverseDone')}
                                  fields={[{ name: 'reason', label: t(d, 'bk.pay.reverseReason'), kind: 'text', min: 3 }]}
                                />
                              </div>
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
            <Empty title={t(d, 'bk.empty.payments')} />
          )}
          {payments.match?.erpOnly.length ? (
            <section className="a2-card tight a2-mt12" data-testid="books-erp-only">
              <h2 className="a2-h4">{t(d, 'bk.pay.erpOnly')}</h2>
              <ul className="a2-stack a2-mt6">
                {payments.match.erpOnly.map((e) => (
                  <li key={e.entryEventId} className="a2-sm">
                    {day(e.date)} · <b className="a2-num">{m(e.amountMinor)}</b> · <span className="a2-mono">{e.reference ?? '—'}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}

      {pieces ? (
        <>
          <form className="a2-fbar a2-mt12" action={HERE} method="get" role="search" aria-label={t(d, 'bk.view.pipeline')} data-testid="books-pipe-filters">
            {storeId === MOTHER_STORE_ID ? null : <input type="hidden" name="storeId" value={storeId} />}
            <input type="hidden" name="view" value="pipeline" />
            <span className="a2-fsel">
              <label className="a2-sr" htmlFor="bk-state">
                {t(d, 'bk.filter.state')}
              </label>
              <select id="bk-state" className="a2-sel" name="state" defaultValue={state ?? ''}>
                <option value="">{t(d, 'bk.filter.inPipeline')}</option>
                {ERP_PIECE_STATES.map((s) => (
                  <option key={s} value={s}>
                    {t(d, `bk.state.${s}`)}
                  </option>
                ))}
              </select>
            </span>
            <label className="a2-fsel">
              <span className="a2-sr">{t(d, 'bk.filter.q')}</span>
              <input className="a2-inp" type="search" name="q" defaultValue={q ?? ''} placeholder={t(d, 'bk.filter.q')} maxLength={80} autoComplete="off" />
            </label>
            <button type="submit" className="a2-btn">
              {t(d, 'bk.filter.go')}
            </button>
          </form>
          {pieces.rows.length ? (
            <section className="a2-card a2-mt12" data-testid="books-pieces">
              <div className="a2-tblw">
                <table className="a2-tbl">
                  <thead>
                    <tr>
                      <th>{t(d, 'bk.pipe.col.order')}</th>
                      <th>{t(d, 'bk.pipe.col.sku')}</th>
                      <th className="r">{t(d, 'bk.pipe.col.price')}</th>
                      <th>{t(d, 'bk.pipe.col.state')}</th>
                      <th>{t(d, 'bk.pipe.col.since')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pieces.rows.map((p) => (
                      <tr key={p.id} data-testid="books-piece" data-state={p.state}>
                        <td className="a2-tdh">
                          <span className="a2-mono">{p.externalOrderId}</span>
                          <div className="a2-xs a2-mute a2-mono">{p.lineId}</div>
                        </td>
                        <td data-l={t(d, 'bk.pipe.col.sku')}>
                          <span className="a2-mono">{p.sku}</span>
                        </td>
                        <td className="r" data-l={t(d, 'bk.pipe.col.price')}>
                          <b className="a2-num">{m(p.buyingPriceMinor)}</b>
                        </td>
                        <td data-l={t(d, 'bk.pipe.col.state')}>
                          <span className={`a2-pill ${p.state === 'WAITING_CHECK' ? 'gold' : 'line'}`}>{t(d, `bk.state.${p.state}`)}</span>
                        </td>
                        <td data-l={t(d, 'bk.pipe.col.since')}>{day(p.stateDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {pager(pieces, { state, q })}
            </section>
          ) : (
            <Empty title={t(d, 'bk.empty.pipeline')} body={t(d, 'bk.empty.pipelineSub')} icon="truck" />
          )}
        </>
      ) : null}
    </div>
  );
}
