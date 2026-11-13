// S08 · PR 180 — Orders → Packing & print → Handover (ORD-04a; Blueprint B1.5): one card per courier with the parcels
// waiting to be handed over to its rider — booked, still with us, the order confirmed, picking or packed — each with its
// consignment id, pieces and the amount to collect, and why it cannot go yet (its sticker not printed, its amount or
// receiver changed after booking). "Print handover sheet" puts every ready parcel on the courier's open batch and makes
// the sheet the rider signs (a tick box per parcel, the total to collect); "Handed over" asks the rider's name and moves
// the batch's orders to "handed over". The sheet's paper, language, the receiver's name and the signature lines are the
// owner's delivery settings, shown here. The screen shows no customer's details; the sheet and "Handed over" need
// `fulfilment.handover`, which the API checks again.
// S20 · PR 406 (ORD-04c): the sheet's settings are a card saved here (`delivery.handover.sheet`, with
// `fulfilment.printSettings`), and below the couriers a "Handed over" history per courier — each sheet's time, rider,
// who marked it, the parcels that went and the amount to collect, with "Print copy" (a COPY of that sheet). How far
// back and how many per courier are the second card (`fulfilment.handover.history`).
// Follow-up 437: with `fulfilment.handover.reconcile` on (a third card; off as shipped), a sheet past the owner's hours
// says under its parcels how many on it the courier never picked up and how many it picked up that were on no sheet,
// with their order numbers in a line under the row. Read only.
import type { Metadata } from 'next';
import Link from 'next/link';
import { Fragment } from 'react';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { LIST_DPIS, LIST_PAPERS } from '@extas/settings';
import * as sh from '@extas/shipping';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { CourierMove } from '@/components/admin/fulfil/CourierMove';
import { HandoverDone } from '@/components/admin/fulfil/Handover';
import { PdfButton } from '@/components/admin/fulfil/Print';
import { formatMoney, formatNumber, moneyOf } from '@/components/admin/products/model';
import { FieldsCard, type FieldsCardField, type FieldsCardTexts } from '@/components/admin/settings/FieldsCard';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { adminDeps } from '@/lib/admin-auth';
import { printedAt } from '@/lib/admin-fulfil/handover';
import { withFulfil } from '@/lib/admin-fulfil/i18n';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { packingSettingCards } from '@/lib/packing-settings-api';
import { shippingDeps } from '@/lib/shipping-api';
import '../../../settings-cards.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/orders/packing/handover';
const API = '/api/admin/packing/handover';
const SETTINGS = '/api/admin/packing/settings';

