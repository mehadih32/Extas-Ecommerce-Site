// S06 · PR 550 — delivery areas and charges: the three bands (demo 92-admin-couriers.js "Three delivery bands" card and
// the Settings › Delivery rows: charge, hours, the sub-area mode) and the owner's sub-area list. PR 551 — "Try an
// address": the line read the way checkout reads it (the demo checkout's delivery block). Seeing needs
// `delivery.read`; changing a band needs `delivery.charges`, the list `delivery.areas`; the API checks both again on
// every call. The charges, hours and the list are owner data: the shop ships them empty and off.
// PR 12 (CN-022): the Delivery section's "Zones & charges" tab, at /admin/delivery/zones (demo V12.3); the old address
// /admin/delivery sends here permanently until the section's own overview is built.
// PR 502: on the new admin shell (demo V12.3 #/admin/delivery/zones: the band cards in a row, then "Areas" and "Try an
// address"): the cash-on-delivery limit per band, the sub-area band's own switch, and the area admin — open, rename,
// re-spell, add, merge, move between bands (never deleting). Guide: docs/admin-guide/pages/delivery/zones.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as del from '@extas/delivery';
import * as sh from '@extas/shipping';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { AreaAdmin } from '@/components/admin/delivery/AreaAdmin';
import { CourierSetupCards, type SetupCourier, type SetupEntry } from '@/components/admin/delivery/CourierSetupCards';
import { DeliveryBands } from '@/components/admin/delivery/DeliveryBands';
import { nameOf } from '@/components/admin/delivery/model';
import { TryAddress } from '@/components/admin/delivery/TryAddress';
import { formatMoney, moneyOf } from '@/components/admin/products/model';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { deliveryDeps } from '@/lib/delivery-api';
import { deliverySettingCards } from '@/lib/delivery-settings-api';
import { shippingDeps } from '@/lib/shipping-api';
import { withCouriers } from '@/lib/admin-couriers';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../messages/admin-delivery.bn.json';
import en from '../../../../../messages/admin-delivery.en.json';
import '../../settings-cards.css';

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
  const view = withCouriers(withScreen(plain));
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="delivery.read" />
      </div>
    );

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
  const choices = bands.map((b) => ({ id: b.id, name: nameOf(view.lang, b) }));

  // PR 803: the prototype's Setup tab — one card per courier, then Alerts and the Default courier
  const sd = await shippingDeps(access.deps);
  const [list, cards, rateRows] = await Promise.all([
    sh.listCouriers(sd, who),
    deliverySettingCards({ db: access.deps.db, resolver: access.deps.resolver }, { actor: access.guard.actor, ctx: access.guard.ctx }),
    access.deps.db.courierRateCard.findMany({
      where: { storeId: MOTHER_STORE_ID, OR: [{ validTo: null }, { validTo: { gt: new Date() } }], validFrom: { lte: new Date() } },
      select: { courierAccountId: true, zoneKey: true, weightFromGrams: true, chargeMinor: true, codFeeBps: true, returnChargeMinor: true },
      orderBy: [{ weightFromGrams: 'asc' }, { id: 'asc' }],
    }),
  ]);
  const defaultId = sh.defaultCourierIdOf(list.couriers.map((c) => ({ id: c.id, providerKey: c.providerKey, name: c.name, archivedAt: null })), (cards['delivery.couriers'].value as { defaultCourierId: string }).defaultCourierId);
  const backupId = (cards['fulfilment.courierWatch'].value as { backupCourierId: string }).backupCourierId;
  const sdict = view.dict;
  const none = t(sdict, 'cr.su.noRate');
  const setupCouriers: SetupCourier[] = list.couriers.map((c) => {
    const mine = rateRows.filter((r) => r.courierAccountId === c.id);
    const first = mine[0];
    return {
      id: c.id,
      name: c.name,
      connected: c.mode !== 'MOCK',
      enabled: c.enabled,
      isDefault: c.id === defaultId,
      isBackup: c.id === backupId,
      rates: bands
        .filter((b) => b.enabled)
        .map((b) => {
          const r = mine.find((x) => x.zoneKey === b.key);
          return { label: nameOf(view.lang, b), value: r ? formatMoney(r.chargeMinor, money) : none };
        }),
      codFee: first?.codFeeBps != null ? `${first.codFeeBps / 100}%` : none,
      returnCharge: first?.returnChargeMinor != null ? formatMoney(first.returnChargeMinor, money) : none,
    };
  });

  return (
    <div className="a2-z" data-testid="delivery-zones" data-lm-ready="" lang={view.lang}>
      <PageHead view={view} place={locateKey(KEY)} title={t(dict, 'cr.su.heading')} sub={t(dict, 'cr.su.sub')} right={<Link className="a2-btn" href="/admin/integrations">{t(dict, 'cr.su.keys')} →</Link>} />
      <SectionTabs view={view} current={KEY} />
      <CourierSetupCards
        dict={dict}
        couriers={setupCouriers}
        entries={(cards['delivery.courier.setup'].value as { couriers: Record<string, SetupEntry> }).couriers}
        setup={cards['delivery.courier.setup']}
        watch={cards['fulfilment.courierWatch']}
        digits={money.digits}
        canEdit={can('delivery.charges')}
        keysHref="/admin/integrations"
        ratesHref="/admin/money/fees"
      />
      <h2 className="a2-h4 a2-mt12" data-testid="delivery-charges-heading">
        {t(dict, 'cr.su.moreSetup')}
      </h2>
      {source === null || source === 'sample' ? (
        <div className="a2-note">
          <ShellIcon name="info" size={15} />
          <span>{t(dict, 'delivery.sample')}</span>
        </div>
      ) : null}
      <div className="a2-mt12">
        <DeliveryBands dict={dict} lang={view.lang} locale={view.locale} money={money} bands={bands} canEdit={can('delivery.charges')} />
      </div>
      <div className="dz-grid">
        <AreaAdmin dict={dict} lang={view.lang} areas={areas} bands={choices} canEdit={can('delivery.areas')} />
        <TryAddress dict={dict} lang={view.lang} locale={view.locale} money={money} settleMs={timings.settleMs} minWords={timings.minWords} />
      </div>
    </div>
  );
}
