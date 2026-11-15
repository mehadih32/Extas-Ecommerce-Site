// S13 · PR 589 (register "Merchant Center feed + Bangladesh test") — Marketing › Merchant feed at
// /admin/marketing/merchant-feed, drawn in Lumen (CN-036: the shared patterns, --lm-* tokens only, data-lm-ready): the
// feed's address on the shop's own domain, how many products are in it and why others are left out, the first products,
// the card `ads.merchantFeed` (off as shipped) and the Bangladesh test's steps. No key, nothing sent, no ad spend.
// Seeing needs `marketing.campaigns.read`; the card `marketing.campaigns.write`.
// PR 589 follow-up: the card chooses one item per product or per size and colour (`variants`); the tiles then count the
// items too, and the first products show how many items each makes.
// PR 589 follow-up 707: the card also chooses whether the struck price goes in (only where the product page shows one)
// and the shop's gender and age group for clothes (empty = not sent).
// Guide: docs/admin-guide/pages/marketing/merchant-feed.md.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { SettingCards } from '@/components/admin/lumen/SettingCards';
import { SummaryTiles, type SummaryTile } from '@/components/admin/lumen/SummaryTiles';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { FeedAction, FeedSwitch, UpdateFeedButton, type FeedTexts } from '@/components/admin/lane-f/FeedActions';
import { withLaneF6 } from '@/lib/admin-lane-f6';
import { feedProducts, feedScreen } from '@/lib/marketing/merchant-feed';
import { feedCounts, feedProblems, needBarcode } from '@/lib/marketing/shopping-feed-model';
import { FEED_AGE_GROUPS, FEED_GENDERS, FEED_REASONS } from '@/lib/marketing/merchant-feed-model';
import { siteAddress } from '@/lib/seo/site';
import bn from '../../../../../messages/admin-merchant-feed.bn.json';
import en from '../../../../../messages/admin-merchant-feed.en.json';
import './merchant-feed.css';
import '../../../../components/admin/lane-f/lane-f6.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/marketing/merchant-feed';
const KEY = 'marketingMerchantFeed';

function withScreen(view: AdminView): AdminView {
  return withLaneF6({ ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } });
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'lf6.sf.meta'), robots: { index: false, follow: false } };
}

