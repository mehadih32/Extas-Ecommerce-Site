'use client';
// S20 · PR 412 (B2.3; demo V12.4 97s "Picking list sort: shelf bin") — the shelf of each style on the picking list: a
// box per style with its shelf code and a Save, through POST /api/admin/packing/picking/shelf (`fulfilment.bins`; each
// change a new kept row, audited). An empty box clears the shelf. A refusal is shown in words, never the server's own.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { call } from '@/components/admin/api';
import { fulError } from '@/lib/admin-fulfil/words';
import { t, type Dict } from '@/lib/i18n';

export interface ShelfRow {
  productId: string;
  style: string;
  code: string | null;
}

function One({ dict, row, canEdit }: { dict: Dict; row: ShelfRow; canEdit: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState(row.code ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const changed = code.trim() !== (row.code ?? '');
  const save = async () => {
    setBusy(true);
    setMsg(null);
    const a = await call('POST', '/api/admin/packing/picking/shelf', { productId: row.productId, code: code.trim() });
    setBusy(false);
    if (!a.data.ok) {
      setMsg({ ok: false, text: a.status === 0 ? fulError(dict, 'network') : fulError(dict, a.data.error, ((a.data.details as string[] | undefined) ?? []).join(', ')) });
      return;
    }
    setMsg({ ok: true, text: t(dict, code.trim() ? 'ful.picking.shelves.saved' : 'ful.picking.shelves.cleared') });
    router.refresh();
  };
  const label = t(dict, 'ful.picking.shelves.code', { style: row.style });
  return (
    <li className="sh-row" data-testid="shelf-row">
      <label className="sh-lab">
        <span className="a2-xs">
          <b>{row.style}</b>
        </span>
        <input className="a2-inp" value={code} maxLength={40} placeholder={t(dict, 'ful.picking.shelves.ph')} aria-label={label} onChange={(e) => setCode(e.target.value)} disabled={!canEdit || busy} data-testid="shelf-code" />
      </label>
      {canEdit ? (
        <button type="button" className="a2-btn" onClick={save} disabled={busy || !changed} data-testid="shelf-save">
          {busy ? t(dict, 'ful.picking.shelves.saving') : t(dict, 'ful.picking.shelves.save')}
        </button>
      ) : null}
      {msg ? (
        <span className={`a2-xs ${msg.ok ? 'a2-mute' : ''}`} role={msg.ok ? 'status' : 'alert'} style={msg.ok ? undefined : { color: 'var(--bad)' }}>
          {msg.text}
        </span>
      ) : null}
    </li>
  );
}

export function ShelfEdit({ dict, rows, canEdit }: { dict: Dict; rows: ShelfRow[]; canEdit: boolean }) {
  if (!rows.length) return <p className="a2-xs a2-mute a2-mt6">{t(dict, 'ful.picking.shelves.none')}</p>;
  return (
    <ul className="sh-list" data-testid="shelf-list">
      {rows.map((r) => (
        <One key={r.productId} dict={dict} row={r} canEdit={canEdit} />
      ))}
    </ul>
  );
}
