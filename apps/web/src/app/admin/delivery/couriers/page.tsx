// S08 · PR 554 — Delivery → Couriers (DLV-05, docs/BACKEND-ARCHITECTURE.md §5.6; demo V12.3 97t couriers): every courier
// account of the store with its mode (practice until the courier's keys pass the Test in Keys & connections), on or off,
// and its own area list — how many places were read, how many of the shop's areas are paired, what the courier dropped,
// the last reading — with "Read the list now". Adding an account and switching it on or off use the courier API of
// PR 175. Follow-up 370: each account can be renamed (the name on the screen) and archived — switched off and moved to
// "Archived" (`?archived=1`), never deleted; its parcels keep being tracked and "Bring back" returns it switched off.
// Seeing needs `delivery.read`; changing needs `delivery.couriers`, which the API checks again.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as sh from '@extas/shipping';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { Act, AddCourier, CourierRename, ReadNow } from '@/components/admin/fulfil/Act';
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

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function CouriersPage({ searchParams }: { searchParams: Search }) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([adminView(deps), pageAccess('delivery.read', deps, MOTHER_STORE_ID), searchParams]);
  const showArchived = sp.archived === '1';
  const view = withFulfil(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(showArchived ? `${HERE}?archived=1` : HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current="couriers" text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="delivery.read" />
      </div>
    );
  const who: sh.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const sd = await shippingDeps(access.deps);
  const [all, zones] = await Promise.all([sh.listCouriers(sd, who, { includeArchived: true }), sh.zoneSummaries(sd, who)]);
  const archived = all.couriers.filter((c) => c.archived);
  const list = { ...all, couriers: all.couriers.filter((c) => !c.archived) };
  const byId = new Map(zones.map((z) => [z.courierAccountId, z]));
  const can = access.guard.permissions?.has('delivery.couriers') ?? false;
  const fd: Dict = { ful: d.ful as Dict };
  const n = (x: number) => formatNumber(x, view.locale);
  const when = new Intl.DateTimeFormat(view.locale, { timeZone: view.timeZone, dateStyle: 'medium', timeStyle: 'short' });
  const provider = (p: string) => t(d, `courier.providers.${p}`);

  if (showArchived)
    return (
      <div className="a2-z" data-testid="couriers" data-lm-ready="" data-view="archived">
        <PageHead view={view} place={locateKey('couriers')} title={t(d, 'ful.couriers.archivedTitle')} sub={t(d, 'ful.couriers.archivedSub')} />
        <SectionTabs view={view} current="couriers" />
        <div className="a2-cmds a2-mt12">
          <Link className="a2-btn sm ghost" href={HERE} data-testid="couriers-in-use">
            <ShellIcon name="cl" size={14} />
            {t(d, 'ful.couriers.showInUse')}
          </Link>
        </div>
        {archived.length ? (
          <div className="a2-stack a2-mt12" data-testid="courier-archived-list">
            {archived.map((c) => (
              <section key={c.id} className="a2-card tight" data-testid="courier-archived-row" data-provider={c.providerKey}>
                <div className="a2-between">
                  <div style={{ minWidth: 0 }}>
                    <h2 className="a2-h3" style={{ overflowWrap: 'anywhere' }}>{c.name}</h2>
                    <div className="a2-gap8 a2-mt6">
                      <span className="a2-pill line">{provider(c.providerKey)}</span>
                      <span className="a2-pill">{t(d, 'ful.couriers.archivedPill')}</span>
                      {c.archivedAt ? <span className="a2-xs a2-mute">{t(d, 'ful.couriers.archivedOn', { at: when.format(c.archivedAt) })}</span> : null}
                    </div>
                  </div>
                  <div className="a2-cmds">
                    <Link className="a2-btn sm" href={`${HERE}/${c.id}`}>
                      {t(d, 'ful.couriers.open')}
                      <ShellIcon name="cr" size={14} />
                    </Link>
                    {can ? <CourierRename dict={fd} courierId={c.id} name={c.name} /> : null}
                    {can ? <Act dict={fd} url={`/api/admin/delivery/couriers/${c.id}`} body={{ archived: false }} label={t(d, 'ful.couriers.bringBack')} tone="ghost" method="PATCH" testId="courier-bring-back" doneText={t(d, 'ful.couriers.broughtBack')} /> : null}
                  </div>
                </div>
              </section>
            ))}
          </div>
        ) : (
          <section className="a2-card a2-mt12" data-testid="couriers-archived-empty">
            <p className="a2-sm a2-mute">{t(d, 'ful.couriers.archivedEmpty')}</p>
          </section>
        )}
      </div>
    );

  return (
    <div className="a2-z" data-testid="couriers" data-lm-ready="">
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
                  <div style={{ minWidth: 0 }}>
                    <h2 className="a2-h3" style={{ overflowWrap: 'anywhere' }}>{c.name}</h2>
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
                    {can ? <CourierRename dict={fd} courierId={c.id} name={c.name} /> : null}
                    {can ? <Act dict={fd} url={`/api/admin/delivery/couriers/${c.id}`} body={{ archived: true }} label={t(d, 'ful.couriers.archive')} ask={t(d, 'ful.couriers.archiveAsk', { name: c.name })} tone="ghost" method="PATCH" testId="courier-archive" doneText={t(d, 'ful.couriers.archivedDone')} /> : null}
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
      {archived.length ? (
        <div className="a2-cmds a2-mt12">
          <Link className="a2-btn sm ghost" href={`${HERE}?archived=1`} data-testid="couriers-archived">
            {t(d, 'ful.couriers.showArchived', { n: n(archived.length) })}
            <ShellIcon name="cr" size={14} />
          </Link>
        </div>
      ) : null}
    </div>
  );
}
