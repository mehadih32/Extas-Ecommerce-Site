'use client';
// S28 · PR 686 (admin prototype v5) — Products › Shop ranking: how much each of five things counts (sliders; the order below
// follows them at once, nothing is saved), the products in the order the shop would show, ▲▼ since the last saved order, a pin
// to the top or a push to the end, and "Save this order" (the weights tried become the owner's and the order goes on the shop).
// Words: messages/admin-ranking.*.json (`productRanking.*`). Nothing here moves money or changes a price.
import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';
import { t, type Dict } from '@/lib/i18n';
import { call } from '../api';
import { showToast } from '../lumen/Toast';

export const RANK_KEYS = ['sales', 'conv', 'margin', 'stock', 'fresh'] as const;
export type RankWeights = Record<(typeof RANK_KEYS)[number], number>;

export interface RankingRowView {
  productId: string;
  name: string;
  sold30: number;
  score: number;
  rank: number;
  pin: 'TOP' | 'DOWN' | null;
  moved: number | null;
}

export interface RankingScreenProps {
  dict: Dict;
  weights: RankWeights;
  defaults: RankWeights;
  rows: RankingRowView[];
  savedAt: string | null;
  canEdit: boolean;
}

export function RankingScreen(p: RankingScreenProps) {
  const id = useId();
  const router = useRouter();
  const c = (k: string, vars?: Record<string, string | number>) => t(p.dict, `productRanking.${k}`, vars);
  const [weights, setWeights] = useState<RankWeights>(p.weights);
  const [rows, setRows] = useState<RankingRowView[]>(p.rows);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const seq = useRef(0);

  async function look(next: RankWeights) {
    const mine = ++seq.current;
    const w = RANK_KEYS.map((k) => `${k}:${next[k]}`).join(',');
    const a = await call('GET', `/api/admin/catalogue/ranking?w=${w}`);
    if (mine !== seq.current) return;
    const view = (a.data as { view?: { rows: RankingRowView[] } }).view;
    if (a.status === 200 && view) setRows(view.rows);
  }
  const change = (k: (typeof RANK_KEYS)[number], v: number) => {
    const next = { ...weights, [k]: v };
    setWeights(next);
    void look(next);
  };
  async function save() {
    setBusy(true);
    const a = await call('POST', '/api/admin/catalogue/ranking', { action: 'save', weights });
    setBusy(false);
    if (a.status === 200) {
      setSaid({ text: c('saved'), bad: false });
      showToast({ text: c('saved'), tone: 'ok' });
      return router.refresh();
    }
    setSaid({ text: a.status === 403 ? c('err.forbidden') : c('err.other'), bad: true });
  }
  async function pin(productId: string, to: 'TOP' | 'DOWN', now: 'TOP' | 'DOWN' | null) {
    const a = await call('POST', '/api/admin/catalogue/ranking', { action: 'pin', productId, pin: now === to ? null : to });
    if (a.status === 200) {
      showToast({ text: now === to ? c('pinRemoved') : to === 'TOP' ? c('pinnedTop') : c('pinnedDown'), tone: 'ok' });
      await look(weights);
      return;
    }
    setSaid({ text: a.status === 403 ? c('err.forbidden') : c('err.other'), bad: true });
  }
  const shown = rows.filter((r) => !q.trim() || r.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, q.trim() ? 40 : 25);
  const names: Record<(typeof RANK_KEYS)[number], string> = { sales: c('w.sales'), conv: c('w.conv'), margin: c('w.margin'), stock: c('w.stock'), fresh: c('w.fresh') };
  const same = RANK_KEYS.every((k) => weights[k] === p.weights[k]);

  return (
    <div className="w4-split" data-testid="ranking-screen">
      <section className="a2-card" aria-labelledby={`${id}-how`}>
        <h2 className="a2-h3" id={`${id}-how`}>
          {c('what.title')}
        </h2>
        <p className="a2-cs">{c('what.sub')}</p>
        <div className="w4-sliders a2-mt12">
          {RANK_KEYS.map((k) => (
            <div key={k} className="w4-slider">
              <label htmlFor={`${id}-${k}`}>{names[k]}</label>
              <b className="w4-num" data-testid={`rk-v-${k}`}>
                {weights[k]}
              </b>
              <input id={`${id}-${k}`} type="range" min={0} max={50} value={weights[k]} disabled={!p.canEdit} onChange={(e) => change(k, Number(e.target.value))} data-testid={`rk-w-${k}`} />
            </div>
          ))}
        </div>
        <div className="a2-mt12 w4-row">
          <button
            type="button"
            className="a2-btn"
            disabled={!p.canEdit || RANK_KEYS.every((k) => weights[k] === p.defaults[k])}
            onClick={() => {
              setWeights(p.defaults);
              void look(p.defaults);
            }}
            data-testid="rk-reset"
          >
            {c('reset')}
          </button>
          <button type="button" className="a2-btn pri" disabled={!p.canEdit || busy} onClick={save} data-testid="rk-save">
            {busy ? c('saving') : c('save')}
          </button>
        </div>
        <p className="a2-xs a2-mute a2-mt6">{same ? (p.savedAt ? c('savedAt', { when: new Date(p.savedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) }) : c('neverSaved')) : c('tryNote')}</p>
        {said ? (
          <p className={`a2-sm a2-mt6 ${said.bad ? 'bk-warn' : 'a2-mute'}`} role={said.bad ? 'alert' : 'status'} data-testid="rk-said">
            {said.text}
          </p>
        ) : null}
        {!p.canEdit ? <p className="a2-note a2-mt12">{c('readOnly')}</p> : null}
      </section>
      <section className="a2-card" aria-labelledby={`${id}-live`}>
        <h2 className="a2-h3" id={`${id}-live`}>
          {c('live.title')}
        </h2>
        <p className="a2-cs">{c('live.sub')}</p>
        <input className="a2-inp a2-mt12" value={q} placeholder={c('find')} aria-label={c('find')} onChange={(e) => setQ(e.target.value)} data-testid="rk-find" />
        {shown.length ? (
          <ol className="w4-list a2-mt6" data-testid="rk-list">
            {shown.map((r) => (
              <li key={r.productId} className="w4-li">
                <span className="w4-n">{r.rank}</span>
                <span className="w4-grow">
                  <b className="w4-ell">{r.name}</b>
                  <span className="a2-xs a2-mute">
                    {c('sold', { n: r.sold30 })}
                    {r.pin === 'TOP' ? ` · ${c('pinned')}` : r.pin === 'DOWN' ? ` · ${c('pushed')}` : ''}
                  </span>
                </span>
                <span className="w4-score" aria-label={c('score', { n: r.score })}>
                  <b>{r.score}</b>
                  <i style={{ width: `${r.score}%` }} />
                </span>
                <span className={`w4-delta ${r.moved === null || r.moved === 0 ? 'flat' : r.moved > 0 ? 'up' : 'down'}`}>{r.moved === null || r.moved === 0 ? '—' : r.moved > 0 ? `▲${r.moved}` : `▼${-r.moved}`}</span>
                <button type="button" className="a2-btn sm" disabled={!p.canEdit} aria-pressed={r.pin === 'TOP'} onClick={() => pin(r.productId, 'TOP', r.pin)} data-testid={`rk-top-${r.rank}`}>
                  {c('top')}
                </button>
                <button type="button" className="a2-btn sm" disabled={!p.canEdit} aria-pressed={r.pin === 'DOWN'} onClick={() => pin(r.productId, 'DOWN', r.pin)} data-testid={`rk-down-${r.rank}`}>
                  {c('down')}
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="a2-mute a2-mt12" data-testid="rk-empty">
            {c('empty')}
          </p>
        )}
      </section>
    </div>
  );
}
