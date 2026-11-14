// PR 722 (admin prototype v5 parity, Home design A "Command"): the five cards the approved prototype has under the sales
// trend — "Do now" (Urgent / Today / This week, from the same waiting lists the sidebar badges and the To-do drawer
// count), "Products: what to do" (best sellers of the period with how many days their stock lasts), "Ads: are they
// paying?" (spend, delivered sales, sales per 1 of spend), "In short" (three plain sentences worked out from the same
// figures) and "Month target" (the monthly goal of Page settings, drawn only when it is on). Nothing here is added up
// again: every number is a figure the Dashboard loader already read, and a card whose figure the person may not read
// (`metrics.read`, `books.read`) is left out. No new setting: the goal and its amount stay where Page settings keep them.
import Link from 'next/link';
import { ShellIcon } from '@/components/admin/shell/ShellIcon';
import { nameIn } from '@/components/admin/products/model';
import { salesPerUnit } from '@/lib/admin-look/dashboard-data';
import type { ShellIconName } from '@/lib/admin-shell/icons';
import { Bar, Card, Empty, Lnk } from '../kit';
import { can, type DashProps } from './common';

/** Slow stock and set-up lists are "This week"; bad-tone lists are "Urgent"; the rest is "Today" (the same split as design B). */
const WEEK_LISTS: ReadonlySet<string> = new Set(['lowStock', 'countsReview', 'launch', 'agentFixes', 'erpKeptAtSwitch', 'ordersTwoSizes']);

function DoNow({ p }: { p: DashProps }) {
  const { f, data } = p;
  const q = data.queues ?? [];
  const groups = (['urgent', 'today', 'week'] as const)
    .map((g) => ({ g, rows: q.filter((r) => (r.def.tone === 'bad' ? 'urgent' : WEEK_LISTS.has(r.id) ? 'week' : 'today') === g) }))
    .filter((x) => x.rows.length > 0);
  const total = q.reduce((n, r) => n + r.n, 0);
  return (
    <Card title={f.t('dsh.proto.doNow')} sub={groups.length ? f.t('dsh.proto.doSub', { n: f.n(total) }) : undefined} testId="dash-donow">
      {groups.length ? (
        groups.map((x) => (
          <div key={x.g} data-testid={`dash-donow-${x.g}`}>
            <p className="a3-cap">{f.t(`dsh.lm.grp${x.g === 'urgent' ? 'Urgent' : x.g === 'today' ? 'Today' : 'Week'}`)}</p>
            {x.rows.map((r) => (
              <Link key={r.id} className="a3-prob" href={r.def.href}>
                <span className={`a3-pi ${r.def.tone === 'bad' ? 'bad' : r.def.tone === 'warn' ? 'gold' : 'mute'}`}>
                  <ShellIcon name={r.def.icon as ShellIconName} size={16} />
                </span>
                <span>
                  <b>{f.t(`dash.queue.${r.id}`)}</b>
                  <span>{r.oldest ? f.t('dash.queue.sub', { n: f.n(r.n), age: f.ago(r.oldest) }) : f.t('shell.nav.waiting', { n: f.n(r.n) })}</span>
                </span>
                <b className="a3-num">{f.n(r.n)}</b>
              </Link>
            ))}
          </div>
        ))
      ) : (
        <Empty text={f.t('dsh.prob.none')} />
      )}
    </Card>
  );
}

function ProductsToDo({ p }: { p: DashProps }) {
  const { f, data, s, viewer } = p;
  const top = data.top ?? [];
  const low = data.lowStock ?? [];
  return (
    <Card title={f.t('dsh.proto.prodTitle')} sub={f.t('dsh.proto.prodSub', { n: f.n(s.courierDays) })} right={can(viewer, 'catalogue.read') ? <Lnk href="/admin/products/ranking">{f.t('dsh.proto.prodLink')}</Lnk> : null} testId="dash-prodtodo">
      {top.length ? (
        top.map((r) => {
          // The days the product's stock lasts: its fastest-running size (the low-stock list's own figure); no size on that list = enough
          const days = low.filter((l) => l.productId === r.productId && l.daysLeft !== null).map((l) => l.daysLeft as number);
          const least = days.length ? Math.min(...days) : null;
          return (
            <div className="a3-prob" key={r.productId}>
              <span>
                <b>{nameIn(f.lang, { nameEn: r.nameEn, nameBn: r.nameBn })}</b>
                <span>{f.t('dsh.proto.prodSold', { n: f.n(r.units), v: f.money(r.valueMinor) })}</span>
              </span>
              <span className={`a2-pill ${least !== null ? 'warn' : 'ok'}`}>{least !== null ? f.t('dsh.proto.daysLeft', { n: f.n(least) }) : f.t('dsh.proto.stockOk')}</span>
            </div>
          );
        })
      ) : (
        <Empty text={f.t('dsh.proto.prodNone')} />
      )}
    </Card>
  );
}

