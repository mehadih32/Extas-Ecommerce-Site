'use client';
// S28 · PR 689 (admin prototype v5) — Reports › Report library: the shared period bar (with compare), one card per question
// (value and change against the period before, pin to Home), the restock and unsold lists, orders by weekday and hour with the
// discount given, last month's review in a few lines made from the numbers, and saved views. Words: messages/admin-reports-
// library.*.json (`reportsLibrary.*`). Read-only reports: nothing here moves money.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import type { LibraryCard, ReviewFacts } from '@/lib/report-library-api';
import { t, type Dict } from '@/lib/i18n';
import { call } from '../api';
import { showToast } from '../lumen/Toast';
import { formatMoney, type Money } from '../products/model';

const PRESETS = ['today', 'last7', 'last30', 'month', 'lastmonth'] as const;
type Preset = (typeof PRESETS)[number];

interface Row {
  productId: string;
  name: string;
  sold30: number;
  sizesInStock: number;
  sizesTotal: number;
  stockDays: number | null;
}

export interface LibraryScreenProps {
  dict: Dict;
  money: Money;
  preset: Preset;
  compare: boolean;
  range: { from: string; to: string };
  cards: LibraryCard[];
  restock: { restock: Row[]; unsold: Row[] };
  time: { weekday: number[]; hour: number[]; orders: number; discountMinor: number; couponOrders: number };
  review: ReviewFacts;
  views: { id: string; name: string; params: { preset: Preset; compare: boolean } }[];
  pins: string[];
}

type Say = (k: string, vars?: Record<string, string | number>) => string;

