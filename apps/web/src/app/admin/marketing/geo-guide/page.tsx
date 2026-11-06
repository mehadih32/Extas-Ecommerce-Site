// S13 · PR 569 (register "Geography-led ad guidance") — Marketing › Where to advertise at /admin/marketing/geo-guide,
// drawn in Lumen (CN-036: the shared patterns, --lm-* tokens only, data-lm-ready): for the last `ads.geoGuide.days` shop
// days, the whole shop or one category, each district's delivered and returned orders, its return rate and (with
// `books.read`) its Sales; with the card on, each district's word and the "more" / "less" lists to copy into an ad
// platform by hand. Advice only: nothing here changes a budget, a campaign or a target. Seeing needs
// `marketing.campaigns.read`; the card `marketing.campaigns.write`. Guide: docs/admin-guide/pages/marketing/geo-guide.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { SettingCards } from '@/components/admin/lumen/SettingCards';
import { SummaryTiles, type SummaryTile } from '@/components/admin/lumen/SummaryTiles';
import { formatMoney, moneyOf } from '@/components/admin/products/model';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { GEO_WORDS } from '@/lib/marketing/geo-guide-model';
import { geoGuideScreen } from '@/lib/marketing/geo-guide';
import bn from '../../../../../messages/admin-geo-guide.bn.json';
import en from '../../../../../messages/admin-geo-guide.en.json';
import './geo-guide.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/marketing/geo-guide';
const KEY = 'marketingGeoGuide';
const PILL = { more: 'ok', hold: '', less: 'warn', few: '' } as const;

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'gg.meta'), robots: { index: false, follow: false } };
}

