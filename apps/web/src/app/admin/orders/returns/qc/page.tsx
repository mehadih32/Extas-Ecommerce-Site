// S08 · PR 187 — ORD-05a Receive & QC at /admin/orders/returns/qc (demo V12.2 #/admin/orders/returns/qc; §6.5.4 D4):
// step 1, the parcels expected back or at the shop (`?order=<number>` finds one order's); step 2 (`?id=<returnId>`),
// each piece checked — the SKU scanned, sellable or not, the reason and photo of a loss — in one save. Needs
// `returns.qc`; the order service checks it again on every call. Words: messages/admin-returns.*.json (`returns.qc.*`).
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as od from '@extas/orders';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { readDeps } from '@/components/admin/orders/OrderListPage';
import { actionTexts } from '@/components/admin/orders/ReturnsBoard';
import { ReturnsQcForm, type QcTexts } from '@/components/admin/orders/ReturnsQcForm';
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

const KEY = 'ordersReturnsQc';
const HERE = `${RETURNS_HREF}/qc`;

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || null;

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, returns: (view.lang === 'bn' ? bn : en) as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'returns.qc.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

const qcHref = (q: { id?: string | null; order?: string | null }) => {
  const sp = new URLSearchParams();
  if (q.order) sp.set('order', q.order);
  if (q.id) sp.set('id', q.id);
  const s = sp.toString();
  return s ? `${HERE}?${s}` : HERE;
};

