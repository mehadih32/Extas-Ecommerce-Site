// S14 · PR 286 — one customer's page at /admin/customers/[id] (CUS-02, docs/BACKEND-ARCHITECTURE.md §5.5; demo V12.4
// #/admin/customers/:id): the person a profile belongs to, by phone — Overview (orders, Sales delivered-only beside
// Ordered value from @extas/metrics, CN-022; refusals with the shop's own mistakes apart; what his orders came to; his
// numbers with Copy and Call, each logged; his profiles; his latest orders), Orders (every order over every profile and
// number, a page at a time), Exchanges and Support (empty until S22). On the side: offers consent, his wallets (with
// `payments.view`), "Who looked at this customer" (with `audit.read`) and the note that the address lives only inside an
// order. A merged profile's address opens its survivor's page. "Merge with…" (with `customers.merge`) finds the other
// profile by phone and opens both side by side in To review. Reading needs `customers.read`; every open is logged.
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import * as cu from '@extas/customers';
import * as pay from '@extas/payments';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { sourceLabel } from '@/components/admin/customers/CustomerList';
import { MergeWith, PhoneButtons } from '@/components/admin/customers/CustomerTools';
import { initials } from '@/components/admin/customers/PairCard';
import { formatMoney, formatNumber, moneyOf, type Money } from '@/components/admin/products/model';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { adminDeps } from '@/lib/admin-auth';
import { withCustomers } from '@/lib/admin-customers/i18n';
import { lookWord } from '@/lib/admin-customers/words';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { customersDeps } from '@/lib/customers-api';
import { t, type Dict } from '@/lib/i18n';
import { paymentsDeps } from '@/lib/payments-api';

export const dynamic = 'force-dynamic';

const TABS = ['overview', 'orders', 'exchanges', 'support'] as const;
/** The logged actions' icons in "Who looked at this customer". */
const LOOK_ICON: Record<string, 'eye' | 'file' | 'phone'> = { 'profile.open': 'eye', 'phone.copy': 'file', 'phone.call': 'phone' };
type Tab = (typeof TABS)[number];

export async function generateMetadata(): Promise<Metadata> {
  const view = withCustomers(await adminView());
  return { title: `${t(view.dict, 'shell.tab.customers.all')} · ${t(view.dict, 'shell.admin')}`, robots: { index: false, follow: false } };
}

