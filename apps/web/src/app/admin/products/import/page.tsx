// PR 33 — import a product from a link: read a supplier's or brand's product page and make a draft from it. Needs
// `catalogue.import` (making the draft also `catalogue.write`). Says so when the page reader still runs on its mock
// (Keys & connections) and lists the latest reads. The demo has no screen of its own for this: it follows the "New
// product" page (demo #/admin/products/new).
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as cat from '@extas/catalogue';
import { AdminFrame, AdminNotice, SystemTabs } from '@/components/admin/AdminFrame';
import { Icon } from '@/components/admin/Icon';
import { LinkImport } from '@/components/admin/products/LinkImport';
import { formatNumber } from '@/components/admin/products/model';
import { IMPORT_HOME } from '@/components/admin/products/tools-model';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { catalogueAccess, pageParam, productHref } from '@/lib/admin-products';
import { pageReaderFor } from '@/lib/catalogue-tools-api';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const KEY = 'productImport';

export async function generateMetadata(): Promise<Metadata> {
  const view = await adminView();
  return { title: t(view.dict, 'linkImport.metaTitle'), robots: { index: false, follow: false } };
}

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function LinkImportPage({ searchParams }: { searchParams: Search }) {
  const deps = adminDeps();
  const [view, sp] = await Promise.all([adminView(deps), searchParams]);
  const access = await pageAccess('catalogue.import', deps, MOTHER_STORE_ID);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(IMPORT_HOME)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noAccess')} />;

  const c = catalogueAccess(access);
  const d = view.dict;
  const [screen, brands, tree, fabrics, colours] = await Promise.all([
    cat.linkImportView({ ...c.deps, pageReader: (storeId) => pageReaderFor(access.deps, storeId) }, c.who, { page: pageParam(sp.page) }),
    cat.listBrands(c.deps, c.who),
    cat.categoryTree(c.deps, c.who),
    cat.listFabrics(c.deps, c.who),
    cat.listColours(c.deps, c.who),
  ]);
  const num = (n: number) => formatNumber(n, view.locale);
  const date = (iso: string) => new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: view.timeZone, numberingSystem: 'latn' }).format(new Date(iso));
  const pages = Math.max(1, Math.ceil(screen.total / screen.pageSize));
  const href = (page: number) => (page > 1 ? `${IMPORT_HOME}?page=${page}` : IMPORT_HOME);

  return (
    <AdminFrame view={view} current={KEY}>
      <div className="ad-hd pa-hd">
        <div className="pa-hd-text">
          <div className="ad-eyebrow">{t(d, 'products.eyebrow')}</div>
          <h1 className="ad-h1">{t(d, 'linkImport.title')}</h1>
          <p className="ad-intro">{t(d, 'linkImport.intro')}</p>
        </div>
      </div>
      <div className="pa-gtabs">
        <SystemTabs view={view} current={KEY} group="catalogue" />
      </div>

      {!screen.enabled ? (
        <div className="ad-note warn ad-note-top">
          <Icon name="info" size={16} />
          <div>{t(d, 'linkImport.off')}</div>
        </div>
      ) : (
        <>
          {screen.reader.mode === 'MOCK' ? (
            <div className="ad-note warn ad-note-top" data-reader-mode="MOCK">
              <Icon name="info" size={16} />
              <div>
                {t(d, 'linkImport.mock')}{' '}
                {c.can('vault.read') ? <Link href="/admin/integrations#ad-key-pageReader">{t(d, 'linkImport.mockLink')}</Link> : null}
              </div>
            </div>
          ) : null}
          <LinkImport
            dict={d}
            lang={view.lang}
            canWrite={c.can('catalogue.write')}
            brands={brands.map((b) => ({ id: b.id, name: b.name }))}
            categories={cat.flatten(tree).map((n) => ({ id: n.id, nameEn: n.nameEn, nameBn: n.nameBn, depth: n.depth }))}
            fabrics={fabrics.map((f) => ({ id: f.id, nameEn: f.nameEn, nameBn: f.nameBn }))}
            colours={colours.map((x) => ({ id: x.id, key: x.key, nameEn: x.nameEn, nameBn: x.nameBn, hex: x.hex, erpColorCode: x.erpColorCode }))}
          />
        </>
      )}

      <section className="ad-card pa-gap" aria-labelledby="li-history">
        <h2 id="li-history">{t(d, 'linkImport.history')}</h2>
        {screen.jobs.length ? (
          <ul className="pa-jobs">
            {screen.jobs.map((j) => (
              <li key={j.id} className="pa-job">
                <div className="pa-main">
                  <div className="pa-nm">{j.name ?? j.sourceUrl}</div>
                  <div className="ad-mini pa-path" translate="no">
                    {j.sourceUrl}
                  </div>
                  <div className="ad-mini" suppressHydrationWarning>
                    {date(j.at)}
                    {j.mode ? `${t(d, 'products.row.metaSep')}${t(d, `linkImport.mode.${j.mode}`)}` : ''}
                    {j.error ? `${t(d, 'products.row.metaSep')}${t(d, `linkImport.reasons.${j.error}`)}` : ''}
                  </div>
                </div>
                <div className="pa-job-st">
                  <span className={`pa-status ${j.stage === 'drafted' ? 's-READY_TO_PUBLISH' : j.stage === 'failed' ? 's-UNPUBLISHED' : 's-DRAFT'}`}>{t(d, `linkImport.stage.${j.stage}`)}</span>
                  {j.productId ? (
                    <Link className="ad-btn ad-btn-ghost ad-btn-sm" href={productHref(j.productId)}>
                      <Icon name="edit" size={14} />
                      {t(d, 'linkImport.open')}
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="pa-empty">{t(d, 'linkImport.historyEmpty')}</p>
        )}
        {pages > 1 ? (
          <nav className="pa-pager" aria-label={t(d, 'products.pager.label')}>
            {screen.page > 1 ? (
              <Link className="ad-btn ad-btn-ghost ad-btn-sm" href={href(screen.page - 1)}>
                {t(d, 'products.pager.prev')}
              </Link>
            ) : null}
            <span className="ad-mini">{t(d, 'products.pager.page', { page: num(screen.page), pages: num(pages) })}</span>
            {screen.page < pages ? (
              <Link className="ad-btn ad-btn-ghost ad-btn-sm" href={href(screen.page + 1)}>
                {t(d, 'products.pager.next')}
              </Link>
            ) : null}
          </nav>
        ) : null}
      </section>
    </AdminFrame>
  );
}
