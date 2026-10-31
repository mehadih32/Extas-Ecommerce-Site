'use client';
// S20 · PR 407 — one settings card inside its section (CN-018: settings sit where they are used), first for Orders ›
// Packing & print › Invoices, then Support › Support settings (PR 425). The card is drawn from a plain list of its
// fields (switch, choice, number, text, ticks, a text in both languages; PR 193: a calendar day; SIM-F-048: a list of
// rows, each a choice and numbers, with add and remove) — words and choices come from the page, so no
// function crosses from the server page. Saved whole to the page's own API (`url`: GET answers `{cards}`, PUT takes
// `{key, value, version}`) with the card's version: a card changed by someone else in between is read again and said
// so. A person without the page's write permission sees it locked.
import { useId, useState } from 'react';
import { call } from '../api';
import { ShellIcon } from '../shell/ShellIcon';

type Json = Record<string, unknown>;

export type FieldsCardField =
  | { kind: 'switch'; path: string; label: string; help?: string }
  | { kind: 'select'; path: string; label: string; help?: string; numeric?: boolean; options: { value: string; label: string }[] }
  | { kind: 'number'; path: string; label: string; help?: string; min: number; max: number }
  | { kind: 'text'; path: string; label: string; help?: string; max: number }
  // PR 193: a calendar day (`YYYY-MM-DD`); empty is kept as null (no day set)
  | { kind: 'date'; path: string; label: string; help?: string }
  | { kind: 'checks'; path: string; label: string; options: { value: string; label: string }[] }
  // PR 384: `rows` makes a taller box for a long text (a policy page's words)
  | { kind: 'pair'; path: string; label: { en: string; bn: string }; help?: string; max: number; rows?: number }
  // SIM-F-048 (PR 550 follow-up): a list of rows (at most `max`); a choice column takes each value once across the rows
  | { kind: 'rows'; path: string; label: string; help?: string; max: number; add: string; remove: string; empty: string; columns: FieldsCardColumn[] };

/** One column of a `rows` field: a choice (each value once across the rows), or a whole number (empty = null when `optional`). */
export type FieldsCardColumn =
  | { kind: 'select'; key: string; label: string; pick: string; options: { value: string; label: string }[] }
  | { kind: 'number'; key: string; label: string; min: number; max: number; optional?: boolean };

export interface FieldsCardTexts {
  h: string;
  d: string;
  save: string;
  saving: string;
  saved: string;
  discard: string;
  unsaved: string;
  readOnly: string;
  pairHelp: string;
  err: Record<string, string>;
}

