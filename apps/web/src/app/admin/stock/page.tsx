// S09 · PR 205 — the sync health panel: when stock last came in from the ERP, what failed and what is queued; with
// PR 206 (re-sync all or one product), PR 199/200 (documents to the ERP, sent again by hand), PR 197/198 (pieces held
// in checkout on the shared pool), PR 202 (low stock on the shared number), PR 204 (the publish queue with real stock)
// and PR 207 (the check against the ERP). Reading needs `inventory.read`; the buttons need `inventory.sync`. The page
// never calls the ERP itself, so it opens when the ERP is down. There is no demo screen for it: it is drawn with the
// admin's own building blocks (cards, counters, rows) like the product pages.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import * as inv from '@extas/inventory';
import { AdminFrame, AdminNotice, SystemTabs } from '@/components/admin/AdminFrame';
import { Icon } from '@/components/admin/Icon';
import { formatNumber, nameIn } from '@/components/admin/products/model';
import { NewStylesButton, ReconcileButton, ResyncButtons, RetryDocuments } from '@/components/admin/stock/StockActions';
import { ago, dateTime, errorCodeOf, keyOf, mismatchLine, STOCK_HOME } from '@/components/admin/stock/text';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { productHref } from '@/lib/admin-products';
import { stockAccess } from '@/lib/admin-stock';
import { t, type Dict } from '@/lib/i18n';
import { MOTHER_STORE_ID } from '@extas/db/client';

export const dynamic = 'force-dynamic';

const KEY = 'stock';

export async function generateMetadata(): Promise<Metadata> {
  const view = await adminView();
  return { title: t(view.dict, 'stock.metaTitle'), robots: { index: false, follow: false } };
}

const LEVEL_DOT: Record<inv.HealthLevel, string> = { ok: 'ad-dot', practice: 'ad-dot warn', late: 'ad-dot warn', failing: 'ad-dot bad', down: 'ad-dot bad', off: 'ad-dot off' };

/** A run's or a document's error line in words: the code's text when the messages have one, else the line itself. */
function errorLine(d: Dict, line: string | null, locale: string): string | null {
  const found = mismatchLine(d, line, inv.MISMATCH_KINDS, locale);
  if (found) return found;
  const code = errorCodeOf(line);
  if (!code) return line;
  const key = `stock.erpCodes.${code}`;
  const text = t(d, key);
  return text === key ? line : text;
}

