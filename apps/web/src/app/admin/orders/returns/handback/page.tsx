// CN-028 · PR 612 — the hand-back desk at /admin/orders/returns/handback (ERP contract v6; docs/RETAIL-ERP-MODEL.md §6):
// start a list for a courier and day, scan each returned parcel with the pieces counted and a short condition note (a
// photo of the sealed bag when `returns.handback.photo` is on), close it and it goes to the store's own ERP as the
// return list. `?list=<id>` opens one list: its parcels and, once sent, the ERP's answer per parcel (in Return stock,
// on Hold, refused with the reason), a count that differs (the courier claim started), and the steps open now. On v5
// the page says the old Receive & QC is still used. Needs `returns.handback`; the order service checks it again on
// every call. Words: messages/admin-returns.*.json (`returns.handback.*`).
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as od from '@extas/orders';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { readDeps } from '@/components/admin/orders/OrderListPage';
import { actionTexts } from '@/components/admin/orders/ReturnsBoard';
import { HandbackFixForm, HandbackOpenForm, HandbackScanForm, HandbackStep, type HandbackTexts } from '@/components/admin/orders/HandbackDesk';
import { formatNumber } from '@/components/admin/products/model';
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

export const dynamic = 'force-dynamic';

const KEY = 'ordersReturnsHandback';
const HERE = `${RETURNS_HREF}/handback`;

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || null;

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, returns: (view.lang === 'bn' ? bn : en) as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'returns.handback.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

const statusTone = (s: string) => (s === 'ACCEPTED' ? 'ok' : s === 'REFUSED' ? 'bad' : s === 'SENT' ? 'warn' : 'info');
const resultTone = (r: string | null) => (r === 'IN_RETURN_STOCK' ? 'ok' : r === 'HOLD' ? 'warn' : r === 'REFUSED' ? 'bad' : '');

