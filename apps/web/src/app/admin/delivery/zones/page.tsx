// S06 · PR 550 — delivery areas and charges: the three bands (demo 92-admin-couriers.js "Three delivery bands" card and
// the Settings › Delivery rows: charge, hours, the sub-area mode) and the owner's sub-area list. PR 551 — "Try an
// address": the line read the way checkout reads it (the demo checkout's delivery block). Seeing needs
// `delivery.read`; changing a band needs `delivery.charges`, the list `delivery.areas`; the API checks both again on
// every call. The charges, hours and the list are owner data: the shop ships them empty and off.
// PR 12 (CN-022): the Delivery section's "Zones & charges" tab, at /admin/delivery/zones (demo V12.3); the old address
// /admin/delivery sends here permanently until the section's own overview is built.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as del from '@extas/delivery';
import { AdminFrame, AdminNotice, SystemTabs } from '@/components/admin/AdminFrame';
import { DeliveryBands } from '@/components/admin/delivery/DeliveryBands';
import { nameOf } from '@/components/admin/delivery/model';
import { SubAreaList } from '@/components/admin/delivery/SubAreaList';
import { TryAddress } from '@/components/admin/delivery/TryAddress';
import { Icon } from '@/components/admin/Icon';
import { moneyOf } from '@/components/admin/products/model';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { deliveryDeps } from '@/lib/delivery-api';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../messages/admin-delivery.bn.json';
import en from '../../../../../messages/admin-delivery.en.json';

export const dynamic = 'force-dynamic';

const HERE = '/admin/delivery/zones';
const KEY = 'delivery';

/** The admin dictionary with this screen's own messages under `delivery.*`. */
function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, delivery: (view.lang === 'bn' ? bn : en) as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'delivery.metaTitle'), robots: { index: false, follow: false } };
}

export default async function DeliveryPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('delivery.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noAccess')} />;

  const d = deliveryDeps(access.deps);
  const who: del.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const can = (p: del.DeliveryPermission) => access.guard.permissions?.has(p) ?? false;
  const [bands, areas, source, currency, timings] = await Promise.all([
    del.listBands(d, who),
    del.listSubAreas(d, who, { includeArchived: true }),
    del.lastImportSource(access.deps.db),
    access.deps.resolver.value('store.currency', { storeId: MOTHER_STORE_ID }),
    del.settleTimings(d, MOTHER_STORE_ID),
  ]);
  const money = moneyOf(currency, view.locale);
  const dict = view.dict;
  const bandNames = Object.fromEntries(bands.map((b) => [b.id, nameOf(view.lang, b)]));

  return (
    <AdminFrame view={view} current={KEY}>
      <div className="ad-hd">
        <div className="ad-eyebrow">{t(dict, 'delivery.eyebrow')}</div>
        <h1 className="ad-h1">{t(dict, 'delivery.title')}</h1>
        <p className="ad-intro">{t(dict, 'delivery.intro')}</p>
      </div>
      <SystemTabs view={view} current={KEY} />
      {source === null || source === 'sample' ? (
        <div className="ad-note ad-note-top">
          <Icon name="info" size={16} />
          <div>{t(dict, 'delivery.sample')}</div>
        </div>
      ) : null}
      <div className="dl-grid">
        <DeliveryBands dict={dict} lang={view.lang} locale={view.locale} money={money} bands={bands} canEdit={can('delivery.charges')} />
        <SubAreaList dict={dict} lang={view.lang} areas={areas} bandNames={bandNames} canEdit={can('delivery.areas')} />
        <TryAddress dict={dict} lang={view.lang} locale={view.locale} money={money} settleMs={timings.settleMs} minWords={timings.minWords} />
      </div>
    </AdminFrame>
  );
}