export function LibraryScreen(p: LibraryScreenProps) {
  const id = useId();
  const router = useRouter();
  const c: Say = (k, vars) => t(p.dict, `reportsLibrary.${k}`, vars);
  const m = (minor: number) => formatMoney(minor, p.money);
  const [name, setName] = useState('');
  const [said, setSaid] = useState<string | null>(null);
  const go = (preset: string, compare: boolean) => router.push(`?preset=${preset}${compare ? '&compare=1' : ''}`);
  const err = (status: number, error?: string) => (status === 403 ? c('err.forbidden') : c(`err.${['INVALID_INPUT', 'CONFLICT'].includes(error ?? '') ? error : 'other'}`));

  async function pin(cardId: string, pinned: boolean) {
    const a = await call('POST', '/api/admin/reports/library', { action: 'pin', cardId, pinned });
    if (a.status === 200) {
      showToast({ text: pinned ? c('pinnedToast') : c('unpinnedToast'), tone: 'ok' });
      return router.refresh();
    }
    setSaid(err(a.status, (a.data as { error?: string }).error));
  }
  async function saveView() {
    const a = await call('POST', '/api/admin/reports/library', { action: 'save-view', reportKey: 'library', name, params: { preset: p.preset, compare: p.compare, filters: {} } });
    if (a.status === 201) {
      showToast({ text: c('saved'), tone: 'ok' });
      setName('');
      setSaid(null);
      return router.refresh();
    }
    setSaid(err(a.status, (a.data as { error?: string }).error));
  }
  async function archive(viewId: string) {
    const a = await call('POST', '/api/admin/reports/library', { action: 'archive-view', id: viewId });
    if (a.status === 200) {
      showToast({ text: c('archived'), tone: 'ok' });
      return router.refresh();
    }
    setSaid(err(a.status, (a.data as { error?: string }).error));
  }

  const value = (k: LibraryCard) => (k.now === null ? c('unknown') : k.kind === 'money' ? m(k.now) : k.id === 'restock' || k.id === 'unsold' ? c('unitStyles', { n: k.now }) : String(k.now));
  const delta = (k: LibraryCard) => {
    if (!p.compare || k.change === null) return null;
    return <span className={`a2-xs ${k.change >= 0 ? 'w4-pos' : 'w4-neg'}`}>{k.change >= 0 ? c('changeUp', { pct: k.change }) : c('changeDown', { pct: Math.abs(k.change) })}</span>;
  };
  const cardView = (k: LibraryCard) => {
    const pinned = p.pins.includes(k.id);
    return (
      <div key={k.id} className="w4-kpi" data-testid={`lib-${k.id}`}>
        <span className="a2-xs a2-mute">{c(`cards.${k.id}`)}</span>
        <b>{value(k)}</b>
        {delta(k)}
        <button type="button" className={`a2-btn sm${pinned ? ' pri' : ''}`} aria-pressed={pinned} onClick={() => pin(k.id, !pinned)} data-testid={`lib-pin-${k.id}`}>
          {pinned ? c('unpin') : c('pin')}
        </button>
      </div>
    );
  };
  const pinnedCards = p.cards.filter((k) => p.pins.includes(k.id));
  const peakWeekday = Math.max(1, ...p.time.weekday);
  const peakHour = Math.max(1, ...p.time.hour);
  const r = p.review;
  const dir = (pct: number) => (pct >= 0 ? c('review.more') : c('review.less'));
  const lines: string[] = [];
  if (r.orders === 0) lines.push(c('review.none'));
  else {
    lines.push(r.salesChange === null ? c('review.salesNoPrev', { amount: m(r.salesMinor) }) : c('review.sales', { amount: m(r.salesMinor), pct: Math.abs(r.salesChange), dir: dir(r.salesChange) }));
    lines.push(
      r.netProfitMinor === null
        ? c('review.profitUnknown')
        : r.profitChange === null
          ? c('review.profitNoPrev', { amount: m(r.netProfitMinor) })
          : c('review.profit', { amount: m(r.netProfitMinor), pct: Math.abs(r.profitChange), dir: dir(r.profitChange) }),
    );
    lines.push(c('review.orders', { n: r.orders }));
    if (r.busiestWeekday !== null) lines.push(c('review.busiest', { day: c(`time.days.${r.busiestWeekday}`) }));
  }
  if (r.restockStyles > 0) lines.push(c('review.restock', { n: r.restockStyles }));

  return (
    <div className="w4-stack" data-testid="library-screen">
      <section className="a2-card" aria-labelledby={`${id}-per`}>
        <h2 className="a2-h3" id={`${id}-per`}>
          {c('period.label')}
        </h2>
        <div className="w4-row a2-mt12">
          {PRESETS.map((x) => (
            <button key={x} type="button" className={`a2-btn sm${p.preset === x ? ' pri' : ''}`} aria-pressed={p.preset === x} onClick={() => go(x, p.compare)} data-testid={`lib-period-${x}`}>
              {c(`period.${x}`)}
            </button>
          ))}
          <label className="a2-sm">
            <input type="checkbox" checked={p.compare} onChange={(e) => go(p.preset, e.target.checked)} data-testid="lib-compare" /> {c('period.compare')}
          </label>
        </div>
        <p className="a2-xs a2-mute a2-mt6">{c('period.range', p.range)}</p>
      </section>

      {pinnedCards.length ? (
        <section className="a2-card" data-testid="lib-pinned">
          <h2 className="a2-h3">{c('pinned')}</h2>
          <div className="w4-kpis a2-mt12">{pinnedCards.map(cardView)}</div>
        </section>
      ) : null}

      {(['sales', 'products'] as const).map((g) => (
        <section key={g} className="a2-card">
          <h2 className="a2-h3">{c(`groups.${g}`)}</h2>
          <div className="w4-kpis a2-mt12">{p.cards.filter((k) => k.group === g).map(cardView)}</div>
        </section>
      ))}

      <section className="a2-card" aria-labelledby={`${id}-rs`} data-testid="lib-restock">
        <h2 className="a2-h3" id={`${id}-rs`}>
          {c('restock.title')}
        </h2>
        <p className="a2-cs">{c('restock.sub')}</p>
        <RestockTable rows={p.restock.restock} c={c} empty={c('restock.none')} />
        <h3 className="a2-h4 a2-mt12">{c('restock.unsoldTitle')}</h3>
        <p className="a2-cs">{c('restock.unsoldSub')}</p>
        <RestockTable rows={p.restock.unsold} c={c} empty={c('restock.noneUnsold')} />
      </section>

      <section className="a2-card" aria-labelledby={`${id}-tm`} data-testid="lib-time">
        <h2 className="a2-h3" id={`${id}-tm`}>
          {c('time.title')}
        </h2>
        <p className="a2-cs">{c('time.sub')}</p>
        <h3 className="a2-h4 a2-mt12">{c('time.weekday')}</h3>
        <div className="w4-bars" role="img" aria-label={c('time.weekday')}>
          {p.time.weekday.map((n, i) => (
            <div key={i} className="w4-barcol">
              <i style={{ height: `${Math.round((n / peakWeekday) * 100)}%` }} />
              <span className="a2-xs">{c(`time.days.${i}`)}</span>
              <span className="a2-xs a2-mute">{n}</span>
            </div>
          ))}
        </div>
        <h3 className="a2-h4 a2-mt12">{c('time.hour')}</h3>
        <div className="w4-bars w4-bars24" role="img" aria-label={c('time.hour')}>
          {p.time.hour.map((n, i) => (
            <div key={i} className="w4-barcol">
              <i style={{ height: `${Math.round((n / peakHour) * 100)}%` }} />
              <span className="a2-xs">{i}</span>
            </div>
          ))}
        </div>
        <p className="a2-sm a2-mt12">
          {c('time.discount')}: <b>{m(p.time.discountMinor)}</b> · {c('time.coupons', { n: p.time.couponOrders })}
        </p>
      </section>

      <section className="a2-card" aria-labelledby={`${id}-rv`} data-testid="lib-review">
        <h2 className="a2-h3" id={`${id}-rv`}>
          {c('review.title')}
        </h2>
        <p className="a2-cs">{c('review.sub', { from: r.from, to: r.to })}</p>
        <ul className="w4-list a2-mt6">
          {lines.map((l, i) => (
            <li key={i} className="w4-li">
              {l}
            </li>
          ))}
        </ul>
      </section>

      <section className="a2-card" aria-labelledby={`${id}-vw`} data-testid="lib-views">
        <h2 className="a2-h3" id={`${id}-vw`}>
          {c('views.title')}
        </h2>
        <p className="a2-cs">{c('views.sub')}</p>
        <div className="w4-row a2-mt12">
          <input className="a2-inp" value={name} maxLength={60} placeholder={c('views.name')} aria-label={c('views.name')} onChange={(e) => setName(e.target.value)} data-testid="lib-view-name" />
          <button type="button" className="a2-btn pri" disabled={!name.trim()} onClick={saveView} data-testid="lib-view-save">
            {c('views.save')}
          </button>
        </div>
        {said ? (
          <p className="a2-sm bk-warn a2-mt6" role="alert">
            {said}
          </p>
        ) : null}
        {p.views.length ? (
          <ul className="w4-list a2-mt6">
            {p.views.map((v) => (
              <li key={v.id} className="w4-li">
                <span className="w4-grow">
                  <b>{v.name}</b>
                  <span className="a2-xs a2-mute">{c(`period.${v.params.preset}`)}</span>
                </span>
                <button type="button" className="a2-btn sm" onClick={() => go(v.params.preset, v.params.compare)}>
                  {c('views.open')}
                </button>
                <button type="button" className="a2-btn sm" onClick={() => archive(v.id)}>
                  {c('views.archive')}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="a2-cs a2-mt6">{c('views.empty')}</p>
        )}
      </section>
    </div>
  );
}

function RestockTable({ rows, c, empty }: { rows: Row[]; c: Say; empty: string }) {
  if (!rows.length) return <p className="a2-cs a2-mt6">{empty}</p>;
  return (
    <div className="a2-tblw a2-mt6">
      <table className="a2-tbl">
        <thead>
          <tr>
            <th>{c('restock.style')}</th>
            <th className="w4-r">{c('restock.sizes')}</th>
            <th className="w4-r">{c('restock.days')}</th>
            <th className="w4-r">{c('restock.sold')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.productId}>
              <td>{r.name}</td>
              <td className="w4-r">{c('restock.sizesOf', { n: r.sizesInStock, total: r.sizesTotal })}</td>
              <td className="w4-r">{r.stockDays ?? '—'}</td>
              <td className="w4-r">{r.sold30}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
