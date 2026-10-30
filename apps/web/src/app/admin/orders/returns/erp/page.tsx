// CN-028 · PR 613 — the Returns section on ERP contract v6 at /admin/orders/returns/erp (docs/RETAIL-ERP-MODEL.md §6,
// §15; docs/erp/site-changes-v6.md §2.5, §2.9). Read-only: the owner decides every returned piece in the ERP.
//   - Seven tabs (`?tab=`): Partial deliveries · Handed back · On hold in ERP · In ERP return stock · Exchanges ·
//     Approved · Declined (our loss); a piece waiting for the owner shows its countdown (`returns.erpCheck.days`).
//   - `?parcel=<consignment | order number>` opens one parcel's timeline: the courier result and its colour, the return
//     list, the owner's tick, each piece's decision with its reason and date (an undone one struck through), the claims.
//   - Beside: the check against the ERP (`GET /returns/summary`, every night and on "Pull from the ERP and compare
//     again" — the only way to fix a difference), the courier claims, the losses report, and under "More options" the
//     section's settings as they stand (changed in Settings → Orders).
// PR 614: on the Exchanges tab, the exchanges at risk read now from the ERP (`GET /exchanges?status=pending`): the old
// piece not back and checked yet, the 4-day watch (late ones marked), the value billed to us if it never comes back.
// On v5 the page says the old Receive & QC is still used. Needs `returns.view`; the order service checks it again.
// Words: messages/admin-returns.*.json (`returns.erp.*`).
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Fragment } from 'react';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as od from '@extas/orders';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { ErpComparePull } from '@/components/admin/orders/ErpReturns';
import { readDeps } from '@/components/admin/orders/OrderListPage';
import { actionTexts } from '@/components/admin/orders/ReturnsBoard';
import { formatMoney, formatNumber, moneyOf } from '@/components/admin/products/model';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { RETURNS_HREF } from '@/lib/admin-returns/model';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../../messages/admin-returns.bn.json';
import en from '../../../../../../messages/admin-returns.en.json';
import '../../../settings/settings.css';

export const dynamic = 'force-dynamic';

const KEY = 'ordersReturnsErp';
const HERE = `${RETURNS_HREF}/erp`;

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || null;

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, returns: (view.lang === 'bn' ? bn : en) as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'returns.erp.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

const stateTone = (s: string) => (s === 'APPROVED' || s === 'IN_RETURN_STOCK' || s === 'SETTLED' || s === 'CREDITED' ? 'ok' : s === 'DECLINED' || s === 'REFUSED' || s === 'BILLED' ? 'bad' : s === 'HOLD' || s === 'PARTIAL' || s.startsWith('WAITING') || s === 'RETURNED_WAITING_CHECK' ? 'warn' : 'info');
const colourTone = (c: string | null) => (c === 'GREEN' ? 'ok' : c === 'YELLOW' ? 'warn' : c === 'ORANGE' ? 'bad' : '');