export default async function HandbackPage({ searchParams }: { searchParams: Search }) {
  const deps = adminDeps();
  const [plain, sp, access] = await Promise.all([adminView(deps), searchParams, pageAccess('returns.handback', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const listId = one(sp.list);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(listId ? `${HERE}?list=${listId}` : HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="returns.handback" />
      </div>
    );
  const who: od.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const rd = readDeps(access.deps);
  const canDesk = true;
  const desk = await od.handbackDesk(rd, who);
  const chosen = listId ? await od.handbackList(rd, who, listId) : (desk.open[0] ?? null);
  const d = view.dict;
  const h = (key: string, vars?: Record<string, string | number>) => t(d, `returns.handback.${key}`, vars);
  const n = (x: number) => formatNumber(x, view.locale);
  const errs = actionTexts(d).errors;
  const texts: HandbackTexts = {
    courier: h('courier'),
    hand: h('hand'),
    day: h('day'),
    openBtn: h('openBtn'),
    code: h('code'),
    count: h('count'),
    note: h('note'),
    noteHint: h('noteHint'),
    unexpected: h('unexpected'),
    photo: h('photo'),
    photoDone: h('photoDone'),
    photoNeeded: h('photoNeeded'),
    scanBtn: h('scanBtn'),
    fix: h('fix'),
    fixSave: h('fixSave'),
    cancel: t(d, 'returns.act.cancel'),
    // a missing note on the desk is about the count, not an exchange's reason
    errors: { ...errs, REASON_REQUIRED: h('noteNeeded') },
  };
  const courierName = (c: string) => (c === od.HAND_COURIER ? h('hand') : c);
  const dt = new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: view.timeZone, numberingSystem: 'latn' });
  const dayFmt = new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeZone: 'UTC', numberingSystem: 'latn' });
  const day = (s: string) => dayFmt.format(new Date(`${s}T00:00:00Z`));
  const listLine = (l: od.HandbackListView) => `${courierName(l.courier)} · ${day(l.handedBackAt)} · ${h('parcels', { n: n(l.parcels.filter((p) => !p.resentInListId).length) })} · ${h('pieces', { n: n(l.pieces) })}`;
  const listCard = (l: od.HandbackListView) => (
    <Link key={l.id} className={`a2-qi a2-mt6${chosen?.id === l.id ? ' on' : ''}`} href={`${HERE}?list=${l.id}`} scroll={false} aria-current={chosen?.id === l.id ? 'true' : undefined} data-testid="handback-list" data-status={l.status}>
      <div>
        <b className="a2-mono">{l.returnListId}</b>
        <span>{listLine(l)}</span>
      </div>
      <span className={`a2-pill ${statusTone(l.status)}`}>{h(`status.${l.status}`)}</span>
    </Link>
  );

  return (
    <div className="a2-z" data-testid="handback-page" data-model={desk.model}>
      <PageHead
        view={view}
        place={locateKey(KEY)}
        title={h('title')}
        sub={h('sub')}
        crumb={
          <Link className="rt-crumb" href={RETURNS_HREF}>
            <ShellIcon name="cl" size={12} />
            {h('back')}
          </Link>
        }
      />
      <SectionTabs view={view} current={KEY} />
      {desk.model === 'v5' ? (
        <section className="a2-card" data-testid="handback-v5">
          <div className="a2-note">
            <ShellIcon name="info" size={15} />
            <span>{h('v5')}</span>
          </div>
        </section>
      ) : (
        <div className="a2-row a2-r12 a2-start">
          <div className="a2-stack">
            {canDesk ? (
              <section className="a2-card">
                <h2 className="a2-h3">{h('open')}</h2>
                <div className="a2-mt12">
                  <HandbackOpenForm couriers={desk.couriers} today={desk.today} here={HERE} texts={texts} />
                </div>
              </section>
            ) : null}
            <section className="a2-card" data-testid="handback-open-lists">
              <h2 className="a2-h3">{h('openLists')}</h2>
              {desk.open.length ? desk.open.map(listCard) : <div className="a2-sm a2-mute a2-mt6">{h('noOpen')}</div>}
            </section>
            <section className="a2-card" data-testid="handback-recent">
              <h2 className="a2-h3">{h('recent')}</h2>
              {desk.recent.length ? desk.recent.map(listCard) : <div className="a2-sm a2-mute a2-mt6">{h('noRecent')}</div>}
            </section>
          </div>
          {chosen ? (
            <section className="a2-card" data-testid="handback-chosen" data-status={chosen.status}>
              <div className="a2-ch">
                <div>
                  <h2 className="a2-h3">{h('list', { id: chosen.returnListId })}</h2>
                  <div className="a2-cs">{listLine(chosen)}</div>
                </div>
                <span className={`a2-pill ${statusTone(chosen.status)}`}>{h(`status.${chosen.status}`)}</span>
              </div>
              {chosen.error ? (
                <div className="a2-note warn">
                  <ShellIcon name="alert" size={15} />
                  <span>{`${h('error', { text: chosen.error })}${chosen.sendAttempts ? ` · ${h('tries', { n: n(chosen.sendAttempts) })}` : ''}`}</span>
                </div>
              ) : null}
              {chosen.status === 'OPEN' && canDesk ? (
                <div className="a2-mt12">
                  <HandbackScanForm listId={chosen.id} photoRequired={desk.photoRequired} texts={texts} />
                </div>
              ) : null}
              <h3 className="a2-h4 a2-mt12">{h('parcels', { n: n(chosen.parcels.length) })}</h3>
              {chosen.parcels.length ? (
                chosen.parcels.map((p) => (
                  <div key={p.id} className="a2-card tight a2-mt6" data-testid="handback-parcel" data-result={p.result ?? 'waiting'}>
                    <div className="a2-between">
                      <b>
                        {p.orderId ? (
                          <Link className="a2-lnk" href={`/admin/orders/${p.orderId}`}>
                            {p.orderNumber ?? p.externalOrderId}
                          </Link>
                        ) : (
                          p.externalOrderId
                        )}
                        {p.consignmentId ? <span className="a2-mono a2-mute">{` · ${p.consignmentId}`}</span> : null}
                      </b>
                      {chosen.status !== 'OPEN' ? <span className={`a2-pill ${resultTone(p.result)}`}>{h(`result.${p.result ?? 'waiting'}`)}</span> : null}
                    </div>
                    <div className="a2-xs a2-mt6">
                      {[h('counted', { n: n(p.receivedCount) }), p.expectedCount !== null ? h('expected', { n: n(p.expectedCount) }) : null, p.reason ? h(`reason.${p.reason}`) : null, dt.format(new Date(p.scannedAt))].filter(Boolean).join(' · ')}
                    </div>
                    {p.note ? <div className="a2-xs a2-mute a2-mt6">{p.note}</div> : null}
                    <div className="a2-gap8 a2-mt6">
                      {p.unexpected ? <span className="a2-pill line">{h('unexpectedTag')}</span> : null}
                      {p.exchange ? <span className="a2-pill info">{h('exchangeTag')}</span> : null}
                      {p.countDiffers ? <span className="a2-pill bad">{h('claim')}</span> : null}
                      {p.resentInListId ? <span className="a2-pill line">{h('resent')}</span> : null}
                    </div>
                    {chosen.status === 'OPEN' && canDesk ? <HandbackFixForm listId={chosen.id} parcelId={p.id} count={p.receivedCount} note={p.note} texts={texts} /> : null}
                  </div>
                ))
              ) : (
                <div className="a2-sm a2-mute a2-mt6">{h('noParcels')}</div>
              )}
              {canDesk ? (
                <div className="a2-cmds a2-mt12">
                  {chosen.status === 'OPEN' && chosen.parcels.length ? <HandbackStep listId={chosen.id} step="close" label={h('close')} tone="pri" here={HERE} texts={texts} testId="handback-close" /> : null}
                  {chosen.status === 'SENT' ? <HandbackStep listId={chosen.id} step="send" label={h('send')} tone="pri" here={HERE} texts={texts} testId="handback-send" /> : null}
                  {chosen.refusedOpen ? <HandbackStep listId={chosen.id} step="resend" label={h('resend')} here={HERE} texts={texts} testId="handback-resend" /> : null}
                </div>
              ) : null}
              <div className="a2-note">
                <ShellIcon name="info" size={15} />
                <span>{chosen.status === 'OPEN' ? h('closeHint') : h('never')}</span>
              </div>
            </section>
          ) : (
            <section className="a2-card">
              <div className="a2-sm a2-mute">{h('noOpen')}</div>
              <div className="a2-note">
                <ShellIcon name="info" size={15} />
                <span>{h('never')}</span>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
