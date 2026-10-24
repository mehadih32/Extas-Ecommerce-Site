// S08 · PR 554 — Delivery → Couriers (DLV-05, docs/BACKEND-ARCHITECTURE.md §5.6; demo V12.3 97t couriers): every courier
// account of the store with its mode (practice until the courier's keys pass the Test in Keys & connections), on or off,
// and its own area list — how many places were read, how many of the shop's areas are paired, what the courier dropped,
// the last reading — with "Read the list now". Adding an account and switching it on or off use the courier API of
// PR 175 (follow-up 370 has the rest of the account screens). Seeing needs `delivery.read`; changing needs
// `delivery.couriers`, which the API checks again.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as sh from '@extas/shipping';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { Act, AddCourier, ReadNow } from '@/components/admin/fulfil/Act';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { formatNumber } from '@/components/admin/products/model';
import { adminDeps } from '@/lib/admin-auth';
import { withFulfil } from '@/lib/admin-fulfil/i18n';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { shippingDeps } from '@/lib/shipping-api';

export const dynamic = 'force-dynamic';

const HERE = '/admin/delivery/couriers';

export async function generateMetadata(): Promise<Metadata> {
  const view = withFulfil(await adminView());
  return { title: `${t(view.dict, 'ful.couriers.title')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function CouriersPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('delivery.read', deps, MOTHER_STORE_ID)]);
  const view = withFulfil(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current="couriers" text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="delivery.read" />
      </div>
    );
  const who: sh.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const sd = await shippingDeps(access.deps);
  const [list, zones] = await Promise.all([sh.listCouriers(sd, who), sh.zoneSummaries(sd, who)]);
  const byId = new Map(zones.map((z) => [z.courierAccountId, z]));
  const can = access.guard.permissions?.has('delivery.couriers') ?? false;
  const fd: Dict = { ful: d.ful as Dict };
  const n = (x: number) => formatNumber(x, view.locale);
  const when = new Intl.DateTimeFormat(view.locale, { timeZone: view.timeZone, dateStyle: 'medium', timeStyle: 'short' });
  const provider = (p: string) => t(d, `courier.providers.${p}`);

  return (
    <div className="a2-z" data-testid="couriers">
      <PageHead view={view} place={locateKey('couriers')} title={t(d, 'ful.couriers.title')} sub={t(d, 'ful.couriers.sub')} />
      <SectionTabs view={view} current="couriers" />
      {can ? (
        <section className="a2-card tight a2-mt12" aria-label={t(d, 'ful.couriers.add')}>
          <h2 className="a2-h4" style={{ marginBottom: 8 }}>
            {t(d, 'ful.couriers.add')}
          </h2>
          <AddCourier dict={fd} providers={list.providers.map((p) => ({ key: p, label: provider(p) }))} />
        </section>
      ) : null}
      {list.couriers.length ? (
        <div className="a2-stack a2-mt12" data-testid="courier-list">
          {list.couriers.map((c) => {
            const z = byId.get(c.id);
            const run = z?.openRun ?? null;
            return (
              <section key={c.id} className="a2-card tight" data-testid="courier-row" data-provider={c.providerKey}>
                <div className="a2-between">
                  <div>
                    <h2 className="a2-h3">{c.name}</h2>
                    <div className="a2-gap8 a2-mt6">
                      <span className="a2-pill line">{provider(c.providerKey)}</span>
                      <span className={`a2-pill ${c.mode === 'MOCK' ? 'gold' : 'ok'}`}>{t(d, `ful.couriers.mode.${c.mode}`)}</span>
                      <span className={`a2-pill ${c.enabled ? 'g' : ''}`}>
                        <i />
                        {t(d, c.enabled ? 'ful.couriers.on' : 'ful.couriers.off')}
                      </span>
                    </div>
                  </div>
                  <div className="a2-cmds">
                    <Link className="a2-btn sm" href={`${HERE}/${c.id}`}>
                      {t(d, 'ful.couriers.open')}
                      <ShellIcon name="cr" size={14} />
                    </Link>
                    {can ? <Act dict={fd} url={`/api/admin/delivery/couriers/${c.id}`} body={{ enabled: !c.enabled }} label={t(d, c.enabled ? 'ful.couriers.switchOff' : 'ful.couriers.switchOn')} tone="ghost" method="PATCH" /> : null}
                  </div>
                </div>
                <div className="a2-sm a2-mt12">
                  {!z?.hasList ? (
                    <span className="a2-mute">{t(d, 'ful.couriers.noList')}</span>
                  ) : (
                    <div className="a2-between">
                      <span>
                        {z.places || z.mapped ? t(d, 'ful.couriers.zoneLine', { places: n(z.places), mapped: n(z.mapped) }) : t(d, 'ful.couriers.neverRead')}
                        {z.dropped ? <span className="a2-pill warn" style={{ marginLeft: 8 }}>{t(d, 'ful.couriers.dropped', { n: n(z.dropped) })}</span> : null}
                        <span className="a2-xs a2-mute a2-blk">
                          {run ? t(d, 'ful.couriers.running', { calls: n(run.calls), left: n(run.left) }) : z.lastRun?.finishedAt ? `${t(d, 'ful.couriers.lastRead', { at: when.format(z.lastRun.finishedAt) })} · ${t(d, `ful.courier.status.${z.lastRun.status}`)}` : ''}
                        </span>
                      </span>
                      {can ? (
                        <ReadNow dict={fd} courierId={c.id} />
                      ) : null}
                    </div>
                  )}
                </div>
                {c.mode === 'MOCK' && z?.hasList ? <div className="a2-xs a2-mute a2-mt6">{t(d, 'ful.couriers.practiceNote')}</div> : null}
              </section>
            );
          })}
        </div>
      ) : (
        <section className="a2-card a2-mt12" data-testid="couriers-empty">
          <p className="a2-sm a2-mute">{t(d, 'ful.couriers.empty')}</p>
        </section>
      )}
    </div>
  );
}
