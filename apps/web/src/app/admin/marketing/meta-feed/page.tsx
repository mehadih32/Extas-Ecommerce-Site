// S28 · PR 696 (CN-048; prototype v5 Marketing › Tools › Shopping feed; gap M12) — Marketing › Meta feed at
// /admin/marketing/meta-feed: the address of the Facebook and Instagram catalogue feed (/feeds/meta.xml), how many products
// and items go in, and an issue list per product (left out, or something Meta would flag). It uses the Google feed's
// products, photos and prices and follows its choices. Off as shipped; the switch is under "More options"
// (`marketing.campaigns.write`). Seeing needs `marketing.campaigns.read`. Advice only: nothing is sent or changed here.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { V5Switch } from '@/components/admin/v5/Parts';
import { PageHead, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { withW5a } from '@/lib/admin-v5-w5a';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { feedProducts } from '@/lib/marketing/merchant-feed';
import { feedItems } from '@/lib/marketing/merchant-feed-model';
import { metaIssues } from '@/lib/marketing/meta-feed-model';
import { siteAddress } from '@/lib/seo/site';
import { locateKey } from '@/lib/admin-shell/sections';
import { t } from '@/lib/i18n';
import '../../reports/delivery/report.css';

export const dynamic = 'force-dynamic';

const KEY = 'marketingMetaFeed';
const HERE = '/admin/marketing/meta-feed';
const SHOWN = 100; // hardcode-ok: a list length, not a business number

export async function generateMetadata(): Promise<Metadata> {
  const view = withW5a(await adminView());
  return { title: `${t(view.dict, 'w5a.meta.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function MetaFeedPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('marketing.campaigns.read', deps, MOTHER_STORE_ID)]);
  const view = withW5a(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z" data-testid="meta-feed" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="marketing.campaigns.read" />
      </div>
    );
  const c = (k: string, v?: Record<string, string | number>) => t(d, `w5a.meta.${k}`, v);
  const sw = await access.deps.resolver.value('marketing.metaFeed', { storeId: MOTHER_STORE_ID });
  const canWrite = access.guard.permissions?.has('marketing.campaigns.write') ?? false;
  const site = await siteAddress(MOTHER_STORE_ID).catch(() => null);
  const origin = site?.origin ?? null;
  const { set, currency, products } = await feedProducts(access.deps.db, access.deps.resolver, origin ?? 'https://shop.invalid', MOTHER_STORE_ID);
  const { items, left } = feedItems(products, currency, set.outOfStock, set.variants, { gender: set.gender, ageGroup: set.ageGroup });
  const issues = metaIssues(products, set.outOfStock);
  const leftTotal = Object.values(left).reduce((a, b) => a + b, 0);
  const inFeed = new Set(items.map((i) => i.groupId ?? i.id)).size;
  const n = (x: number) => new Intl.NumberFormat(view.locale, { numberingSystem: 'latn' }).format(x);
  const address = origin ? new URL('/feeds/meta.xml', origin).toString() : null;

  return (
    <div className="a2-z" data-testid="meta-feed" data-lm-ready="" data-on={sw.on ? 'yes' : 'no'}>
      <PageHead view={view} place={locateKey(KEY)} title={c('title')} sub={c('sub')} right={<Link className="a2-btn sm" href="/admin/marketing/merchant-feed">{c('back')}</Link>} />
      {!sw.on ? <div className="a2-note a2-mt12">{c('off')}</div> : null}
      <section className="a2-card a2-mt12" data-testid="meta-address">
        <div className="a2-xs a2-mute">{c('address')}</div>
        <div className="a2-sm a2-mono a2-mt6" style={{ overflowWrap: 'anywhere' }}>
          {address ?? c('noAddress')}
        </div>
      </section>
      <div className="a2-kpis a2-mt12">
        {(
          [
            ['kProducts', products.length],
            ['kIn', inFeed],
            ['kItems', items.length],
            ['kLeft', leftTotal],
            ['kIssues', issues.length],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="a2-card">
            <div className="a2-xs a2-mute">{c(k)}</div>
            <div className="a2-h2">{n(v)}</div>
          </div>
        ))}
      </div>
      <section className="a2-card a2-mt12" data-testid="meta-issues">
        <h2 className="a2-h3" style={{ marginBottom: 10 }}>
          {c('issueList')}
        </h2>
        {issues.length ? (
          <ul className="cr-rows" style={{ marginTop: 0 }}>
            {issues.slice(0, SHOWN).map((x) => (
              <li key={x.id} data-testid="meta-issue-row">
                <div>
                  <b>{x.title}</b>
                  <div className="a2-xs a2-mt6">
                    {x.left.map((r) => (
                      <span key={r} className="a2-pill bad" style={{ marginRight: 6 }}>
                        {c(`r_${r}`)}
                      </span>
                    ))}
                    {x.issues.map((r) => (
                      <span key={r} className="a2-pill warn" style={{ marginRight: 6 }}>
                        {c(`i_${r}`)}
                      </span>
                    ))}
                  </div>
                </div>
                <Link className="cr-link" href={`/admin/products/${x.id}`}>
                  {c('colProduct')}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="a2-sm a2-mute">{c('noneIssues')}</p>
        )}
        {issues.length > SHOWN ? <p className="a2-xs a2-mute a2-mt6">{c('shown', { n: SHOWN })}</p> : null}
      </section>
      <p className="a2-xs a2-mute a2-mt6">{c('note')}</p>
      {canWrite ? (
        <details className="a2-card a2-mt12" data-testid="meta-more">
          <summary className="a2-h4">{t(d, 'w5a.more')}</summary>
          <div className="a2-stack a2-mt12" style={{ gap: 12 }}>
            <V5Switch dict={d} url="/api/admin/marketing/meta-feed/settings" before={sw} field="on" label={sw.on ? c('switchOff') : c('switchOn')} tone={sw.on ? '' : 'pri'} testId="meta-switch" />
          </div>
        </details>
      ) : null}
    </div>
  );
}
