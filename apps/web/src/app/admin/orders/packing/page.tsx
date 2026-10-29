// S08 · PR 182 — Orders → Packing & print → Pack (ORD-04; Blueprint B1.3; CN-014c; SIM-F-002, SIM-F-010; follow-ups
// 433, 434): pick, pack and hand over on one screen. The steps Pick → Pack → Ready for courier → Handed over, each with
// its orders (one filter for the lists and "Start picking" for all: never a cancelled, archived, in-review order, or one
// with a cancel asked); one order at the table with each piece checked (scanned, its SKU typed, or a tick when the shop
// packs without a scanner), its open packing cards, the packing photo (the owner's switch: required or a reminder, and
// his override with a reason), the parcel's weight (the owner's check), and the next step: Start picking, Mark packed,
// Book courier, then the handover sheet. Every state move goes through the order service (the API checks the
// permission again). The screen shows no customer's details: order numbers, pieces, codes, the courier and its
// consignment id.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as sh from '@extas/shipping';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { Act } from '@/components/admin/fulfil/Act';
import { BookOne, PackButton, PhotoUpload, ScanBox, StartAll, TickLine } from '@/components/admin/fulfil/Pack';
import { PdfButton } from '@/components/admin/fulfil/Print';
import { invoiceHref } from '@/lib/admin-orders/model';
import { formatNumber } from '@/components/admin/products/model';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { adminDeps } from '@/lib/admin-auth';
import { withFulfil } from '@/lib/admin-fulfil/i18n';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { shippingDeps } from '@/lib/shipping-api';

export const dynamic = 'force-dynamic';