export default async function StockPage() {
  const deps = adminDeps();
  const view = await adminView(deps);
  const access = await pageAccess('inventory.read', deps, MOTHER_STORE_ID);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(STOCK_HOME)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noAccess')} />;

  const s = await stockAccess(access);
  const d = view.dict;
  const [health, docs, low, queue] = await Promise.all([
    inv.syncHealth(s.deps, s.who),
    inv.listErpPushes(s.deps, s.who, { status: ['FAILED', 'DEAD', 'SKIPPED_NO_ERP', 'PENDING'] }),
    inv.listLowStock(s.deps, s.who),
    inv.stockQueue(s.deps, s.who),
  ]);
  const now = new Date(health.checkedAt);
  const num = (n: number) => formatNumber(n, view.locale);
  const when = (iso: string) => dateTime(iso, view.locale, view.timeZone);
  const canSync = s.can('inventory.sync');
  const failedDocs = health.pushes.failed + health.pushes.dead + health.pushes.skipped;
  const lastError = errorLine(d, health.stock.lastError, view.locale);
  const lowMore = Math.max(0, low.total - low.items.length);

  return (
    <AdminFrame view={view} current={KEY}>
      <div className="ad-hd pa-hd">
        <div className="pa-hd-text">
          <div className="ad-eyebrow">{t(d, 'stock.eyebrow')}</div>
          <h1 className="ad-h1">{t(d, 'stock.title')}</h1>
          <p className="ad-intro">{t(d, 'stock.intro')}</p>
        </div>
      </div>
      <div className="pa-gtabs">
        <SystemTabs view={view} current={KEY} group="inventory" />
      </div>

      <div className={`ad-note ad-note-top st-verdict lv-${health.level}`} role="status">
        <span className={LEVEL_DOT[health.level]} />
        <div>
          <b>{t(d, `stock.level.${health.level}.title`)}</b>
          <div>{t(d, `stock.level.${health.level}.text`, { minutes: num(health.stock.lateAfterMinutes) })}</div>
        </div>
      </div>

      <div className="pa-kpis">
        <div className="pa-kpi">
          <div className={`pa-kpi-v st-kpi-t${health.stock.late ? ' warn' : ''}`}>{ago(d, health.stock.lastSuccessAt, now, view.locale, view.timeZone)}</div>
          <div className="pa-kpi-l">{t(d, 'stock.kpi.lastStock')}</div>
          <div className="pa-kpi-s">{t(d, 'stock.kpi.every', { n: num(health.stock.pollMinutes) })}</div>
        </div>
        <div className="pa-kpi">
          <div className="pa-kpi-v">{num(health.pushes.pending)}</div>
          <div className="pa-kpi-l">{t(d, 'stock.kpi.waiting')}</div>
          <div className="pa-kpi-s">{t(d, 'stock.kpi.waitingSub')}</div>
        </div>
        <div className="pa-kpi">
          <div className={`pa-kpi-v${failedDocs ? ' warn' : ' ok'}`}>{num(failedDocs)}</div>
          <div className="pa-kpi-l">{t(d, 'stock.kpi.failed')}</div>
          <div className="pa-kpi-s">{t(d, 'stock.kpi.failedSub')}</div>
        </div>
        <div className="pa-kpi">
          <div className="pa-kpi-v">{num(health.holds.active.units + health.holds.orders.units)}</div>
          <div className="pa-kpi-l">{t(d, 'stock.kpi.held')}</div>
          <div className="pa-kpi-s">{t(d, 'stock.kpi.heldSub', { carts: num(health.holds.active.carts), orders: num(health.holds.orders.units) })}</div>
        </div>
        <div className="pa-kpi">
          <div className={`pa-kpi-v${health.lowStockOpen ? ' warn' : ' ok'}`}>{num(health.lowStockOpen)}</div>
          <div className="pa-kpi-l">{t(d, 'stock.kpi.low')}</div>
          <div className="pa-kpi-s">{t(d, 'stock.kpi.lowSub')}</div>
        </div>
        <div className="pa-kpi">
          <div className="pa-kpi-v">{num(health.auditsOpen)}</div>
          <div className="pa-kpi-l">{t(d, 'stock.kpi.counts')}</div>
          <div className="pa-kpi-s">{t(d, 'stock.kpi.countsSub')}</div>
        </div>
      </div>

      <div className="st-grid">
        <section className="ad-card st-card" aria-labelledby="st-erp">
          <h2 id="st-erp">{t(d, 'stock.erp.title')}</h2>
          <p className="ad-sub">{t(d, 'stock.erp.sub')}</p>
          <div className="ad-row">
            <div className="ad-row-main">
              <div className="ad-row-name">{t(d, 'stock.erp.mode')}</div>
              <div className="ad-mini">{t(d, `stock.erp.modes.${health.link.mode}`)}</div>
            </div>
          </div>
          <div className="ad-row">
            <div className="ad-row-main">
              <div className="ad-row-name">{t(d, 'stock.erp.connection')}</div>
              <div className="ad-mini">{t(d, `stock.erp.states.${health.link.state}`)}</div>
            </div>
            {health.link.state === 'mock' || health.link.state === 'unavailable' ? (
              <Link className="ad-btn ad-btn-ghost ad-btn-sm" href="/admin/integrations">
                <Icon name="lock" size={16} />
                {t(d, 'stock.erp.keys')}
              </Link>
            ) : null}
          </div>
          <div className="ad-row">
            <div className="ad-row-main">
              <div className="ad-row-name">{t(d, 'stock.erp.lastStock')}</div>
              <div className="ad-mini">{health.stock.lastSuccessAt ? when(health.stock.lastSuccessAt) : t(d, 'stock.time.never')}</div>
              {lastError ? <div className="ad-mini bad st-err">{lastError}</div> : null}
              {health.stock.resuming ? <div className="ad-mini">{t(d, 'stock.erp.resuming')}</div> : null}
            </div>
          </div>
          {canSync ? (
            <div className="st-card-acts">
              <ResyncButtons dict={d} locale={view.locale} />
              <ReconcileButton dict={d} locale={view.locale} />
            </div>
          ) : (
            <p className="ad-mini pa-gap">{t(d, 'stock.noSync')}</p>
          )}
        </section>

        <section className="ad-card st-card" aria-labelledby="st-docs">
          <div className="st-card-hd">
            <h2 id="st-docs">{t(d, 'stock.docs.title')}</h2>
            {canSync ? <RetryDocuments dict={d} locale={view.locale} count={failedDocs} /> : null}
          </div>
          <p className="ad-sub">{t(d, 'stock.docs.sub')}</p>
          <div className="st-counts">
            {(['pending', 'failed', 'dead', 'skipped', 'sent'] as const).map((k) => (
              <span key={k} className={`st-count c-${k}`}>
                <b>{num(health.pushes[k])}</b> {t(d, `stock.docs.counts.${k}`)}
              </span>
            ))}
          </div>
          {docs.items.length ? (
            <ul className="st-list">
              {docs.items.map((p) => (
                <li key={p.id} className="st-li st-doc">
                  <span className={`st-st s-${p.status}`}>{t(d, `stock.docs.status.${p.status}`)}</span>
                  <span className="st-li-main">
                    <b>{t(d, `stock.docs.type.${keyOf(p.documentType)}`, { order: p.externalOrderId ?? '' })}</b>
                    <span className="ad-mini st-block">
                      {t(d, 'stock.docs.tries', { n: num(p.attempts) })}
                      {t(d, 'stock.sep')}
                      {when(p.createdAt)}
                    </span>
                    {p.lastError && p.status !== 'SKIPPED_NO_ERP' ? <span className="ad-mini bad st-block st-err">{errorLine(d, p.lastError, view.locale)}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="pa-empty">{t(d, 'stock.docs.empty')}</p>
          )}
        </section>

        <section className="ad-card st-card" aria-labelledby="st-low">
          <h2 id="st-low">{t(d, 'stock.low.title')}</h2>
          <p className="ad-sub">{t(d, 'stock.low.sub')}</p>
          {low.items.length ? (
            <ul className="st-list">
              {low.items.map((a) => (
                <li key={a.alertId} className="st-li">
                  <span className={a.available === 0 ? 'st-n zero' : 'st-n'}>{num(a.available)}</span>
                  <span className="st-li-main">
                    <Link className="st-name" href={productHref(a.productId)}>
                      {nameIn(view.lang, { nameEn: a.productName.en, nameBn: a.productName.bn })}
                    </Link>
                    <span className="ad-mini st-block">
                      <span translate="no">{a.sku}</span>
                      {a.colour ? `${t(d, 'stock.sep')}${a.colour}` : ''}
                      {a.size ? `${t(d, 'stock.sep')}${a.size}` : ''}
                      {t(d, 'stock.sep')}
                      {t(d, 'stock.low.threshold', { n: num(a.threshold) })}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="pa-empty">{t(d, 'stock.low.empty')}</p>
          )}
          {lowMore ? <p className="ad-mini">{t(d, 'stock.more', { n: num(lowMore) })}</p> : null}
        </section>

        <section className="ad-card st-card" aria-labelledby="st-queue">
          <h2 id="st-queue">{t(d, 'stock.queue.title')}</h2>
          <p className="ad-sub">{t(d, 'stock.queue.sub')}</p>
          {queue.items.length ? (
            <ul className="st-list">
              {queue.items.map((q) => (
                <li key={q.productId} className="st-li">
                  <span className={q.sellable ? 'st-n' : 'st-n zero'}>{num(q.sellable)}</span>
                  <span className="st-li-main">
                    <Link className="st-name" href={productHref(q.productId)}>
                      {nameIn(view.lang, { nameEn: q.name.en, nameBn: q.name.bn })}
                    </Link>
                    <span className="ad-mini st-block">{t(d, q.sellable ? (q.ready ? 'stock.queue.ready' : 'stock.queue.inStock') : 'stock.queue.noStock')}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="pa-empty">{t(d, 'stock.queue.empty')}</p>
          )}
          <NewStylesButton dict={d} locale={view.locale} />
        </section>

        <section className="ad-card st-card st-wide" aria-labelledby="st-runs">
          <h2 id="st-runs">{t(d, 'stock.runs.title')}</h2>
          <p className="ad-sub">{t(d, 'stock.runs.sub')}</p>
          {health.recentRuns.length ? (
            <ul className="st-list">
              {health.recentRuns.map((r) => (
                <li key={r.id} className="st-li">
                  <span className={`st-st s-${r.status}`}>{t(d, `stock.runs.status.${r.status}`)}</span>
                  <span className="st-li-main">
                    <b>{t(d, `stock.runs.kind.${keyOf(r.kind)}`)}</b>
                    <span className="ad-mini st-block">
                      {when(r.startedAt)}
                      {t(d, 'stock.sep')}
                      {t(d, 'stock.runs.items', { ok: num(r.itemsOk), bad: num(r.itemsFailed) })}
                    </span>
                    {r.error ? <span className={`ad-mini st-block st-err${r.status === 'FAILED' ? ' bad' : ''}`}>{errorLine(d, r.error, view.locale)}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="pa-empty">{t(d, 'stock.runs.empty')}</p>
          )}
        </section>
      </div>
    </AdminFrame>
  );
}