function AdsPaying({ p }: { p: DashProps }) {
  const { f, data, viewer } = p;
  const pf = data.profit;
  if (!pf) return null;
  const per = salesPerUnit(pf.cur.salesMinor, pf.cur.adsMinor);
  return (
    <Card title={f.t('dsh.lm.roasTitle')} sub={f.t('dsh.lm.roasSub')} right={can(viewer, 'marketing.campaigns.read') ? <Lnk href="/admin/marketing">{f.t('dsh.lm.roasMore')}</Lnk> : null} testId="dash-adspay">
      <div className="a3-tt" role="table" aria-label={f.t('dsh.lm.roasTitle')}>
        <div className="a3-prob" role="row">
          <span>
            <b>{f.t('dsh.lm.roasSpend')}</b>
          </span>
          <b className="a3-num">{pf.cur.adsMinor === null ? '—' : f.money(pf.cur.adsMinor)}</b>
        </div>
        <div className="a3-prob" role="row">
          <span>
            <b>{f.t('dsh.lm.roasSales')}</b>
          </span>
          <b className="a3-num">{f.money(pf.cur.salesMinor)}</b>
        </div>
        <div className="a3-prob" role="row">
          <span>
            <b>{f.t('dsh.proto.roas')}</b>
          </span>
          <b className="a3-num">{per === null ? '—' : `${per.toFixed(1)}x`}</b>
        </div>
      </div>
      {per === null ? <p className="a3-cap c">{f.t(pf.cur.adsMinor === null ? 'dsh.lm.roasUnknown' : 'dsh.lm.roasNone')}</p> : null}
    </Card>
  );
}

function InShort({ p }: { p: DashProps }) {
  const { f, data } = p;
  const lines: string[] = [];
  const m = data.money;
  if (m && m.prev.sales.itemsMinor > 0) {
    const ch = (m.cur.sales.itemsMinor - m.prev.sales.itemsMinor) / m.prev.sales.itemsMinor;
    lines.push(f.t(ch >= 0 ? 'dsh.proto.shortUp' : 'dsh.proto.shortDown', { pct: f.pct(Math.abs(ch), 0), n: f.n(data.range.days) }));
  }
  const pf = data.profit;
  if (pf && pf.cur.netMinor !== null && pf.cur.salesMinor > 0) lines.push(f.t('dsh.proto.shortKeep', { pct: f.pct(pf.cur.netMinor / pf.cur.salesMinor, 0) }));
  const best = data.top?.[0];
  if (best) lines.push(f.t('dsh.proto.shortBest', { name: nameIn(f.lang, { nameEn: best.nameEn, nameBn: best.nameBn }), v: f.money(best.valueMinor) }));
  return (
    <Card title={f.t('dsh.proto.shortTitle')} testId="dash-inshort">
      {lines.length ? (
        lines.map((l) => (
          <p className="a3-prob" key={l}>
            <ShellIcon name="info" size={15} />
            <span>{l}</span>
          </p>
        ))
      ) : (
        <Empty text={f.t('dsh.proto.shortNone')} />
      )}
    </Card>
  );
}

function MonthTarget({ p }: { p: DashProps }) {
  const { f, data } = p;
  const g = data.goal;
  if (!g) {
    return (
      <Card title={f.t('dsh.lm.goalOff')} testId="dash-monthtarget-off">
        <Empty title={f.t('dsh.lm.goalOffNone')} text={f.t('dsh.lm.goalOffText')} />
      </Card>
    );
  }
  const done = g.goalMinor > 0 ? g.salesMinor / g.goalMinor : 0;
  return (
    <Card title={f.t('dsh.lm.goalOff')} testId="dash-monthtarget">
      <p className="a3-cap">
        {f.t('dsh.proto.targetLine', { goal: f.money(g.goalMinor), pct: f.pct(done, 0) })}
      </p>
      <Bar p={done} />
      <p className="a3-cap c">{f.t('dsh.proto.targetSold', { sales: f.money(g.salesMinor), n: f.n(g.daysLeft) })}</p>
    </Card>
  );
}

/** The prototype's lower Home cards. Left out entirely when none of them has anything the person may read. */
export function ProtoCards(p: DashProps) {
  const { data, viewer } = p;
  const canMoney = can(viewer, 'metrics.read');
  const cards = [
    data.queues ? <DoNow key="do" p={p} /> : null,
    data.top ? <ProductsToDo key="prod" p={p} /> : null,
    data.profit ? <AdsPaying key="ads" p={p} /> : null,
    canMoney ? <InShort key="short" p={p} /> : null,
    canMoney ? <MonthTarget key="goal" p={p} /> : null,
  ].filter(Boolean);
  if (!cards.length) return null;
  return (
    <div className="a3-dg3 a3-proto" style={{ ['--n' as string]: Math.min(3, cards.length) }} data-testid="dash-proto">
      {cards}
    </div>
  );
}
