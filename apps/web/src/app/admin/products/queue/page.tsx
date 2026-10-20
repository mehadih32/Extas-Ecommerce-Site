// PR 35 — the publish queue ("Ready to publish"): every product that is not on the shop waits here, oldest first, with
// its checklist (PR 26) and health score (PR 29). Only a product whose checklist passes can be published; the others
// open in the edit form to be finished. A live product that stopped passing shows here too ("needs a fix").
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as cat from '@extas/catalogue';
import { AdminFrame, AdminNotice, SystemTabs } from '@/components/admin/AdminFrame';
import { Icon } from '@/components/admin/Icon';
import { QueueButton } from '@/components/admin/products/QueueButton';
import { checkText, formatNumber, nameIn } from '@/components/admin/products/model';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { catalogueAccess, one, pageParam, productHref, QUEUE_HOME } from '@/lib/admin-products';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const KEY = 'publishQueue';

export async function generateMetadata(): Promise<Metadata> {
  const view = await adminView();
  return { title: t(view.dict, 'queue.metaTitle'), robots: { index: false, follow: false } };
}

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function PublishQueuePage({ searchParams }: { searchParams: Search }) {
  const deps = adminDeps();
  const [view, sp] = await Promise.all([adminView(deps), searchParams]);
  const access = await pageAccess('catalogue.read', deps, MOTHER_STORE_ID);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(QUEUE_HOME)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noAccess')} />;

  const c = catalogueAccess(access);
  const d = view.dict;
  const raw = one(sp.filter);
  const filter = (cat.QUEUE_FILTERS as readonly string[]).includes(raw ?? '') ? (raw as cat.QueueFilter) : 'all';
  const [queue, colours] = await Promise.all([cat.publishQueue(c.deps, c.who, { filter, page: pageParam(sp.page) }), cat.listColours(c.deps, c.who, { includeArchived: true })]);
  const colourName = (id: string) => {
    const x = colours.find((k) => k.id === id);
    return x ? nameIn(view.lang, x) : id;
  };
  const num = (n: number) => formatNumber(n, view.locale);
  const date = (iso: string) => new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeZone: view.timeZone, numberingSystem: 'latn' }).format(new Date(iso));
  const canPublish = c.can('catalogue.publish');
  const pages = Math.max(1, Math.ceil(queue.total / queue.pageSize));
  const href = (f: string, page = 1) => `${QUEUE_HOME}?filter=${f}${page > 1 ? `&page=${page}` : ''}`;

  return (
    <AdminFrame view={view} current={KEY}>
      <div className="ad-hd pa-hd">
        <div className="pa-hd-text">
          <div className="ad-eyebrow">{t(d, 'products.eyebrow')}</div>
          <h1 className="ad-h1">{t(d, 'queue.title')}</h1>
          <p className="ad-intro">{t(d, 'queue.intro')}</p>
        </div>
        <QueueButton dict={d} locale={view.locale} kind="recheck" productIds={queue.items.map((i) => i.productId)} />
      </div>
      <div className="pa-gtabs">
        <SystemTabs view={view} current={KEY} group="catalogue" />
      </div>
      <nav className="ad-tabs" aria-label={t(d, 'queue.filters.label')}>
        {cat.QUEUE_FILTERS.map((f) => (
          <Link key={f} className="ad-chip" href={href(f)} aria-current={filter === f ? 'page' : undefined}>
            {t(d, `queue.filters.${f}`, { n: num(queue.counts[f]) })}
          </Link>
        ))}
      </nav>

      {queue.items.length ? (
        <div className="pa-queue">
          {queue.items.map((i) => {
            const name = nameIn(view.lang, i);
            const failing = i.checks.filter((k) => !k.ok).sort((a, b) => (a.level === b.level ? 0 : a.level === 'block' ? -1 : 1));
            const passed = i.checks.filter((k) => k.ok).length;
            return (
              <article key={i.id} className="ad-card pa-qi">
                <div className="pa-qh">
                  <Link className="pa-nm" href={productHref(i.productId)}>
                    {name}
                  </Link>
                  <span className={`pa-status ${i.ready ? 's-READY_TO_PUBLISH' : 's-DRAFT'}`}>{t(d, i.ready ? 'queue.ready' : 'queue.waiting')}</span>
                </div>
                <div className="ad-mini">
                  {t(d, `queue.reason.${i.reason}`)}
                  {t(d, 'products.row.metaSep')}
                  {t(d, 'queue.since', { date: date(i.since) })}
                  {t(d, 'products.row.metaSep')}
                  {t(d, 'products.row.score', { n: num(i.score) })}
                </div>
                <ul className="pa-hl pa-qchecks">
                  {failing.map((k) => (
                    <li key={k.key} className="pa-hli">
                      <span className={k.level === 'block' ? 'ad-dot bad' : 'ad-dot warn'} />
                      <span>
                        <b>{t(d, `checks.${k.key}.label`)}</b>
                        <span className="ad-mini pa-block">{checkText(d, k, colourName)}</span>
                      </span>
                    </li>
                  ))}
                  {passed ? (
                    <li className="pa-hli ok">
                      <Icon name="check" size={16} />
                      <span>{t(d, 'queue.passed', { n: num(passed), of: num(i.checks.length) })}</span>
                    </li>
                  ) : null}
                </ul>
                <div className="pa-qacts">
                  {i.status !== 'PUBLISHED' && canPublish ? <QueueButton dict={d} locale={view.locale} kind="publish" productId={i.productId} name={name} disabled={!i.ready} /> : null}
                  <Link className="ad-btn ad-btn-ghost ad-btn-sm" href={productHref(i.productId)}>
                    <Icon name="edit" size={16} />
                    {t(d, 'queue.fix')}
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="ad-card">
          <p className="pa-empty">{t(d, 'queue.empty')}</p>
        </div>
      )}
      {!canPublish ? <p className="ad-mini pa-gap">{t(d, 'products.publish.noPermission')}</p> : null}

      {pages > 1 ? (
        <nav className="pa-pager" aria-label={t(d, 'products.pager.label')}>
          {queue.page > 1 ? (
            <Link className="ad-btn ad-btn-ghost ad-btn-sm" href={href(filter, queue.page - 1)}>
              {t(d, 'products.pager.prev')}
            </Link>
          ) : null}
          <span className="ad-mini">{t(d, 'products.pager.page', { page: num(queue.page), pages: num(pages) })}</span>
          {queue.page < pages ? (
            <Link className="ad-btn ad-btn-ghost ad-btn-sm" href={href(filter, queue.page + 1)}>
              {t(d, 'products.pager.next')}
            </Link>
          ) : null}
        </nav>
      ) : null}
    </AdminFrame>
  );
}
