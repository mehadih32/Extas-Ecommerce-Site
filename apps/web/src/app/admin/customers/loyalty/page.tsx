// S14 · PR 296 — Customers › Loyalty & wallet at /admin/customers/loyalty (CUS-04; demo 97u-adm2-customers.js): the
// rewards and points the owner's own rule gives (SIM-F-032) beside the wallet's ledger. The top line: customers who hold
// points, points given and turned in over the last days, and — for a person holding `payments.view` — what the wallets
// hold. Then the points, newest first (each delivered order earns once, after the exchange window; turning points into
// wallet credit is the customer's own press in My account › Rewards), the wallet's newest lines with their reasons
// (`payments.view`), and the Rewards and points card (`customers.points`, off with every number 0; saving needs
// `customers.settings` and `settings.write`, because the turn-in rate is money). The late-delivery apology credit stays
// in Money › Refunds & wallet (PR 172), linked here with its state. Seeing needs `customers.read`. Nothing is deleted.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as cu from '@extas/customers';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { AdjustPoints } from '@/components/admin/customers/AdjustPoints';
import { CrmSettingCard, type CrmField } from '@/components/admin/customers/CrmSettingCard';
import { formatNumber } from '@/components/admin/products/model';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { adminDeps } from '@/lib/admin-auth';
import { withCustomers } from '@/lib/admin-customers/i18n';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { customersDeps } from '@/lib/customers-api';
import { refundWords } from '@/lib/money-words';
import { t, type Dict } from '@/lib/i18n';
import '../settings/settings.css';
import './loyalty.css';

export const dynamic = 'force-dynamic';

const HERE = '/admin/customers/loyalty';
const KEY = 'customersLoyalty';

const FIELDS: readonly CrmField[] = [
  { name: 'enabled', kind: 'bool' },
  { name: 'pointsPer100', kind: 'int' },
  { name: 'orderPoints', kind: 'int' },
  { name: 'holdDays', kind: 'int' },
  { name: 'lookbackDays', kind: 'int' },
  { name: 'redeemPoints', kind: 'int' },
  { name: 'redeemMinor', kind: 'money' },
  { name: 'batchSize', kind: 'int' },
];

