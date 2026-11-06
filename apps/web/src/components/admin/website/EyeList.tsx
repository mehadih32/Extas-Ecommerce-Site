'use client';
// S02 · PR 81 — Website › Eye-toggles, the list: every eye-toggle with its place, screens and "as shipped" value, found
// by words (label, place, screen) and filtered by place and by Shown / Hidden / Not as shipped, without a reload. A
// switch only marks the change; Save sends every marked change at once (PUT /api/admin/website/eye-toggles with the
// version the list was read at), Discard drops them, "Back to as shipped" marks the shipped value. A save refused as
// STALE reloads the list, so nothing is written over someone else's change.
import { useMemo, useState } from 'react';
import { call } from '../api';
import { ShellIcon } from '../shell/ShellIcon';
import { showToast } from '../lumen/Toast';

export interface EyeListRow {
  id: string;
  area: string;
  label: string;
  areaLabel: string;
  screenLabel: string;
  shown: boolean;
  def: boolean;
}

export interface EyeListTexts {
  search: string;
  searchPh: string;
  where: string;
  everywhere: string;
  show: string;
  showOpt: Record<'all' | 'shown' | 'hidden' | 'changed', string>;
  clear: string;
  found: string;
  summary: string;
  none: string;
  asShippedOn: string;
  asShippedOff: string;
  back: string;
  save: string;
  saving: string;
  saved: string;
  discard: string;
  unsaved: string;
  readOnly: string;
  err: Record<string, string>;
}

type Show = keyof EyeListTexts['showOpt'];
const SHOWS: Show[] = ['all', 'shown', 'hidden', 'changed'];

