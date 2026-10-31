// S16 · PR 343 — Money → Cost ledger at /admin/money/cost-ledger (B3.9; BACKEND-ARCHITECTURE §5 MNY-06): every paid call
// writes a cost row (messages now; the daily cost lines of Money → Costs and the return losses are rows too). Today,
// this month and this year in the store's time zone, by service; the latest rows; the prepaid balances (SMS credit …)
// drawn down by each paid message, with a top-up record and a low mark; the export of a period. Seeing it needs
// `books.read`; recording a top-up or a low mark needs `costs.write`. Nothing here pays or moves money.
// Words: messages/admin-cost-ledger.*.json (`moneyCostLedger.*`).
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { ymdIn } from '@extas/metrics';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { PrepaidCard } from '@/components/admin/money/PrepaidCard';
import { formatMoney, moneyOf } from '@/components/admin/products/model';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { dateTime } from '@/components/admin/stock/text';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { costLedger, PREPAID_SERVICES } from '@/lib/cost-ledger';
import { t, type Dict } from '@/lib/i18n';
import bn from '../../../../../messages/admin-cost-ledger.bn.json';
import en from '../../../../../messages/admin-cost-ledger.en.json';
import '../money.css';

export const dynamic = 'force-dynamic';

const KEY = 'moneyCostLedger';
const HERE = '/admin/money/cost-ledger';

function withScreen(view: AdminView): AdminView {
  return { ...view, dict: { ...view.dict, moneyCostLedger: (view.lang === 'bn' ? bn : en).moneyCostLedger as unknown as Dict } };
}

export async function generateMetadata(): Promise<Metadata> {
  const view = withScreen(await adminView());
  return { title: `${t(view.dict, 'moneyCostLedger.metaTitle')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function CostLedgerPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('books.read', deps, MOTHER_STORE_ID)]);
  const view = withScreen(plain);
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(view.dict, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="books.read" />
      </div>
    );
  const d = view.dict;
  const c = (k: string, vars?: Record<string, string | number>) => t(d, `moneyCostLedger.${k}`, vars);
  const svc = (s: string) => {
    const k = `moneyCostLedger.service.${s}`;
    const v = t(d, k);
    return v === k ? s : v;
  };
  const at = { storeId: MOTHER_STORE_ID };
  const [currency, timeZone, cfg] = await Promise.all([access.deps.resolver.value('store.currency', at), access.deps.resolver.value('store.timeZone', at), access.deps.resolver.value('costs.ledger', at)]);
  const now = new Date();
  const o = await costLedger(access.deps.db, MOTHER_STORE_ID, timeZone, cfg.recentRows, now);
  const money = moneyOf(currency, view.locale);
  const m = (minor: number) => formatMoney(minor, money);
  const when = (iso: string | Date) => dateTime(typeof iso === 'string' ? iso : iso.toISOString(), view.locale, view.timeZone);
  const canEdit = access.guard.permissions?.has('costs.write') ?? false;
  const today = ymdIn(now, timeZone);
  const lastTopUpText = Object.fromEntries(
    o.prepaid.filter((p) => p.lastTopUp).map((p) => [p.service, c(p.lastTopUp!.credits ? 'prepaid.lastWithCredits' : 'prepaid.last', { amount: m(p.lastTopUp!.amountMinor), credits: p.lastTopUp!.credits ?? 0, at: when(p.lastTopUp!.at) })]),
  );

  return (
    <div className="a2-z" data-testid="cost-ledger">
      <PageHead view={view} place={locateKey(KEY)} title={c('title')} sub={c('sub')} />
      <SectionTabs view={view} current={KEY} />
      <p className="a2-xs a2-mute a2-mt12">{c('asOf', { at: when(o.at) })}</p>

      <section className="a2-card a2-mt12" aria-labelledby="cl-spend" data-testid="cl-spend">
        <h2 className="a2-h3" id="cl-spend">
          {c('spend.title')}
        </h2>
        <p className="a2-cs">{c('spend.sub')}</p>
        <div className="a2-kpis k3">
          {o.periods.map((p) => (
            <div key={p.key} className="a2-kpi" data-testid={`cl-period-${p.key}`}>
              <span className="a2-xs a2-mute">{c(`period.${p.key}`)}</span>
              <b className="a2-kv">{m(p.minor)}</b>
              <span className="a2-xs a2-mute">{c('spend.rows', { n: p.count })}</span>
            </div>
          ))}
        </div>
        <h3 className="a2-h3 a2-mt12">{c('spend.byService')}</h3>
        {o.periods[1]!.byService.length ? (
          o.periods[1]!.byService.map((s) => (
            <div key={s.service} className="a2-rule" data-testid={`cl-service-${s.service}`}>
              <span>{svc(s.service)}</span>
              <span className="a2-xs a2-mute">{c('spend.rows', { n: s.count })}</span>
              <b>{m(s.minor)}</b>
            </div>
          ))
        ) : (
          <p className="a2-xs a2-mute">{c('spend.none')}</p>
        )}
      </section>

      <PrepaidCard dict={d} money={money} services={PREPAID_SERVICES} rows={o.prepaid} canEdit={canEdit} today={today} monthStart={`${today.slice(0, 7)}-01`} lastTopUpText={lastTopUpText} />

      <section className="a2-card a2-mt12" aria-labelledby="cl-recent" data-testid="cl-recent">
        <h2 className="a2-h3" id="cl-recent">
          {c('recent.title')}
        </h2>
        <p className="a2-cs">{o.more ? c('recent.latest', { n: o.recentLimit }) : c('recent.sub')}</p>
        {o.recent.length ? (
          o.recent.map((r) => (
            <div key={r.id} className="a2-rule" data-testid="cl-row">
              <span>
                <b>{svc(r.service)}</b>
                <span className="a2-xs a2-mute cl-sub">{[when(r.occurredAt), r.detail].filter(Boolean).join(' · ')}</span>
              </span>
              <span className="a2-xs a2-mute">{c(`source.${r.source}`) === `moneyCostLedger.source.${r.source}` ? r.source : c(`source.${r.source}`)}</span>
              <b>{m(r.amountMinor)}</b>
            </div>
          ))
        ) : (
          <p className="a2-xs a2-mute">{c('recent.none')}</p>
        )}
      </section>
    </div>
  );
}
