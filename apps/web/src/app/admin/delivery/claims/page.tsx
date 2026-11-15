// S28 · PR 711 (CN-048, admin prototype v5, Couriers › Claims & payouts) at /admin/delivery/claims — ONE page across every
// courier: each claim (lost, damaged, short cash, rider's extra …) with its state, what was claimed, what the courier paid, how
// old it is and whether it is late; the figures; and the money each courier holds, has paid and still owes, with the latest
// payout requests. Filters by courier, state, kind and the day raised (a plain GET form: the address says what is shown).
// READ ONLY apart from PR 673's own steps on a claim (Mark sent / Settled / Rejected, behind `delivery.claims` and the owner's
// claims switch); no money moves from here. The ledger and the cash position are PR 673's and PR 193's (`@extas/payments`).
// Seeing needs `delivery.read`; the money side also `payments.view`. Practice claims show only while practice mode is on.
// Words: messages/admin-claims.*.json (`claimsOverview.*`) and the Courier 360 words it shares. Guide: docs/admin-guide/pages/delivery/claims.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { daysPeriod } from '@extas/metrics';
import * as pay from '@extas/payments';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { StepButton } from '@/components/admin/courier-report/Parts';
import { AskPayout } from '@/components/admin/couriers/PayoutPanel';
import { formatMoney, formatNumber, moneyOf } from '@/components/admin/products/model';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { withCouriers } from '@/lib/admin-couriers';
import { withCourierReport } from '@/lib/admin-courier-report';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { orderHref } from '@/lib/admin-orders/model';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { claimsPageCard } from '@/lib/courier-claims-page-api';
import { t, type Dict } from '@/lib/i18n';
import { paymentsDeps } from '@/lib/payments-api';
import bn from '../../../../../messages/admin-claims.bn.json';
import en from '../../../../../messages/admin-claims.en.json';
import '../../settings/settings.css';
import '../../settings-cards.css';
import '../../reports/delivery/report.css';
import './claims.css';

export const dynamic = 'force-dynamic';

