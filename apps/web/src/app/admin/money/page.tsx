// S16 · PR 342 — Money → Overview at /admin/money (BACKEND-ARCHITECTURE §5 MNY-01; B3.10): cash received in the last
// 24 hours, 7 and 30 days (and by method), the COD the couriers still owe (by courier) and the refunds owed to
// customers, from the shop's own records (lib/money-overview.ts). Read-only: approving or paying a refund is on Money ›
// Refunds & wallet (gate F-041) and is the owner's. Seeing it needs `payments.view`. Words: messages/admin-money.*.json (`moneyOverview.*`).
// PR 642 (CN-036): in the Lumen look — the three received windows are the summary tiles and the same 30 days of cash
// received, day by day in the shop's time zone, are the hero chart (7 days with the 7 before as a dashed line, or all
// 30). The root and the no-access state carry data-lm-ready (dark mode; the read-only smoke account sees the latter).
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MOTHER_STORE_ID } from '@extas/db/client';
import { AdminNotice } from '@/components/admin/AdminFrame';
import { HeroChart, type HeroRange } from '@/components/admin/lumen/HeroChart';
import { SummaryTiles, type SummaryTile } from '@/components/admin/lumen/SummaryTiles';
import { formatMoney, formatNumber, moneyOf } from '@/components/admin/products/model';
import { PageHead, SectionTabs, ShellState } from '@/components/admin/shell/ShellParts';
import { dateTime } from '@/components/admin/stock/text';
import { adminDeps } from '@/lib/admin-auth';
import { ADMIN_LOGIN } from '@/lib/admin-nav';
import { change } from '@/lib/admin-look/chart';
import type { CountFormat } from '@/lib/admin-lumen/model';
import { adminView, pageAccess, type AdminView } from '@/lib/admin-page';
import { locateKey } from '@/lib/admin-shell/sections';
import { t, type Dict } from '@/lib/i18n';
import { moneyOverview, type ReceivedDay } from '@/lib/money-overview';
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
      <div className="a2-z" data-testid="money-overview" data-lm-ready="">
        <ShellState view={view} kind="denied" permission="payments.view" />
      </div>
    );
  const d = view.dict;
  const c = (k: string, vars?: Record<string, string | number>) => t(d, `moneyOverview.${k}`, vars);
  const [o, currency] = await Promise.all([moneyOverview(access.deps.db, MOTHER_STORE_ID, new Date(), view.timeZone), access.deps.resolver.value('store.currency', { storeId: MOTHER_STORE_ID })]);
  const money = moneyOf(currency, view.locale);
  const amount = (minor: number) => formatMoney(minor, money);
  const fmt: CountFormat = { kind: 'money', locale: view.locale, currency, digits: money.digits };
  const tiles: SummaryTile[] = o.received.windows.map((w) => ({ key: w.key, label: c(`received.${w.key}`), value: w.minor, shown: amount(w.minor), format: fmt, vs: c('received.count', { n: w.count }), icon: 'wallet' }));
  const ranges = heroRanges(o.received.daily ?? [], view.locale, amount, 10 ** money.digits, c);

  return (
    <div className="a2-z" data-testid="money-overview" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={c('title')} sub={c('sub')} />
      <SectionTabs view={view} current={KEY} />
      <p className="a2-xs a2-mute a2-mt12">{c('asOf', { at: dateTime(o.at, view.locale, view.timeZone) })}</p>

      {ranges.length ? (
        <div className="a2-mt12 mo-hero">
          <HeroChart title={c('hero.title')} ranges={ranges} format={fmt} seriesName={c('hero.series')} prevName={c('hero.prev')} testId="mo-hero" />
        </div>
      ) : null}
      <div className="a2-mt12 mo-tiles">
        <SummaryTiles tiles={tiles} label={c('hero.tiles')} testId="mo-tiles" />
      </div>

      <section className="a2-card a2-mt12" aria-labelledby="mo-received" data-testid="mo-received">
        <div className="a2-ch">
          <div>
            <h2 className="a2-h3" id="mo-received">{c('received.title')}</h2>
            <div className="a2-cs">{c('received.sub')}</div>
          </div>
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

      {o.claims ? (
        <section className="a2-card a2-mt12" aria-labelledby="mo-claims" data-testid="mo-claims">
          <div className="a2-ch">
            <div>
              <h2 className="a2-h3" id="mo-claims">{c('claims.title')}</h2>
              <div className="a2-cs">{c('claims.sub')}</div>
            </div>
            <span className={`a2-pill ${o.claims.minor ? 'warn' : 'ok'}`}>{amount(o.claims.minor)}</span>
          </div>
          {o.claims.count ? (
            <>
              <p className="a2-xs a2-mute">
                {c('claims.count', { n: o.claims.count })}
                {o.claims.late ? ` · ${c('claims.late', { n: o.claims.late })}` : ''}
              </p>
              {o.claims.byCourier.map((k) => (
                <div key={k.courierId} className="a2-rule">
                  <Link href={`/admin/delivery/couriers/${k.courierId}?s=claims`}>{k.courier || c('cod.noCourier')}</Link>
                  <span className="a2-xs a2-mute">{c('claims.count', { n: k.count })}</span>
                  <b>{amount(k.minor)}</b>
                </div>
              ))}
            </>
          ) : (
            <p className="a2-xs a2-mute">{c('claims.none')}</p>
          )}
        </section>
      ) : null}

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
        <Link className="a2-btn sm a2-mt6" href="/admin/money/refunds" data-testid="mo-refunds-open">
          {c('refunds.open')}
        </Link>
      </section>
    </div>
  );
}

/** The hero chart's two ranges from the 30 days (oldest first): the last 7 with the 7 before as a dashed line, and all 30. */
type Say = (k: string, vars?: Record<string, string | number>) => string;
type Amount = (minor: number) => string;

function heroRanges(daily: readonly ReceivedDay[], locale: string, amount: Amount, unit: number, c: Say): HeroRange[] {
  if (!daily.length) return [];
  let dayFmt: Intl.DateTimeFormat;
  try {
    dayFmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC', numberingSystem: 'latn' });
  } catch {
    dayFmt = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  }
  const label = (day: string) => dayFmt.format(new Date(`${day}T12:00:00Z`));
  const sum = (xs: readonly ReceivedDay[]) => xs.reduce((s, x) => s + x.minor, 0);
  const count = (xs: readonly ReceivedDay[]) => xs.reduce((s, x) => s + x.count, 0);
  const range = (key: string, days: readonly ReceivedDay[], before: readonly ReceivedDay[]): HeroRange => {
    const total = sum(days);
    const prev = before.length === days.length ? before.map((x) => x.minor) : undefined;
    return {
      key,
      label: c(`hero.${key}`),
      total,
      shown: amount(total),
      ...(prev ? { delta: change(total, sum(before)), vs: c('hero.vs7', { amount: amount(sum(before)) }), prev } : {}),
      points: days.map((x, i) => ({ label: label(x.day), value: x.minor, shown: amount(x.minor), ...(prev ? { prevShown: amount(prev[i] ?? 0) } : {}) })),
      mini: [
        { label: c('hero.payments'), shown: formatNumber(count(days), locale) },
        { label: c('hero.perDay'), shown: amount(Math.round(total / days.length / unit) * unit) },
      ],
    };
  };
  const last7 = daily.slice(-7);
  const before7 = daily.slice(-14, -7);
  return [range('r7', last7, before7), range('r30', daily, [])];
}
