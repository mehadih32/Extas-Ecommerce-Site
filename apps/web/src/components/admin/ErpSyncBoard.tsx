'use client';
// PR 845 (lane E4), PR 851 (lane E5) — Settings › ERP connection: the prototype's "Sync status" table, then the "Activity log" with its
// filter chips beside the side cards (Matching and Safety). Pure display of what `loadSyncBoard` read; nothing here calls the ERP.
import { useState, type ReactNode } from 'react';
import { t, type Dict } from '@/lib/i18n';
import type { SyncBoard, SyncKind } from '@/lib/erp-sync-board';

const FILTERS: ('all' | 'failed' | SyncKind)[] = ['all', 'order', 'stock', 'bill', 'return', 'product', 'price', 'payment', 'failed'];

export function ErpSyncBoard({ dict, board, locale, side }: { dict: Dict; board: SyncBoard; locale: string; side?: ReactNode }) {
  const [f, setF] = useState<(typeof FILTERS)[number]>('all');
  const e = (k: string, v?: Record<string, string | number>) => t(dict, `erpLink.board.${k}`, v);
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }) : e('never'));
  const rows = board.log.filter((r) => (f === 'all' ? true : f === 'failed' ? !r.ok : r.kind === f));
  return (
    <>
      <section className="a2-card a2-mt12" data-testid="erp-sync-status">
        <h2 className="a2-h4">{e('status.title')}</h2>
        <div className="a2-mt6" style={{ overflowX: 'auto' }}>
          <table className="a2-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>{e('col.what')}</th>
                <th>{e('col.last')}</th>
                <th>{e('col.next')}</th>
                <th>{e('col.items')}</th>
                <th>{e('col.state')}</th>
              </tr>
            </thead>
            <tbody>
              {board.streams.map((s) => (
                <tr key={s.key} data-testid={`erp-stream-${s.key}`}>
                  <td>
                    <span className={`a2-pill ${s.dir === 'in' ? 'line' : 'gold'}`}>{e(s.dir === 'in' ? 'dirIn' : 'dirOut')}</span> <b>{e(`stream.${s.key}`)}</b>
                  </td>
                  <td>{s.lastAt ? when(s.lastAt) : '—'}</td>
                  <td className="a2-mute">{s.nextAt ? when(s.nextAt) : e(`next.${s.key}`)}</td>
                  <td className="a2-sm">{s.items.what === 'none' ? '—' : e(`items.${s.items.what}`, { n: s.items.n })}</td>
                  <td>
                    <span className={`a2-pill ${s.failed24 > 0 ? 'warn' : 'ok'}`}>{s.failed24 > 0 ? e('failed', { n: s.failed24 }) : e('none')}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="erp-g3 a2-mt12">
        <section className="a2-card" data-testid="erp-activity-log" style={{ minWidth: 0 }}>
          <h2 className="a2-h4">{e('log.title')}</h2>
          <div className="a2-mt6" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="group" aria-label={e('log.filters')}>
            {FILTERS.map((k) => (
              <button key={k} type="button" className={`a2-btn${f === k ? ' pri' : ''}`} aria-pressed={f === k} onClick={() => setF(k)} data-testid={`erp-log-filter-${k}`}>
                {e(`filter.${k}`)}
              </button>
            ))}
          </div>
          {rows.length === 0 ? (
            <p className="a2-sm a2-mute a2-mt6">{e('log.empty')}</p>
          ) : (
            <div className="a2-mt6" style={{ overflowX: 'auto' }}>
              <table className="a2-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>{e('col.when')}</th>
                    <th>{e('col.type')}</th>
                    <th>{e('col.happened')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={`${r.at}-${i}`}>
                      <td className="a2-sm">{when(r.at)}</td>
                      <td>
                        <span className={`a2-pill ${r.ok ? 'line' : 'bad'}`}>{e(`type.${r.kind}`)}</span>
                      </td>
                      <td className="a2-sm" style={{ overflowWrap: 'anywhere' }}>
                        {r.name}
                        {r.ref ? ` · ${r.ref}` : ''}
                        {r.detail ? ` — ${r.detail}` : ''}
                      </td>
                      <td>
                        <span style={{ color: r.ok ? 'var(--lm-ok)' : 'var(--lm-bad)' }} role="img" aria-label={r.ok ? e('ok') : e('failedOne')}>
                          {r.ok ? '✓' : '✕'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        {side ? <div className="a2-stack" style={{ minWidth: 0 }}>{side}</div> : null}
      </div>
    </>
  );
}
