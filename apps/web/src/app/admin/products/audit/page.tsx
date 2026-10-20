// PR 39 — the product audit report: every product that is not complete, what it misses (the publish checklist,
// PR 26), and a "Fix" for each missing thing that opens the place to fix it. Filters by what is missing and by status;
// "Check all again" checks every product again within the per-opening limit (`catalogue.audit.recheckMax`). The demo
// has no screen of its own for this: it follows the publish queue's cards (demo #/admin/products style).
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as cat from '@extas/catalogue';
import { AdminFrame, AdminNotice, SystemTabs } from '@/components/admin/AdminFrame';
import { Icon } from '@/components/admin/Icon';
import { checkText, formatNumber, nameIn } from '@/components/admin/products/model';
import { AUDIT_HOME, auditHref, fixHref } from '@/components/admin/products/tools-model';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { catalogueAccess, one, pageParam, productHref } from '@/lib/admin-products';
import { t } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const KEY = 'productAudit';

export async function generateMetadata(): Promise<Metadata> {
  const view = await adminView();
  return { title: t(view.dict, 'audit.metaTitle'), robots: { index: false, follow: false } };
}

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function ProductAuditPage({ searchParams }: { searchParams: Search }) {
  const deps = adminDeps();
  const [view, sp] = await Promise.all([adminView(deps), searchParams]);
  const access = await pageAccess('catalogue.read', deps, MOTHER_STORE_ID);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(AUDIT_HOME)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noAccess')} />;

  const c = catalogueAccess(access);
  const d = view.dict;
  const rawCheck = one(sp.check);
  const check = (cat.PUBLISH_CHECK_KEYS as readonly string[]).includes(rawCheck ?? '') ? (rawCheck as cat.PublishCheckKey) : undefined;
  const rawStatus = one(sp.status);
  const status = (cat.AUDIT_STATUSES as readonly string[]).includes(rawStatus ?? '') ? (rawStatus as cat.AuditStatus) : 'all';
  const rawSince = one(sp.recheckSince);
  const recheckSince = rawSince && !Number.isNaN(Date.parse(rawSince)) && /^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(rawSince) ? rawSince : undefined;

  const [report, colours] = await Promise.all([
    cat.productAudit(c.deps, c.who, { check, status, page: pageParam(sp.page), recheckSince }),
    cat.listColours(c.deps, c.who, { includeArchived: true }),
  ]);
  const colourName = (id: string) => {
    const x = colours.find((k) => k.id === id);
    return x ? nameIn(view.lang, x) : id;
  };
  const num = (n: number) => formatNumber(n, view.locale);
  const date = (iso: string) => new Intl.DateTimeFormat(view.locale, { dateStyle: 'medium', timeZone: view.timeZone, numberingSystem: 'latn' }).format(new Date(iso));
  const pages = Math.max(1, Math.ceil(report.total / report.pageSize));
  const here = { check, status };
  const kpis = [
    { value: report.products, label: 'audit.kpi.products', sub: t(d, 'audit.kpi.productsSub') },
    { value: report.incomplete, label: 'audit.kpi.incomplete', sub: t(d, 'audit.kpi.incompleteSub'), tone: 'warn' },
    { value: report.blocked, label: 'audit.kpi.blocked', sub: t(d, 'audit.kpi.blockedSub', { n: num(report.liveBlocked) }), tone: 'warn' },
    { value: report.averageScore, label: 'audit.kpi.score', sub: t(d, 'audit.kpi.scoreSub'), tone: 'ok' },
  ];

  return (
    <AdminFrame view={view} current={KEY}>
      <div className="ad-hd pa-hd">
        <div className="pa-hd-text">
          <div className="ad-eyebrow">{t(d, 'products.eyebrow')}</div>
          <h1 className="ad-h1">{t(d, 'audit.title')}</h1>
          <p className="ad-intro">{t(d, 'audit.intro')}</p>
        </div>
        <Link className="ad-btn ad-btn-ghost pa-hd-btn" href={auditHref({ ...here, recheckSince: report.checkedAt })} prefetch={false}>
          {t(d, 'audit.recheck')}
        </Link>
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

      {report.rechecked ? <p className="ad-mini pa-gap" role="status">{t(d, 'audit.rechecked', { n: num(report.rechecked) })}</p> : null}
      {report.waiting ? (
        <div className="ad-note warn ad-note-top">
          <Icon name="info" size={16} />
          <div>
            {t(d, 'audit.waiting', { n: num(report.waiting) })}{' '}
            <Link href={auditHref({ ...here, recheckSince })} prefetch={false}>
              {t(d, 'audit.carryOn')}
            </Link>
          </div>
        </div>
      ) : null}

      <nav className="ad-tabs" aria-label={t(d, 'audit.checksLabel')}>
        <Link className="ad-chip" href={auditHref({ status })} aria-current={!check ? 'page' : undefined}>
          {t(d, 'audit.allChecks', { n: num(report.incomplete) })}
        </Link>
        {report.byCheck
          .filter((b) => b.failing > 0)
          .map((b) => (
            <Link key={b.key} className="ad-chip" href={auditHref({ check: b.key, status })} aria-current={check === b.key ? 'page' : undefined}>
              <span className={b.level === 'block' ? 'ad-dot bad' : 'ad-dot warn'} aria-hidden="true" />
              {t(d, `checks.${b.key}.label`)}
              <span className="pa-chip-n">{num(b.failing)}</span>
            </Link>
          ))}
      </nav>
      <nav className="ad-tabs" aria-label={t(d, 'audit.statusLabel')}>
        {cat.AUDIT_STATUSES.map((s) => (
          <Link key={s} className="ad-chip" href={auditHref({ check, status: s })} aria-current={status === s ? 'page' : undefined}>
            {t(d, `audit.status.${s}`, { n: num(report.byStatus[s]) })}
          </Link>
        ))}
      </nav>

      {report.items.length ? (
        <div className="pa-queue">
          {report.items.map((i) => {
            const name = nameIn(view.lang, i);
            return (
              <article key={i.productId} className="ad-card pa-qi">
                <div className="pa-qh">
                  <Link className="pa-nm" href={productHref(i.productId)}>
                    {name}
                  </Link>
                  <span className={`pa-status s-${i.status}`}>{t(d, `products.status.${i.status}`)}</span>
                </div>
                <div className="ad-mini">
                  {i.liveBlocked ? (
                    <>
                      <b className="pa-warn-t">{t(d, 'audit.liveBlocked')}</b>
                      {t(d, 'products.row.metaSep')}
                    </>
                  ) : null}
                  {t(d, 'products.row.score', { n: num(i.score) })}
                  {i.checkedAt ? (
                    <>
                      {t(d, 'products.row.metaSep')}
                      {t(d, 'audit.checkedAt', { date: date(i.checkedAt) })}
                    </>
                  ) : null}
                </div>
                <ul className="pa-hl pa-qchecks">
                  {i.failing.map((k) => (
                    <li key={k.key} className="pa-hli pa-fixrow">
                      <span className={k.level === 'block' ? 'ad-dot bad' : 'ad-dot warn'} />
                      <span className="pa-fixtext">
                        <b>{t(d, `checks.${k.key}.label`)}</b>
                        <span className="ad-mini pa-block">{checkText(d, k, colourName)}</span>
                      </span>
                      <Link className="ad-btn ad-btn-ghost ad-btn-sm pa-fix" href={fixHref(i.productId, k.key)}>
                        <Icon name="edit" size={14} />
                        {k.key === 'sizeChart' ? t(d, 'audit.fixSizeChart') : t(d, 'audit.fix')}
                      </Link>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="ad-card">
          <p className="pa-empty">{t(d, check || status !== 'all' ? 'audit.emptyFilter' : 'audit.empty')}</p>
        </div>
      )}

      {pages > 1 ? (
        <nav className="pa-pager" aria-label={t(d, 'products.pager.label')}>
          {report.page > 1 ? (
            <Link className="ad-btn ad-btn-ghost ad-btn-sm" href={auditHref({ ...here, page: report.page - 1 })}>
              {t(d, 'products.pager.prev')}
            </Link>
          ) : null}
          <span className="ad-mini">{t(d, 'products.pager.page', { page: num(report.page), pages: num(pages) })}</span>
          {report.page < pages ? (
            <Link className="ad-btn ad-btn-ghost ad-btn-sm" href={auditHref({ ...here, page: report.page + 1 })}>
              {t(d, 'products.pager.next')}
            </Link>
          ) : null}
        </nav>
      ) : null}
    </AdminFrame>
  );
}