const HERE = '/admin/orders/packing';
const STEPS = ['pick', 'pack', 'ready', 'done'] as const;
type Step = (typeof STEPS)[number];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata(): Promise<Metadata> {
  const view = withFulfil(await adminView());
  return { title: `${t(view.dict, 'ful.pack.title')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export default async function PackPage({ searchParams }: Props) {
  const sp = await searchParams;
  const step: Step = (STEPS as readonly string[]).includes(one(sp.step)) ? (one(sp.step) as Step) : 'pick';
  const wanted = UUID.test(one(sp.id)) ? one(sp.id) : null;
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('fulfilment.read', deps, MOTHER_STORE_ID)]);
  const view = withFulfil(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current="packingPack" text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="fulfilment.read" />
      </div>
    );
  const who: sh.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const perms = access.guard.permissions ?? new Set<string>();
  const can = (p: string) => perms.has(p);
  const sd = await shippingDeps(access.deps);
  const at = { storeId: MOTHER_STORE_ID };
  const [queue, check, photoCfg, weightCfg] = await Promise.all([
    sh.packingQueue(sd, who, { step }),
    sd.settings.value('fulfilment.packing.check', at),
    sd.settings.value('fulfilment.packing.photo', at),
    sd.settings.value('fulfilment.packing.weight', at),
  ]);
  const pickedId = wanted && queue.rows.some((r) => r.orderId === wanted) ? wanted : (queue.rows[0]?.orderId ?? wanted);
  let order: sh.PackOrder | null = null;
  if (pickedId) {
    try {
      order = await sh.packingOrder(sd, who, pickedId);
    } catch (e) {
      if (!sh.isShippingError(e)) throw e;
    }
  }
  const checking = !!order && (order.status === 'CONFIRMED' || order.status === 'PROCESSING');
  const canPack = can('fulfilment.pack');
  let couriers: { id: string; name: string }[] = [];
  if (order && order.status === 'PACKED' && !order.parcel && can('delivery.book')) {
    try {
      const list = await sh.listCouriers(sd, who);
      couriers = list.couriers.filter((c) => c.enabled && !c.archived).map((c) => ({ id: c.id, name: c.mode === 'MOCK' ? `${c.name} · ${t(d, 'ful.packing.pill.practice')}` : c.name }));
    } catch (e) {
      if (!sh.isShippingError(e)) throw e;
    }
  }
  const fd: Dict = { ful: d.ful as Dict };
  const n = (x: number) => formatNumber(x, view.locale);
  const href = (s: Step, id?: string) => `${HERE}?step=${s}${id ? `&id=${id}` : ''}`;
  const codeWords = Object.fromEntries(sh.BOOKING_CODES.map((c) => [c, t(d, `courier.booking.code.${c}`)]));
  const lineOf = (orderItemId: string) => order?.lines.find((l) => l.lineId === orderItemId);
  const onOff = (on: boolean) => t(d, on ? 'ful.handover.on' : 'ful.handover.off');
  // the weight readings and a big gap are answered at "Mark packed" itself; the other blocks keep it shut
  const shut = !!order?.blocked && order.blocked !== 'WEIGHT_REQUIRED' && order.blocked !== 'WEIGHT_GAP';

  return (
    <div className="a2-z" data-testid="pack-page">
      <PageHead
        view={view}
        place={locateKey('packingPack')}
        title={t(d, 'ful.pack.title')}
        sub={t(d, 'ful.pack.sub')}
        right={
          <>
            <Link className="a2-btn" href="/admin/orders/packing/print" data-testid="pack-print-all">
              <ShellIcon name="print" size={15} />
              {t(d, 'ful.pack.printAll')}
            </Link>
            {queue.counts.ready ? (
              <Link className="a2-btn pri" href="/admin/orders/packing/handover" data-testid="pack-hand-all">
                {t(d, 'ful.pack.handAll')}
              </Link>
            ) : null}
          </>
        }
      />
      <SectionTabs view={view} current="packingPack" />
      <div className="a2-views a2-mt12" role="navigation" aria-label={t(d, 'ful.pack.stepsLabel')} data-testid="pack-steps">
        {STEPS.map((s, i) => (
          <Link key={s} className={`a2-view${s === step ? ' on' : ''}`} href={href(s)} aria-current={s === step ? 'page' : undefined} data-testid={`pack-step-${s}`}>
            {`${n(i + 1)}. ${t(d, `ful.pack.steps.${s}`)}`}
            <span className="a2-cnt">{n(queue.counts[s])}</span>
          </Link>
        ))}
      </div>
      <section className="a2-card tight" aria-label={t(d, 'ful.pack.settingsTitle')} data-testid="pack-settings" style={{ marginBottom: 12 }}>
        <div className="a2-gap8" style={{ flexWrap: 'wrap' }}>
          <span className="a2-pill line">{t(d, `ful.pack.mode.${check.mode}`)}</span>
          {check.mode === 'scan' ? <span className="a2-pill line">{t(d, 'ful.pack.typedPill', { on: onOff(check.allowTyped) })}</span> : null}
          <span className="a2-pill line">{photoCfg.enabled ? t(d, 'ful.pack.photoPill', { mode: t(d, `ful.pack.photoMode.${photoCfg.mode}`), days: n(photoCfg.keepDays) }) : t(d, 'ful.pack.photoPillOff')}</span>
          <span className="a2-pill line">{weightCfg.enabled ? t(d, 'ful.pack.weightPill', { p: n(weightCfg.gapPercent), g: n(weightCfg.gapGrams) }) : t(d, 'ful.pack.weightPillOff')}</span>
          {step === 'pick' && canPack ? (
            <span style={{ marginLeft: 'auto' }}>
              <StartAll dict={fd} count={queue.counts.pick} />
            </span>
          ) : null}
        </div>
        <p className="a2-xs a2-mute a2-mt6">{t(d, 'ful.pack.settingsNote')}</p>
      </section>
      <div className="a2-row a2-r12" style={{ alignItems: 'start' }}>
        <div className="a2-q" data-testid="pack-queue">
          {queue.rows.length ? (
            queue.rows.map((r) => (
              <Link key={r.orderId} className={`a2-qi${r.orderId === order?.orderId ? ' on' : ''}`} href={href(step, r.orderId)} aria-current={r.orderId === order?.orderId ? 'true' : undefined} data-testid="pack-row">
                <div>
                  <b>
                    {r.orderNumber} · {t(d, 'ful.pack.pcs', { n: n(r.pieces) })}
                    {r.gift ? ` · ${t(d, 'ful.pack.gift')}` : ''}
                  </b>
                  <span>
                    {[r.courierName ? `${r.courierName}${r.consignmentId ? ` · ${r.consignmentId}` : ''}` : t(d, 'ful.pack.notBooked'), r.openIssues ? t(d, 'ful.pack.issues', { n: n(r.openIssues) }) : null, r.photos ? t(d, 'ful.pack.photos', { n: n(r.photos) }) : null].filter(Boolean).join(' · ')}
                  </span>
                </div>
              </Link>
            ))
          ) : (
            <div className="a2-state" data-testid="pack-empty">
              <div className="a2-sti">
                <ShellIcon name="box" size={26} />
              </div>
              <h3>{t(d, 'ful.pack.empty')}</h3>
              <p>{t(d, `ful.pack.emptySub.${step}`)}</p>
            </div>
          )}
          {queue.more ? <p className="a2-xs a2-mute">{t(d, 'ful.pack.more', { n: n(queue.more) })}</p> : null}
        </div>
        <div className="a2-stack" key={order?.orderId ?? 'none'}>
          {order ? (
            <>
              <section className="a2-card" aria-label={order.orderNumber} data-testid="pack-order">
                <div className="a2-ch">
                  <div>
                    <h2 className="a2-h3">
                      {order.orderNumber} <span className={`a2-pill ${order.status === 'PACKED' || order.status === 'HANDED_OVER' ? 'ok' : 'line'}`}>{t(d, `ful.pack.status.${order.status}`) === `ful.pack.status.${order.status}` ? order.status : t(d, `ful.pack.status.${order.status}`)}</span>
                    </h2>
                  </div>
                  <Link className="a2-lnk" href={`/admin/orders/${order.orderId}`}>
                    {t(d, 'ful.pack.openOrder')}
                    <ShellIcon name="cr" size={14} />
                  </Link>
                </div>
                {order.gift ? (
                  <div className="a2-note" style={{ marginTop: 0, marginBottom: 12 }} data-testid="pack-gift">
                    <ShellIcon name="info" size={15} />
                    <span>{order.gift.deliverAfter ? t(d, 'ful.pack.giftNote', { day: order.gift.deliverAfter }) : t(d, 'ful.pack.giftNoteNoDay')}</span>
                  </div>
                ) : null}
                {order.openIssues.length ? (
                  <div className="a2-note bad" style={{ marginTop: 0, marginBottom: 12 }} role="alert" data-testid="pack-issues">
                    <ShellIcon name="alert" size={15} />
                    <span>
                      <b>{t(d, 'ful.pack.issueTitle')}</b>
                      <br />
                      {order.openIssues.map((i) => `${t(d, `ful.pack.issueKind.${i.kind}`)}: ${lineOf(i.orderItemId)?.sku ?? ''}`).join(' · ')}
                      <br />
                      {t(d, 'ful.pack.issueOpen')}
                    </span>
                  </div>
                ) : null}
                {order.status === 'ON_HOLD' ? (
                  <div className="a2-note warn" style={{ marginTop: 0, marginBottom: 12 }}>
                    <ShellIcon name="lock" size={15} />
                    <span>{t(d, 'ful.pack.heldNote')}</span>
                  </div>
                ) : null}
                <h3 className="a2-h4" style={{ marginBottom: 4 }}>
                  {t(d, check.mode === 'tick' ? 'ful.pack.tickTitle' : 'ful.pack.scanTitle')}
                </h3>
                <div className="a2-lines" data-testid="pack-lines">
                  {order.lines.map((l) => (
                    <div key={l.lineId} className="a2-prow" data-testid="pack-line">
                      <div className="a2-prt">
                        <b>{[l.productName, l.colourName, l.sizeLabel].filter(Boolean).join(' · ')}</b>
                        <span className="a2-mono">
                          {l.sku}
                          {l.barcode ? ` · ${l.barcode}` : ''} · × {n(l.quantity)}
                        </span>
                      </div>
                      {l.done ? (
                        <span className="a2-pill ok">
                          <ShellIcon name="check" size={12} />
                          {t(d, 'ful.pack.checked')}
                        </span>
                      ) : checking && canPack && check.mode === 'tick' ? (
                        <TickLine dict={fd} orderId={order.orderId} lineId={l.lineId} />
                      ) : (
                        <span className="a2-pill line">{t(d, 'ful.pack.progress', { n: n(l.checked), q: n(l.quantity) })}</span>
                      )}
                    </div>
                  ))}
                </div>
                {checking && canPack && check.mode === 'scan' && !order.allChecked ? <ScanBox dict={fd} orderId={order.orderId} allowTyped={check.allowTyped} /> : null}
                {order.photo.state !== 'off' ? (
                  <div className={`a2-note${order.photo.state === 'missing' ? ' warn' : ''}`} data-testid="pack-photo-note">
                    <ShellIcon name={order.photo.state === 'ok' || order.photo.state === 'waived' ? 'check' : 'alert'} size={15} />
                    <span>
                      {order.photo.state === 'ok'
                        ? t(d, 'ful.pack.photo.ok', { n: n(order.photo.count), days: n(order.photo.keepDays) })
                        : order.photo.state === 'waived'
                          ? t(d, 'ful.pack.photo.waived', { reason: order.photo.waivedReason ?? '' })
                          : t(d, `ful.pack.photo.${order.photo.state}`)}
                    </span>
                    {canPack && ['CONFIRMED', 'PROCESSING', 'PACKED'].includes(order.status) ? <PhotoUpload dict={fd} orderId={order.orderId} label={t(d, order.photo.count ? 'ful.pack.photoMore' : 'ful.pack.photoTake')} /> : null}
                  </div>
                ) : null}
                {order.photo.state === 'missing' && can('fulfilment.photoWaive') ? (
                  <div className="a2-mt6">
                    <Act dict={fd} url={`/api/admin/packing/orders/${order.orderId}/waive`} label={t(d, 'ful.pack.waive')} note={{ field: 'reason', label: t(d, 'ful.pack.waiveReason') }} tone="ghost" testId="pack-waive" />
                  </div>
                ) : null}
                <div className="a2-kv2" style={{ marginTop: 12 }} data-testid="pack-kv">
                  <span>{t(d, 'ful.pack.kv.courier')}</span>
                  <span>
                    {order.parcel ? (
                      <>
                        {order.parcel.courierName}
                        {order.parcel.consignmentId ? (
                          <>
                            {' · '}
                            <span className="a2-mono">{order.parcel.consignmentId}</span>
                          </>
                        ) : null}
                      </>
                    ) : (
                      t(d, 'ful.pack.notBooked')
                    )}
                  </span>
                  <span>{t(d, 'ful.pack.kv.stickers')}</span>
                  <span>{n(order.parcel?.printCount ?? 0)}</span>
                  {order.weight.enabled ? (
                    <>
                      <span>{t(d, 'ful.pack.kv.weight')}</span>
                      <span>
                        {order.weight.expectedGrams !== null ? t(d, 'ful.pack.weight.expected', { g: n(order.weight.expectedGrams) }) : t(d, 'ful.pack.weight.expectedNone')}
                        {order.weight.weighedGrams !== null ? ` · ${t(d, 'ful.pack.weight.weighed', { g: n(order.weight.weighedGrams) })}` : ''}
                      </span>
                    </>
                  ) : null}
                </div>
              </section>
              <div className="a2-card tight" data-testid="pack-actions">
                <div className="a2-gap8" style={{ alignItems: 'flex-start' }}>
                  {order.status === 'CONFIRMED' && canPack ? <Act dict={fd} url={`/api/admin/packing/orders/${order.orderId}/start`} label={t(d, 'ful.pack.start')} tone="pri" size="" testId="pack-start" /> : null}
                  {checking && canPack ? <PackButton dict={fd} orderId={order.orderId} disabled={shut} weight={{ enabled: order.weight.enabled, required: weightCfg.requireReading }} primary={order.status === 'PROCESSING'} /> : null}
                  {order.status === 'PACKED' && !order.parcel && can('delivery.book') ? (
                    couriers.length ? (
                      <BookOne dict={fd} orderId={order.orderId} couriers={couriers} codeWords={codeWords} />
                    ) : (
                      <span className="a2-xs a2-mute">{t(d, 'ful.pack.noCourier')}</span>
                    )
                  ) : null}
                  {order.status === 'PACKED' && order.parcel?.consignmentId ? (
                    <Link className="a2-btn pri lg" href="/admin/orders/packing/handover" data-testid="pack-handover">
                      {t(d, 'ful.pack.handover')}
                    </Link>
                  ) : null}
                  {order.parcel?.consignmentId && can('fulfilment.print') ? (
                    <PdfButton dict={fd} url="/api/admin/packing/stickers" body={{ shipmentIds: [order.parcel.shipmentId] }} label={t(d, 'ful.pack.sticker')} busyLabel={t(d, 'ful.packing.printing')} size="" keyed fileName="sticker.pdf" testId="pack-sticker" />
                  ) : null}
                  {can('orders.invoice') ? (
                    <a className="a2-btn" href={invoiceHref(order.orderNumber)} target="_blank" rel="noopener" data-testid="pack-invoice">
                      <ShellIcon name="file" size={15} />
                      {t(d, 'ful.pack.invoice')}
                    </a>
                  ) : null}
                </div>
                {checking && order.blocked && order.blocked !== 'WEIGHT_GAP' ? (
                  <p className="a2-xs a2-mute a2-mt6" data-testid="pack-blocked">
                    {t(d, `ful.pack.block.${order.blocked}`)}
                  </p>
                ) : null}
              </div>
            </>
          ) : (
            <div className="a2-state">
              <div className="a2-sti">
                <ShellIcon name="box" size={26} />
              </div>
              <h3>{t(d, 'ful.pack.pickOne')}</h3>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