export function EyeList(props: { api: string; rows: EyeListRow[]; version: string; canEdit: boolean; areas: { id: string; label: string }[]; texts: EyeListTexts; initial: { q: string; area: string; show: string } }) {
  const x = props.texts;
  const [base, setBase] = useState({ rows: props.rows, version: props.version });
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState(props.initial.q);
  const [area, setArea] = useState(props.areas.some((a) => a.id === props.initial.area) ? props.initial.area : '');
  const [show, setShow] = useState<Show>(SHOWS.includes(props.initial.show as Show) ? (props.initial.show as Show) : 'all');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const off = !props.canEdit || busy;
  const now = (r: EyeListRow) => draft[r.id] ?? r.shown;
  const marked = Object.keys(draft).length;

  const rows = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return base.rows.filter((r) => {
      if (area && r.area !== area) return false;
      // By the saved value, so a row does not leave the list while it is being changed.
      const v = r.shown;
      if (show === 'shown' && !v) return false;
      if (show === 'hidden' && v) return false;
      if (show === 'changed' && v === r.def) return false;
      const hay = `${r.label} ${r.areaLabel} ${r.screenLabel} ${r.id}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [base.rows, q, area, show]);

  const mark = (r: EyeListRow, v: boolean) => {
    const next = { ...draft };
    if (v === r.shown) delete next[r.id];
    else next[r.id] = v;
    setDraft(next);
    setSaid(null);
  };

  const fresh = (d: { rows?: { id: string; shown: boolean; def: boolean }[]; version?: string }) => {
    if (!d.rows || typeof d.version !== 'string') return;
    const by = new Map(d.rows.map((r) => [r.id, r]));
    setBase({ rows: base.rows.map((r) => ({ ...r, shown: by.get(r.id)?.shown ?? r.shown, def: by.get(r.id)?.def ?? r.def })), version: d.version });
    setDraft({});
  };

  async function save() {
    setBusy(true);
    const a = await call('PUT', props.api, { version: base.version, shown: draft });
    setBusy(false);
    if (a.status === 200) {
      fresh(a.data as never);
      return showToast({ text: x.saved, tone: 'ok' });
    }
    const code = a.status === 0 ? 'network' : (a.data.error ?? 'other');
    if (code === 'STALE') {
      const g = await call('GET', props.api);
      if (g.status === 200) fresh(g.data as never);
    }
    setSaid({ text: (x.err[code] ?? x.err.other ?? code).replace('{details}', (a.data.details ?? []).join(', ')), bad: true });
  }

  const groups = props.areas.map((a) => ({ ...a, rows: rows.filter((r) => r.area === a.id) })).filter((g) => g.rows.length);

  return (
    <>
      <div className="a2-sc a2-mt12 eyb-search" role="search" data-testid="ey-search">
        <div className="a2-fld eyb-q">
          <label className="a2-lbl" htmlFor="ey-q">
            {x.search}
          </label>
          <input id="ey-q" className="a2-inp" type="search" value={q} placeholder={x.searchPh} maxLength={120} onChange={(e) => setQ(e.target.value)} data-testid="ey-q" />
        </div>
        <div className="a2-fld">
          <label className="a2-lbl" htmlFor="ey-where">
            {x.where}
          </label>
          <select id="ey-where" className="a2-sel" value={area} onChange={(e) => setArea(e.target.value)} data-testid="ey-where">
            <option value="">{x.everywhere}</option>
            {props.areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
        <div className="a2-fld">
          <label className="a2-lbl" htmlFor="ey-show">
            {x.show}
          </label>
          <select id="ey-show" className="a2-sel" value={show} onChange={(e) => setShow(e.target.value as Show)} data-testid="ey-show">
            {SHOWS.map((k) => (
              <option key={k} value={k}>
                {x.showOpt[k]}
              </option>
            ))}
          </select>
        </div>
        {q || area || show !== 'all' ? (
          <div className="eyb-go">
            <button
              type="button"
              className="a2-btn"
              onClick={() => {
                setQ('');
                setArea('');
                setShow('all');
              }}
              data-testid="ey-clear"
            >
              {x.clear}
            </button>
          </div>
        ) : null}
      </div>
      {!props.canEdit ? (
        <div className="a2-note a2-mt12">
          <ShellIcon name="lock" size={15} />
          <span>{x.readOnly}</span>
        </div>
      ) : null}
      <p className="a2-xs a2-mute eyb-mt6" data-testid="ey-summary">
        {x.summary
          .replace('{total}', String(base.rows.length))
          .replace('{hidden}', String(base.rows.filter((r) => !r.shown).length))
          .replace('{changed}', String(base.rows.filter((r) => r.shown !== r.def).length))}
      </p>
      <h2 className="a2-h3 a2-mt12" data-testid="ey-found">
        {x.found.replace('{n}', String(rows.length))}
      </h2>
      {groups.length ? null : (
        <p className="a2-sm eyb-mt6" data-testid="ey-none">
          {x.none}
        </p>
      )}
      {groups.map((g) => (
        <section className="a2-sc a2-mt12" key={g.id} aria-labelledby={`ey-a-${g.id}`} data-testid={`ey-area-${g.id}`}>
          <h3 className="a2-h3" id={`ey-a-${g.id}`}>
            {g.label} <span className="a2-xs a2-mute">· {g.rows.length}</span>
          </h3>
          <ul className="eyb-list">
            {g.rows.map((r) => {
              const v = now(r);
              return (
                <li className={`eyb-row${draft[r.id] !== undefined ? ' eyb-marked' : ''}`} key={r.id} data-testid="ey-row" data-id={r.id}>
                  <div className="a2-swl">
                    <span>
                      <span className="eyb-label">{r.label}</span>
                      <span className="a2-xs a2-mute a2-blk">
                        {r.screenLabel} · {r.def ? x.asShippedOn : x.asShippedOff}
                      </span>
                    </span>
                    <button type="button" className={`a2-sw${v ? ' on' : ''}`} role="switch" aria-checked={v} aria-label={r.label} disabled={off} onClick={() => mark(r, !v)} data-testid="ey-sw" />
                  </div>
                  {props.canEdit && v !== r.def ? (
                    <button type="button" className="a2-btn eyb-back" disabled={off} onClick={() => mark(r, r.def)} data-testid="ey-back">
                      {x.back}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {props.canEdit ? (
        <div className="a2-scbar eyb-bar" data-testid="ey-bar">
          <span className={`a2-sm${said?.bad ? '' : ' a2-mute'}`} role="status" aria-live="polite" data-testid="ey-status">
            {said ? said.text : marked ? x.unsaved.replace('{n}', String(marked)) : ''}
          </span>
          <div className="a2-gap8">
            {marked ? (
              <button type="button" className="a2-btn" disabled={busy} onClick={() => setDraft({})} data-testid="ey-discard">
                {x.discard}
              </button>
            ) : null}
            <button type="button" className="a2-btn pri" disabled={busy || !marked} onClick={save} data-testid="ey-save">
              {busy ? x.saving : x.save}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
