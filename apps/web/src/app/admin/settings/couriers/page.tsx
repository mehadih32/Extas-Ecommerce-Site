// PR 1010 (final round, lane D11; admin prototype v5 m-settings.js `renderCouriers`) — Settings › Couriers at /admin/settings/couriers, built to the
// prototype: Courier accounts (Connect / Disconnect, Fees: Inside Dhaka, Suburbs, Outside, Cash fee, the share returned and the parcels in 30
// days; "Shop's cost per parcel"), Default courier (the connected couriers only), Different courier by area, Pickup from, Daily pickup time, and
// Auto-booking with the packed orders waiting. Everything the shop already had about couriers (all accounts, rename and archive, Courier 360, the
// delivery settings, claims and payouts) is under "More options" on this same page; nothing was removed. Seeing needs `delivery.read`; each change
// checks its own permission again in the API (fees: `costs.write` and the owner's PIN). Nothing here reaches a customer or moves money.
// Guide: docs/admin-guide/pages/settings/couriers.md. lib/admin-courier-settings/*, components/admin/settings/CourierSettings.tsx.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { CourierSettings } from '@/components/admin/settings/CourierSettings';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { courierSettingsView } from '@/lib/admin-courier-settings/service';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { shippingDeps } from '@/lib/shipping-api';
import bn from '../../../../../messages/admin-courier-settings.bn.json';
import en from '../../../../../messages/admin-courier-settings.en.json';
import '../../settings-cards.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/settings/couriers';
const KEY = 'settingsCouriers';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

/** A nested words file as one flat list: `{a: {b: 'x'}}` → `{'a.b': 'x'}`. */
function flat(d: Dict, at = ''): Record<string, string> {
  return Object.fromEntries(Object.entries(d).flatMap(([k, v]) => (typeof v === 'string' ? [[`${at}${k}`, v]] : Object.entries(flat(v, `${at}${k}.`)))));
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'cs.metaTitle'), robots: { index: false, follow: false } };
}

export default async function CourierSettingsPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('delivery.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="cs-page" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="delivery.read" />
      </div>
    );
  const sd = await shippingDeps(access.deps);
  const data = await courierSettingsView({ db: access.deps.db, resolver: access.deps.resolver, shipping: sd }, { actor: access.guard.actor, ctx: access.guard.ctx }, view.lang);
  const perms = access.guard.permissions;
  const has = (p: string) => perms?.has(p as never) ?? false;
  const x = flat((d.cs ?? {}) as Dict);
  const m = (k: string) => x[`more.${k}`] ?? k;
  const more: { id: string; href: string; h: string; d: string }[] = [
    { id: 'all', href: '/admin/delivery/couriers', h: m('all'), d: m('allD') },
    { id: 'overview', href: '/admin/delivery', h: m('overview'), d: m('overviewD') },
    { id: 'settings', href: '/admin/delivery/settings', h: m('settings'), d: m('settingsD') },
    { id: 'claims', href: '/admin/delivery/claims', h: m('claims'), d: m('claimsD') },
    { id: 'keys', href: '/admin/integrations', h: m('keys'), d: m('keysD') },
  ];
  return (
    <div className="a2-z" data-testid="cs-page" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={x.title!} sub={x.sub!} />
      <SectionTabs view={view} current={KEY} />
      <CourierSettings
        view={data}
        x={x}
        locale={view.locale}
        can={{ fees: has('costs.write'), charges: has('delivery.charges'), couriers: has('delivery.couriers'), book: has('delivery.book') }}
        links={{ delivery: '/admin/delivery/zones', keys: '/admin/integrations', store: '/admin/settings/store', orders: '/admin/orders/packing' }}
      />
      <details className="a2-card a2-mt12 cs-more" data-testid="cs-more">
        <summary className="a2-h3">{m('h')}</summary>
        <p className="a2-sm a2-mute a2-mt6">{m('sub')}</p>
        <ul className="cs-more-list">
          {more.map((o) => (
            <li key={o.id}>
              <Link className="a2-lnk" href={o.href} data-testid={`cs-more-${o.id}`}>
                {o.h} →
              </Link>
              <div className="a2-xs a2-mute">{o.d}</div>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