export default async function MerchantFeedPage({ searchParams }: { searchParams?: Promise<{ problem?: string }> }) {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('marketing.campaigns.read', deps, MOTHER_STORE_ID)]);
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
  const l = (k: string, vars?: Record<string, string | number>) => t(d, `mf.${k}`, vars);
  const canWrite = access.guard.permissions?.has('marketing.campaigns.write') ?? false;
  const site = await siteAddress(MOTHER_STORE_ID);
  const r = await feedScreen(access.deps.db, access.deps.resolver, site.onPrimary ? (site.origin ?? null) : null);
  const set = r.card.value;
  const num = (n: number) => new Intl.NumberFormat(view.locale, { numberingSystem: 'latn' }).format(n);
  const fmt = { kind: 'number', locale: view.locale } as const;
  const out = r.total - r.inFeed;
  const tiles: SummaryTile[] = [
    { key: 'in', label: l('tIn'), value: r.inFeed, shown: num(r.inFeed), format: fmt, icon: 'check' },
    { key: 'total', label: l('tTotal'), value: r.total, shown: num(r.total), format: fmt, icon: 'box' },
    { key: 'out', label: l('tOut'), value: out, shown: num(out), format: fmt, icon: 'alert' },
    ...(set.variants ? [{ key: 'items', label: l('tItems'), value: r.items, shown: num(r.items), format: fmt, icon: 'layers' } satisfies SummaryTile] : []),
  ];
  const reasons = FEED_REASONS.filter((k) => r.left[k] > 0);

  // PR 866 (prototype v5 Shopping feed): the counts and problems of the feed's own live products
  const f = (k: string, vars?: Record<string, string | number>) => t(d, `lf6.sf.${k}`, vars);
  const shopOrigin = site.onPrimary ? (site.origin ?? null) : null;
  const [{ products }, metaSwitch, shopName] = await Promise.all([
    feedProducts(access.deps.db, access.deps.resolver, shopOrigin ?? 'https://shop.invalid'),
    access.deps.resolver.value('marketing.metaFeed', { storeId: MOTHER_STORE_ID }),
    access.deps.resolver.value('store.name', { storeId: MOTHER_STORE_ID }),
  ]);
  const problems = feedProblems(products);
  const counts = feedCounts(products, problems);
  const barcode = needBarcode(products);
  const only = (await searchParams)?.problem ?? 'all';
  const filter = (['desc', 'photo', 'stock'] as const).includes(only as 'desc') ? only : 'all';
  const listed = problems.filter((x) => filter === 'all' || x.kind === filter);
  const nOf = (k: string) => problems.filter((x) => x.kind === k).length;
  const SHOWN = 40; // hardcode-ok: the prototype lists forty rows and says how many more
  const shop = typeof shopName === 'string' && shopName.trim() ? shopName.trim() : '';
  const ft: FeedTexts = Object.fromEntries(['updated', 'ownDone', 'filled', 'googleOn', 'googleOff', 'fbOn', 'fbOff', 'err'].map((k) => [k, f(`t.${k}`)])) as unknown as FeedTexts;

  return (
    <div className="a2-z mf-page" data-testid="merchant-feed" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={f('title')} sub={f('sub')} right={<UpdateFeedButton label={f('update')} products={counts.live} texts={ft} />} />
      <SectionTabs view={view} current={KEY} />
      <div className="a2-kpis" data-testid="sf-kpis">
        {(
          [
            [f('kIn'), num(counts.live), f('kInSub')],
            [f('kOk'), num(counts.approved), new Intl.NumberFormat(view.locale, { style: 'percent', maximumFractionDigits: 0, numberingSystem: 'latn' }).format(counts.live ? counts.approved / counts.live : 0)],
            [f('kBad'), num(counts.rejected), f('kBadSub')],
            [f('kUp'), f('kUpVal'), f('kUpSub')],
          ] as const
        ).map(([label, value, sub]) => (
          <div key={label} className="a2-card">
            <div className="a2-xs a2-mute">{label}</div>
            <div className="a2-h2">{value}</div>
            <div className="a2-xs a2-mute">{sub}</div>
          </div>
        ))}
      </div>
      <div className="lf6-g2 lf6-grid2 lf6-cols">
        <section className="a2-card" data-testid="sf-goes">
          <h2 className="a2-h3">{f('goes')}</h2>
          <FeedSwitch which="google" on={set.on} label={f('google')} onLabel={f('sending')} offLabel={f('stopped')} canWrite={canWrite} texts={ft} before={set.on} />
          <FeedSwitch which="fb" on={metaSwitch.on} label={f('fb')} onLabel={f('sending')} offLabel={f('stopped')} canWrite={canWrite} texts={ft} before={metaSwitch.on} />
        </section>
        <section className="a2-card" data-testid="sf-gtin">
          <h2 className="a2-h3">{f('gtin')}</h2>
          {barcode > 0 ? (
            <>
              <p className="a2-note" role="note">
                {f('gtinWarn', { n: num(barcode), shop })}
              </p>
              {canWrite ? (
                <div className="lf6-btns a2-mt12">
                  <FeedAction action="ownBrand" label={f('own')} texts={ft} doneKey="ownDone" testId="sf-own" />
                </div>
              ) : null}
            </>
          ) : (
            <p className="a2-note ok" role="note">
              {f('gtinOk', { shop })}
            </p>
          )}
        </section>
      </div>
      <section className="a2-card" data-testid="sf-problems">
        <div className="lf6-btns" style={{ justifyContent: 'space-between' }}>
          <h2 className="a2-h3">{f('problems')}</h2>
          {nOf('desc') && canWrite ? <FeedAction action="fillDescriptions" label={f('fill', { n: num(nOf('desc')) })} texts={ft} doneKey="filled" testId="sf-fill" /> : null}
        </div>
        <div className="a2-views" role="group" aria-label={f('problems')}>
          {(
            [
              ['all', f('fAll'), problems.length],
              ['desc', f('fDesc'), nOf('desc')],
              ['photo', f('fPhoto'), nOf('photo')],
              ['stock', f('fStock'), nOf('stock')],
            ] as const
          ).map(([k, label, n]) => (
            <Link key={k} className={`a2-view${filter === k ? ' on' : ''}`} href={k === 'all' ? HERE : `${HERE}?problem=${k}`} aria-current={filter === k ? 'true' : undefined}>
              {label}
              <span className="a2-cnt">{num(n)}</span>
            </Link>
          ))}
        </div>
        {listed.length ? (
          <div className="mf-table-w">
            <table className="mf-table">
              <thead>
                <tr>
                  <th scope="col">{f('colProduct')}</th>
                  <th scope="col">{f('colProblem')}</th>
                  <th scope="col">
                    <span className="a2-sr">{f('fix')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {listed.slice(0, SHOWN).map((x) => (
                  <tr key={`${x.productId}-${x.key}`} data-testid="sf-problem">
                    <th scope="row">{x.title}</th>
                    <td>
                      <span className={`mf-pill ${x.severity === 'bad' ? 'warn' : 'ok'}`}>{f(x.severity)}</span> <span className="a2-sm">{f(`problem.${x.key}`, { n: x.n })}</span>
                    </td>
                    <td>
                      <Link className="a2-btn sm" href={`/admin/products/${x.productId}`}>
                        {f('fix')} →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="a2-sm a2-mute a2-mt12">{f('none')}</p>
        )}
        {listed.length - SHOWN > 0 ? <p className="a2-xs a2-mute a2-mt6">{f('showing', { n: SHOWN, total: listed.length })}</p> : null}
      </section>
      <details className="a2-card" data-testid="sf-more">
        <summary className="a2-h4">{f('more')}</summary>
        <div className="a2-stack a2-mt12" style={{ gap: 16 }}>
      {set.on ? null : (
        <p className="lm-card mf-off" role="note" data-testid="mf-off">
          {l('off')}
        </p>
      )}
      <SummaryTiles tiles={tiles} label={l('tiles')} testId="mf-tiles" />
      <div className="mf-grid">
        <div className="mf-stack">
          <section className="lm-card" aria-labelledby="mf-a-h" data-testid="mf-address">
            <h2 className="lm-h2" id="mf-a-h">
              {l('address')}
            </h2>
            {r.url ? <p className="mf-line">{r.url}</p> : <p className="mf-span">{l('noAddress')}</p>}
            <p className="mf-span">{l('addressSub')}</p>
            <p className="mf-span">{l('country', { c: set.country })}</p>
          </section>
          <section className="lm-card" aria-labelledby="mf-l-h" data-testid="mf-left">
            <h2 className="lm-h2" id="mf-l-h">
              {l('left')}
            </h2>
            {reasons.length ? (
              <ul className="mf-list">
                {reasons.map((k) => (
                  <li key={k}>{l(`r_${k}`, { n: num(r.left[k]) })}</li>
                ))}
              </ul>
            ) : (
              <p className="mf-span">{l('leftNone')}</p>
            )}
          </section>
          <section className="lm-card" aria-labelledby="mf-s-h" data-testid="mf-sample">
            <h2 className="lm-h2" id="mf-s-h">
              {l('sample')}
            </h2>
            <p className="mf-span">{l('sampleSub')}</p>
            {r.sample.length ? (
              <div className="mf-table-w">
                <table className="mf-table">
                  <thead>
                    <tr>
                      <th scope="col">{l('colProduct')}</th>
                      <th scope="col">{l('colPrice')}</th>
                      {set.variants ? <th scope="col">{l('colItems')}</th> : null}
                      <th scope="col">{l('colStock')}</th>
                      <th scope="col">{l('colState')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.sample.map((x) => (
                      <tr key={x.id}>
                        <th scope="row">{x.title}</th>
                        <td>{x.price ?? '—'}</td>
                        {set.variants ? <td>{num(x.items)}</td> : null}
                        <td>{l(x.availability)}</td>
                        <td>{x.reasons.length ? <span className="mf-pill warn">{x.reasons.map((k) => l(`s_${k}`)).join(' · ')}</span> : <span className="mf-pill ok">{l('yes')}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mf-span">{l('empty')}</p>
            )}
          </section>
        </div>
        <div className="mf-stack">
          {canWrite ? (
            <SettingCards
              save={{ method: 'PUT', url: '/api/admin/marketing/merchant-feed' }}
              cards={[
                {
                  key: r.card.key,
                  title: l('card'),
                  text: l('cardText'),
                  on: set.on,
                  fields: [
                    { name: 'maxItems', label: l('maxItems'), kind: 'number', value: set.maxItems, min: 1, max: 100_000, step: 100, unit: l('unitItems') },
                    {
                      name: 'outOfStock',
                      label: l('outOfStock'),
                      kind: 'select',
                      value: set.outOfStock ? 'on' : 'off',
                      options: [
                        { value: 'on', label: l('keep') },
                        { value: 'off', label: l('drop') },
                      ],
                    },
                    {
                      name: 'variants',
                      label: l('variants'),
                      kind: 'select',
                      value: set.variants ? 'on' : 'off',
                      options: [
                        { value: 'off', label: l('perProduct') },
                        { value: 'on', label: l('perVariant') },
                      ],
                    },
                    {
                      name: 'salePrice',
                      label: l('salePrice'),
                      kind: 'select',
                      value: set.salePrice ? 'on' : 'off',
                      options: [
                        { value: 'off', label: l('salePriceOff') },
                        { value: 'on', label: l('salePriceOn') },
                      ],
                      hint: l('salePriceHint'),
                    },
                    {
                      name: 'gender',
                      label: l('gender'),
                      kind: 'select',
                      value: set.gender,
                      options: [{ value: '', label: l('notSent') }, ...FEED_GENDERS.map((g) => ({ value: g, label: l(`g_${g}`) }))],
                    },
                    {
                      name: 'ageGroup',
                      label: l('ageGroup'),
                      kind: 'select',
                      value: set.ageGroup,
                      options: [{ value: '', label: l('notSent') }, ...FEED_AGE_GROUPS.map((g) => ({ value: g, label: l(`a_${g}`) }))],
                    },
                  ],
                },
              ]}
              testId="mf-card"
            />
          ) : (
            <p className="lm-card mf-ro" data-testid="mf-readonly">
              {l('readOnly')}
            </p>
          )}
          <section className="lm-card" aria-labelledby="mf-how-h">
            <h2 className="lm-h2" id="mf-how-h">
              {l('how')}
            </h2>
            <ol className="mf-how">
              {['how1', 'how2', 'how3', 'how4'].map((k) => (
                <li key={k}>{l(k)}</li>
              ))}
            </ol>
          </section>
        </div>
      </div>
        </div>
      </details>
    </div>
  );
}
