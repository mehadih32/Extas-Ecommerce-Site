// S08 · PR 554 — one courier's page under Delivery → Couriers (DLV-05 "Sync zones"): its last reading of the courier's
// own area list, and four tabs — the areas parcels are waiting for (a booking to an area the courier does not know is
// held, never sent to fail), the shop's areas not paired yet (with the courier places of the same name as one-press
// candidates, or any place found by name), the pairs (by name or by a person; a person can take one away), and the
// pairs whose place the courier dropped (archived, never deleted; they come back when the courier lists the place
// again). Seeing needs `delivery.read`; pairing and reading need `delivery.couriers` (the API checks again).
// S08 · PR 192 — under the areas: the courier's performance by zone (30 days) and its claims (CourierCards).
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as pay from '@extas/payments';
import * as sh from '@extas/shipping';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { CourierCards } from '@/components/admin/courier-report/CourierCards';
import { Act, PlacePicker, ReadNow } from '@/components/admin/fulfil/Act';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { formatNumber } from '@/components/admin/products/model';
import { adminDeps } from '@/lib/admin-auth';
import { withCourierReport } from '@/lib/admin-courier-report';
import { withFulfil } from '@/lib/admin-fulfil/i18n';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { paymentsDeps } from '@/lib/payments-api';
import { shippingDeps } from '@/lib/shipping-api';

