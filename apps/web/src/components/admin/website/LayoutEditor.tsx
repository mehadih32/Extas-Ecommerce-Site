'use client';
// S02 · PR 76 — Website › Page layouts' section list: one row per section of the page (its number, name and what it
// shows), "Show" (locked sections always show), its screens (phone and computer, phone only, computer only) and ▲ ▼; on a
// computer a row can also be dragged to its place. Save sends the whole list with the version it was read at (PUT
// /api/admin/website/layouts, `website.layout.write`; the API checks everything again); "Back to the default order" and
// "Discard changes" only change the draft. Every word comes from messages/admin-layouts.<lang>.json.
// ~~Used by Website › Page layouts~~ PR 595: the page uses LayoutBuilder.tsx (Lumen, the owner's own sections); this
// list is kept as it was built (nothing deleted) and no page draws it. Unused since PR 595 (follow-up 693): nothing
// imports it (layout-editor-unused.test.ts); it moves out with the next Website section PR (640).
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { LayoutDevice } from '@extas/settings';
import { moveRow, type LayoutRow } from '@/lib/shop/layout-rows';
import { showToast } from '../lumen/Toast';

const API = '/api/admin/website/layouts';
const DEVICES: readonly LayoutDevice[] = ['both', 'phone', 'desktop'];

/** @deprecated Unused since PR 595 — Website › Page layouts draws LayoutBuilder.tsx. */
export interface LayoutEditorWords {
  count: string;
  always: string;
  show: string;
  screens: string;
  dev: Record<LayoutDevice, string>;
  up: string;
  down: string;
  drag: string;
  save: string;
  saving: string;
  saved: string;
  discard: string;
  reset: string;
  resetHelp: string;
  unsaved: string;
  err: Record<string, string>;
}

interface Props {
  page: string;
  rows: LayoutRow[];
  defaults: LayoutRow[];
  locked: string[];
  version: string;
  names: Record<string, string>;
  hints: Record<string, string>;
  canEdit: boolean;
  w: LayoutEditorWords;
}

type Msg = { ok: boolean; text: string } | null;

const same = (a: readonly LayoutRow[], b: readonly LayoutRow[]) => JSON.stringify(a.map((r) => [r.id, r.on, r.dev ?? 'both'])) === JSON.stringify(b.map((r) => [r.id, r.on, r.dev ?? 'both']));

/** @deprecated Unused since PR 595 — Website › Page layouts draws LayoutBuilder.tsx. */
export function LayoutEditor({ page, rows: saved, defaults, locked, version, names, hints, canEdit, w }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const dirty = !same(rows, saved);
  const shown = rows.filter((r) => r.on).length;
  const edit = (next: LayoutRow[]) => {
    setRows(next);
    setMsg(null);
  };
  const patch = (i: number, p: Partial<LayoutRow>) => edit(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const sections = rows.map((r) => ({ id: r.id, on: r.on, dev: r.dev ?? 'both' }));
      const res = await fetch(API, { method: 'PUT', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ page, sections, version }) });
      const data = (await res.json().catch(() => ({ ok: false }))) as { ok?: boolean; error?: string; details?: string[] };
      if (data.ok) {
        showToast({ text: w.saved, tone: 'ok' });
        router.refresh();
      } else {
        const code = data.error ?? (res.status === 403 ? 'forbidden' : res.status === 401 ? 'unauthorized' : 'other');
        setMsg({ ok: false, text: (w.err[code] ?? w.err.other ?? code).replace('{fields}', (data.details ?? []).join(', ')) });
      }
    } catch {
      setMsg({ ok: false, text: w.err.network ?? '' });
    }
    setBusy(false);
  };

  return (
    <div data-testid="ly-editor" data-page={page}>
      <p className="a2-xs a2-mute" data-testid="ly-count">
        {w.count.replace('{on}', String(shown)).replace('{all}', String(rows.length))}
      </p>
      {canEdit ? <p className="a2-xs a2-mute lyb-mt6">{w.drag}</p> : null}
      <ol className="lyb-list">
        {rows.map((r, i) => {
          const isLocked = locked.includes(r.id);
          const name = names[r.id] ?? r.id;
          return (
            <li
              key={r.id}
              className={`lyb-row${r.on ? '' : ' off'}${drag === i ? ' drag' : ''}`}
              data-testid="ly-row"
              data-id={r.id}
              draggable={canEdit}
              onDragStart={(e) => {
                setDrag(i);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => {
                if (drag !== null) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (drag !== null) edit(moveRow(rows, drag, i));
                setDrag(null);
              }}
              onDragEnd={() => setDrag(null)}
            >
              <span className="lyb-num" aria-hidden="true">
                {i + 1}
              </span>
              <div className="lyb-name">
                <b className="a2-sm">{name}</b>
                <span className="a2-xs a2-mute">{isLocked ? `${hints[r.id] ?? ''} · ${w.always}` : (hints[r.id] ?? '')}</span>
              </div>
              <div className="lyb-acts">
                <label className="a2-chkl lyb-show">
                  <input type="checkbox" className="a2-chk" checked={r.on} disabled={!canEdit || isLocked} onChange={(e) => patch(i, { on: e.target.checked })} data-testid={`ly-on-${r.id}`} />
                  <span className="a2-sm">{w.show}</span>
                </label>
                <label className="a2-sr" htmlFor={`ly-dev-${page}-${r.id}`}>
                  {`${w.screens}: ${name}`}
                </label>
                <select id={`ly-dev-${page}-${r.id}`} className="a2-sel lyb-dev" value={r.dev ?? 'both'} disabled={!canEdit} onChange={(e) => patch(i, { dev: e.target.value as LayoutDevice })} data-testid={`ly-dev-${r.id}`}>
                  {DEVICES.map((d) => (
                    <option key={d} value={d}>
                      {w.dev[d]}
                    </option>
                  ))}
                </select>
                {canEdit ? (
                  <>
                    <button type="button" className="a2-btn lyb-mv" disabled={i === 0} aria-label={`${w.up}: ${name}`} onClick={() => edit(moveRow(rows, i, i - 1))} data-testid={`ly-up-${r.id}`}>
                      ▲
                    </button>
                    <button type="button" className="a2-btn lyb-mv" disabled={i === rows.length - 1} aria-label={`${w.down}: ${name}`} onClick={() => edit(moveRow(rows, i, i + 1))} data-testid={`ly-down-${r.id}`}>
                      ▼
                    </button>
                  </>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      {canEdit ? (
        <>
          {dirty ? (
            <p className="a2-xs lyb-mt6" role="status" data-testid="ly-unsaved">
              {w.unsaved}
            </p>
          ) : null}
          <div className="lyb-bar">
            <button type="button" className="a2-btn pri" disabled={busy || !dirty} onClick={() => void save()} data-testid="ly-save">
              {busy ? w.saving : w.save}
            </button>
            {dirty ? (
              <button type="button" className="a2-btn" disabled={busy} onClick={() => edit(saved)} data-testid="ly-discard">
                {w.discard}
              </button>
            ) : null}
            <button type="button" className="a2-btn" disabled={busy || same(rows, defaults)} onClick={() => edit(defaults)} data-testid="ly-reset">
              {w.reset}
            </button>
          </div>
          <p className="a2-xs a2-mute lyb-mt6">{w.resetHelp}</p>
        </>
      ) : null}
      {msg ? (
        <p className="a2-xs lyb-mt6" role={msg.ok ? 'status' : 'alert'} style={msg.ok ? undefined : { color: 'var(--bad)' }} data-testid="ly-msg">
          {msg.text}
        </p>
      ) : null}
    </div>
  );
}