const KEY = 'courierClaims';
const HERE = '/admin/delivery/claims';
const API = '/api/admin/delivery/claims';
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, claimsOverview: (view.lang === 'bn' ? bn : en).claimsOverview as unknown as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'claimsOverview.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function ClaimsPage({ searchParams }: { searchParams: Search }) {
  const deps = adminDeps();
  const [sp, plain, access] = await Promise.all([searchParams, adminView(deps), pageAccess('delivery.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(withCouriers(withCourierReport(plain)));
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="claims-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="delivery.read" />
      </div>
    );
  const co = (k: string, v?: Record<string, string | number>) => t(d, `claimsOverview.${k}`, v);
  const cr = (k: string, v?: Record<string, string | number>) => t(d, `cr.${k}`, v);
  const currency = await access.deps.resolver.value('store.currency', { storeId: MOTHER_STORE_ID });
  const money = moneyOf(currency, view.locale);
  const m = (x: number) => formatMoney(x, money);
  const n = (x: number) => formatNumber(x, view.locale);
  const day = new Intl.DateTimeFormat(view.locale, { timeZone: view.timeZone, dateStyle: 'medium', numberingSystem: 'latn' });
  const when = new Intl.DateTimeFormat(view.locale, { timeZone: view.timeZone, dateStyle: 'medium', timeStyle: 'short', numberingSystem: 'latn' });

  // the filter, from the address
  const courier = one(sp.c) && UUID.test(one(sp.c)!) ? one(sp.c)! : '';
  const status = (pay.OVERVIEW_STATUS as readonly string[]).includes(one(sp.s) ?? '') ? (one(sp.s) as pay.OverviewStatus) : 'all';
  const kind = (pay.CLAIM_KINDS as readonly string[]).includes(one(sp.k) ?? '') ? (one(sp.k) as pay.ClaimKind) : '';
  const from = DAY_RE.test(one(sp.from) ?? '') ? one(sp.from)! : '';
  const to = DAY_RE.test(one(sp.to) ?? '') ? one(sp.to)! : '';
  const pageNo = Math.max(1, Number.parseInt(one(sp.page) ?? '1', 10) || 1);
  const range = (() => {
    try {
      if (from && to) return daysPeriod(from, to, view.timeZone);
      if (from) return { from: daysPeriod(from, from, view.timeZone).from, to: undefined };
      if (to) return { from: undefined, to: daysPeriod(to, to, view.timeZone).to };
    } catch {
      /* the end before the start: no date filter */
    }
    return { from: undefined, to: undefined };
  })();
  const href = (over: Record<string, string | number> = {}) => {
    const q = new URLSearchParams();
    const all: Record<string, string | number> = { c: courier, s: status === 'all' ? '' : status, k: kind, from, to, page: 1, ...over };
    for (const [k, v] of Object.entries(all)) if (String(v) !== '' && !(k === 'page' && Number(v) <= 1)) q.set(k, String(v));
    const qs = q.toString();
    return qs ? `${HERE}?${qs}` : HERE;
  };

  const who: pay.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const pd = await paymentsDeps(access.deps);
  const [o, claimsSwitch, card, toClaim] = await Promise.all([
    pay.claimsOverview(pd, who, { ...(courier ? { courierAccountId: courier } : {}), status, ...(kind ? { kind } : {}), ...range, page: pageNo }),
    access.deps.resolver.value('delivery.courier.claims', { storeId: MOTHER_STORE_ID }),
    claimsPageCard(access.deps, MOTHER_STORE_ID),
    pay.listClaims(pd, who, {}).then((l) => l.claimable).catch(() => []),
  ]);
  const held = access.guard.permissions;
  const canMove = (held?.has('delivery.claims') ?? false) && claimsSwitch.enabled;
  const canEdit = held?.has('settings.write') ?? false;
  const f = o.figures;
  // PR 733: "Request payout" here asks the courier for real (the owner's PIN, `payments.settle`), for a courier that can be asked now
  const canAsk = held?.has('payments.settle') ?? false;
  const askable = new Map<string, pay.PayoutView>();
  if (canAsk && o.money) {
    await Promise.all(
      o.money.couriers.map(async (c) => {
        try {
          const v = await pay.payoutView(pd, who, c.courierAccountId);
          if (v.enabled && v.supported === 'request') askable.set(c.courierAccountId, v);
        } catch {
          /* a courier whose payout view cannot be read keeps the link to its own page */
        }
      }),
    );
  }
  const cd: Dict = { cr: d.cr as Dict };
  const openMinor = f.open.claimedMinor + f.sent.claimedMinor;
  const openCount = f.open.count + f.sent.count;
  const inProgress = o.money ? o.money.totals.requestedMinor : null;
  const outcomePill = { open: 'warn', sent: 'info', won: 'ok', lost: 'line' } as const;
  const c360 = (id: string, s: string) => `/admin/delivery/couriers/${id}?s=${s}`;

  const opt = (k: string) => co(`opt.${k}`);
  const texts: FieldsCardTexts = {
    h: opt('h'),
    d: opt('d'),
    save: opt('save'),
    saving: opt('saving'),
    saved: opt('saved'),
    discard: opt('discard'),
    unsaved: opt('unsaved'),
    readOnly: opt('readOnly'),
    pairHelp: '',
    err: Object.fromEntries(['STALE', 'INVALID_INPUT', 'FORBIDDEN', 'forbidden', 'unauthorized', 'network', 'other'].map((k) => [k, opt(`err.${k}`)])),
  };
  const fields: FieldsCardField[] = [
    { kind: 'number', path: 'claimRows', label: opt('claimRows'), help: opt('claimRowsHelp'), min: 5, max: 200 },
    { kind: 'number', path: 'payoutRows', label: opt('payoutRows'), help: opt('payoutRowsHelp'), min: 3, max: 100 },
  ];

  const fig = (label: string, value: string, sub: string, testId: string, tone = '') => (
    <div className={`a2-card a2-kpi ${tone}`} data-testid={testId}>
      <div className="a2-kl">{label}</div>
      <div className="a2-kv">{value}</div>
      <div className="a2-kf">
        <span className="a2-kn">{sub}</span>
      </div>
    </div>
  );
  const dueCount = o.terms.deadlineEnabled ? (f.late.count ? f.late : f.soon) : null;

  return (
    <div className="a2-z" data-testid="claims-page" data-lm-ready="">
      <PageHead
        view={view}
        place={locateKey(KEY)}
        title={co('title')}
        sub={co('sub')}
        right={
          canMove ? (
            <a className="a2-btn pri" href="#claimable" data-testid="claims-new">
              {co('new')}
            </a>
          ) : null
        }
      />
      <SectionTabs view={view} current={KEY} />

      <div className="a2-kpis a2-mt12">
        {fig(co('k.open'), n(openCount), co('k.openSub', { amount: m(openMinor) }), 'claims-fig-open')}
        {fig(co('k.recovered'), m(f.won.paidMinor), co('k.recoveredSub', { asked: m(f.won.claimedMinor) }), 'claims-fig-recovered')}
        {dueCount
          ? fig(f.late.count ? co('k.late') : co('k.due'), n(dueCount.count), f.late.count ? co('k.lateSub', { amount: m(f.late.claimedMinor) }) : co('k.dueSub', { amount: m(f.soon.claimedMinor) }), 'claims-fig-due', f.late.count ? 'bad' : '')
          : fig(co('k.dueOff'), '—', co('k.dueOffSub'), 'claims-fig-due')}
        {inProgress !== null ? fig(co('k.inProgress'), m(inProgress), co('k.inProgressSub', { amount: m(inProgress) }), 'claims-fig-payouts') : fig(co('k.inProgress'), '—', co('money.noPerm'), 'claims-fig-payouts')}
      </div>

      <section className="a2-card a2-mt12" data-testid="claims-ledger">
        <h2 className="a2-h3">{co('ledger.title')}</h2>
        <p className="a2-sm a2-mute">{co('ledger.sub')} · {co('ledger.count', { n: n(o.total) })}</p>
        <form className="a2-mt12" action={HERE} method="get" aria-label={co('f.label')} data-testid="claims-filter">
          <div className="cl-filter">
            <div className="a2-fld">
              <label className="a2-lbl" htmlFor="cl-c">{co('f.courier')}</label>
              <select id="cl-c" name="c" className="a2-sel" defaultValue={courier}>
                <option value="">{co('f.allCouriers')}</option>
                {o.couriers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="a2-fld">
              <label className="a2-lbl" htmlFor="cl-k">{co('f.kind')}</label>
              <select id="cl-k" name="k" className="a2-sel" defaultValue={kind}>
                <option value="">{co('f.allKinds')}</option>
                {pay.CLAIM_KINDS.map((k) => (
                  <option key={k} value={k}>{t(d, `courierReport.claims.kind.${k}`)}</option>
                ))}
              </select>
            </div>
            <div className="a2-fld">
              <label className="a2-lbl" htmlFor="cl-from">{co('f.from')}</label>
              <input id="cl-from" name="from" type="date" className="a2-inp" defaultValue={from} />
            </div>
            <div className="a2-fld">
              <label className="a2-lbl" htmlFor="cl-to">{co('f.to')}</label>
              <input id="cl-to" name="to" type="date" className="a2-inp" defaultValue={to} />
            </div>
            <div className="a2-gap8" style={{ flexWrap: 'wrap' }}>
              {status !== 'all' ? <input type="hidden" name="s" value={status} /> : null}
              <button type="submit" className="cl-go" data-testid="claims-show">{co('f.show')}</button>
              {courier || kind || from || to || status !== 'all' ? <Link href={HERE} className="cl-link" data-testid="claims-clear">{co('f.clear')}</Link> : null}
            </div>
          </div>
          <nav className="cl-chips" aria-label={co('f.status')} data-testid="claims-states">
            {pay.OVERVIEW_STATUS.map((s) => (
              <Link key={s} href={href({ s: s === 'all' ? '' : s })} className={`cl-chip ${status === s ? 'on' : ''}`} aria-current={status === s ? 'true' : undefined} data-state={s}>
                {co(`f.s.${s}`)}
              </Link>
            ))}
          </nav>
        </form>

      {!claimsSwitch.enabled ? (
        <div className="a2-note a2-mt12" data-testid="claims-off">
          {co('off')} <Link href="/admin/delivery/settings">{cr('s.settingsOpen')}</Link>
        </div>
      ) : null}


        {o.rows.length ? (
          <div className="a2-tblw a2-mt12">
            <table className="a2-tbl" data-testid="claims-table">
              <thead>
                <tr>
                  <th>{co('t.claim')}</th>
                  <th>{co('t.type')}</th>
                  <th className="r">{co('t.amount')}</th>
                  <th>{co('t.deadline')}</th>
                  <th>{co('t.status')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {o.rows.map((r) => (
                  <tr key={r.id} className="cl-row" data-testid="claim-row" data-status={r.status} data-outcome={r.outcome}>
                    <td className="a2-tdh" data-l={co('t.claim')}>
                      <Link href={orderHref(r.orderId)}>{r.orderNumber ?? '—'}</Link>
                      <span className="a2-xs a2-mute a2-blk">
                        <Link href={c360(r.courierAccountId, 'claims')}>{r.courier || '—'}</Link>
                        {r.consignmentId ? ` · ${r.consignmentId}` : ''}
                        {r.courierRef ? ` · ${r.courierRef}` : ''}
                      </span>
                      {r.practice ? <span className="a2-pill line" data-testid="claim-practice">{co('ledger.practice')}</span> : null}
                    </td>
                    <td data-l={co('t.type')}>
                      {t(d, `courierReport.claims.kind.${r.kind}`)}
                      <span className="a2-xs a2-mute a2-blk" style={{ whiteSpace: 'pre-line' }}>
                        {r.note ?? (r.closedAt ? co('ledger.ageClosed', { n: n(r.ageDays) }) : co('ledger.age', { n: n(r.ageDays) }))}
                      </span>
                    </td>
                    <td className="r" data-l={co('t.amount')}>
                      <b>{m(r.claimedMinor)}</b>
                      {r.settledMinor !== null ? <span className="a2-xs a2-blk" style={{ color: 'var(--ok)' }}>{co('ledger.paid', { amount: m(r.settledMinor) })}</span> : null}
                    </td>
                    <td data-l={co('t.deadline')}>
                      {r.deadline ? <span className={`a2-pill ${r.deadline === 'late' ? 'bad' : 'warn'}`} data-testid="claim-deadline">{cr(`k.dl.${r.deadline}`)}</span> : r.deadlineAt ? cr('k.deadline', { date: day.format(r.deadlineAt) }) : '—'}
                    </td>
                    <td data-l={co('t.status')}>
                      <span className={`a2-pill ${outcomePill[r.outcome]}`}>{cr(`k.out.${r.outcome}`)}</span>
                    </td>
                    <td>
                      {canMove && (r.status === 'OPEN' || r.status === 'SENT') && !r.practice ? (
                        <div className="a2-gap8" style={{ flexWrap: 'wrap' }}>
                          {r.status === 'OPEN' ? <StepButton dict={d} url={`${API}/${r.id}/move`} body={{ to: 'SENT' }} label={t(d, 'courierReport.claims.send')} field={{ name: 'courierRef', label: t(d, 'courierReport.claims.ref'), optional: true }} testId="claim-sent" /> : null}
                          <StepButton dict={d} url={`${API}/${r.id}/move`} body={{ to: 'SETTLED' }} label={t(d, 'courierReport.claims.settle')} field={{ name: 'settledMinor', label: t(d, 'courierReport.claims.paid'), money: true }} tone="pri" testId="claim-settled" />
                          <StepButton dict={d} url={`${API}/${r.id}/move`} body={{ to: 'REJECTED' }} label={t(d, 'courierReport.claims.reject')} field={{ name: 'note', label: t(d, 'courierReport.claims.why') }} testId="claim-rejected" />
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="a2-sm a2-mute a2-mt6" data-testid="claims-none">{co('ledger.none')}</p>
        )}
        {o.pages > 1 ? (
          <div className="cl-pager" data-testid="claims-pager">
            {o.page > 1 ? <Link href={href({ page: o.page - 1 })} className="cl-link">{co('ledger.prev')}</Link> : <span />}
            <span className="a2-sm a2-mute">{co('ledger.page', { n: n(o.page), m: n(o.pages) })}</span>
            {o.page < o.pages ? <Link href={href({ page: o.page + 1 })} className="cl-link">{co('ledger.next')}</Link> : <span />}
          </div>
        ) : null}
      </section>

      {canMove ? (
        <section className="a2-card a2-mt12" id="claimable" data-testid="claims-claimable">
          <h2 className="a2-h3">{co('claimable.title')}</h2>
          <p className="a2-sm a2-mute">{co('claimable.sub')}</p>
          {toClaim.length ? (
            <div className="a2-tblw a2-mt12">
              <table className="a2-tbl">
                <thead>
                  <tr>
                    <th>{co('t.claim')}</th>
                    <th>{co('t.type')}</th>
                    <th className="r">{co('t.amount')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {toClaim.map((p) => (
                    <tr key={`${p.shipmentId}:${p.kind}`} data-testid="claimable-row">
                      <td className="a2-tdh" data-l={co('t.claim')}>
                        {p.orderNumber}
                        {p.consignmentId ? <span className="a2-xs a2-mute a2-blk">{p.consignmentId}</span> : null}
                      </td>
                      <td data-l={co('t.type')}>{t(d, `courierReport.claims.kind.${p.kind}`)}</td>
                      <td className="r" data-l={co('t.amount')}>{p.declaredValueMinor !== null ? m(p.declaredValueMinor) : '—'}</td>
                      <td>
                        <StepButton dict={d} url={API} body={{ shipmentId: p.shipmentId, kind: p.kind }} withKey label={t(d, 'courierReport.claims.claim')} field={{ name: 'note', label: t(d, 'courierReport.claims.claimNote') }} tone="pri" testId="claim-raise" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="a2-sm a2-mute a2-mt6">{co('claimable.none')}</p>
          )}
        </section>
      ) : null}

      <section className="a2-card a2-mt12" data-testid="claims-money">
        <h2 className="a2-h3">{co('money.title')}</h2>
        <p className="a2-sm a2-mute">{co('money.sub')}</p>
        {o.money ? (
          <>
            {o.money.couriers.length ? (
              <div className="cl-money a2-mt6">
                {o.money.couriers.map((c) => (
                  <div key={c.courierAccountId} className="a2-card tight" data-testid="claims-courier-money">
                    <b>{c.courier || '—'}</b>
                    <dl className="cl-kv">
                      <dt className="a2-sm a2-mute">{co('money.holds')}</dt>
                      <dd>{m(c.holdsMinor)} <span className="a2-xs a2-mute">{co('money.holdsN', { n: n(c.holdsParcels) })}</span></dd>
                      {c.onRoadMinor ? (
                        <>
                          <dt className="a2-sm a2-mute">{co('money.onRoad')}</dt>
                          <dd>{m(c.onRoadMinor)}</dd>
                        </>
                      ) : null}
                      <dt className="a2-sm a2-mute">{co('money.paid')}</dt>
                      <dd>{m(c.paidMinor)}</dd>
                      <dt className="a2-sm a2-mute">{co('money.requested')}</dt>
                      <dd>{m(c.requestedMinor)}</dd>
                      <dt className="a2-sm a2-mute">{co('money.claims')}</dt>
                      <dd>{m(c.claimsMinor)}</dd>
                      <dt className="a2-sm"><b>{co('money.owed')}</b></dt>
                      <dd>{m(c.owedMinor)}</dd>
                    </dl>
                    {askable.get(c.courierAccountId) ? (
                      <div className="a2-mt6" data-testid="claims-ready">
                        <p className="a2-sm">
                          <b>{co('money.ready')}</b> {m(askable.get(c.courierAccountId)!.holds.netMinor)} <span className="a2-xs a2-mute">{co('money.holdsN', { n: n(askable.get(c.courierAccountId)!.holds.parcels) })}</span>
                        </p>
                        {askable.get(c.courierAccountId)!.blockedBy.length ? (
                          <ul className="a2-xs a2-mute" style={{ paddingLeft: 18 }}>
                            {askable.get(c.courierAccountId)!.blockedBy.map((b) => (
                              <li key={b}>{cr(`y.blocked.${b}`)}</li>
                            ))}
                          </ul>
                        ) : (
                          <AskPayout dict={cd} courierId={c.courierAccountId} label={co('money.request')} />
                        )}
                      </div>
                    ) : null}
                    <div className="a2-gap8 a2-mt6">
                      {askable.has(c.courierAccountId) ? null : (
                        <Link href={c360(c.courierAccountId, 'payouts')} className="cl-link pri" data-testid="claims-request-payout">{co('money.request')}</Link>
                      )}
                      <Link href={c360(c.courierAccountId, 'payouts')} className="cl-link">{co('money.open360')}</Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="a2-sm a2-mute a2-mt6">{co('money.none')}</p>
            )}
            <h3 className="a2-h3 a2-mt12">{co('money.latest')}</h3>
            {o.money.latest.length ? (
              <div className="a2-tblw a2-mt6" data-testid="claims-payouts">
                <table className="a2-tbl">
                  <thead>
                    <tr>
                      <th>{co('t.requested')}</th>
                      <th>{cr('c.pick')}</th>
                      <th className="r">{co('t.amount')}</th>
                      <th>{co('t.status')}</th>
                      <th>{co('t.paidOn')}</th>
                      <th>{co('t.reference')}</th>
                      <th className="r">{co('t.paid')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.money.latest.map((p) => (
                      <tr key={p.id} data-testid="payout-line" data-state={p.state}>
                        <td className="a2-tdh" data-l={co('t.requested')}>
                          {when.format(p.requestedAt)}
                          <span className="a2-xs a2-mute a2-blk">{co('money.covers', { amount: m(p.coveredMinor) })}</span>
                        </td>
                        <td data-l={cr('c.pick')}>{p.courier || '—'}</td>
                        <td className="r" data-l={co('t.amount')}><b>{m(p.amountMinor)}</b></td>
                        <td data-l={co('t.status')}>
                          <span className={`a2-pill ${p.state === 'PAID' ? 'ok' : p.state === 'REJECTED' ? 'bad' : 'info'}`}>{cr(`y.state.${p.state}`)}</span>
                          {p.differenceMinor !== null ? <span className="a2-xs a2-blk" style={{ color: 'var(--bad)' }}>{cr('y.diff', { diff: m(Math.abs(p.differenceMinor)), dir: p.differenceMinor > 0 ? cr('y.dir.more') : cr('y.dir.less') })}</span> : null}
                        </td>
                        <td data-l={co('t.paidOn')}>{p.paidAt ? day.format(p.paidAt) : '—'}</td>
                        <td data-l={co('t.reference')}>
                          {p.paymentRef ?? '—'}
                          {p.method ? <span className="a2-xs a2-mute a2-blk">{p.method}</span> : null}
                        </td>
                        <td className="r" data-l={co('t.paid')}>{p.paidMinor !== null ? m(p.paidMinor) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="a2-sm a2-mute a2-mt6">{co('money.noPayouts')}</p>
            )}
          </>
        ) : (
          <p className="a2-sm a2-mute a2-mt6" data-testid="claims-money-denied">{co('money.noPerm')}</p>
        )}
      </section>

      <div className="a2-mt12">
        <FieldsCard url="/api/admin/delivery/claims-overview/options" screen={{ key: card.key, value: { ...card.value }, version: card.version }} fields={fields} texts={texts} canEdit={canEdit} testId="claims-options" />
      </div>
    </div>
  );
}