export async function generateMetadata(): Promise<Metadata> {
  const view = withCustomers(await adminView());
  return { title: `${t(view.dict, 'cus.loy.title')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

export default async function LoyaltyPage() {
  const deps = adminDeps();
  const [plain, access] = await Promise.all([adminView(deps), pageAccess('customers.read', deps, MOTHER_STORE_ID)]);
  const view = withCustomers(plain);
  const d = view.dict;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(HERE)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current={KEY} text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="customers.read" />
      </div>
    );
  const who: cu.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const cdeps = customersDeps(access.deps);
  const [s, currency] = await Promise.all([cu.loyaltyScreen(cdeps, who), cdeps.settings.value('store.currency', { storeId: MOTHER_STORE_ID }) as Promise<string>]);
  const reasonWords = refundWords(view.lang);
  const walletReason = (r: string) => {
    const w = t(reasonWords, `wallet.reason.${r}`);
    return w === `wallet.reason.${r}` ? r : w;
  };
  const n = (x: number) => formatNumber(x, view.locale);
  const money = (minor: number) => new Intl.NumberFormat(view.locale, { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 2, numberingSystem: 'latn' }).format(minor / 100);
  const day = new Intl.DateTimeFormat(view.locale, { timeZone: view.timeZone, numberingSystem: 'latn', dateStyle: 'medium' });
  const days = n(s.kpis.days);
  // PR 905: the prototype's four figures — points held (what they are worth, given and turned in), wallet, money back, members
  const rate = s.points;
  const rateOn = rate.redeemPoints > 0 && rate.redeemMinor > 0;
  const worthMinor = rateOn ? Math.floor(s.pointsHeld / rate.redeemPoints) * rate.redeemMinor : 0;
  const backPct = rateOn && rate.pointsPer100 > 0 ? (rate.pointsPer100 * (rate.redeemMinor / 100)) / rate.redeemPoints : null;
  const kpis = [
    { id: 'held', value: n(s.pointsHeld), note: `${rateOn ? t(d, 'cus.loy.kpi.heldWorth', { amount: money(worthMinor) }) : t(d, 'cus.loy.kpi.heldNoRate')} · ${t(d, 'cus.loy.kpi.heldFlow', { given: n(s.kpis.given), redeemed: n(s.kpis.redeemed), days })}` },
    {
      id: 'wallet',
      value: s.kpis.walletMinor === null ? '—' : money(s.kpis.walletMinor),
      note: s.kpis.walletMinor === null ? t(d, 'cus.loy.kpi.walletHidden') : t(d, 'cus.loy.kpi.walletNote', { lines: n(s.kpis.walletLines ?? 0), days }),
    },
    { id: 'back', value: backPct === null ? '—' : `${new Intl.NumberFormat(view.locale, { maximumFractionDigits: 2, numberingSystem: 'latn' }).format(backPct)}%`, note: t(d, 'cus.loy.kpi.backNote') },
    { id: 'members', value: n(s.kpis.members), note: t(d, 'cus.loy.kpi.membersNote') },
  ];
  const pointsOn = cu.earns(s.points);
  const cdict: Dict = { cus: d.cus as Dict };
  const pointsWhat = (reason: string, orderNumber: string | null) =>
    reason === cu.POINTS_REASONS.order && orderNumber ? t(d, 'cus.loy.points.ORDER_DELIVERED', { n: orderNumber }) : reason === cu.POINTS_REASONS.redeem ? t(d, 'cus.loy.points.REDEEMED') : t(d, 'cus.loy.points.other');

  return (
    <div className="a2-z" data-testid="customer-loyalty" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={t(d, 'cus.loy.title')} sub={t(d, 'cus.loy.sub')} />
      <SectionTabs view={view} current={KEY} />
      {!pointsOn ? (
        <p className="a2-sm a2-mute a2-mt12" data-testid="loyalty-off">
          {t(d, 'cus.loy.off')}
        </p>
      ) : null}
      <div className="a2-kpis a2-mt12" data-testid="loyalty-kpis">
        {kpis.map((k) => (
          <div key={k.id} className="a2-card a2-kpi" data-testid={`loyalty-kpi-${k.id}`}>
            <div className="a2-kl">{t(d, `cus.loy.kpi.${k.id}`)}</div>
            <div className="a2-kv">{k.value}</div>
            <div className="a2-kf">
              <span className="a2-kn">{k.note}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="a2-row a2-r21 a2-mt12">
        <div className="a2-stack">
          <section className="a2-card" data-testid="loyalty-points">
            <h2 className="a2-h3">{t(d, 'cus.loy.points.title')}</h2>
            <p className="a2-xs a2-mute a2-mt6">{t(d, 'cus.loy.points.sub')}</p>
            {s.pointsLines.length ? (
              <ul className="loy-lines">
                {s.pointsLines.map((l) => (
                  <li key={l.id} className="loy-line">
                    <span className="loy-who">
                      <Link href={`/admin/customers/${l.customerId}`}>{l.customerName ?? t(d, 'cus.loy.someone')}</Link>
                      <span className="a2-xs a2-mute">
                        {pointsWhat(l.reason, l.orderNumber)} · {day.format(l.at)}
                      </span>
                    </span>
                    <span className={`a2-num loy-amt${l.points < 0 ? ' neg' : ''}`}>
                      {l.points > 0 ? '+' : ''}
                      {n(l.points)}
                      <span className="a2-xs a2-mute loy-after">{t(d, 'cus.loy.points.after', { n: n(l.pointsAfter) })}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="a2-sm a2-mute a2-mt12">{t(d, 'cus.loy.points.none')}</p>
            )}
          </section>
          {s.walletLines ? (
            <section className="a2-card" data-testid="loyalty-wallet">
              <div className="a2-between">
                <h2 className="a2-h3">{t(d, 'cus.loy.wallet.title')}</h2>
                <Link className="a2-btn" href="/admin/money/refunds">
                  {t(d, 'cus.loy.wallet.more')}
                </Link>
              </div>
              <p className="a2-xs a2-mute a2-mt6">{t(d, 'cus.loy.wallet.sub')}</p>
              {s.walletLines.length ? (
                <ul className="loy-lines">
                  {s.walletLines.map((w) => (
                    <li key={w.id} className="loy-line">
                      <span className="loy-who">
                        <Link href={`/admin/customers/${w.customerId}`}>{w.customerName ?? t(d, 'cus.loy.someone')}</Link>
                        <span className="a2-xs a2-mute">
                          {walletReason(w.reason)}
                          {w.orderNumber ? ` · ${t(d, 'cus.loy.wallet.order', { n: w.orderNumber })}` : ''} · {day.format(w.at)}
                        </span>
                      </span>
                      <span className={`a2-num loy-amt${w.direction === 'DEBIT' ? ' neg' : ''}`}>
                        {w.direction === 'DEBIT' ? '−' : '+'}
                        {money(w.amountMinor)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="a2-sm a2-mute a2-mt12">{t(d, 'cus.loy.wallet.none')}</p>
              )}
            </section>
          ) : null}
        </div>
        <div className="a2-stack">
          {rateOn && rate.pointsPer100 > 0 ? (
            <p className="a2-note" data-testid="loyalty-example">
              {t(d, 'cus.loy.example', { goods: money(200_000), earned: n(Math.floor((200_000 * rate.pointsPer100) / 10_000) + rate.orderPoints), points: n(rate.redeemPoints), worth: money(rate.redeemMinor), pct: new Intl.NumberFormat(view.locale, { maximumFractionDigits: 2, numberingSystem: 'latn' }).format(backPct ?? 0) })}
            </p>
          ) : null}
          <CrmSettingCard dict={cdict} settingKey="customers.points" card="points" fields={FIELDS} value={s.points as unknown as Record<string, unknown>} canWrite={s.canWrite} />
          {s.topEarners.length ? (
            <section className="a2-card" data-testid="loyalty-top">
              <h2 className="a2-h3">{t(d, 'cus.loy.top.title')}</h2>
              <ul className="loy-lines">
                {s.topEarners.map((e, i) => (
                  <li key={e.customerId} className="loy-line">
                    <span className="loy-who">
                      <Link href={`/admin/customers/${e.customerId}`}>
                        {i + 1}. {e.customerName ?? t(d, 'cus.loy.someone')}
                      </Link>
                    </span>
                    <span className="a2-num loy-amt">{t(d, 'cus.loy.top.pts', { n: n(e.points) })}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {s.topWallets?.length ? (
            <section className="a2-card" data-testid="loyalty-big-wallets">
              <h2 className="a2-h3">{t(d, 'cus.loy.bigWallets.title')}</h2>
              <ul className="loy-lines">
                {s.topWallets.map((w) => (
                  <li key={w.customerId} className="loy-line">
                    <span className="loy-who">
                      <Link href={`/admin/customers/${w.customerId}`}>{w.customerName ?? t(d, 'cus.loy.someone')}</Link>
                    </span>
                    <span className="a2-num loy-amt">{money(w.balanceMinor)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <section className="a2-card" data-testid="loyalty-adjustments">
            <div className="a2-between">
              <h2 className="a2-h3">{t(d, 'cus.loy.adj.title')}</h2>
              {s.canWrite ? <AdjustPoints dict={{ cus: d.cus as Dict }} /> : null}
            </div>
            {s.adjustments.length ? (
              <ul className="loy-lines">
                {s.adjustments.map((a) => (
                  <li key={a.id} className="loy-line">
                    <span className="loy-who">
                      <Link href={`/admin/customers/${a.customerId}`}>{a.customerName ?? t(d, 'cus.loy.someone')}</Link>
                      <span className="a2-xs a2-mute">
                        {a.note ?? t(d, 'cus.loy.points.other')} · {day.format(a.at)}
                      </span>
                    </span>
                    <span className={`a2-num loy-amt${a.points < 0 ? ' neg' : ''}`}>
                      {a.points > 0 ? '+' : ''}
                      {n(a.points)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="a2-sm a2-mute a2-mt12">{t(d, 'cus.loy.adj.none')}</p>
            )}
          </section>
          <section className="a2-card" data-testid="loyalty-apology">
            <h2 className="a2-h3">{t(d, 'cus.loy.apology.title')}</h2>
            <p className="a2-xs a2-mute a2-mt6">{t(d, s.apologyOn ? 'cus.loy.apology.on' : 'cus.loy.apology.off')}</p>
            <Link className="a2-btn a2-mt12" href="/admin/money/refunds">
              {t(d, 'cus.loy.apology.link')}
            </Link>
          </section>
          <p className="a2-xs a2-mute">{t(d, 'cus.loy.tiers')}</p>
        </div>
      </div>
    </div>
  );
}
