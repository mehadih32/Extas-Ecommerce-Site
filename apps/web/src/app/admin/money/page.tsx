// S16 · PR 342 — Money → Overview at /admin/money (BACKEND-ARCHITECTURE §5 MNY-01; B3.10): cash received in the last
// 24 hours, 7 and 30 days (and by method), the COD the couriers still owe (by courier) and the refunds owed to
// customers, from the shop's own records (lib/money-overview.ts). Read-only: approving or paying a refund stays on the
// order and is the owner's. Seeing it needs `payments.view`. Words: messages/admin-money.*.json (`moneyOverview.*`).
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { formatMoney, moneyOf } from '@/components/admin/products/model';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { dateTime } from '@/components/admin/stock/text';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { moneyOverview } from '@/lib/money-overview';
import bn from '../../../../messages/admin-money.bn.json';
import en from '../../../../messages/admin-money.en.json';
import './money.css';

export const dynamic = 'force-dynamic';

const KEY = 'moneyOverview';
const HERE = '/admin/money';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, moneyOverview: (view.lang === 'bn' ? bn : en).moneyOverview as unknown as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'moneyOverview.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function MoneyOverviewPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('payments.view', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="payments.view" />
      </div>
    );
  const d = view.dict;
  const c = (k: string, vars?: Record<string, string | number>) => t(d, `moneyOverview.${k}`, vars);
  const [o, currency] = await Promise.all([moneyOverview(access.deps.db, MOTHER_STORE_ID), access.deps.resolver.value('store.currency', { storeId: MOTHER_STORE_ID })]);
  const money = moneyOf(currency, view.locale);
  const amount = (minor: number) => formatMoney(minor, money);

  return (
    <div className="a2-z" data-testid="money-overview">
      <PageHead view={view} place={locateKey(KEY)} title={c('title')} sub={c('sub')} />
      <SectionTabs view={view} current={KEY} />
      <p className="a2-xs a2-mute a2-mt12">{c('asOf', { at: dateTime(o.at, view.locale, view.timeZone) })}</p>

      <section className="a2-card a2-mt12" aria-labelledby="mo-received" data-testid="mo-received">
        <div className="a2-ch">
          <div>
            <h2 className="a2-h3" id="mo-received">{c('received.title')}</h2>
            <div className="a2-cs">{c('received.sub')}</div>
          </div>
        </div>
        <div className="a2-kpis k3">
          {o.received.windows.map((w) => (
            <div key={w.key} className="a2-kpi" data-testid={`mo-received-${w.key}`}>
              <span className="a2-xs a2-mute">{c(`received.${w.key}`)}</span>
              <b className="a2-kv">{amount(w.minor)}</b>
              <span className="a2-xs a2-mute">{c('received.count', { n: w.count })}</span>
            </div>
          ))}
        </div>
        <h3 className="a2-h3 a2-mt12">{c('received.byMethod')}</h3>
        {o.received.byMethod.length ? (
          o.received.byMethod.map((m) => (
            <div key={m.method} className="a2-rule">
              <span>{c(`method.${m.method}`)}</span>
              <span className="a2-xs a2-mute">{c('received.count', { n: m.count })}</span>
              <b>{amount(m.minor)}</b>
            </div>
          ))
        ) : (
          <p className="a2-xs a2-mute">{c('received.none')}</p>
        )}
      </section>

      <section className="a2-card a2-mt12" aria-labelledby="mo-cod" data-testid="mo-cod">
        <div className="a2-ch">
          <div>
            <h2 className="a2-h3" id="mo-cod">{c('cod.title')}</h2>
            <div className="a2-cs">{c('cod.sub')}</div>
          </div>
          <span className={`a2-pill ${o.cod.minor ? 'warn' : 'ok'}`}>{amount(o.cod.minor)}</span>
        </div>
        {o.cod.parcels ? (
          <>
            <p className="a2-xs a2-mute">
              {c('cod.parcels', { n: o.cod.parcels })}
              {o.cod.oldestDays !== null ? ` · ${o.cod.oldestDays ? c('cod.oldest', { n: o.cod.oldestDays }) : c('cod.oldestToday')}` : ''}
            </p>
            {o.cod.byCourier.map((k) => (
              <div key={k.courier ?? '-'} className="a2-rule">
                <span>{k.courier ?? c('cod.noCourier')}</span>
                <span className="a2-xs a2-mute">{c('cod.parcels', { n: k.parcels })}</span>
                <b>{amount(k.minor)}</b>
              </div>
            ))}
          </>
        ) : (
          <p className="a2-xs a2-mute">{c('cod.none')}</p>
        )}
      </section>

      <section className="a2-card a2-mt12" aria-labelledby="mo-refunds" data-testid="mo-refunds">
        <div className="a2-ch">
          <div>
            <h2 className="a2-h3" id="mo-refunds">{c('refunds.title')}</h2>
            <div className="a2-cs">{c('refunds.sub')}</div>
          </div>
          <span className={`a2-pill ${o.refunds.waiting ? 'warn' : 'ok'}`}>{amount(o.refunds.waitingMinor)}</span>
        </div>
        {o.refunds.waiting || o.refunds.failed ? (
          <>
            <div className="a2-rule">
              <span>{c('refunds.waiting')}</span>
              <span className="a2-xs a2-mute">
                {c('refunds.count', { n: o.refunds.waiting })}
                {o.refunds.oldestDays !== null ? ` · ${o.refunds.oldestDays ? c('refunds.oldest', { n: o.refunds.oldestDays }) : c('refunds.oldestToday')}` : ''}
              </span>
              <b>{amount(o.refunds.waitingMinor)}</b>
            </div>
            <div className="a2-rule">
              <span>{c('refunds.failed')}</span>
              <span className="a2-xs a2-mute">{c('refunds.count', { n: o.refunds.failed })}</span>
              <b>{amount(o.refunds.failedMinor)}</b>
            </div>
          </>
        ) : (
          <p className="a2-xs a2-mute">{c('refunds.none')}</p>
        )}
        <p className="a2-xs a2-mute a2-mt12">{c('refunds.where')}</p>
      </section>
    </div>
  );
}