export default async function ReturnsQcPage({ searchParams }: { searchParams: Search }) {
  const deps = adminDeps();
  const [plain, sp, access] = await Promise.all([adminView(deps), searchParams, pageAccess('returns.qc', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const q = { id: one(sp.id), order: one(sp.order) };
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(qcHref(q))}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="returns.qc" />
      </div>
    );
  const who: od.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const rd = readDeps(access.deps);
  const [waiting, qc, lossReasons] = await Promise.all([
    od.listReturns(rd, who, { status: ['EXPECTED', 'RECEIVED'], ...(q.order ? { orderNumber: q.order } : {}) }),
    access.deps.resolver.value('orders.returns.qc', { storeId: MOTHER_STORE_ID }),
    access.deps.resolver.value('orders.returns.lossReasons', { storeId: MOTHER_STORE_ID }),
  ]);
  let chosen: od.ReturnView | null = null;
  if (q.id) {
    try {
      chosen = await od.returnDetail(rd, who, q.id);
    } catch (e) {
      if (!(e instanceof od.OrdersError && e.code === 'NOT_FOUND')) throw e;
    }
  }
  const d = view.dict;
  const r = (key: string, vars?: Record<string, string | number>) => t(d, `returns.qc.${key}`, vars);
  const texts: QcTexts = {
    ...Object.fromEntries(['expectedSku', 'scanned', 'sellable', 'unsellable', 'reason', 'choose', 'photo', 'photoAdd', 'photoDone', 'photoNeeded', 'otherSku', 'otherNote', 'note', 'save', 'saveHint', 'receive'].map((k) => [k, r(k)])),
    errors: actionTexts(d).errors,
  } as QcTexts;
  const pieceText = (i: od.ReturnItemView) => [i.productName, i.colourName, i.sizeLabel].filter(Boolean).join(' · ');
  const reasonLabel = (key: string | null) => (key ? (lossReasons.find((x) => x.key === key)?.[view.lang === 'bn' ? 'bn' : 'en'] ?? key) : '');
  const open = chosen && (chosen.status === 'EXPECTED' || chosen.status === 'RECEIVED');
  const tone = (s: string | null) => (s === 'RESTOCKED' ? 'ok' : s === 'ERP_FAILED' || s === 'LOSS_RECORDED' ? 'bad' : 'warn');

  return (
    <div className="a2-z" data-testid="returns-qc">
      <PageHead
        view={view}
        place={locateKey(KEY)}
        title={r('title')}
        sub={r('sub')}
        crumb={
          <Link className="rt-crumb" href={RETURNS_HREF}>
            <ShellIcon name="cl" size={12} />
            {r('back')}
          </Link>
        }
      />
      <SectionTabs view={view} current={KEY} />
      <div className="a2-row a2-r12 a2-start">
        <section className="a2-card" data-testid="qc-find">
          <h2 className="a2-h3">{r('step1')}</h2>
          <form method="get" action={HERE} className="a2-gap8 rt-nowrap a2-mt12">
            <label className="a2-sr" htmlFor="qc-order">
              {r('findLabel')}
            </label>
            <input id="qc-order" name="order" className="a2-inp" defaultValue={q.order ?? ''} placeholder={r('findLabel')} maxLength={40} />
            <button type="submit" className="a2-btn pri">
              <ShellIcon name="search" size={15} />
              {r('find')}
            </button>
          </form>
          <div className="a2-h4 a2-mt12">{r('expected', { n: formatNumber(waiting.length, view.locale) })}</div>
          {waiting.length ? (
            waiting.map((x) => (
              <Link key={x.id} className={`a2-qi a2-mt6${chosen?.id === x.id ? ' on' : ''}`} href={qcHref({ id: x.id, order: q.order })} scroll={false} aria-current={chosen?.id === x.id ? 'true' : undefined}>
                <div>
                  <b>{`${x.orderNumber} · ${x.customerName ?? ''}`}</b>
                  <span>{`${r(`kind.${x.kind}`)} · ${r(`parcel.${x.status}`)}${x.exchangeNumber ? ` · ${x.exchangeNumber}` : ''}`}</span>
                </div>
              </Link>
            ))
          ) : (
            <div className="a2-sm a2-mute a2-mt6">{r('nothing')}</div>
          )}
        </section>
        <div className="a2-stack">
          {chosen ? (
            <section className="a2-card" data-testid="qc-parcel" data-status={chosen.status}>
              <div className="a2-ch">
                <div>
                  <h2 className="a2-h3">{r('step2')}</h2>
                  <div className="a2-cs">{`${chosen.orderNumber} · ${chosen.customerName ?? ''} · ${r(`kind.${chosen.kind}`)}`}</div>
                </div>
                <span className={`a2-pill ${open ? 'warn' : 'ok'}`}>{r(`parcel.${chosen.status}`)}</span>
              </div>
              {open ? (
                <ReturnsQcForm
                  url={`/api/admin/returns/parcels/${chosen.id}/qc`}
                  receiveUrl={chosen.status === 'EXPECTED' ? `/api/admin/returns/parcels/${chosen.id}/receive` : null}
                  version={chosen.version}
                  pieces={chosen.items.filter((i) => !i.disposition).map((i) => ({ id: i.id, expectedSku: i.expectedSku, text: pieceText(i), quantity: i.quantity }))}
                  reasons={lossReasons.map((x) => ({ key: x.key, label: view.lang === 'bn' ? x.bn : x.en }))}
                  photoForLoss={qc.photoForLoss}
                  acceptOtherSku={qc.acceptOtherSku}
                  canReceive
                  texts={texts}
                />
              ) : (
                <>
                  {chosen.items.map((i) => (
                    <div key={i.id} className="a2-sm a2-mt12" data-testid="qc-done-piece">
                      <div>
                        <b>{pieceText(i)}</b>
                        {` · `}
                        <span className="a2-mono">{i.scannedSku}</span>
                        {i.dispositionState ? <span className={`a2-pill ${tone(i.dispositionState)} rt-ml`}>{r(`state.${i.dispositionState}`)}</span> : null}
                      </div>
                      {i.lossReason ? <div className="a2-xs a2-mute">{reasonLabel(i.lossReason)}</div> : null}
                      {i.erp?.lastError && i.dispositionState === 'ERP_FAILED' ? <div className="a2-xs rt-bad">{i.erp.lastError}</div> : null}
                    </div>
                  ))}
                  <p className="a2-sm a2-mute a2-mt12">{r('done')}</p>
                </>
              )}
              <div className="a2-note">
                <ShellIcon name="info" size={15} />
                <span>{r('d4')}</span>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