type Params = Promise<{ id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

function Card({ title, children, testId, right }: { title: string; children: React.ReactNode; testId?: string; right?: React.ReactNode }) {
  return (
    <section className="a2-card" data-testid={testId}>
      <div className="a2-ch">
        <h2 className="a2-h3">{title}</h2>
        {right}
      </div>
      <div className="a2-mt12">{children}</div>
    </section>
  );
}

function OrderLines({ view, rows, money, when, canOpen }: { view: AdminView; rows: cu.CustomerOrderRow[]; money: Money; when: Intl.DateTimeFormat; canOpen: boolean }) {
  const d = view.dict;
  if (!rows.length) return <p className="a2-sm a2-mute">{t(d, 'cus.profile.orders.none')}</p>;
  return (
    <div className="a2-lines" data-testid="cus-orders">
      {rows.map((o) => {
        const body = (
          <>
            <ShellIcon name="bag" size={18} />
            <div className="a2-prt">
              <b>
                {o.number} · {formatMoney(o.totalMinor, money)}
              </b>
              <span>{[when.format(o.placedAt), o.paymentMethod ? t(d, `orders.method.${o.paymentMethod}`) : null, o.profileId ? null : t(d, 'cus.profile.orders.guest')].filter(Boolean).join(' · ')}</span>
            </div>
            <span className={`a2-pill ${o.status === 'DELIVERED' ? 'ok' : o.status === 'RETURNED' || o.status === 'CANCELLED' ? 'bad' : 'line'}`}>{t(d, `orders.st.${o.status}`)}</span>
          </>
        );
        return canOpen ? (
          <Link key={o.id} className="a2-prow full" href={`/admin/orders/${o.id}`} data-testid="cus-order" aria-label={`${t(d, 'cus.profile.orders.open')} ${o.number}`}>
            {body}
          </Link>
        ) : (
          <div key={o.id} className="a2-prow full" data-testid="cus-order">
            {body}
          </div>
        );
      })}
    </div>
  );
}

export default async function CustomerPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const deps = adminDeps();
  const [{ id }, sp, plain, access] = await Promise.all([params, searchParams, adminView(deps), pageAccess('customers.read', deps, MOTHER_STORE_ID)]);
  const view = withCustomers(plain);
  const d = view.dict;
  const here = `/admin/customers/${encodeURIComponent(id)}`;
  if (access.kind === 'login' || access.kind === 'password') redirect(`${ADMIN_LOGIN}?next=${encodeURIComponent(here)}`);
  if (access.kind === 'unavailable') return <AdminNotice view={view} current="customer" text={t(d, 'page.noDb')} />;
  if (access.kind === 'forbidden')
    return (
      <div className="a2-z">
        <ShellState view={view} kind="denied" permission="customers.read" />
      </div>
    );
  const who: cu.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const cd = customersDeps(access.deps);
  const perms = access.guard.permissions ?? new Set<string>();
  // read first without the log: a merged profile's address opens its survivor's page (logged there, once)
  const sv = await cu.customerView(cd, who, id, { log: false });
  if (!sv)
    return (
      <div className="a2-z" data-testid="customer-missing">
        <PageHead view={view} place={locateKey('customer')} title={t(d, 'shell.tab.customers.all')} />
        <section className="a2-card a2-mt12">
          <p className="a2-sm">{t(d, 'cus.profile.notFound')}</p>
          <Link className="a2-btn a2-mt12" href="/admin/customers">
            {t(d, 'cus.profile.back')}
          </Link>
        </section>
      </div>
    );
  if (sv.redirectedFrom) redirect(`/admin/customers/${sv.id}?from=${encodeURIComponent(sv.redirectedFrom)}`);
  await cu.logAccess(access.deps.db, MOTHER_STORE_ID, sv.id, who.actor.staffUserId, 'profile.open');

  const tab: Tab = (TABS as readonly string[]).includes(one(sp.tab)) ? (one(sp.tab) as Tab) : 'overview';
  const page = Math.max(1, Math.trunc(Number(one(sp.page)) || 1));
  const from = one(sp.from);
  const canWallet = perms.has('payments.view');
  const profiles = [sv.customer, ...sv.members];
  // the owner's "0 lines" hides the "Who looked" card (the log itself is always written)
  const { accessLogShown } = (await access.deps.resolver.value('customers.profile', { storeId: MOTHER_STORE_ID })) as { accessLogShown: number };
  const [orders, exchanges, support, looks, wallets, currency] = await Promise.all([
    cu.customerOrders(cd, who, sv.id, tab === 'orders' ? { page } : {}),
    tab === 'overview' || tab === 'exchanges' ? cu.customerExchanges(cd, who, sv.id) : Promise.resolve([]),
    tab === 'support' ? cu.customerSupport(cd, who, sv.id) : Promise.resolve([]),
    sv.viewer.audit && accessLogShown > 0 ? cu.customerLooks(cd, who, sv.id) : Promise.resolve(null),
    canWallet
      ? paymentsDeps(access.deps).then((pd) => Promise.all(profiles.map((p) => pay.walletOf(pd, { ...who }, p.id, { limit: 1 }).then((w) => ({ p, w }))))) // hardcode-ok: only the balance is shown, so the fewest ledger lines are read
      : Promise.resolve(null),
    access.deps.resolver.value('store.currency', { storeId: MOTHER_STORE_ID }) as Promise<string>,
  ]);
  const money = moneyOf(currency, view.locale);
  const when = new Intl.DateTimeFormat(view.locale, { timeZone: view.timeZone, numberingSystem: 'latn', dateStyle: 'medium' });
  const stamp = new Intl.DateTimeFormat(view.locale, { timeZone: view.timeZone, numberingSystem: 'latn', dateStyle: 'medium', timeStyle: 'short' });
  const n = (x: number) => formatNumber(x, view.locale);
  const cdict: Dict = { cus: d.cus as Dict };
  const c = sv.customer;
  const h = sv.history;
  const name = c.name ?? t(d, 'cus.side.noName');
  const phoneText = c.phone?.text ?? t(d, 'cus.side.noPhone');
  const sub = c.firstSource
    ? t(d, 'cus.profile.subSource', { phone: phoneText, source: sourceLabel(view, c.firstSource), since: when.format(c.createdAt) })
    : t(d, 'cus.profile.sub', { phone: phoneText, since: when.format(c.createdAt) });
  const mergedFrom = from ? profiles.find((p) => p.id === from) : null;
  const tabHref = (x: Tab) => (x === 'overview' ? here : `${here}?tab=${x}`);
  const yesNo = (v: boolean | null) => t(d, `cus.profile.consent.${v === null ? 'unknown' : v ? 'yes' : 'no'}`);

  const kpis = (
    <div className="a2-kpis" data-testid="cus-profile-kpis">
      <div className="a2-card a2-kpi" data-testid="cus-kpi-orders">
        <div className="a2-kl">{t(d, 'cus.profile.kpi.orders')}</div>
        <div className="a2-kv">{n(sv.kpi.ordered.orders)}</div>
        <div className="a2-kf">
          <span className="a2-kn">{t(d, 'cus.profile.kpi.ordersNote', { n: n(h.delivered) })}</span>
        </div>
      </div>
      <div className="a2-card a2-kpi" data-testid="cus-kpi-sales">
        <div className="a2-kl">{t(d, 'cus.profile.kpi.sales')}</div>
        <b className="a2-kv">{formatMoney(sv.kpi.sales.valueMinor, money)}</b>
        <div className="a2-kf">
          <span className="a2-kn">{t(d, 'cus.profile.kpi.salesNote')}</span>
        </div>
      </div>
      <div className="a2-card a2-kpi" data-testid="cus-kpi-ordered">
        <div className="a2-kl">{t(d, 'cus.profile.kpi.ordered')}</div>
        <b className="a2-kv">{formatMoney(sv.kpi.ordered.valueMinor, money)}</b>
        <div className="a2-kf">
          <span className="a2-kn">{t(d, 'cus.profile.kpi.orderedNote')}</span>
        </div>
      </div>
      <div className="a2-card a2-kpi" data-testid="cus-kpi-refused">
        <div className="a2-kl">{t(d, 'cus.profile.kpi.refused')}</div>
        <div className="a2-kv">{n(h.refused)}</div>
        <div className="a2-kf">
          <span className="a2-kn">{h.ourFault ? t(d, 'cus.profile.kpi.refusedNote', { n: n(h.ourFault) }) : t(d, 'cus.profile.kpi.refusedNoteNone')}</span>
        </div>
      </div>
    </div>
  );

  const hist = (
    <Card title={t(d, 'cus.profile.hist.title')} testId="cus-history">
      <div className="a2-hist">
        {(['orders', 'delivered', 'refused', 'ourFault', 'cancelled', 'returns', 'open', 'noAnswer'] as const).map((k) => (
          <div key={k}>
            <b>{n(h[k])}</b>
            <span>{t(d, `cus.profile.hist.${k}`)}</span>
          </div>
        ))}
      </div>
    </Card>
  );

  const numbers = (
    <Card title={t(d, 'cus.profile.numbers.title')} testId="cus-numbers">
      {sv.numbers.map((p, i) => (
        <div key={`${p.text}-${i}`} className="a2-prow wrap">
          <ShellIcon name="phone" size={16} />
          <div className="a2-prt">
            <b className="a2-mono">{p.text}</b>
            {i === 0 ? <span>{t(d, 'cus.profile.numbers.own')}</span> : null}
          </div>
          {p.dial ? <PhoneButtons dict={cdict} customerId={sv.id} dial={p.dial} /> : null}
        </div>
      ))}
      {!sv.viewer.fullPhone ? <p className="a2-xs a2-mute a2-mt6">{t(d, 'cus.profile.numbers.masked')}</p> : null}
    </Card>
  );

  const profileCard = sv.members.length ? (
    <Card title={t(d, 'cus.profile.profiles.title')} testId="cus-profiles">
      {profiles.map((p, i) => {
        const mergedAt = i === 0 ? null : (sv.members[i - 1]?.mergedAt ?? null);
        return (
        <div key={p.id} className="a2-prow full">
          <span className={`a2-av${i === 0 ? ' g' : ''}`} aria-hidden="true">
            {initials(p.name)}
          </span>
          <div className="a2-prt">
            <b>{p.name ?? t(d, 'cus.side.noName')}</b>
            <span>{[p.phone?.text, i === 0 ? t(d, 'cus.profile.profiles.main') : mergedAt ? t(d, 'cus.profile.profiles.mergedAt', { at: when.format(mergedAt) }) : null, p.hasLogin ? t(d, 'cus.profile.profiles.login') : null].filter(Boolean).join(' · ')}</span>
          </div>
        </div>
        );
      })}
      <Link className="a2-xs a2-mt6 a2-blk" href="/admin/customers/review?view=done">
        {t(d, 'cus.profile.profiles.review')}
      </Link>
    </Card>
  ) : null;

  const orderCard = (all: boolean) => (
    <Card
      title={t(d, 'cus.profile.orders.title')}
      testId="cus-orders-card"
      right={
        !all && orders.total > orders.rows.length ? (
          <Link className="a2-btn sm" href={tabHref('orders')}>
            {t(d, 'cus.profile.orders.all', { n: n(orders.total) })}
          </Link>
        ) : null
      }
    >
      <OrderLines view={view} rows={orders.rows} money={money} when={when} canOpen={sv.viewer.orders} />
      {all && (orders.page > 1 || orders.hasMore) ? (
        <div className="a2-gap8 a2-mt12">
          {orders.page > 1 ? (
            <Link className="a2-btn sm" href={`${here}?tab=orders${orders.page > 2 ? `&page=${orders.page - 1}` : ''}`}>
              {t(d, 'cus.profile.orders.newer')}
            </Link>
          ) : null}
          {orders.hasMore ? (
            <Link className="a2-btn sm" href={`${here}?tab=orders&page=${orders.page + 1}`} data-testid="cus-orders-older">
              {t(d, 'cus.profile.orders.older')}
            </Link>
          ) : null}
        </div>
      ) : null}
    </Card>
  );

  const exchangeCard = (
    <Card title={t(d, 'cus.profile.exchanges.title')} testId="cus-exchanges">
      {exchanges.length ? (
        exchanges.map((x) => (
          <div key={x.id} className="a2-prow full">
            <ShellIcon name="uturn" size={16} />
            <div className="a2-prt">
              <b>
                {x.number}
                {x.order ? ` · ${x.order.number}` : ''}
              </b>
              <span>{`${when.format(x.createdAt)} · ${x.reason}`}</span>
            </div>
            <span className="a2-pill line">{t(d, `cus.profile.xst.${x.status}`)}</span>
          </div>
        ))
      ) : (
        <p className="a2-sm a2-mute">{t(d, 'cus.profile.exchanges.none')}</p>
      )}
    </Card>
  );

  const supportCard = (
    <Card title={t(d, 'cus.profile.support.title')} testId="cus-support">
      {support.length ? (
        support.map((s) => (
          <div key={`${s.kind}-${s.id}`} className="a2-prow full">
            <ShellIcon name={s.kind === 'ticket' ? 'flag' : 'msg'} size={16} />
            <div className="a2-prt">
              <b>{s.title}</b>
              <span>{`${t(d, `cus.profile.support.${s.kind}`)} · ${stamp.format(s.at)}`}</span>
            </div>
            <span className="a2-pill line">{s.status}</span>
          </div>
        ))
      ) : (
        <p className="a2-sm a2-mute">{t(d, 'cus.profile.support.none')}</p>
      )}
    </Card>
  );

  const side = (
    <>
      <Card title={t(d, 'cus.profile.consent.title')} testId="cus-consent">
        <div className="a2-rule">
          <span>{t(d, 'cus.profile.consent.sms')}</span>
          <b>{yesNo(c.consent.sms)}</b>
        </div>
        <div className="a2-rule">
          <span>{t(d, 'cus.profile.consent.whatsapp')}</span>
          <b>{yesNo(c.consent.whatsapp)}</b>
        </div>
        {c.codPolicy ? <p className="a2-xs a2-mt6">{t(d, 'cus.profile.cod', { v: c.codPolicy })}</p> : null}
      </Card>
      {wallets ? (
        <Card title={t(d, 'cus.profile.wallet.title')} testId="cus-wallet">
          {wallets.some((x) => x.w?.walletId) ? (
            wallets
              .filter((x) => x.w?.walletId)
              .map((x) => (
                <div key={x.p.id} className="a2-rule">
                  <span>{t(d, 'cus.profile.wallet.profile', { name: x.p.name ?? t(d, 'cus.side.noName') })}</span>
                  <b>{t(d, 'cus.profile.wallet.balance', { v: formatMoney(x.w!.balanceMinor, money) })}</b>
                </div>
              ))
          ) : (
            <p className="a2-sm a2-mute">{t(d, 'cus.profile.wallet.none')}</p>
          )}
        </Card>
      ) : null}
      {looks ? (
        <Card title={t(d, 'cus.profile.looks.title')} testId="cus-looks">
          {looks.length ? (
            looks.map((l, i) => (
              <div key={`${l.at.toISOString()}-${i}`} className="a2-prow full">
                <ShellIcon name={LOOK_ICON[l.action] ?? 'eye'} size={16} />
                <div className="a2-prt">
                  <b>{lookWord(d, l.action)}</b>
                  <span>{t(d, 'cus.profile.looks.line', { by: l.by ?? t(d, 'cus.profile.looks.system'), at: stamp.format(l.at) })}</span>
                </div>
              </div>
            ))
          ) : (
            <p className="a2-sm a2-mute">{t(d, 'cus.profile.looks.none')}</p>
          )}
        </Card>
      ) : null}
      <p className="a2-xs a2-mute">
        <ShellIcon name="lock" size={12} /> {t(d, 'cus.profile.address')}
      </p>
    </>
  );

  return (
    <div className="a2-z" data-testid="customer-page" data-customer={sv.id}>
      <PageHead
        view={view}
        place={locateKey('customer')}
        crumb={
          <Link href="/admin/customers">
            <ShellIcon name="cl" size={12} />
            {t(d, 'cus.profile.crumb')}
          </Link>
        }
        title={name}
        sub={sub}
        right={sv.viewer.merge ? <MergeWith dict={cdict} customerId={sv.id} /> : null}
      />
      <SectionTabs view={view} current="customer" />
      {mergedFrom ? (
        <div className="a2-band locked a2-mt12" data-testid="cus-merged-band">
          <ShellIcon name="info" size={16} />
          <span>{t(d, 'cus.profile.merged', { name })}</span>
        </div>
      ) : null}
      <nav className="a2-views a2-mt12" aria-label={t(d, 'cus.profile.tabsAria')} data-testid="cus-tabs">
        {TABS.map((x) => (
          <Link key={x} className={`a2-view${x === tab ? ' on' : ''}`} href={tabHref(x)} aria-current={x === tab ? 'page' : undefined} scroll={false} data-tab={x}>
            {t(d, `cus.profile.tab.${x}`)}
          </Link>
        ))}
      </nav>
      <div className="a2-dgrid a2-mt12">
        <div className="a2-dmain a2-stack">
          {tab === 'overview' ? (
            <>
              {kpis}
              {hist}
              {numbers}
              {profileCard}
              {orderCard(false)}
              {exchanges.length ? exchangeCard : null}
            </>
          ) : tab === 'orders' ? (
            orderCard(true)
          ) : tab === 'exchanges' ? (
            exchangeCard
          ) : (
            supportCard
          )}
        </div>
        <div className="a2-dside a2-stack">{side}</div>
      </div>
    </div>
  );
}
