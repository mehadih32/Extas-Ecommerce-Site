// S13 · PR 589 (register "Merchant Center feed + Bangladesh test") — Marketing › Merchant feed at
// /admin/marketing/merchant-feed, drawn in Lumen (CN-036: the shared patterns, --lm-* tokens only, data-lm-ready): the
// feed's address on the shop's own domain, how many products are in it and why others are left out, the first products,
// the card `ads.merchantFeed` (off as shipped) and the Bangladesh test's steps. No key, nothing sent, no ad spend.
// Seeing needs `marketing.campaigns.read`; the card `marketing.campaigns.write`.
// PR 589 follow-up: the card chooses one item per product or per size and colour (`variants`); the tiles then count the
// items too, and the first products show how many items each makes.
// Guide: docs/admin-guide/pages/marketing/merchant-feed.md.
import type { Metadata } from 'next';
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
import { feedScreen } from '@/lib/marketing/merchant-feed';
import { FEED_REASONS } from '@/lib/marketing/merchant-feed-model';
import { siteAddress } from '@/lib/seo/site';
import bn from '../../../../../messages/admin-merchant-feed.bn.json';
import en from '../../../../../messages/admin-merchant-feed.en.json';
import './merchant-feed.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/marketing/merchant-feed';
const KEY = 'marketingMerchantFeed';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, ...((view.lang === 'bn' ? bn : en) as unknown as Dict) } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: t(view.dict, 'mf.meta'), robots: { index: false, follow: false } };
}

export default async function MerchantFeedPage() {
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

  return (
    <div className="a2-z mf-page" data-testid="merchant-feed" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={l('title')} sub={l('sub')} />
      <SectionTabs view={view} current={KEY} />
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
  );
}