export default async function GeoGuidePage(props: { searchParams: Promise<{ category?: string | string[] }> }) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([adminView(deps), pageAccess('marketing.campaigns.read', deps, MOTHER_STORE_ID), props.searchParams]);
  const view = withScreen(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="marketing.campaigns.read" />
      </div>
    );
  const l = (k: string, vars?: Record<string, string | number>) => t(d, `gg.${k}`, vars);
  const canWrite = access.guard.permissions?.has('marketing.campaigns.write') ?? false;
  const money = access.guard.permissions?.has('books.read') ?? false;
  const asked = typeof sp.category === 'string' ? sp.category : null;
  const [r, currency] = await Promise.all([geoGuideScreen(access.deps.db, access.deps.resolver, new Date(), { categoryId: asked, money }), access.deps.resolver.value('store.currency', { storeId: MOTHER_STORE_ID })]);
  const set = r.card.value;
  const bnNames = view.lang === 'bn';
  const num = (n: number) => new Intl.NumberFormat(view.locale, { numberingSystem: 'latn' }).format(n);
  const m = (minor: number) => formatMoney(minor, moneyOf(currency, view.locale));
  const dayText = (ymd: string) => new Intl.DateTimeFormat(view.locale, { day: 'numeric', month: 'short', timeZone: 'UTC', numberingSystem: 'latn' }).format(new Date(`${ymd}T00:00:00Z`));
  const fmt = { kind: 'number', locale: view.locale } as const;
  const icons = { more: 'trend', hold: 'check', less: 'alert', few: 'info' } as const;
  const tiles: SummaryTile[] = GEO_WORDS.map((w) => ({ key: w, label: l(`w_${w}`), value: r.counts[w], shown: set.on ? num(r.counts[w]) : '—', format: fmt, icon: icons[w] }));
  const name = (c: { nameEn: string; nameBn: string | null }) => (bnNames ? (c.nameBn ?? c.nameEn) : c.nameEn);

  return (
    <div className="a2-z gg-page" data-testid="geo-guide" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={l('title')} sub={l('sub')} />
      <SectionTabs view={view} current={KEY} />
      {set.on ? null : (
        <p className="lm-card gg-off" role="note" data-testid="gg-off">
          {l('off')}
        </p>
      )}
      <p className="gg-span">{l('range', { from: dayText(r.from), to: dayText(r.to), n: num(set.days), tz: r.timeZone })}</p>
      <nav className="gg-nav" aria-label={l('cat')} data-testid="gg-cats">
        {[{ id: null, label: l('allCats') }, ...r.categories.map((c) => ({ id: c.id, label: name(c) }))].map((c) => (
          <Link key={c.id ?? 'all'} className={`lm-btn${c.id === r.categoryId ? ' pri' : ''}`} href={c.id ? `${HERE}?category=${c.id}` : HERE} aria-current={c.id === r.categoryId ? 'page' : undefined}>
            {c.label}
          </Link>
        ))}
      </nav>
      <SummaryTiles tiles={tiles} label={l('tiles')} testId="gg-tiles" />
      <div className="gg-grid">
        <div className="gg-stack">
          <section className="lm-card" aria-labelledby="gg-t-h" data-testid="gg-table">
            <h2 className="lm-h2" id="gg-t-h">
              {l('table')}
            </h2>
            <p className="gg-span">{l('tableSub')}</p>
            {money ? null : <p className="gg-span">{l('noMoney')}</p>}
            {r.rows.length ? (
              <div className="gg-table-w">
                <table className="gg-table">
                  <thead>
                    <tr>
                      <th scope="col">{l('colDistrict')}</th>
                      {set.on ? <th scope="col">{l('colWord')}</th> : null}
                      <th scope="col">{l('colDelivered')}</th>
                      <th scope="col">{l('colReturned')}</th>
                      <th scope="col">{l('colRate')}</th>
                      {money ? <th scope="col">{l('colSales')}</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {r.rows.map((x) => (
                      <tr key={x.areaId} data-word={x.word ?? ''}>
                        <th scope="row">{name(x)}</th>
                        {set.on && x.word ? (
                          <td className="gg-word">
                            <span className={`gg-pill ${PILL[x.word]}`} title={l(`wh_${x.word}`)}>
                              {l(`w_${x.word}`)}
                            </span>
                          </td>
                        ) : null}
                        <td>{num(x.delivered)}</td>
                        <td>{num(x.returned)}</td>
                        <td>{x.returnPct === null ? '—' : `${num(x.returnPct)}%`}</td>
                        {money ? <td>{x.salesMinor === null ? '—' : m(x.salesMinor)}</td> : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="gg-span" data-testid="gg-empty">
                {l('empty')}
              </p>
            )}
            {r.unknown.delivered + r.unknown.returned ? <p className="gg-span">{l('unknown', { n: num(r.unknown.delivered + r.unknown.returned) })}</p> : null}
          </section>
          {set.on ? (
            <section className="lm-card" aria-labelledby="gg-c-h" data-testid="gg-copy">
              <h2 className="lm-h2" id="gg-c-h">
                {l('copy')}
              </h2>
              <p className="gg-span">{l('copySub')}</p>
              {(['more', 'less'] as const).map((w) => (
                <div key={w} className="gg-copy">
                  <h3 className="gg-h3">{l(w === 'more' ? 'copyMore' : 'copyLess')}</h3>
                  {r.copy[w].en ? (
                    <>
                      <p className="gg-line" data-testid={`gg-copy-${w}`}>
                        <span className="gg-lbl">{l('en')}</span> {r.copy[w].en}
                      </p>
                      <p className="gg-line">
                        <span className="gg-lbl">{l('bn')}</span> {r.copy[w].bn}
                      </p>
                    </>
                  ) : (
                    <p className="gg-span">{l('copyEmpty')}</p>
                  )}
                </div>
              ))}
            </section>
          ) : null}
        </div>
        <div className="gg-stack">
          {canWrite ? (
            <SettingCards
              save={{ method: 'PUT', url: '/api/admin/marketing/geo-guide' }}
              cards={[
                {
                  key: r.card.key,
                  title: l('card'),
                  text: l('cardText'),
                  on: set.on,
                  fields: [
                    { name: 'days', label: l('days'), kind: 'number', value: set.days, min: 7, max: 365, step: 1, unit: l('unitDays') },
                    { name: 'minOrders', label: l('minOrders'), kind: 'number', value: set.minOrders, min: 1, max: 1000, step: 1, unit: l('unitOrders') },
                    { name: 'goodReturnPct', label: l('goodReturnPct'), kind: 'number', value: set.goodReturnPct, min: 0, max: 100, step: 1, unit: l('unitPct') },
                    { name: 'badReturnPct', label: l('badReturnPct'), kind: 'number', value: set.badReturnPct, min: 0, max: 100, step: 1, unit: l('unitPct') },
                  ],
                },
              ]}
              testId="gg-card"
            />
          ) : (
            <p className="lm-card gg-ro" data-testid="gg-readonly">
              {l('readOnly')}
            </p>
          )}
          <section className="lm-card" aria-labelledby="gg-how-h">
            <h2 className="lm-h2" id="gg-how-h">
              {l('how')}
            </h2>
            <ol className="gg-how">
              {['how1', 'how2', 'how3', 'how4'].map((k) => (
                <li key={k}>{l(k)}</li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