export async function generateMetadata(): Promise<Metadata> {
  const view = withFulfil(await adminView());
  return { title: `${t(view.dict, 'ful.handover.title')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export default async function HandoverPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('fulfilment.read', deps, MOTHER_STORE_ID)]);
  const view = withFulfil(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current="packingHandover" text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="fulfilment.read" />
      </div>
    );
  const who: sh.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const sd = await shippingDeps(access.deps);
  // S28 · PR 667: what the couriers hold now (`?status=` narrows it) and one parcel's history in the drawer (`?track=`)
  const heldStatus = (sh.COURIER_HELD as readonly string[]).includes(one(sp.status)) ? (one(sp.status) as sh.HeldStatus) : undefined;
  const trackId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(one(sp.track)) ? one(sp.track) : '';
  const [held, drawer] = await Promise.all([
    sh.withCourier(sd, who, heldStatus ? { status: heldStatus } : {}),
    trackId ? sh.parcelHistory(sd, who, trackId).catch(() => null) : Promise.resolve(null),
  ]);
  const [couriers, handed, currency, cards] = await Promise.all([
    sh.handoverList(sd, who),
    sh.handoverHistory(sd, who),
    sd.settings.value('store.currency', { storeId: MOTHER_STORE_ID }),
    packingSettingCards(access.deps, { actor: access.guard.actor, ctx: access.guard.ctx }),
  ]);
  const canHand = access.guard.permissions?.has('fulfilment.handover') ?? false;
  const canSettings = access.guard.permissions?.has('fulfilment.printSettings') ?? false;
  const history = cards['fulfilment.handover.history'].value as { days: number; perCourier: number };
  const cols = canHand ? 6 : 5;
  const fd: Dict = { ful: d.ful as Dict };
  const n = (x: number) => formatNumber(x, view.locale);
  const m = (minor: number, cur: string) => formatMoney(minor, moneyOf(cur, view.locale));
  const ready = couriers.reduce((s, c) => s + c.ready.parcels, 0);
  const waiting = couriers.reduce((s, c) => s + c.parcels.length, 0);

  // ---- the settings cards (CN-018: on the page where they are used); words here, values from the API ----
  const ps = (k: string) => t(d, `ful.printRun.set.${k}`);
  const hs = (k: string) => t(d, `ful.handover.set.${k}`);
  const texts = (card: string): FieldsCardTexts => ({
    h: hs(`${card}.h`),
    d: hs(`${card}.d`),
    save: ps('save'),
    saving: ps('saving'),
    saved: ps('saved'),
    discard: ps('discard'),
    unsaved: ps('unsaved'),
    readOnly: ps('readOnly'),
    pairHelp: ps('readOnly'),
    err: Object.fromEntries(['STALE', 'INVALID_INPUT', 'forbidden', 'unauthorized', 'network', 'other'].map((c) => [c, ps(`err.${c}`)])),
  });
  const sheetFields: FieldsCardField[] = [
    { kind: 'select', path: 'paper', label: hs('sheet.paper'), options: LIST_PAPERS.map((v) => ({ value: v, label: t(d, `ful.handover.paper.${v}`) })) },
    { kind: 'select', path: 'dpi', label: hs('sheet.dpi'), numeric: true, options: LIST_DPIS.map((v) => ({ value: String(v), label: n(v) })) },
    { kind: 'select', path: 'lang', label: hs('sheet.lang'), options: (['en', 'bn'] as const).map((v) => ({ value: v, label: t(d, `ful.packing.lang.${v}`) })) },
    { kind: 'switch', path: 'receiverName', label: hs('sheet.receiverName') },
    { kind: 'switch', path: 'signatures', label: hs('sheet.signatures') },
    { kind: 'switch', path: 'packOnHandover', label: hs('sheet.packOnHandover'), help: hs('sheet.packOnHandoverHelp') },
  ];
  const historyFields: FieldsCardField[] = [
    { kind: 'number', path: 'days', label: hs('history.days'), help: hs('history.daysHelp'), min: 1, max: 90 },
    { kind: 'number', path: 'perCourier', label: hs('history.perCourier'), help: hs('history.perCourierHelp'), min: 1, max: 50 },
  ];
  const reconcileFields: FieldsCardField[] = [
    { kind: 'switch', path: 'enabled', label: hs('reconcile.enabled') },
    { kind: 'number', path: 'afterHours', label: hs('reconcile.afterHours'), help: hs('reconcile.afterHoursHelp'), min: 1, max: 168 },
    { kind: 'number', path: 'windowHours', label: hs('reconcile.windowHours'), help: hs('reconcile.windowHoursHelp'), min: 1, max: 168 },
  ];
  // S28 · PR 667: the watch card (stuck alert, hours, backup courier) and the courier accounts the backup is chosen from
  const wc = (k: string, vars?: Record<string, string | number>) => t(d, `ful.withCourier.${k}`, vars);
  const canBook = access.guard.permissions?.has('delivery.book') ?? false;
  let courierAccounts: { id: string; name: string }[] = [];
  try {
    courierAccounts = (await sh.listCouriers(sd, who)).couriers.filter((c) => c.enabled && !c.archived).map((c) => ({ id: c.id, name: c.name }));
  } catch (e) {
    if (!sh.isShippingError(e)) throw e;
  }
  const watchFields: FieldsCardField[] = [
    { kind: 'switch', path: 'stuckAlert', label: wc('watch.stuckAlert'), help: wc('watch.stuckAlertHelp') },
    { kind: 'number', path: 'stuckHours', label: wc('watch.stuckHours'), help: wc('watch.stuckHoursHelp'), min: 1, max: 720 },
    { kind: 'select', path: 'backupCourierId', label: wc('watch.backup'), help: wc('watch.backupHelp'), options: [{ value: '', label: wc('watch.noBackup') }, ...courierAccounts.map((c) => ({ value: c.id, label: c.name }))] },
  ];
  const watchTexts: FieldsCardTexts = { ...texts('reconcile'), h: wc('watch.h'), d: wc('watch.d') };
  const backup = held.watch.backupCourierId ? courierAccounts.find((c) => c.id === held.watch.backupCourierId) : undefined;
  const hrefHeld = (status?: string, track?: string) => `${HERE}${status || track ? '?' : ''}${[status ? `status=${status}` : '', track ? `track=${track}` : ''].filter(Boolean).join('&')}`;
  const orderList = (lines: { orderNumber: string }[]) => lines.map((l) => l.orderNumber).join(', ');

  return (
    <div className="a2-z" data-testid="handover-page" data-lm-ready="">
      <PageHead view={view} place={locateKey('packingHandover')} title={t(d, 'ful.handover.title')} sub={t(d, 'ful.handover.sub')} />
      <SectionTabs view={view} current="packingHandover" />
      <div className="a2-kpis a2-mt12" data-testid="handover-counts">
        {(
          [
            ['couriers', couriers.length],
            ['waiting', waiting],
            ['ready', ready],
            ['notReady', waiting - ready],
          ] as [string, number][]
        ).map(([k, v]) => (
          <div key={k} className="a2-card a2-kpi">
            <div className="a2-kl">{t(d, `ful.handover.counts.${k}`)}</div>
            <div className="a2-kv">{n(v)}</div>
          </div>
        ))}
      </div>
      {/* S28 · PR 667: the day-end check, then what the couriers hold now (live status, filter, stuck and cancelled-but-booked marks) */}
      <section className="a2-card a2-mt12" aria-label={wc('dayend.h')} data-testid="dayend">
        <h2 className="a2-h4">{wc('dayend.h')}</h2>
        <p className="a2-xs a2-mt6">{wc('dayend.line', { packed: n(held.dayEnd.packedToday), entered: n(held.dayEnd.enteredToday) })}</p>
        <p className="a2-xs a2-mute">{held.dayEnd.missing.length ? wc('dayend.missing', { list: held.dayEnd.missing.join(', ') }) : wc('dayend.ok')}</p>
      </section>
      <section className="a2-card a2-mt12" aria-label={wc('held.h')} data-testid="held">
        <h2 className="a2-h4">{wc('held.h')}</h2>
        <p className="a2-xs a2-mute a2-mt6">{wc('held.d')}</p>
        {held.stuck ? <p className="a2-xs a2-mt6" data-testid="held-stuck">{wc('held.stuckCount', { n: n(held.stuck), hours: n(held.watch.stuckHours) })}</p> : null}
        {held.cancelledButBooked ? <p className="a2-xs a2-mt6" style={{ color: 'var(--bad)' }} data-testid="held-cancelled">{wc('held.cancelledCount', { n: n(held.cancelledButBooked) })}</p> : null}
        <nav className="a2-views a2-mt12" aria-label={wc('held.status')} data-testid="held-filter">
          <Link className={`a2-view${heldStatus ? '' : ' on'}`} href={hrefHeld()} aria-current={heldStatus ? undefined : 'page'}>
            {wc('held.all')}
          </Link>
          {Object.entries(held.counts).map(([st, c]) => (
            <Link key={st} className={`a2-view${heldStatus === st ? ' on' : ''}`} href={hrefHeld(st)} aria-current={heldStatus === st ? 'page' : undefined} data-status={st}>
              {t(d, `ful.status.${st}`)}
              <span className="a2-cnt">{n(c)}</span>
            </Link>
          ))}
        </nav>
        {held.rows.length ? (
          <div className="a2-tblw a2-mt12">
            <table className="a2-tbl">
              <thead>
                <tr>
                  <th>{t(d, 'ful.packing.col.order')}</th>
                  <th>{wc('held.courier')}</th>
                  <th>{wc('held.status')}</th>
                  <th>{wc('held.moved')}</th>
                  <th className="r">{wc('held.cod')}</th>
                  <th>{wc('held.track')}</th>
                </tr>
              </thead>
              <tbody>
                {held.rows.map((r) => (
                  <tr key={r.shipmentId} data-testid="held-row">
                    <td className="a2-tdh">
                      <b>
                        <Link className="a2-lnk" href={`/admin/orders/${r.orderId}`}>
                          {r.orderNumber}
                        </Link>
                      </b>
                    </td>
                    <td data-l={wc('held.courier')}>{r.courierName}</td>
                    <td data-l={wc('held.status')}>
                      <span className="a2-pill line">{t(d, `ful.status.${r.status}`)}</span>
                      {r.stuck ? <span className="a2-pill warn"> {wc('held.stuck')}</span> : null}
                      {r.cancelledButBooked ? (
                        <span className="a2-pill bad" title={wc('held.cancelledHelp')}>
                          {' '}
                          {wc('held.cancelled')}
                        </span>
                      ) : null}
                    </td>
                    <td data-l={wc('held.moved')}>{r.movedAt ? printedAt(r.movedAt, view.timeZone) : wc('held.none')}</td>
                    <td className="r" data-l={wc('held.cod')}>
                      <span className="a2-num">{r.codMinor ? m(r.codMinor, currency) : t(d, 'ful.handover.paid')}</span>
                    </td>
                    <td data-l={wc('held.track')}>
                      <Link className="a2-lnk" href={hrefHeld(heldStatus, r.shipmentId)} scroll={false} data-testid="held-track">
                        {wc('held.track')}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="a2-xs a2-mute a2-mt12" data-testid="held-empty">
            {wc('held.empty')}
          </p>
        )}
      </section>
      {drawer ? (
        <aside className="a2-card a2-mt12" aria-label={wc('drawer.h')} data-testid="track-drawer">
          <div className="a2-between">
            <h2 className="a2-h4">
              {wc('drawer.h')} · {drawer.orderNumber} · {drawer.courierName}
            </h2>
            <Link className="a2-btn sm ghost" href={hrefHeld(heldStatus)} scroll={false}>
              {wc('drawer.close')}
            </Link>
          </div>
          <p className="a2-xs a2-mute a2-mt6">
            {wc('drawer.consignment')}: <span className="a2-mono">{drawer.consignmentId ?? '-'}</span> · {wc('drawer.tracking')}: <span className="a2-mono">{drawer.trackingCode ?? '-'}</span> · {wc('held.cod')}: {drawer.codMinor ? m(drawer.codMinor, currency) : t(d, 'ful.handover.paid')}
          </p>
          <p className="a2-xs a2-mt6">{wc('drawer.attempts', { n: n(drawer.attempts) })}</p>
          {drawer.events.length ? (
            <ol className="a2-xs a2-mt6" style={{ paddingInlineStart: 18 }}>
              {drawer.events.map((e, i) => (
                <li key={i}>
                  <b>{t(d, `ful.status.${e.status}`)}</b> · {printedAt(e.at, view.timeZone)}
                  {e.message ? ` · ${e.message}` : ''}
                  {e.riderNote ? ` · ${wc('drawer.rider', { note: e.riderNote })}` : ''}
                </li>
              ))}
            </ol>
          ) : (
            <p className="a2-xs a2-mute a2-mt6">{wc('drawer.empty')}</p>
          )}
        </aside>
      ) : null}
      {couriers.length ? (
        couriers.map((c) => (
          <section key={c.courierAccountId} className="a2-card a2-mt12" aria-label={c.courierName} data-testid="handover-courier">
            <div className="a2-between">
              <div>
                <h2 className="a2-h4">
                  {c.courierName} {c.practice ? <span className="a2-pill gold">{t(d, 'ful.packing.pill.practice')}</span> : null}
                </h2>
                <p className="a2-xs a2-mute a2-mt6">{t(d, 'ful.handover.readyLine', { parcels: n(c.ready.parcels), pieces: n(c.ready.pieces), amount: m(c.ready.collectMinor, c.currency || currency) })}</p>
                {c.openBatch ? <p className="a2-xs a2-mt6">{t(d, 'ful.handover.openBatch', { n: n(c.openBatch.printCount), parcels: n(c.openBatch.parcels), at: printedAt(c.openBatch.createdAt, view.timeZone) })}</p> : null}
              </div>
              {canHand ? (
                <div className="a2-cmds">
                  <PdfButton dict={fd} url={`${API}/sheet`} body={{ courierAccountId: c.courierAccountId }} label={t(d, c.openBatch ? 'ful.handover.printAgain' : 'ful.handover.print')} busyLabel={t(d, 'ful.packing.printing')} tone={c.openBatch ? 'ghost' : 'pri'} testId="handover-print" disabled={!c.ready.parcels} keyed fileName="handover-sheet.pdf" />
                  {c.openBatch ? <HandoverDone dict={fd} url={`${API}/done`} batchId={c.openBatch.id} testId="handover-done" /> : null}
                  {canBook && backup && backup.id !== c.courierAccountId && c.parcels.length ? <CourierMove dict={fd} url={`${API}/move`} shipmentIds={c.parcels.map((p) => p.shipmentId)} backupName={backup.name} /> : null}
                </div>
              ) : null}
            </div>
            <div className="a2-tblw a2-mt12">
              <table className="a2-tbl">
                <thead>
                  <tr>
                    <th>{t(d, 'ful.packing.col.order')}</th>
                    <th>{t(d, 'ful.packing.col.consignment')}</th>
                    <th className="r">{t(d, 'ful.packing.col.pieces')}</th>
                    <th className="r">{t(d, 'ful.handover.col.collect')}</th>
                    <th>{t(d, 'ful.handover.col.state')}</th>
                  </tr>
                </thead>
                <tbody>
                  {c.parcels.map((p) => (
                    <tr key={p.shipmentId} data-testid="handover-row">
                      <td className="a2-tdh">
                        <b>
                          <Link className="a2-lnk" href={`/admin/orders/${p.orderId}`}>{p.orderNumber}</Link>
                        </b>
                      </td>
                      <td data-l={t(d, 'ful.packing.col.consignment')}>
                        <span className="a2-mono">{p.consignmentId}</span>
                      </td>
                      <td className="r" data-l={t(d, 'ful.packing.col.pieces')}>
                        <b className="a2-num">{n(p.pieces)}</b>
                      </td>
                      <td className="r" data-l={t(d, 'ful.handover.col.collect')}>
                        <span className="a2-num">{p.collectMinor ? m(p.collectMinor, c.currency || currency) : t(d, 'ful.handover.paid')}</span>
                      </td>
                      <td data-l={t(d, 'ful.handover.col.state')}>{p.problem ? <span style={{ color: 'var(--bad)' }}>{t(d, `ful.sticker.problem.${p.problem}`)}</span> : <span className="a2-pill ok">{t(d, 'ful.handover.ready')}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      ) : (
        <div className="a2-state a2-mt12" data-testid="handover-empty">
          <div className="a2-sti">
            <ShellIcon name="print" size={26} />
          </div>
          <h3>{t(d, 'ful.handover.empty')}</h3>
          <p>{t(d, 'ful.handover.emptySub')}</p>
        </div>
      )}
      <section className="a2-card a2-mt12" aria-label={t(d, 'ful.handover.history.title')} data-testid="handover-history">
        <h2 className="a2-h4">{t(d, 'ful.handover.history.title')}</h2>
        <p className="a2-xs a2-mute a2-mt6">{t(d, 'ful.handover.history.sub', { days: n(history.days) })}</p>
        {handed.length ? (
          handed.map((c) => (
            <div key={c.courierAccountId} className="a2-mt12" data-testid="handover-history-courier">
              <h3 className="a2-h4">{c.courierName}</h3>
              <p className="a2-xs a2-mute">{t(d, 'ful.handover.history.line', { batches: n(c.totals.batches), parcels: n(c.totals.parcels), amount: m(c.totals.collectMinor, c.currency || currency) })}</p>
              <div className="a2-tblw a2-mt6">
                <table className="a2-tbl">
                  <thead>
                    <tr>
                      <th>{t(d, 'ful.handover.history.col.at')}</th>
                      <th>{t(d, 'ful.handover.history.col.rider')}</th>
                      <th>{t(d, 'ful.handover.history.col.by')}</th>
                      <th className="r">{t(d, 'ful.handover.history.col.parcels')}</th>
                      <th className="r">{t(d, 'ful.handover.history.col.collect')}</th>
                      {canHand ? <th /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {c.batches.map((b) => (
                      <Fragment key={b.batchId}>
                        <tr data-testid="handover-history-row">
                        <td className="a2-tdh">
                          <b>{printedAt(b.handedOverAt, view.timeZone)}</b>
                        </td>
                        <td data-l={t(d, 'ful.handover.history.col.rider')}>{b.receivedBy || t(d, 'ful.handover.history.nobody')}</td>
                        <td data-l={t(d, 'ful.handover.history.col.by')}>{b.by || t(d, 'ful.handover.history.nobody')}</td>
                        <td className="r" data-l={t(d, 'ful.handover.history.col.parcels')}>
                          <b className="a2-num">{n(b.parcels)}</b>
                          {b.leftOut ? <span className="a2-xs a2-mute"> · {t(d, 'ful.handover.history.leftOut', { n: n(b.leftOut) })}</span> : null}
                          {b.check && !b.check.notPicked.length && !b.check.offSheet.length ? <span className="a2-xs a2-mute" data-testid="handover-check-ok"> · {t(d, 'ful.handover.history.check.ok')}</span> : null}
                          {b.check?.notPicked.length ? <span className="a2-xs" style={{ color: 'var(--bad)' }} data-testid="handover-check-not-picked"> · {t(d, 'ful.handover.history.check.notPicked', { n: n(b.check.notPicked.length) })}</span> : null}
                          {b.check?.offSheet.length ? <span className="a2-xs" style={{ color: 'var(--bad)' }} data-testid="handover-check-off-sheet"> · {t(d, 'ful.handover.history.check.offSheet', { n: n(b.check.offSheet.length) })}</span> : null}
                        </td>
                        <td className="r" data-l={t(d, 'ful.handover.history.col.collect')}>
                          <span className="a2-num">{m(b.collectMinor, c.currency || currency)}</span>
                        </td>
                        {canHand ? (
                          <td>
                            <PdfButton dict={fd} url={`${API}/copy`} body={{ batchId: b.batchId }} label={t(d, 'ful.handover.history.copy')} busyLabel={t(d, 'ful.handover.history.copying')} tone="ghost" testId="handover-copy" fileName="handover-sheet-copy.pdf" />
                          </td>
                        ) : null}
                        </tr>
                        {b.check && (b.check.notPicked.length || b.check.offSheet.length) ? (
                          <tr data-testid="handover-check-row">
                            <td colSpan={cols} className="a2-xs">
                              {b.check.notPicked.length ? <p>{t(d, 'ful.handover.history.check.notPickedList', { orders: orderList(b.check.notPicked) })}</p> : null}
                              {b.check.offSheet.length ? <p>{t(d, 'ful.handover.history.check.offSheetList', { orders: orderList(b.check.offSheet) })}</p> : null}
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              {c.totals.batches !== c.batches.length ? <p className="a2-xs a2-mute a2-mt6">{t(d, 'ful.handover.history.more', { n: n(c.batches.length) })}</p> : null}
            </div>
          ))
        ) : (
          <p className="a2-xs a2-mt12" data-testid="handover-history-empty">
            {t(d, 'ful.handover.history.empty', { days: n(history.days) })}
          </p>
        )}
      </section>
      <FieldsCard url={SETTINGS} screen={cards['delivery.handover.sheet']} fields={sheetFields} texts={texts('sheet')} canEdit={canSettings} testId="handover-settings" />
      <FieldsCard url={SETTINGS} screen={cards['fulfilment.handover.history']} fields={historyFields} texts={texts('history')} canEdit={canSettings} testId="handover-history-settings" />
      <FieldsCard url={SETTINGS} screen={cards['fulfilment.handover.reconcile']} fields={reconcileFields} texts={texts('reconcile')} canEdit={canSettings} testId="handover-reconcile-settings" />
      <FieldsCard url={SETTINGS} screen={cards['fulfilment.courierWatch']} fields={watchFields} texts={watchTexts} canEdit={canSettings} testId="courier-watch-settings" />
    </div>
  );
}
