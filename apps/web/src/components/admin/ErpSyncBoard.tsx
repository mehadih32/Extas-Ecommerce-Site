'use client';
// PR 845 (lane E4) — Settings › ERP connection: the prototype's "Sync status" table and "Activity log" with filter chips.
// Pure display of what `loadSyncBoard` read; nothing here calls the ERP.
import { useState } from 'react';
import { t, type Dict } from '@/lib/i18n';
import type { SyncBoard, SyncKind } from '@/lib/erp-sync-board';

const FILTERS: ('all' | 'failed' | SyncKind)[] = ['all', 'failed', 'order', 'stock', 'bill', 'return', 'product', 'price', 'payment'];

export function ErpSyncBoard({ dict, board, locale }: { dict: Dict; board: SyncBoard; locale: string }) {
  const [f, setF] = useState<(typeof FILTERS)[number]>('all');
  const e = (k: string, v?: Record<string, string | number>) => t(dict, `erpLink.board.${k}`, v);
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }) : e('never'));
  const rows = board.log.filter((r) => (f === 'all' ? true : f === 'failed' ? !r.ok : r.kind === f));
  return (
    <>
      <section className="a2-card a2-mt12" data-testid="erp-sync-status">
        <h2 className="a2-h4">{e('status.title')}</h2>
        <p className="a2-xs a2-mute">{e('status.sub')}</p>
        <div className="a2-mt6" style={{ overflowX: 'auto' }}>
          <table className="a2-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>{e('col.what')}</th>
                <th>{e('col.dir')}</th>
                <th>{e('col.last')}</th>
                <th>{e('col.next')}</th>
                <th>{e('col.items')}</th>
                <th>{e('col.state')}</th>
              </tr>
            </thead>
            <tbody>
              {board.streams.map((s) => (
                <tr key={s.key} data-testid={`erp-stream-${s.key}`}>
                  <td>{e(`stream.${s.key}`)}</td>
                  <td>{e(`dir.${s.dir}`)}</td>
                  <td>{when(s.lastAt)}</td>
                  <td>{s.nextAt ? when(s.nextAt) : e('onEvent')}</td>
                  <td>{s.items.what === 'none' ? '—' : e(`items.${s.items.what}`, { n: s.items.n })}</td>
                  <td>
                    <span className={`a2-pill ${s.failed24 > 0 ? 'bad' : s.lastAt ? 'ok' : 'line'}`}>{s.failed24 > 0 ? e('failed', { n: s.failed24 }) : s.lastAt ? e('ok') : e('idle')}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="a2-card a2-mt12" data-testid="erp-activity-log">
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
          <ul className="a2-stack a2-mt6">
            {rows.map((r, i) => (
              <li key={`${r.at}-${i}`} className="a2-between a2-sm" style={{ gap: 8, flexWrap: 'wrap' }}>
                <span>
                  {when(r.at)} · {e(`stream.${r.kind}`)} · {r.name}
                  {r.ref ? ` · ${r.ref}` : ''}
                </span>
                <span className={`a2-pill ${r.ok ? 'ok' : 'bad'}`}>{r.ok ? e('ok') : e('failedOne')}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
