// S08 · PR 180 — Orders → Packing & print → Handover (ORD-04a; Blueprint B1.5): one card per courier with the parcels
// waiting to be handed over to its rider — booked, still with us, the order confirmed, picking or packed — each with its
// consignment id, pieces and the amount to collect, and why it cannot go yet (its sticker not printed, its amount or
// receiver changed after booking). "Print handover sheet" puts every ready parcel on the courier's open batch and makes
// the sheet the rider signs (a tick box per parcel, the total to collect); "Handed over" asks the rider's name and moves
// the batch's orders to "handed over". The sheet's paper, language, the receiver's name and the signature lines are the
// owner's delivery settings, shown here. The screen shows no customer's details; the sheet and "Handed over" need
// `fulfilment.handover`, which the API checks again.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as sh from '@extas/shipping';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { HandoverDone } from '@/components/admin/fulfil/Handover';
import { PdfButton } from '@/components/admin/fulfil/Print';
import { formatMoney, formatNumber, moneyOf } from '@/components/admin/products/model';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { adminDeps } from '@/lib/admin-auth';
import { printedAt } from '@/lib/admin-fulfil/handover';
import { withFulfil } from '@/lib/admin-fulfil/i18n';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { shippingDeps } from '@/lib/shipping-api';

export const dynamic = 'force-dynamic';

const HERE = '/admin/orders/packing/handover';
const API = '/api/admin/packing/handover';

export async function generateMetadata(): Promise<Metadata> {
  const view = withFulfil(await adminView());
  return { title: `${t(view.dict, 'ful.handover.title')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function HandoverPage() {
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
  const [couriers, cfg, currency] = await Promise.all([sh.handoverList(sd, who), sd.settings.value('delivery.handover.sheet', { storeId: MOTHER_STORE_ID }), sd.settings.value('store.currency', { storeId: MOTHER_STORE_ID })]);
  const canHand = access.guard.permissions?.has('fulfilment.handover') ?? false;
  const fd: Dict = { ful: d.ful as Dict };
  const n = (x: number) => formatNumber(x, view.locale);
  const m = (minor: number, cur: string) => formatMoney(minor, moneyOf(cur, view.locale));
  const ready = couriers.reduce((s, c) => s + c.ready.parcels, 0);
  const waiting = couriers.reduce((s, c) => s + c.parcels.length, 0);
  const onOff = (on: boolean) => t(d, on ? 'ful.handover.on' : 'ful.handover.off');

  return (
    <div className="a2-z" data-testid="handover-page">
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
      <section className="a2-card tight a2-mt12" aria-label={t(d, 'ful.handover.sheetTitle')} data-testid="handover-settings">
        <h2 className="a2-h4">{t(d, 'ful.handover.sheetTitle')}</h2>
        <div className="a2-gap8 a2-mt6" style={{ flexWrap: 'wrap' }}>
          <span className="a2-pill line">{t(d, `ful.handover.paper.${cfg.paper}`)}</span>
          <span className="a2-pill line">{t(d, 'ful.packing.dpi', { dpi: n(cfg.dpi) })}</span>
          <span className="a2-pill line">{t(d, `ful.packing.lang.${cfg.lang}`)}</span>
          <span className="a2-pill line">{t(d, 'ful.handover.names', { on: onOff(cfg.receiverName) })}</span>
          <span className="a2-pill line">{t(d, 'ful.handover.signs', { on: onOff(cfg.signatures) })}</span>
          <span className="a2-pill line">{t(d, 'ful.handover.packs', { on: onOff(cfg.packOnHandover) })}</span>
        </div>
        <p className="a2-xs a2-mute a2-mt6">{t(d, 'ful.handover.settingsNote')}</p>
      </section>
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
    </div>
  );
}
