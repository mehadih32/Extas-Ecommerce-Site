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
import { ProfitSnapshot, DecideToday, MonthSoFar, type DecideCard, type MonthRow, type SnapCol } from '@/components/admin/lane-f/MoneyParts';
import { withLaneF } from '@/lib/admin-lane-f';
import * as inv from '@extas/inventory';
import { inventoryDeps } from '@/lib/inventory-api';
import { BooksMatch, CashForecast, CourierMoney, MoneyTiles, Rich, type NowTile } from '@/components/admin/lane-f/MoneyNow';
import { PrintButton } from '@/components/admin/reports/PrintButton';
import { loadMoneyNow } from '@/lib/lane-f/money-now';
import { moneyOf as plainMoney } from '@/lib/lane-f/format';
import { deltaPct } from '@/components/admin/lane-f/Parts';
import { previousPeriod, resolvePeriod, type PeriodKey } from '@/lib/lane-f/period';
import { dayIn, moneyOverview, type ReceivedDay } from '@/lib/money-overview';
import { profitReport } from '@/lib/profit-report';
import bn from '../../../../messages/admin-money.bn.json';
import en from '../../../../messages/admin-money.en.json';
import './money.css';
import '../reports/delivery/report.css';

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

export default async function MoneyOverviewPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const deps = adminDeps();
  const [plain, access, sp] = await Promise.all([adminView(deps), pageAccess('payments.view', deps, MOTHER_STORE_ID), props.searchParams]);
  // PR 910: the prototype's Finance overview has none of the older cash cards; they stay one click away (?more=1), nothing is removed
  const showMore = sp.more === '1';
  const view = withLaneF(withScreen(plain));
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
  const f = (k: string, vars?: Record<string, string | number>) => t(d, `lf.fn.${k}`, vars);
  const [adTarget, todaySet] = await Promise.all([access.deps.resolver.value('costs.adShareTarget', { storeId: MOTHER_STORE_ID }), access.deps.resolver.value('admin.today', { storeId: MOTHER_STORE_ID })]);
  const money = moneyOf(currency, view.locale);
  const amount = (minor: number) => formatMoney(minor, money);
  const fmt: CountFormat = { kind: 'money', locale: view.locale, currency, digits: money.digits };
  const tiles: SummaryTile[] = o.received.windows.map((w) => ({ key: w.key, label: c(`received.${w.key}`), value: w.minor, shown: amount(w.minor), format: fmt, vs: c('received.count', { n: w.count }), icon: 'wallet' }));
  // prototype v5: the profit snapshot (today, 7 days, this month, each against the period before) and Decide today
  const today = dayIn(new Date(), view.timeZone);
  const snapKeys: { key: PeriodKey; id: 'today' | '7d' | 'month' }[] = [{ key: 'today', id: 'today' }, { key: '7d', id: '7d' }, { key: 'month', id: 'month' }];
  let monthRep: Awaited<ReturnType<typeof profitReport>> | null = null;
  let monthFrom = '';
  let monthTo = '';
  const snapRows = await Promise.all(
    snapKeys.map(async ({ key, id }) => {
      const cur = resolvePeriod(key, today);
      const prev = previousPeriod(cur.from, cur.to);
      const [a, b] = await Promise.all([profitReport(access.deps, MOTHER_STORE_ID, cur.from, cur.to), profitReport(access.deps, MOTHER_STORE_ID, prev.from, prev.to)]);
      if (id === 'month') {
        // eslint-disable-next-line react-hooks/immutability -- server render: a local result of this one request
        monthRep = a;
        monthFrom = cur.from;
        monthTo = cur.to;
      }
      const net = a.netProfitMinor; // null while a cost is not known: shown as a dash, never as 0
      const cost = net === null ? 0 : Math.max(0, a.salesMinor - net);
      const costPct = net === null ? 0 : a.salesMinor > 0 ? Math.min(100, Math.max(0, (cost / a.salesMinor) * 100)) : net < 0 ? 100 : 0; // hardcode-ok: percent
      const col: SnapCol = {
        key: id,
        label: f(`sn.${id}`),
        vs: f(`sn.vs${id === '7d' ? '7d' : id === 'today' ? 'Today' : 'Month'}`),
        href: `/admin/money/profit?from=${cur.from}&to=${cur.to}`,
        netShown: net === null ? '—' : `${net < 0 ? '−' : ''}${amount(Math.abs(net))}`,
        negative: net !== null && net < 0,
        delta: deltaPct(net, b.netProfitMinor),
        salesShown: amount(a.salesMinor),
        costShown: amount(cost),
        costPct,
      };
      return col;
    }),
  );
  const decide: DecideCard[] = [];
  const topCod = [...o.cod.byCourier].sort((x, y) => y.minor - x.minor)[0];
  if (topCod && topCod.minor > 0) decide.push({ key: 'cod', tone: (o.cod.oldestDays ?? 0) >= 3 ? 'warn' : 'ok', head: f('dec.codHead', { courier: topCod.courier ?? c('cod.noCourier'), amt: amount(topCod.minor) }), text: f('dec.codText', { n: topCod.parcels, days: o.cod.oldestDays ?? 0 }), action: { label: f('dec.codBtn'), href: '/admin/delivery/couriers' } });
  if (o.refunds.waiting) decide.push({ key: 'refunds', tone: 'warn', head: f('dec.refHead', { n: o.refunds.waiting }), text: f('dec.refText', { amt: amount(o.refunds.waitingMinor) }), action: { label: f('dec.refBtn'), href: '/admin/money/refunds' } });
  if (o.claims?.late) decide.push({ key: 'claims', tone: 'bad', head: f('dec.claimHead', { n: o.claims.late }), text: f('dec.claimText', { amt: amount(o.claims.minor) }), action: { label: f('dec.claimBtn'), href: '/admin/delivery/claims' } });
  // parity F4 · PR 849 (prototype Finance home): "N courier lines do not match", with the cash we are short in them
  const openLines = await access.deps.db.courierSettlementLine.findMany({
    where: { storeId: MOTHER_STORE_ID, matchState: { in: ['MISMATCH', 'LATE'] }, resolvedAt: null },
    select: { expectedMinor: true, codMinor: true },
    take: 5000, // hardcode-ok: a safety cap on one read; the count shown is the real one below
  });
  const openLineCount = await access.deps.db.courierSettlementLine.count({ where: { storeId: MOTHER_STORE_ID, matchState: { in: ['MISMATCH', 'LATE'] }, resolvedAt: null } });
  const shortMinor = openLines.reduce((a, l) => a + (l.expectedMinor !== null && l.expectedMinor > l.codMinor ? l.expectedMinor - l.codMinor : 0), 0); // hardcode-ok: zero fallback, not a business number
  if (openLineCount > 0) decide.push({ key: 'courierLines', tone: 'warn', head: f('dec.lineHead', { n: openLineCount }), text: f('dec.lineText', { amt: amount(shortMinor) }), action: { label: f('dec.lineBtn'), href: '/admin/delivery/couriers' } });
  // prototype v5 (PR 821): where the money is now, courier money, the cash forecast and the ERP match, from the real records
  const perms = access.guard.permissions;
  const who: inv.Who = { actor: access.guard.actor, storeId: MOTHER_STORE_ID, ctx: access.guard.ctx };
  const now = await loadMoneyNow({ db: access.deps.db, deps: await inventoryDeps(access.deps), who, money: o, can: { books: perms?.has('books.read') ?? false, erp: perms?.has('erp.account.read') ?? false }, locale: view.lang === 'bn' ? 'bn' : 'en' });
  const m = (k: string, vars?: Record<string, string | number>) => t(d, `lf.mn.${k}`, vars);
  const short = (minor: number) => plainMoney(minor, currency);
  const holdDays = now.erp?.daysSincePayment ?? null;
  const holdLeft = now.erp?.holdsInDays ?? null;
  const holdBar: ('u' | 'w' | 'x' | '')[] | undefined = holdDays !== null && holdLeft !== null ? Array.from({ length: Math.max(1, holdDays + holdLeft) }, (_, i) => (i < holdDays ? (i >= holdDays + holdLeft - Math.ceil((holdDays + holdLeft) / 6) ? 'x' : i >= (holdDays + holdLeft) / 2 ? 'w' : 'u') : '')) : undefined; // hardcode-ok: bar segments
  const nowTiles: NowTile[] = [
    { key: 'hand', label: m('hand'), value: now.inHandMinor === null ? '–' : short(now.inHandMinor), sub: now.inHandMinor === null ? m('handNone') : m('handSub'), href: '/admin/money/cash', mini: now.accounts?.map((a) => ({ label: a.name, shown: short(a.minor) })) },
    { key: 'couriers', label: m('couriers'), value: short(o.cod.minor), sub: o.cod.parcels ? m('couriersSub', { n: o.cod.parcels, d: o.cod.oldestDays ?? 0 }) : m('couriersNone'), tone: (o.cod.oldestDays ?? 0) > 4 ? 'warn' : undefined, href: '/admin/money/cash', mini: o.cod.byCourier.map((k) => ({ label: k.courier ?? c('cod.noCourier'), shown: short(k.minor) })) }, // hardcode-ok: parcel age that turns the tile orange
    {
      key: 'erp',
      label: m('erp'),
      value: now.erp ? short(now.erp.owedMinor) : '–',
      sub: !now.erp ? m('erpOff') : now.erp.onHold ? m('erpHold') : holdDays !== null && holdLeft !== null ? (now.erp.tone === 'good' ? m('erpPaid', { d: holdDays, left: holdLeft }) : m('erpLate', { d: holdDays, left: holdLeft })) : m('erpNoDate'),
      tone: now.erp && now.erp.tone !== 'good' ? now.erp.tone : undefined,
      href: '/admin/money/books',
      ...(holdBar ? { holdBar } : {}),
    },
    { key: 'wallets', label: m('wallets'), value: short(now.walletsMinor), sub: m('walletsSub', { n: now.walletHolders }), href: '/admin/money/refunds' },
  ];
  // PR 980 (prototype): "Pay the ERP … to stay safe" when the shop owes the ERP and the payment gap is not green
  // PR 1185 (prototype v5): the card shows whenever the shop owes the ERP, green while the payment gap is safe
  if (now.erp && now.erp.owedMinor > 0 && holdDays !== null && holdLeft !== null) decide.push({ key: 'erpPay', tone: now.erp.tone === 'bad' ? 'bad' : now.erp.tone === 'good' ? 'ok' : 'warn', head: f('dec.erpHead', { amt: short(now.erp.owedMinor) }), text: f('dec.erpText', { owed: short(now.erp.owedMinor), d: holdDays, left: holdLeft }), action: { label: f('dec.erpBtn'), href: '/admin/money/books' } });
  const claimsMinor = o.claims?.minor ?? 0;
  const payoutRows = now.payouts.map((p) => ({ id: p.id, label: `${p.courier} · ${m(`cm.st.${p.state}`)} · ${short(p.minor)}`, tone: 'info' as const }));
  const topCourier = o.claims?.byCourier[0]?.courierId ?? null;
  const fcDays = (now.forecast?.days ?? []).map((x) => ({ day: x.day, label: dayLabel(x.day, view.locale), inShown: short(x.inMinor), outShown: short(x.outMinor), balShown: short(x.balanceMinor), bal: x.balanceMinor, tight: now.forecast?.tightest?.day === x.day }));
  const fcTight = now.forecast?.tightest ?? null;
  const fcIn = (now.forecast?.days ?? []).reduce((n, x) => n + x.inMinor, 0);
  const fcOut = (now.forecast?.days ?? []).reduce((n, x) => n + x.outMinor, 0);
  const fcStart = now.inHandMinor ?? 0;
  const books = now.erp;
  const mr = monthRep as Awaited<ReturnType<typeof profitReport>> | null;
  const msSales = mr?.salesMinor ?? 0;
  const msPct = (n: number) => (msSales > 0 ? (Math.abs(n) / msSales) * 100 : 0); // hardcode-ok: percent of sales for a bar length
  const msRow = (key: string, label: string, n: number, kind: MonthRow['kind']): MonthRow => ({ key, label, shown: `${kind === 'out' && n ? '−' : ''}${short(Math.abs(n))}`, pct: msPct(n), kind });
  const msFixed = mr?.fixedMinor ?? 0;
  const msAds = mr?.adsMinor ?? 0;
  const msNet = mr?.netProfitMinor ?? null;
  const monthRows: MonthRow[] = mr
    ? [
        msRow('sales', f('ms.sales'), msSales, 'in'),
        msRow('productCost', f('ms.productCost'), mr.parts.productCost, 'out'),
        msRow('courier', f('ms.courier'), mr.parts.courier, 'out'),
        msRow('packing', f('ms.packing'), mr.parts.packaging + mr.parts.paymentFees, 'out'),
        msRow('returns', f('ms.returns'), mr.parts.returnLoss, 'out'),
        msRow('ads', f('ms.ads'), msAds, 'out'),
        msRow('fixed', f('ms.fixed'), msFixed, 'out'),
        msRow('other', f('ms.other'), mr.otherCostsMinor, 'out'),
        { key: 'net', label: f('ms.net'), shown: msNet === null ? '—' : `${msNet < 0 ? '−' : ''}${short(Math.abs(msNet))}`, pct: msNet === null ? 0 : msPct(msNet), kind: 'net' },
      ]
    : [];
  // ads over the owner's own target (empty setting = no card), and how much of this month's fixed costs the sales so far cover
  const adPct = msSales > 0 ? (msAds / msSales) * 100 : 0; // hardcode-ok: percent of sales
  // PR 1185 (prototype v5): the ads card shows on both sides of the owner's target (over: orange, inside: green with the room left)
  if (typeof adTarget === 'number' && msSales > 0) {
    const over = adPct > adTarget;
    const room = Math.max(0, Math.round((msSales * adTarget) / 100 - msAds)); // hardcode-ok: percent of sales
    decide.push({ key: 'adShare', tone: over ? 'warn' : 'ok', head: f('dec.adHead', { pct: adPct.toFixed(1) }), text: over ? f('dec.adText', { target: adTarget, ads: short(msAds) }) : f('dec.adGood', { target: adTarget, room: short(room) }), action: { label: f('dec.adBtn'), href: '/admin/marketing' } });
  }
  const fixedCoverPct = msFixed > 0 && msNet !== null ? Math.max(0, Math.round(((msNet + msFixed) / msFixed) * 100)) : null; // hardcode-ok: percent
  const goal = (todaySet as { goal?: { on: boolean; amountMinor: number } } | null)?.goal;
  const goalLine = goal && goal.on && goal.amountMinor > 0 ? f('ms.target', { target: short(goal.amountMinor) }) : ''; // hardcode-ok: percent
  const goalPct = goal && goal.on && goal.amountMinor > 0 ? Math.round((msSales / goal.amountMinor) * 100) : 0; // hardcode-ok: percent
  const dayNo = Number(today.slice(8, 10)) || 1; // hardcode-ok: day of month read from the date text
  const monthDays = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).getUTCDate(); // hardcode-ok: days in this month
  const monthTiles = mr ? [{ key: 'pace', label: f('ms.pace'), shown: short(Math.round((msSales / dayNo) * monthDays)) }, ...(fixedCoverPct === null ? [] : [{ key: 'fixedCovered', label: f('ms.fixedCovered'), shown: `${fixedCoverPct}%` }]), ...(goalLine ? [{ key: 'target', label: goalLine, shown: `${goalPct}%` }] : []), ...(msNet === null ? [] : [{ key: 'paceNet', label: f('ms.paceNet'), shown: short(Math.round((msNet / dayNo) * monthDays)) }])] : [];
  const ranges = heroRanges(o.received.daily ?? [], view.locale, amount, 10 ** money.digits, c);

  return (
    <div className="a2-z" data-testid="money-overview" data-lm-ready="">
      <PageHead view={view} place={locateKey(KEY)} title={t(d, 'lf.fn.title')} sub={t(d, 'lf.fn.asOf', { at: asOfShort(o.at, view.locale, view.timeZone) })}
        right={
          <>
            <Link className="a2-btn" href="/admin/money/budgets" data-testid="fn-targets">
              {m('act.targets')}
            </Link>
            <Link className="a2-btn" href="/admin/reports" data-testid="fn-bank">
              {m('act.bank')}
            </Link>
            <PrintButton label={m('act.dl')} testId="fn-dl" />
          </>
        }
      />
      <SectionTabs view={view} current={KEY} />

      <ProfitSnapshot
        cols={snapRows}
        texts={{ title: t(d, 'lf.fn.sn.title'), sub: t(d, 'lf.fn.sn.sub'), open: t(d, 'lf.fn.sn.open'), bar: t(d, 'lf.fn.sn.bar'), sales: t(d, 'lf.fn.sn.sales'), costs: t(d, 'lf.fn.sn.costs'), note: t(d, 'lf.fn.sn.note'), more: t(d, 'lf.fn.sn.more'), moreHref: '/admin/money/profit' }}
      />
      <MoneyTiles title={m('now')} tiles={nowTiles} />
      <CourierMoney
        texts={{ title: m('cm.title'), sub: m('cm.sub'), cod: m('cm.cod'), codSub: m('cm.codSub', { n: o.cod.parcels }), claims: m('cm.claims'), claimsSub: m('cm.claimsSub', { n: o.claims?.count ?? 0 }), payouts: m('cm.payouts'), noPayout: m('cm.noPayout'), c360: m('cm.c360'), account: m('cm.account'), match: m('cm.match') }}
        codShown={short(o.cod.minor)}
        claimsShown={short(claimsMinor)}
        claimsBad={claimsMinor > 0}
        payouts={payoutRows}
        links={{ c360: topCourier ? `/admin/delivery/couriers/${topCourier}` : '/admin/delivery/couriers', account: '/admin/money/couriers', match: '/admin/money/couriers' }}
      />
      <div className="lf-split">
        <MonthSoFar title={f('ms.title')} more={f('ms.more')} moreHref="/admin/money/profit" rows={monthRows} tiles={monthTiles} foot={f('ms.foot', { from: monthFrom.slice(8).replace(/^0/, ''), to: dayLabel(monthTo, view.locale) })} />
        <CashForecast
          texts={{ title: m('fc.title', { n: fcDays.length || '' }), series: m('fc.series'), tightest: m('fc.tight'), inWord: m('fc.in'), outWord: m('fc.out'), dayBy: m('fc.dayBy'), dayHead: m('fc.dayHead'), inHead: m('fc.inHead'), outHead: m('fc.outHead'), handHead: m('fc.handHead'), tightBadge: m('fc.badge'), fixed: m('fc.fixed'), none: m('fc.none'), start: m('fc.start') }}
          days={fcDays}
          tightLine={fcTight ? m('fc.tight', { day: dayLabel(fcTight.day, view.locale), amt: short(fcTight.balanceMinor) }) : null}
          tightBad={!!fcTight && fcTight.balanceMinor <= 0}
          inTotal={short(fcIn)}
          outTotal={short(fcOut)}
          startLine={m('fc.start', { amt: short(fcStart) })}
          fixedLine={now.forecast && now.forecast.fixedMinor > 0 ? m('fc.fixed', { amt: short(now.forecast.fixedMinor) }) : null}
        />
      </div>
      {showMore && ranges.length ? (
        <div className="a2-mt12 mo-hero">
          <HeroChart title={c('hero.title')} ranges={ranges} format={fmt} seriesName={c('hero.series')} prevName={c('hero.prev')} testId="mo-hero" />
        </div>
      ) : null}
      {showMore ? (
      <>
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
      </>
      ) : null}
      <DecideToday cards={decide} texts={{ title: t(d, 'lf.fn.dec.title'), sub: t(d, 'lf.fn.dec.sub'), none: t(d, 'lf.fn.dec.none') }} />
      {books ? (
        books.openLines > 0 || (books.erpSaysMinor !== null && books.erpSaysMinor !== books.owedMinor) ? (
          <BooksMatch title={m('bm.title')} tone="bad" action={{ label: m('bm.fix'), href: '/admin/money/books' }}>
            <Rich text={m('bm.bad', { ours: short(books.owedMinor), erp: short(books.erpSaysMinor ?? books.owedMinor), n: books.openLines })} />
          </BooksMatch>
        ) : (
          <BooksMatch title={m('bm.title')} tone="ok">
            <Rich text={m('bm.good', { amt: short(books.owedMinor) })} />
          </BooksMatch>
        )
      ) : (
        <BooksMatch title={m('bm.title')} tone="info">
          {m('bm.off')}
        </BooksMatch>
      )}
    </div>
  );
}

/** The hero chart's two ranges from the 30 days (oldest first): the last 7 with the 7 before as a dashed line, and all 30. */
type Say = (k: string, vars?: Record<string, string | number>) => string;
type Amount = (minor: number) => string;

function dayLabel(day: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC', numberingSystem: 'latn' }).format(new Date(`${day}T12:00:00Z`));
  } catch {
    return day;
  }
}

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

/** The page head's time as the prototype shows it: day, short month, 24-hour time ("12 Nov, 20:00"). */
function asOfShort(iso: string, locale: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(new Date(iso));
  } catch {
    return dateTime(iso, locale, timeZone);
  }
}