export default async function ErpReturnsPage({ searchParams }: { searchParams: Search }) {
  const deps = adminDeps();
  const [plain, sp, access] = await Promise.all([adminView(deps), searchParams, pageAccess('returns.view', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const want = one(sp.tab);
  const tab: od.ErpReturnTab = od.ERP_RETURN_TABS.find((x) => x === want) ?? 'handedBack';
  const parcel = one(sp.parcel);
  const qs = (o: Record<string, string | null>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(o)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `${HERE}?${s}` : HERE;
  };
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(qs({ tab: want ? tab : null, parcel }))}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="returns.view" />
      </div>
    );
  const who: od.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const rd = readDeps(access.deps);
  const at = { storeId: MOTHER_STORE_ID };
  const [overview, currency, runAt, months] = await Promise.all([
    od.returnsErpOverview(rd, who, { tab }),
    access.deps.resolver.value('store.currency', at),
    access.deps.resolver.value('returns.compare.runAt', at),
    access.deps.resolver.value('returns.losses.months', at),
  ]);
  const live = overview.model === 'v6' && overview.linked;
  const [losses, claims, timeline, watch] = live
    ? await Promise.all([od.returnsLosses(rd, who), od.returnsClaims(rd, who), parcel ? od.parcelTimeline(rd, who, parcel) : Promise.resolve(null), tab === 'exchanges' ? od.exchangeWatch(rd, who) : Promise.resolve(null)])
    : [null, null, null, null];

  const d = view.dict;
  const e = (key: string, vars?: Record<string, string | number>) => t(d, `returns.erp.${key}`, vars);
  const n = (x: number) => formatNumber(x, view.locale);
  const money = moneyOf(currency, view.locale);
  const m = (x: number) => formatMoney(x, money);
  const dayFmt = new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeZone: 'UTC', numberingSystem: 'latn' });
  const day = (s: string) => dayFmt.format(new Date(`${s.slice(0, 10)}T00:00:00Z`));
  const dt = new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: view.timeZone, numberingSystem: 'latn' });
  const monthFmt = new Intl.DateTimeFormat(view.locale, { month: 'long', year: 'numeric', timeZone: 'UTC', numberingSystem: 'latn' });
  const word = (group: string, key: string | null) => (key ? (t(d, `returns.erp.${group}.${key}`) === `returns.erp.${group}.${key}` ? key : t(d, `returns.erp.${group}.${key}`)) : '');
  const errors = actionTexts(d).errors;
  const countdown = (r: { daysLeft: number | null; dueOn: string | null }) =>
    r.daysLeft === null ? null : r.daysLeft > 0 ? e('daysLeft', { n: n(r.daysLeft) }) : r.daysLeft === 0 ? e('dueToday') : e('overdue', { n: n(-r.daysLeft) });
  const countTone = (r: { daysLeft: number | null }) => (r.daysLeft === null ? '' : r.daysLeft < 0 ? 'bad' : r.daysLeft <= 2 ? 'warn' : 'line');

  const head = (
    <PageHead
      view={view}
      place={locateKey(KEY)}
      title={e('title')}
      sub={e('sub')}
      crumb={
        <Link className="rt-crumb" href={RETURNS_HREF}>
          <ShellIcon name="cl" size={12} />
          {e('back')}
        </Link>
      }
    />
  );
  if (!live)
    return (
      <div className="a2-z" data-testid="erp-returns-page" data-model={overview.model}>
        {head}
        <SectionTabs view={view} current={KEY} />
        <section className="a2-card" data-testid={overview.model === 'v5' ? 'erp-returns-v5' : 'erp-returns-nolink'}>
          <div className="a2-note">
            <ShellIcon name="info" size={15} />
            <span>{overview.model === 'v5' ? e('v5') : e('noLink')}</span>
          </div>
        </section>
      </div>
    );

  const row = (r: od.ErpReturnRow) => {
    const ref = r.consignmentId ?? r.orderNumber ?? r.externalOrderId;
    const bits = [
      r.lineId ? r.lineId : null,
      r.pieces && !r.lineId ? e('pieces', { n: n(r.pieces) }) : null,
      r.keptPieces !== null ? e('kept', { n: n(r.keptPieces) }) : null,
      r.courier,
      r.handedBackAt ? e('handedBackOn', { date: day(r.handedBackAt) }) : null,
      r.decidedAt ? e('decidedOn', { date: day(r.decidedAt) }) : null,
      r.dueOn && tab !== 'exchanges' ? e('dueOn', { date: day(r.dueOn) }) : null,
      r.dueOn && tab === 'exchanges' ? e('watchUntil', { date: day(r.dueOn) }) : null,
      r.reason ? word('reason', r.reason) : null,
      r.valueMinor !== null ? (tab === 'exchanges' ? e('atRisk', { money: m(r.valueMinor) }) : e('paid', { money: m(r.valueMinor) })) : null,
      r.creditMinor ? e('credit', { money: m(r.creditMinor) }) : null,
      tab === 'exchanges' && r.note ? e('newOrder', { id: r.note }) : null,
    ].filter(Boolean);
    const cd = tab === 'returnStock' || tab === 'hold' ? countdown(r) : null;
    return (
      <div key={r.key} className="a2-card tight a2-mt6" data-testid="erp-returns-row" data-state={r.state}>
        <div className="a2-between">
          <b>
            {r.orderId ? (
              <Link className="a2-lnk" href={`/admin/orders/${r.orderId}`}>
                {r.orderNumber ?? r.externalOrderId}
              </Link>
            ) : (
              r.externalOrderId
            )}
            {r.consignmentId ? <span className="a2-mono a2-mute">{` · ${r.consignmentId}`}</span> : null}
          </b>
          <span className={`a2-pill ${stateTone(r.state)}`}>{r.state.startsWith('REFUSED:') ? word('reason', r.reason) : word('state', r.state)}</span>
        </div>
        <div className="a2-xs a2-mt6">{bits.join(' · ')}</div>
        {r.note && tab !== 'exchanges' ? <div className="a2-xs a2-mute a2-mt6">{r.note}</div> : null}
        <div className="a2-between a2-mt6">
          <div className="a2-gap8">
            {r.colour ? <span className={`a2-pill ${colourTone(r.colour)}`}>{word('colour', r.colour)}</span> : null}
            {cd ? <span className={`a2-pill ${countTone(r)}`}>{cd}</span> : null}
            {r.claim ? <span className="a2-pill bad">{tab === 'exchanges' ? e('lateTag') : e('claimTag')}</span> : null}
            {r.countDiffers ? <span className="a2-pill warn">{e('countDiffersTag')}</span> : null}
            {r.exchange && tab !== 'exchanges' ? <span className="a2-pill info">{e('exchangeTag')}</span> : null}
          </div>
          {tab !== 'exchanges' ? (
            <Link className="a2-btn" href={qs({ tab, parcel: ref })} scroll={false} data-testid="erp-returns-open">
              {e('open')}
            </Link>
          ) : null}
        </div>
      </div>
    );
  };

  const tlText = (i: od.TimelineItem) => {
    switch (i.kind) {
      case 'delivery':
        return e('timeline.delivery', { result: i.result ?? '', colour: word('colour', i.colour ?? null) });
      case 'deliveryResult':
        return e('timeline.deliveryResult', { result: i.result ?? '' });
      case 'handedBack':
        return `${e('timeline.handedBack', { list: i.returnListId ?? '' })} · ${e('timeline.counted', { n: n(i.counted ?? 0), e: i.expected === null || i.expected === undefined ? '?' : n(i.expected) })}`;
      case 'erpAnswer':
        return `${e('timeline.erpAnswer', { result: word('state', i.result ?? null) })}${i.reason ? ` · ${word('reason', i.reason)}` : ''}`;
      case 'deskClaim':
        return e('timeline.deskClaim');
      case 'ownerTick':
        return e('timeline.ownerTick', { result: word('timeline.tickResult', i.result ?? null) });
      case 'decided':
        return `${e('timeline.decided', { line: i.lineId ?? '', decision: word('decision', i.decision ?? null) })}${i.reason ? ` · ${word('reason', i.reason)}` : ''}${i.creditMinor ? ` · ${e('credit', { money: m(i.creditMinor) })}` : ''}`;
      case 'courierClaim':
        return `${e('timeline.courierClaim', { reason: word('reason', i.reason ?? null) })}${i.valueMinor ? ` · ${m(i.valueMinor)}` : ''}`;
      case 'exchange':
        return `${e('timeline.exchange', { result: i.result ?? '' })}${i.valueMinor ? ` · ${m(i.valueMinor)}` : ''}`;
    }
  };

  const compare = overview.compare;
  // months with nothing in them are left out (the total still covers every month of `returns.losses.months`)
  const shown = losses ? losses.months.filter((x) => x.totalMinor || x.declined.count || x.deliveryCharges.count || x.underpaid.count || x.exchangeBilledMinor).reverse() : [];
  const lossLine = (label: string, value: number, extra: string | null, testId: string) => (
    <>
      <span className="a2-mute">{label}</span>
      <span data-testid={testId}>
        {m(value)}
        {extra ? <span className="a2-xs a2-mute">{` · ${extra}`}</span> : null}
      </span>
    </>
  );

  return (
    <div className="a2-z" data-testid="erp-returns-page" data-model="v6">
      {head}
      <SectionTabs view={view} current={KEY} />
      <div className="a2-row a2-r21 a2-start">
        <div className="a2-stack">
          <section className="a2-card" data-testid="erp-returns-tabs" data-tab={tab}>
            <nav className="a2-seg" aria-label={e('tabsAria')}>
              {od.ERP_RETURN_TABS.map((x) => (
                <Link key={x} className={x === tab ? 'on' : undefined} href={qs({ tab: x })} scroll={false} aria-current={x === tab ? 'page' : undefined} data-testid={`erp-returns-tab-${x}`}>
                  {`${e(`tab.${x}`)} · ${n(overview.counts[x])}`}
                </Link>
              ))}
            </nav>
            {tab === 'returnStock' || tab === 'hold' ? (
              <div className="a2-note">
                <ShellIcon name="info" size={15} />
                <span>{`${e('checkWithin', { n: n(overview.checkDays) })}${overview.overdue ? ` · ${e('overdueCount', { n: n(overview.overdue) })}` : ''}`}</span>
              </div>
            ) : null}
            {overview.rows.length ? overview.rows.map(row) : <div className="a2-sm a2-mute a2-mt12">{e(`empty.${tab}`)}</div>}
          </section>
          {watch ? (
            <section className="a2-card" data-testid="erp-returns-watch" data-source={watch.source}>
              <div className="a2-ch">
                <div>
                  <h2 className="a2-h3">{e('watch.title')}</h2>
                  <div className="a2-cs">{e('watch.sub')}</div>
                </div>
                <b>{m(watch.totalAtRiskMinor)}</b>
              </div>
              {watch.error ? <div className="a2-xs a2-mute a2-mt6">{e('watch.stale')}</div> : null}
              {watch.rows.length ? (
                watch.rows.map((w) => (
                  <div key={w.erpExchangeId} className="a2-card tight a2-mt6" data-testid="erp-returns-watch-row" data-late={String(w.late)}>
                    <div className="a2-between">
                      <b>
                        {w.orderId ? (
                          <Link className="a2-lnk" href={`${RETURNS_HREF}?case=${w.exchangeId ?? ''}`}>
                            {w.exchangeNumber ?? w.ofExternalOrderId}
                          </Link>
                        ) : (
                          w.ofExternalOrderId
                        )}
                        <span className="a2-mono a2-mute">{` · ${w.externalOrderId}`}</span>
                      </b>
                      <span className={`a2-pill ${stateTone(w.erpStatus)}`}>{word('state', w.erpStatus)}</span>
                    </div>
                    <div className="a2-xs a2-mt6">{[w.orderNumber, e('atRisk', { money: m(w.atRiskMinor) }), w.deadline ? e('watchUntil', { date: day(w.deadline) }) : null].filter(Boolean).join(' · ')}</div>
                    <div className="a2-gap8 a2-mt6">
                      {w.daysLeft !== null ? <span className={`a2-pill ${w.late ? 'bad' : w.daysLeft <= 1 ? 'warn' : 'line'}`}>{w.late ? `${e('watch.late')} · ${e('overdue', { n: n(-w.daysLeft) })}` : e('daysLeft', { n: n(w.daysLeft) })}</span> : null}
                      {w.lateReturnMarkedAt ? <span className="a2-pill info">{e('watch.lateTag')}</span> : null}
                    </div>
                  </div>
                ))
              ) : (
                <div className="a2-sm a2-mute a2-mt6">{e('watch.none')}</div>
              )}
            </section>
          ) : null}
          {parcel ? (
            <section className="a2-card" data-testid="erp-returns-timeline">
              <div className="a2-ch">
                <h2 className="a2-h3">{e('timeline.title', { id: timeline?.orderNumber ?? timeline?.externalOrderId ?? parcel })}</h2>
                <Link className="a2-btn" href={qs({ tab })} scroll={false}>
                  {e('timeline.close')}
                </Link>
              </div>
              {!timeline ? (
                <div className="a2-sm a2-mute a2-mt6">{e('timeline.notFound')}</div>
              ) : (
                <>
                  {timeline.items.length ? (
                    <ol className="a2-stack a2-mt12">
                      {timeline.items.map((i, k) => (
                        <li key={`${i.kind}-${k}`} className="a2-sm" data-testid="erp-returns-tl" data-kind={i.kind}>
                          {i.reversed ? <s className="a2-mute">{tlText(i)}</s> : <span>{tlText(i)}</span>}
                          {i.reversed ? <span className="a2-xs a2-mute">{` · ${e('timeline.reversed')}`}</span> : null}
                          <div className="a2-xs a2-mute">{dt.format(new Date(i.at))}</div>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <div className="a2-sm a2-mute a2-mt6">{e('timeline.none')}</div>
                  )}
                  {timeline.pieces.length ? (
                    <>
                      <h3 className="a2-h4 a2-mt12">{e('timeline.now')}</h3>
                      {timeline.pieces.map(row)}
                    </>
                  ) : null}
                </>
              )}
            </section>
          ) : null}
          <div className="a2-note">
            <ShellIcon name="info" size={15} />
            <span>{e('never')}</span>
          </div>
        </div>

        <div className="a2-stack">
          <section className="a2-card" data-testid="erp-returns-compare" data-matched={compare ? String(compare.matched) : 'none'}>
            <div className="a2-ch">
              <h2 className="a2-h3">{e('compare.title')}</h2>
              {compare ? <span className={`a2-pill ${compare.matched ? 'ok' : 'bad'}`}>{compare.matched ? e('compare.matched') : compare.error ? e('compare.failed') : e('compare.differs')}</span> : null}
            </div>
            {compare ? (
              <>
                <div className="a2-xs a2-mute a2-mt6">{e('compare.line', { date: day(compare.date), when: dt.format(new Date(compare.ranAt)), trigger: word('compare.trigger', compare.trigger) })}</div>
                {compare.error ? <div className="a2-xs a2-mt6">{e('compare.error', { text: compare.error })}</div> : null}
                {compare.differences.length ? (
                  <div className="a2-kv2 a2-mt12" data-testid="erp-returns-differences">
                    <b>{''}</b>
                    <b>{`${e('compare.shop')} / ${e('compare.erp')}`}</b>
                    {compare.differences.map((x) => {
                      const v = (y: number) => (x.field.endsWith('Minor') ? m(y) : n(y));
                      return (
                        <Fragment key={x.field}>
                          <span className="a2-mute">{word('compare.field', x.field)}</span>
                          <span>{`${v(x.shop)} / ${v(x.erp)}`}</span>
                        </Fragment>
                      );
                    })}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="a2-sm a2-mute a2-mt6">{e('compare.none')}</div>
            )}
            <div className="a2-mt12">
              <ErpComparePull label={e('compare.pull')} date={null} errors={errors} />
            </div>
            <div className="a2-note">
              <ShellIcon name="info" size={15} />
              <span>{e('compare.never')}</span>
            </div>
          </section>

          <section className="a2-card" data-testid="erp-returns-claims">
            <h2 className="a2-h3">{e('claims.title')}</h2>
            <div className="a2-cs">{e('claims.sub')}</div>
            {claims?.claims.length ? (
              claims.claims.map((c) => (
                <div key={c.id} className="a2-card tight a2-mt6" data-testid="erp-returns-claim" data-status={c.status}>
                  <div className="a2-between">
                    <b>
                      {c.orderId ? (
                        <Link className="a2-lnk" href={`/admin/orders/${c.orderId}`}>
                          {c.orderNumber ?? c.externalOrderId}
                        </Link>
                      ) : (
                        c.externalOrderId
                      )}
                    </b>
                    <span className={`a2-pill ${c.status === 'OPEN' ? 'bad' : 'line'}`}>{word('claims.status', c.status)}</span>
                  </div>
                  <div className="a2-xs a2-mt6">{[word('reason', c.reason), c.lineId, c.courier, c.consignmentId, c.valueMinor !== null ? m(c.valueMinor) : null, c.decidedAt ? e('decidedOn', { date: day(c.decidedAt) }) : null].filter(Boolean).join(' · ')}</div>
                </div>
              ))
            ) : (
              <div className="a2-sm a2-mute a2-mt6">{e('claims.none')}</div>
            )}
            <h3 className="a2-h4 a2-mt12">{e('claims.desk')}</h3>
            {claims?.countDiffers.length ? (
              claims.countDiffers.map((p) => (
                <div key={p.parcelId} className="a2-card tight a2-mt6" data-testid="erp-returns-desk-claim">
                  <b>
                    {p.orderId ? (
                      <Link className="a2-lnk" href={`/admin/orders/${p.orderId}`}>
                        {p.orderNumber ?? p.externalOrderId}
                      </Link>
                    ) : (
                      p.externalOrderId
                    )}
                  </b>
                  <div className="a2-xs a2-mt6">{[e('claims.count', { e: p.expectedCount === null ? '?' : n(p.expectedCount), n: n(p.receivedCount) }), p.courier, p.consignmentId, p.returnListId, dt.format(new Date(p.claimStartedAt))].filter(Boolean).join(' · ')}</div>
                  {p.note ? <div className="a2-xs a2-mute a2-mt6">{p.note}</div> : null}
                </div>
              ))
            ) : (
              <div className="a2-sm a2-mute a2-mt6">{e('claims.deskNone')}</div>
            )}
          </section>

          <section className="a2-card" data-testid="erp-returns-losses">
            <h2 className="a2-h3">{e('losses.title')}</h2>
            <div className="a2-cs">{e('losses.sub')}</div>
            {losses && !shown.length ? <div className="a2-sm a2-mute a2-mt6">{e('losses.none')}</div> : null}
            {losses
              ? shown.map((x) => (
                    <div key={x.month} className="a2-card tight a2-mt6" data-testid="erp-returns-loss-month" data-month={x.month}>
                      <div className="a2-between">
                        <b>{monthFmt.format(new Date(`${x.month}-01T00:00:00Z`))}</b>
                        <b>{m(x.totalMinor)}</b>
                      </div>
                      <div className="a2-kv2 a2-mt6">
                        {lossLine(e('losses.declined'), x.declined.valueMinor, [x.declined.count ? n(x.declined.count) : null, x.declined.unknownValue ? e('losses.unknown', { n: n(x.declined.unknownValue) }) : null].filter(Boolean).join(' · ') || null, 'erp-returns-loss-declined')}
                        {lossLine(e('losses.exchanges'), x.exchangeBilledMinor - x.exchangeCreditedMinor, null, 'erp-returns-loss-exchanges')}
                        {lossLine(e('losses.delivery'), x.deliveryCharges.valueMinor, [x.deliveryCharges.count ? n(x.deliveryCharges.count) : null, x.deliveryCharges.unknownValue ? e('losses.unknown', { n: n(x.deliveryCharges.unknownValue) }) : null].filter(Boolean).join(' · ') || null, 'erp-returns-loss-delivery')}
                        {lossLine(e('losses.underpaid'), x.underpaid.valueMinor, x.underpaid.count ? n(x.underpaid.count) : null, 'erp-returns-loss-underpaid')}
                      </div>
                      {Object.keys(x.declined.byReason).length ? (
                        <div className="a2-xs a2-mute a2-mt6">
                          {Object.entries(x.declined.byReason)
                            .map(([k, v]) => `${word('reason', k)} ${n(v.count)} · ${m(v.valueMinor)}`)
                            .join(' — ')}
                        </div>
                      ) : null}
                    </div>
                  ))
              : null}
            {losses ? (
              <div className="a2-between a2-mt12" data-testid="erp-returns-loss-total">
                <b>{`${e('losses.total')} · ${e('losses.allMonths', { n: n(losses.months.length) })}`}</b>
                <b>{m(losses.totals.totalMinor)}</b>
              </div>
            ) : null}
          </section>

          <section className="a2-card">
            <details className="a2-more-opts" data-testid="erp-returns-more">
              <summary className="a2-sm a2-b">{e('more.title')}</summary>
              <div className="a2-kv2 a2-mt12">
                <span className="a2-mute">{e('more.checkDays')}</span>
                <span>{e('more.days', { n: n(overview.checkDays) })}</span>
                <span className="a2-mute">{e('more.runAt')}</span>
                <span className="a2-mono">{runAt}</span>
                <span className="a2-mute">{e('more.months')}</span>
                <span>{e('more.monthsN', { n: n(months) })}</span>
              </div>
              <div className="a2-xs a2-mute a2-mt12">{e('more.where')}</div>
            </details>
          </section>
        </div>
      </div>
    </div>
  );
}
