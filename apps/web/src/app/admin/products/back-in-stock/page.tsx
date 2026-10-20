// PR 36 — back in stock: the products people are waiting for (a sold-out, taken-off or archived product keeps its
// page and takes "tell me when it is back" requests), products that are back first. Counts need `catalogue.read`; the
// list of who asked (phone numbers, e-mails: the owner's data) needs `catalogue.interest`. The demo has no screen of
// its own for this: it follows the publish queue's cards and the product list's bulk bar.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as cat from '@extas/catalogue';
import { AdminFrame, AdminNotice, SystemTabs } from '@/components/admin/AdminFrame';
import { Icon } from '@/components/admin/Icon';
import { InterestList } from '@/components/admin/products/InterestList';
import { formatNumber, nameIn } from '@/components/admin/products/model';
import { INTEREST_HOME, interestHref } from '@/components/admin/products/tools-model';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { catalogueAccess, one, pageParam, productHref } from '@/lib/admin-products';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const KEY = 'backInStock';

export async function generateMetadata(): Promise<Metadata> {
  const view = await adminView();
  return { title: t(view.dict, 'interest.metaTitle'), robots: { index: false, follow: false } };
}

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function BackInStockPage({ searchParams }: { searchParams: Search }) {
  const deps = adminDeps();
  const [view, sp] = await Promise.all([adminView(deps), searchParams]);
  const access = await pageAccess('catalogue.read', deps, MOTHER_STORE_ID);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(INTEREST_HOME)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noAccess')} />;

  const c = catalogueAccess(access);
  const d = view.dict;
  const canSee = c.can('catalogue.interest');
  const rawProduct = one(sp.product);
  const product = canSee && rawProduct && /^[0-9a-f-]{36}$/i.test(rawProduct) ? rawProduct : undefined;
  const rawState = one(sp.state);
  const state = (cat.INTEREST_STATES as readonly string[]).includes(rawState ?? '') ? (rawState as cat.InterestState) : 'waiting';
  const page = pageParam(sp.page);

  const summary = await cat.backInStockSummary(c.deps, c.who, product ? {} : { page });
  const requests = product ? await cat.backInStockRequests(c.deps, c.who, { productId: product, state, page }) : null;
  const named = product ? await c.deps.db.product.findFirst({ where: { id: product, storeId: c.storeId }, select: { nameEn: true, nameBn: true } }) : null;
  const productName = named ? nameIn(view.lang, named) : '';
  const num = (n: number) => formatNumber(n, view.locale);
  const date = (iso: string) => new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeZone: view.timeZone, numberingSystem: 'latn' }).format(new Date(iso));
  const listed = requests ?? summary;
  const pages = Math.max(1, Math.ceil(listed.total / listed.pageSize));
  const kpis = [
    { value: summary.counts.waiting, label: 'interest.kpi.waiting', sub: t(d, 'interest.kpi.waitingSub'), tone: 'warn' },
    { value: summary.counts.products, label: 'interest.kpi.products', sub: t(d, 'interest.kpi.productsSub') },
    { value: summary.counts.told, label: 'interest.kpi.told', sub: t(d, 'interest.kpi.toldSub'), tone: 'ok' },
    { value: summary.counts.archived, label: 'interest.kpi.archived', sub: t(d, 'interest.kpi.archivedSub') },
  ];

  return (
    <AdminFrame view={view} current={KEY}>
      <div className="ad-hd pa-hd">
        <div className="pa-hd-text">
          <div className="ad-eyebrow">{t(d, 'products.eyebrow')}</div>
          <h1 className="ad-h1">{t(d, 'interest.title')}</h1>
          <p className="ad-intro">{t(d, 'interest.intro')}</p>
        </div>
      </div>
      <div className="pa-gtabs">
        <SystemTabs view={view} current={KEY} group="catalogue" />
      </div>

      <div className="pa-kpis">
        {kpis.map((k) => (
          <div key={k.label} className="pa-kpi">
            <div className={`pa-kpi-v${k.tone ? ` ${k.tone}` : ''}`}>{num(k.value)}</div>
            <div className="pa-kpi-l">{t(d, k.label)}</div>
            <div className="pa-kpi-s">{k.sub}</div>
          </div>
        ))}
      </div>
      <div className="ad-note ad-note-top">
        <Icon name="info" size={16} />
        <div>{t(d, canSee ? 'interest.sendNote' : 'interest.noContacts')}</div>
      </div>

      {product && requests ? (
        <section className="ad-card" aria-labelledby="bis-list">
          <Link className="pa-back" href={INTEREST_HOME}>
            <Icon name="back" size={14} />
            {t(d, 'interest.allProducts')}
          </Link>
          <h2 id="bis-list">{t(d, 'interest.listTitle', { name: productName })}</h2>
          <nav className="ad-tabs pa-gap" aria-label={t(d, 'interest.states.label')}>
            {cat.INTEREST_STATES.map((s) => (
              <Link key={s} className="ad-chip" href={interestHref({ product, state: s })} aria-current={state === s ? 'page' : undefined}>
                {t(d, `interest.states.${s}`)}
              </Link>
            ))}
          </nav>
          <InterestList key={`${product}-${state}-${page}`} dict={d} locale={view.locale} timeZone={view.timeZone} state={state} rows={requests.items} />
        </section>
      ) : summary.items.length ? (
        <div className="pa-queue">
          {summary.items.map((i) => (
            <article key={i.productId} className="ad-card pa-qi">
              <div className="pa-qh">
                <Link className="pa-nm" href={productHref(i.productId)}>
                  {nameIn(view.lang, i)}
                </Link>
                <span className={`pa-status ${i.backInStock ? 's-PUBLISHED' : 's-UNPUBLISHED'}`}>{t(d, `interest.state.${i.reason ?? (i.state === 'live' ? 'live' : 'none')}`)}</span>
              </div>
              <div className="ad-mini">
                <b>{t(d, 'interest.waitingN', { n: num(i.waiting) })}</b>
                {t(d, 'products.row.metaSep')}
                {t(d, 'interest.since', { date: date(i.since) })}
              </div>
              {i.backInStock ? (
                <p className="pa-back-in">
                  <Icon name="check" size={16} />
                  {t(d, 'interest.back')}
                </p>
              ) : null}
              {canSee ? (
                <div className="pa-qacts">
                  <Link className="ad-btn ad-btn-ghost ad-btn-sm" href={interestHref({ product: i.productId })}>
                    <Icon name="eye" size={16} />
                    {t(d, 'interest.see')}
                  </Link>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <div className="ad-card">
          <p className="pa-empty">{t(d, 'interest.empty')}</p>
        </div>
      )}

      {pages > 1 ? (
        <nav className="pa-pager" aria-label={t(d, 'products.pager.label')}>
          {listed.page > 1 ? (
            <Link className="ad-btn ad-btn-ghost ad-btn-sm" href={interestHref({ product, state, page: listed.page - 1 })}>
              {t(d, 'products.pager.prev')}
            </Link>
          ) : null}
          <span className="ad-mini">{t(d, 'products.pager.page', { page: num(listed.page), pages: num(pages) })}</span>
          {listed.page < pages ? (
            <Link className="ad-btn ad-btn-ghost ad-btn-sm" href={interestHref({ product, state, page: listed.page + 1 })}>
              {t(d, 'products.pager.next')}
            </Link>
          ) : null}
        </nav>
      ) : null}
    </AdminFrame>
  );
}