export const dynamic = 'force-dynamic';

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
/** How many of the courier's claims the page lists (newest first). */
const CLAIM_ROWS = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata(): Promise<Metadata> {
  const view = withFulfil(await adminView());
  return { title: `${t(view.dict, 'ful.couriers.title')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function CourierPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Search }) {
  const deps = adminDeps();
  const [{ id }, sp, plain, access] = await Promise.all([params, searchParams, adminView(deps), pageAccess('delivery.read', deps, MOTHER_STORE_ID)]);
  const view = withCourierReport(withFulfil(plain));
  const d = view.dict;
  const here = `/admin/delivery/couriers/${id}`;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(here)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current="courier" text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="delivery.read" />
      </div>
    );
  if (!UUID.test(id)) notFound();
  const who: sh.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const sd = await shippingDeps(access.deps);
  const wantTab = one(sp.tab);
  const tab = (sh.ZONE_TABS as readonly string[]).includes(wantTab ?? '') ? (wantTab as sh.ZoneTab) : 'needed';
  const q = (one(sp.q) ?? '').trim().slice(0, 80);
  const page = Math.max(1, Math.min(10_000, Number(one(sp.page)) || 1));
  let z: sh.CourierZonesView;
  try {
    z = await sh.courierZones(sd, who, id, { tab, page, ...(q ? { q } : {}) });
  } catch (e) {
    if (sh.isShippingError(e) && e.code === 'NOT_FOUND') notFound();
    throw e;
  }
  const can = access.guard.permissions?.has('delivery.couriers') ?? false;
  const at = { storeId: MOTHER_STORE_ID };
  const [claims, claimsSwitch, currency] = await Promise.all([
    pay.listClaims(await paymentsDeps(access.deps), who, { courierAccountId: id, limit: CLAIM_ROWS }),
    access.deps.resolver.value('delivery.courier.claims', at),
    access.deps.resolver.value('store.currency', at),
  ]);
  const canClaim = { claim: access.guard.permissions?.has('delivery.claims') ?? false, settings: access.guard.permissions?.has('settings.write') ?? false };
  const fd: Dict = { ful: d.ful as Dict };
  const n = (x: number) => formatNumber(x, view.locale);
  const when = new Intl.DateTimeFormat(view.locale, { timeZone: view.timeZone, dateStyle: 'medium', timeStyle: 'short' });
  const href = (o: { tab?: string; q?: string; page?: number }) => {
    const p = new URLSearchParams();
    p.set('tab', o.tab ?? tab);
    if (o.q ?? q) p.set('q', o.q ?? q);
    if ((o.page ?? 1) > 1) p.set('page', String(o.page));
    return `${here}?${p.toString()}`;
  };
  const counts: Record<sh.ZoneTab, number> = { needed: z.counts.needed, unmapped: z.counts.unmapped, mapped: z.counts.mapped, dropped: z.counts.dropped };
  const placeText = (p: { name: string; path: string[]; level: string }) => `${[p.name, ...p.path].join(', ')} (${t(d, `ful.courier.level.${p.level}`)})`;
  const run = z.openRun ?? z.lastRun;
  const stats = run?.stats ?? null;

  return (
    <div className="a2-z" data-testid="courier">
      <PageHead
        view={view}
        place={locateKey('courier')}
        crumb={
          <Link href="/admin/delivery/couriers">
            <ShellIcon name="cl" size={12} />
            {t(d, 'ful.courier.back')}
          </Link>
        }
        title={z.courier.name}
        sub={t(d, `courier.providers.${z.courier.providerKey}`)}
        right={can && z.courier.hasList ? <ReadNow dict={fd} courierId={id} tone="pri" size="" /> : null}
      />
      <SectionTabs view={view} current="courier" />
      {!z.courier.hasList ? (
        <section className="a2-card a2-mt12">
          <p className="a2-sm a2-mute">{t(d, 'ful.courier.noListLong')}</p>
        </section>
      ) : (
        <>
          <section className="a2-card tight a2-mt12" data-testid="zone-run">
            <div className="a2-between">
              <div className="a2-sm">
                <b>{t(d, 'ful.courier.lastRun')}</b>
                {': '}
                {run ? (
                  <>
                    <span className={`a2-pill ${run.status === 'SUCCEEDED' ? 'ok' : run.status === 'FAILED' ? 'bad' : 'info'}`}>{t(d, `ful.courier.status.${run.status}`)}</span>{' '}
                    {run.finishedAt ? when.format(run.finishedAt) : run.startedAt ? when.format(run.startedAt) : ''}
                  </>
                ) : (
                  t(d, 'ful.courier.lastRunNone')
                )}
              </div>
              <div className="a2-xs a2-mute">{t(d, 'ful.couriers.zoneLine', { places: n(z.counts.places.city + z.counts.places.zone + z.counts.places.area), mapped: n(z.counts.mapped) })}</div>
            </div>
            {z.openRun ? <div className="a2-xs a2-mute a2-mt6">{t(d, 'ful.couriers.running', { calls: n(z.openRun.calls), left: n(z.openRun.left) })}</div> : null}
            {run?.status === 'FAILED' ? <div className="a2-note bad a2-mt6">{t(d, 'ful.courier.failed', { error: run.error ?? '' })}</div> : null}
            {stats && run?.status === 'SUCCEEDED' ? (
              <div className="a2-xs a2-mute a2-mt6">
                {t(d, 'ful.courier.stats', { city: n(stats.seen.city), zone: n(stats.seen.zone), area: n(stats.seen.area), paired: n(stats.autoPaired), unclear: n(stats.unclear) })}
                {stats.archivedPlaces || stats.archivedPairs || stats.restoredPairs ? ` · ${t(d, 'ful.courier.statsDropped', { places: n(stats.archivedPlaces), pairs: n(stats.archivedPairs), restored: n(stats.restoredPairs) })}` : ''}
              </div>
            ) : null}
          </section>

          <nav className="a2-views a2-mt12" aria-label={t(d, 'ful.couriers.title')}>
            {sh.ZONE_TABS.map((x) => (
              <Link key={x} className={`a2-view${x === tab ? ' on' : ''}`} href={href({ tab: x, q: '', page: 1 })} aria-current={x === tab ? 'page' : undefined}>
                {t(d, `ful.courier.tabs.${x}`)}
                <span className="a2-cnt">{n(counts[x])}</span>
              </Link>
            ))}
          </nav>
          <form className="a2-fbar" method="get" action={here} role="search">
            <input type="hidden" name="tab" value={tab} />
            <label className="a2-sr" htmlFor="zq">
              {t(d, 'ful.courier.search')}
            </label>
            <input id="zq" name="q" className="a2-inp" style={{ flex: '1 1 200px', width: 'auto' }} defaultValue={q} maxLength={80} placeholder={t(d, 'ful.courier.searchPh')} />
            <button type="submit" className="a2-btn sm">
              {t(d, 'ful.courier.searchGo')}
            </button>
            {q ? (
              <Link className="a2-btn sm ghost" href={href({ q: '', page: 1 })}>
                {t(d, 'ful.courier.clear')}
              </Link>
            ) : null}
          </form>

          {z.rows.length ? (
            <div className="a2-stack" style={{ gap: 10 }} data-testid="zone-rows">
              {z.rows.map((r) => (
                <section key={r.area.id} className="a2-card tight" data-testid="zone-row" data-area={r.area.name}>
                  <div className="a2-between">
                    <div>
                      <b>{view.lang === 'bn' && r.area.nameBn ? r.area.nameBn : r.area.name}</b>{' '}
                      <span className="a2-pill line">{t(d, `ful.courier.level.${r.area.level}`)}</span>
                      {r.area.path.length ? <span className="a2-xs a2-mute a2-blk">{r.area.path.join(' › ')}</span> : null}
                    </div>
                    {r.held ? <span className="a2-pill warn">{t(d, 'ful.courier.held', { n: n(r.held) })}</span> : null}
                  </div>
                  {tab === 'needed' || tab === 'unmapped' ? (
                    <div className="a2-mt6">
                      <div className="a2-xs a2-mute">{r.candidates.length ? t(d, 'ful.courier.candidates') : t(d, 'ful.courier.noCandidate')}</div>
                      {can ? (
                        <div className="a2-mt6">
                          <PlacePicker dict={fd} courierId={id} areaId={r.area.id}>
                            {r.candidates.map((c) => (
                              <Act key={c.id} dict={fd} url={`/api/admin/delivery/couriers/${id}/areas`} body={{ areaId: r.area.id, placeId: c.id }} label={t(d, 'ful.courier.pairWith', { place: placeText(c) })} testId="pair" />
                            ))}
                          </PlacePicker>
                        </div>
                      ) : (
                        <div className="a2-gap8 a2-mt6">
                          {r.candidates.map((c) => (
                            <span key={c.id} className="a2-pill line">
                              {placeText(c)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="a2-between a2-mt6">
                      <div className="a2-sm">
                        {r.place ? placeText(r.place) : ''}
                        {r.source && tab === 'mapped' ? <span className={`a2-pill ${r.source === 'staff' ? 'g' : 'info'}`} style={{ marginLeft: 8 }}>{t(d, `ful.courier.source.${r.source}`)}</span> : null}
                        {tab === 'dropped' ? <span className="a2-xs a2-mute a2-blk">{t(d, 'ful.courier.droppedNote', { place: r.place?.name ?? '' })}</span> : null}
                      </div>
                      {can && tab === 'mapped' ? <Act dict={fd} url={`/api/admin/delivery/couriers/${id}/areas/${r.area.id}/unmap`} label={t(d, 'ful.courier.unpair')} ask={t(d, 'ful.courier.unpairAsk')} tone="bad" testId="unpair" /> : null}
                    </div>
                  )}
                </section>
              ))}
              {z.pages > 1 ? (
                <div className="a2-between">
                  <span className="a2-xs a2-mute">{t(d, 'ful.courier.page', { page: n(z.page), pages: n(z.pages) })}</span>
                  <span className="a2-gap8">
                    {z.page > 1 ? (
                      <Link className="a2-btn sm" href={href({ page: z.page - 1 })}>
                        {t(d, 'ful.courier.prev')}
                      </Link>
                    ) : null}
                    {z.page < z.pages ? (
                      <Link className="a2-btn sm" href={href({ page: z.page + 1 })}>
                        {t(d, 'ful.courier.next')}
                      </Link>
                    ) : null}
                  </span>
                </div>
              ) : null}
            </div>
          ) : (
            <section className="a2-card" data-testid="zone-empty">
              <p className="a2-sm a2-mute">{t(d, `ful.courier.empty${tab[0]!.toUpperCase()}${tab.slice(1)}`)}</p>
            </section>
          )}
        </>
      )}
      <CourierCards
        dict={d}
        locale={view.locale}
        timeZone={view.timeZone}
        lang={view.lang === 'bn' ? 'bn' : 'en'}
        courierId={id}
        perfDeps={sd}
        who={who}
        claims={claims}
        claimsSwitch={{ ...claimsSwitch }}
        currency={currency}
        can={canClaim}
      />
    </div>
  );
}
