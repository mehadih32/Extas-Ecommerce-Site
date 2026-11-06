'use client';
// S12 · PR 530 — Marketing › Landing pages › Seasonal pages › Each year: the occasions' dates (the owner's own,
// `marketing.seasonalReturn.dates`), drawn in Lumen (--lm-* tokens only). One row per date: the occasion, its first and
// last day, and "every year" (the same month and day each year, a season such as winter). Add a row, take one out,
// then Save: the list is saved whole with the version it was read at (someone else's change in between = STALE; the
// page reloads it). Taking a row out only changes the dates setting (its history keeps the old value).
import { useId, useState } from 'react';
import { showToast } from '@/components/admin/lumen/Toast';

export interface SeasonDateRow {
  occasion: string;
  from: string;
  to: string;
  yearly: boolean;
}

export interface SeasonDatesTexts {
  title: string;
  sub: string;
  occasion: string;
  from: string;
  to: string;
  yearly: string;
  add: string;
  remove: string;
  save: string;
  saving: string;
  saved: string;
  empty: string;
  readOnly: string;
  err: Record<string, string>;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function SeasonDates(props: { url: string; dates: SeasonDateRow[]; version: string; occasions: { key: string; name: string }[]; max: number; texts: SeasonDatesTexts; canEdit: boolean; today: string }) {
  const { texts: x, occasions, canEdit } = props;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [rows, setRows] = useState<SeasonDateRow[]>(props.dates);
  const [version, setVersion] = useState(props.version);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const change = (i: number, patch: Partial<SeasonDateRow>) => {
    setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));
    setDirty(true);
  };
  const add = () => {
    setRows((r) => [...r, { occasion: occasions[0]?.key ?? '', from: props.today, to: props.today, yearly: false }]);
    setDirty(true);
  };
  const remove = (i: number) => {
    setRows((r) => r.filter((_, j) => j !== i));
    setDirty(true);
  };
  const bad = rows.some((r) => !r.occasion || !DAY.test(r.from) || !DAY.test(r.to) || (!r.yearly && r.to < r.from));

  const save = async () => {
    if (busy || bad) return;
    setBusy(true);
    let code = 'other';
    try {
      const res = await fetch(props.url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: 'marketing.seasonalReturn', dates: rows, version }) });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; screen?: { card?: { version?: string } } };
      if (res.ok && j.ok) {
        setVersion(j.screen?.card?.version ?? version);
        setDirty(false);
        setBusy(false);
        showToast({ text: x.saved, tone: 'ok' });
        return;
      }
      code = j.error ?? (res.status === 401 ? 'unauthorized' : res.status === 403 ? 'forbidden' : 'other');
    } catch {
      code = 'network';
    }
    setBusy(false);
    showToast({ text: x.err[code] ?? x.err.other ?? '', tone: 'bad' });
  };

  return (
    <section className="lm-card sy-dates" aria-labelledby={`${uid}-h`} data-testid="sy-dates">
      <h2 className="lm-h2" id={`${uid}-h`}>
        {x.title}
      </h2>
      <p className="sy-sub">{x.sub}</p>
      {rows.length ? (
        <ul className="sy-dl">
          {rows.map((r, i) => (
            <li key={i} className="sy-dr" data-testid="sy-date-row">
              <div className="lm-fl">
                <label htmlFor={`${uid}-o${i}`}>{x.occasion}</label>
                <select id={`${uid}-o${i}`} className="lm-inp" value={r.occasion} disabled={!canEdit || busy} onChange={(e) => change(i, { occasion: e.target.value })}>
                  {occasions.some((o) => o.key === r.occasion) ? null : <option value={r.occasion}>{r.occasion}</option>}
                  {occasions.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="lm-fl">
                <label htmlFor={`${uid}-f${i}`}>{x.from}</label>
                <input id={`${uid}-f${i}`} className="lm-inp" type="date" value={r.from} disabled={!canEdit || busy} onChange={(e) => change(i, { from: e.target.value })} />
              </div>
              <div className="lm-fl">
                <label htmlFor={`${uid}-t${i}`}>{x.to}</label>
                <input id={`${uid}-t${i}`} className="lm-inp" type="date" value={r.to} disabled={!canEdit || busy} aria-invalid={!r.yearly && r.to < r.from} onChange={(e) => change(i, { to: e.target.value })} />
              </div>
              <label className="sy-ck">
                <input type="checkbox" checked={r.yearly} disabled={!canEdit || busy} onChange={(e) => change(i, { yearly: e.target.checked })} />
                <span>{x.yearly}</span>
              </label>
              {canEdit ? (
                <button type="button" className="lm-btn gh sy-rm" onClick={() => remove(i)} disabled={busy}>
                  {x.remove}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="sy-sub" data-testid="sy-dates-empty">
          {x.empty}
        </p>
      )}
      {canEdit ? (
        <div className="sy-acts">
          <button type="button" className="lm-btn" onClick={add} disabled={busy || rows.length >= props.max || !occasions.length} data-testid="sy-date-add">
            {x.add}
          </button>
          <button type="button" className="lm-btn pri" onClick={save} disabled={busy || !dirty || bad} data-testid="sy-date-save">
            {busy ? x.saving : x.save}
          </button>
        </div>
      ) : (
        <p className="sy-sub">{x.readOnly}</p>
      )}
    </section>
  );
}