export interface FieldsCardScreen {
  key: string;
  value: Json;
  version: string;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function FieldsCard({ url, screen, fields, texts: x, canEdit, testId }: { url: string; screen: FieldsCardScreen; fields: FieldsCardField[]; texts: FieldsCardTexts; canEdit: boolean; testId: string }) {
  const id = useId();
  const [base, setBase] = useState(screen);
  const [draft, setDraft] = useState<Json>(screen.value);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  const off = !canEdit || busy;
  const dirty = !same(draft, base.value);
  const edit = (path: string, v: unknown) => {
    setDraft({ ...draft, [path]: v });
    setSaid(null);
  };
  const fresh = (cards: Record<string, FieldsCardScreen> | undefined) => {
    const c = cards?.[base.key];
    if (!c) return;
    setBase(c);
    setDraft(c.value);
  };

  async function save() {
    const half = fields.some((f) => f.kind === 'pair' && (() => {
      const p = draft[f.path] as { en?: string; bn?: string } | null;
      return !!p && (!p.en?.trim() || !p.bn?.trim());
    })());
    if (half) return setSaid({ text: x.pairHelp, bad: true });
    setBusy(true);
    const a = await call('PUT', url, { key: base.key, value: draft, version: base.version });
    setBusy(false);
    if (a.status === 200) {
      fresh(a.data.cards as Record<string, FieldsCardScreen>);
      return setSaid({ text: x.saved, bad: false });
    }
    const code = a.status === 0 ? 'network' : (a.data.error ?? 'other');
    if (code === 'STALE') {
      const g = await call('GET', url);
      if (g.status === 200) fresh(g.data.cards as Record<string, FieldsCardScreen>);
    }
    const fieldsText = (a.data.details ?? []).join(', ');
    setSaid({ text: (x.err[code] ?? x.err.other ?? code).replace('{fields}', fieldsText), bad: true });
  }

  const field = (f: FieldsCardField) => {
    const fid = `${id}-${f.path}`;
    const help = 'help' in f && f.help ? <span className="a2-xs a2-mute">{f.help}</span> : null;
    if (f.kind === 'switch') {
      const on = draft[f.path] === true;
      return (
        <div className="a2-swl" key={f.path}>
          <span>
            {f.label}
            {f.help ? <span className="a2-xs a2-mute a2-blk">{f.help}</span> : null}
          </span>
          <button type="button" className={`a2-sw${on ? ' on' : ''}`} role="switch" aria-checked={on} aria-label={f.label} disabled={off} onClick={() => edit(f.path, !on)} data-testid={`${testId}-${f.path}`} />
        </div>
      );
    }
    if (f.kind === 'select')
      return (
        <div className="a2-fld" key={f.path}>
          <label className="a2-lbl" htmlFor={fid}>
            {f.label}
          </label>
          <select id={fid} className="a2-sel" value={String(draft[f.path])} disabled={off} onChange={(e) => edit(f.path, f.numeric ? Number(e.target.value) : e.target.value)} data-testid={`${testId}-${f.path}`}>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {help}
        </div>
      );
    if (f.kind === 'number')
      return (
        <div className="a2-fld" key={f.path}>
          <label className="a2-lbl" htmlFor={fid}>
            {f.label}
          </label>
          <input id={fid} className="a2-inp" type="number" inputMode="numeric" min={f.min} max={f.max} value={String(draft[f.path] ?? '')} disabled={off} onChange={(e) => edit(f.path, e.target.value === '' ? '' : Number(e.target.value))} data-testid={`${testId}-${f.path}`} />
          {help}
        </div>
      );
    if (f.kind === 'text')
      return (
        <div className="a2-fld" key={f.path}>
          <label className="a2-lbl" htmlFor={fid}>
            {f.label}
          </label>
          <input id={fid} className="a2-inp" value={String(draft[f.path] ?? '')} maxLength={f.max} disabled={off} onChange={(e) => edit(f.path, e.target.value)} data-testid={`${testId}-${f.path}`} />
          {help}
        </div>
      );
    if (f.kind === 'date')
      return (
        <div className="a2-fld" key={f.path}>
          <label className="a2-lbl" htmlFor={fid}>
            {f.label}
          </label>
          <input id={fid} className="a2-inp" type="date" value={String(draft[f.path] ?? '')} disabled={off} onChange={(e) => edit(f.path, e.target.value === '' ? null : e.target.value)} data-testid={`${testId}-${f.path}`} />
          {help}
        </div>
      );
    if (f.kind === 'checks') {
      const v = (draft[f.path] ?? {}) as Record<string, boolean>;
      return (
        <div className="a2-fld" role="group" aria-labelledby={`${fid}-l`} key={f.path}>
          <span className="a2-lbl" id={`${fid}-l`}>
            {f.label}
          </span>
          {f.options.map((o) => (
            <label key={o.value} className="a2-chkl">
              <input type="checkbox" className="a2-chk" checked={v[o.value] === true} disabled={off} onChange={(e) => edit(f.path, { ...v, [o.value]: e.target.checked })} data-testid={`${testId}-${f.path}-${o.value}`} />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      );
    }
    if (f.kind === 'rows') {
      const rows = (Array.isArray(draft[f.path]) ? draft[f.path] : []) as Json[];
      const put = (next: Json[]) => edit(f.path, next);
      const blank = Object.fromEntries(f.columns.map((c) => [c.key, c.kind === 'select' ? '' : null]));
      return (
        <div className="a2-fld full" role="group" aria-labelledby={`${fid}-l`} key={f.path} data-testid={`${testId}-${f.path}`}>
          <span className="a2-lbl" id={`${fid}-l`}>
            {f.label}
          </span>
          {help}
          {rows.length ? null : <span className="a2-xs a2-mute">{f.empty}</span>}
          {rows.map((r, i) => (
            <div className="a2-fg" style={{ alignItems: 'end' }} key={i} data-testid={`${testId}-${f.path}-row`}>
              {f.columns.map((c) => {
                const cid = `${fid}-${i}-${c.key}`;
                const set = (v: unknown) => put(rows.map((x, j) => (j === i ? { ...x, [c.key]: v } : x)));
                if (c.kind === 'select') {
                  const used = new Set(rows.filter((_, j) => j !== i).map((x) => String(x[c.key] ?? '')));
                  return (
                    <div className="a2-fld" key={c.key}>
                      <label className="a2-lbl" htmlFor={cid}>
                        {c.label}
                      </label>
                      <select id={cid} className="a2-sel" value={String(r[c.key] ?? '')} disabled={off} onChange={(e) => set(e.target.value)} data-testid={`${testId}-${f.path}-${c.key}`}>
                        <option value="">{c.pick}</option>
                        {c.options
                          .filter((o) => !used.has(o.value))
                          .map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                      </select>
                    </div>
                  );
                }
                return (
                  <div className="a2-fld" key={c.key}>
                    <label className="a2-lbl" htmlFor={cid}>
                      {c.label}
                    </label>
                    <input
                      id={cid}
                      className="a2-inp"
                      type="number"
                      inputMode="numeric"
                      min={c.min}
                      max={c.max}
                      value={r[c.key] == null ? '' : String(r[c.key])}
                      disabled={off}
                      onChange={(e) => set(e.target.value === '' ? (c.optional ? null : '') : Number(e.target.value))}
                      data-testid={`${testId}-${f.path}-${c.key}`}
                    />
                  </div>
                );
              })}
              {canEdit ? (
                <div className="a2-fld" style={{ justifyContent: 'flex-end' }}>
                  <button type="button" className="a2-btn" disabled={off} onClick={() => put(rows.filter((_, j) => j !== i))} data-testid={`${testId}-${f.path}-remove`}>
                    {f.remove}
                  </button>
                </div>
              ) : null}
            </div>
          ))}
          {canEdit && rows.length < f.max ? (
            <span>
              <button type="button" className="a2-btn" disabled={off} onClick={() => put([...rows, blank])} data-testid={`${testId}-${f.path}-add`}>
                {f.add}
              </button>
            </span>
          ) : null}
        </div>
      );
    }
    const p = (draft[f.path] ?? null) as { en: string; bn: string } | null;
    const set = (lang: 'en' | 'bn', text: string) => {
      const next = { en: p?.en ?? '', bn: p?.bn ?? '', [lang]: text };
      edit(f.path, next.en.trim() || next.bn.trim() ? next : null);
    };
    // a long text (`rows`) takes the card's full width and grows to its rows instead of the one-line box height
    const tall = f.rows ? { height: 'auto', padding: '8px 12px', lineHeight: 1.5 } : undefined;
    return (
      <div className={`a2-fld${f.rows ? ' full' : ''}`} key={f.path}>
        {(['en', 'bn'] as const).map((lang) => (
          <span key={lang} className="a2-stack" style={{ gap: 4 }}>
            <label className="a2-lbl" htmlFor={`${fid}-${lang}`}>
              {f.label[lang]}
            </label>
            <textarea id={`${fid}-${lang}`} className="a2-inp" rows={f.rows ?? 2} style={tall} maxLength={f.max} value={p?.[lang] ?? ''} disabled={off} onChange={(e) => set(lang, e.target.value)} data-testid={`${testId}-${f.path}-${lang}`} />
          </span>
        ))}
        {help}
      </div>
    );
  };

  return (
    <section className="a2-sc a2-mt12" aria-labelledby={`${id}-h`} data-testid={testId}>
      <div className="a2-sch">
        <div>
          <h2 className="a2-h3" id={`${id}-h`}>
            {x.h}
          </h2>
          <p className="a2-scd">{x.d}</p>
        </div>
      </div>
      {!canEdit ? (
        <div className="a2-note">
          <ShellIcon name="lock" size={15} />
          <span>{x.readOnly}</span>
        </div>
      ) : null}
      <div className="a2-fg a2-mt12">{fields.map(field)}</div>
      <div className="a2-scbar">
        <span className={`a2-sm${said?.bad ? '' : ' a2-mute'}`} role="status" aria-live="polite" data-testid={`${testId}-status`}>
          {said ? said.text : dirty ? x.unsaved : ''}
        </span>
        {canEdit ? (
          <div className="a2-gap8">
            {dirty ? (
              <button type="button" className="a2-btn" disabled={busy} onClick={() => setDraft(base.value)}>
                {x.discard}
              </button>
            ) : null}
            <button type="button" className="a2-btn pri" disabled={busy || !dirty} onClick={save} data-testid={`${testId}-save`}>
              {busy ? x.saving : x.save}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
