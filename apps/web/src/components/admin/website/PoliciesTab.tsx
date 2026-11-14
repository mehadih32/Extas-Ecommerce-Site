'use client';
// PR 718 — Website › Policies: the nine policy pages as a row of chips, and for the chosen page its words in English and
// Bengali (title, line, body), a live preview of the public page in either language, its state, who changed it last and
// when, the link to the public page, and the history of versions with "Restore as new draft". "Save draft" keeps the
// words as the page's open draft; "Publish" saves any change first and makes the draft the live page (PUT
// /api/admin/website/policies; the API checks everything again). A restore never removes anything: it brings an older
// version's words back as a new draft. Every box is 16px or larger and every button 44px tall.
import { useEffect, useMemo, useState } from 'react';
import { textBlocks } from '@/lib/shop/help-pages';
import type { PolicyRow, PolicyVersion } from '@/lib/website-policies/service';
import type { PolicySlug, PolicyWords } from '@/lib/website-policies/model';
import { showToast } from '../lumen/Toast';

const API = '/api/admin/website/policies';
type Texts = Record<string, string>;
type Lang = 'en' | 'bn';
interface Draft {
  title: { en: string; bn: string };
  lede: { en: string; bn: string };
  body: { en: string; bn: string };
}

const toDraft = (w: PolicyWords | null | undefined): Draft => ({
  title: { en: w?.title?.en ?? '', bn: w?.title?.bn ?? '' },
  lede: { en: w?.lede?.en ?? '', bn: w?.lede?.bn ?? '' },
  body: { en: w?.body?.en ?? '', bn: w?.body?.bn ?? '' },
});
const toWords = (d: Draft) => {
  const one = (p: { en: string; bn: string }) => (p.en.trim() || p.bn.trim() ? { en: p.en, bn: p.bn } : null);
  return { title: one(d.title), lede: one(d.lede), body: one(d.body) };
};
const startOf = (r: PolicyRow): Draft => toDraft((r.draft ?? r.live)?.words);

async function send(payload: Record<string, unknown>): Promise<{ ok: boolean; rows?: PolicyRow[]; error?: string; details?: string[] }> {
  try {
    const res = await fetch(API, { method: 'PUT', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const a = (await res.json().catch(() => ({}))) as { ok?: boolean; view?: { rows: PolicyRow[] }; error?: string; details?: string[] };
    if (res.ok && a.ok && a.view) return { ok: true, rows: a.view.rows };
    return { ok: false, error: a.error ?? (res.status === 403 ? 'forbidden' : res.status === 401 ? 'unauthorized' : 'other'), details: a.details };
  } catch {
    return { ok: false, error: 'network' };
  }
}

export function PoliciesTab({ rows: first, w, names, initial, canEdit, locale, timeZone, shopLang }: { rows: PolicyRow[]; w: Texts; names: Record<string, string>; initial: PolicySlug; canEdit: boolean; locale: string; timeZone: string; shopLang: Lang }) {
  const [rows, setRows] = useState(first);
  const [slug, setSlug] = useState<PolicySlug>(initial);
  const row = rows.find((r) => r.slug === slug)!;
  const [draft, setDraft] = useState<Draft>(() => startOf(row));
  const [base, setBase] = useState<string>(() => JSON.stringify(startOf(row)));
  const [lang, setLang] = useState<Lang>(shopLang);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const dirty = JSON.stringify(draft) !== base;

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const when = (iso: string | null) => (iso ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(iso)) : '');
  const fill = (k: string, vars: Record<string, string | number> = {}) => Object.entries(vars).reduce((s, [a, b]) => s.replaceAll(`{${a}}`, String(b)), w[k] ?? k);
  const problem = (code: string | undefined, details: string[] = []) => {
    const base = w[`err.${code}`] ?? w['err.other']!;
    const named = details.map((d) => w[`field.${d}`] ?? d).join(', ');
    return named ? `${base} (${named})` : base;
  };

  function open(next: PolicySlug) {
    if (next === slug) return;
    if (dirty && !window.confirm(w['unsaved']!)) return;
    const r = rows.find((x) => x.slug === next)!;
    setSlug(next);
    setDraft(startOf(r));
    setBase(JSON.stringify(startOf(r)));
    setErr(null);
    const u = new URL(window.location.href);
    u.searchParams.set('page', next);
    window.history.replaceState(null, '', u);
  }

  function adopt(next: PolicyRow[], keep: PolicySlug) {
    setRows(next);
    const r = next.find((x) => x.slug === keep)!;
    setDraft(startOf(r));
    setBase(JSON.stringify(startOf(r)));
  }

  async function save(): Promise<PolicyRow[] | null> {
    const a = await send({ page: slug, words: toWords(draft), version: row.latest });
    if (!a.ok) {
      setErr(problem(a.error, a.details));
      return null;
    }
    return a.rows!;
  }

  async function onSave() {
    setBusy(true);
    setErr(null);
    const next = await save();
    setBusy(false);
    if (!next) return;
    adopt(next, slug);
    showToast({ text: w['saved']!, tone: 'ok' });
  }

  async function onPublish() {
    setBusy(true);
    setErr(null);
    let list = rows;
    let latest = row.latest;
    if (dirty) {
      const next = await save();
      if (!next) return setBusy(false);
      list = next;
      latest = next.find((x) => x.slug === slug)!.latest;
    }
    const a = await send({ page: slug, publish: true, version: latest });
    setBusy(false);
    if (!a.ok) {
      setErr(problem(a.error, a.details));
      adopt(list, slug);
      return;
    }
    adopt(a.rows!, slug);
    showToast({ text: w['published']!, tone: 'ok' });
  }

  async function onRestore(v: PolicyVersion) {
    if (dirty && !window.confirm(w['unsaved']!)) return;
    setBusy(true);
    setErr(null);
    const a = await send({ page: slug, restore: v.version, version: row.latest });
    setBusy(false);
    if (!a.ok) return setErr(problem(a.error, a.details));
    adopt(a.rows!, slug);
    showToast({ text: fill('restored', { v: v.version }), tone: 'ok' });
  }

  const blocks = useMemo(() => textBlocks(draft.body[lang] || draft.body.en), [draft.body, lang]);
  const title = draft.title[lang] || draft.title.en || names[slug]!;
  const lede = draft.lede[lang] || draft.lede.en;
  const pill = (state: PolicyRow['state']) => (
    <span className={`a2-pill ${state === 'draft' ? '' : state === 'published' ? 'ok' : 'warn'}`} data-testid={`pol-state-${state}`}>
      {w[`state.${state}`]}
    </span>
  );
  const field = (f: 'title' | 'lede' | 'body', l: Lang) => {
    const id = `pol-${f}-${l}`;
    const common = {
      id,
      lang: l,
      value: draft[f][l],
      readOnly: !canEdit,
      maxLength: f === 'title' ? 80 : f === 'lede' ? 400 : 20000,
      'data-testid': id,
    };
    const set = (v: string) => setDraft({ ...draft, [f]: { ...draft[f], [l]: v } });
    return (
      <div className="a2-fld" key={id}>
        <label className="a2-lbl" htmlFor={id}>
          {w[`label.${f}`]} · {l === 'en' ? 'English' : 'বাংলা'}
        </label>
        {f === 'body' ? (
          <textarea {...common} className="a2-inp polb-body" rows={12} onChange={(e) => set(e.target.value)} />
        ) : (
          <input {...common} className="a2-inp" type="text" onChange={(e) => set(e.target.value)} />
        )}
      </div>
    );
  };

  return (
    <div className="polb" data-testid="pol-tab">
      <div className="a2-chips polb-chips" role="group" aria-label={w['pages']}>
        {rows.map((r) => (
          <button key={r.slug} type="button" className={`a2-chipt${r.slug === slug ? ' on' : ''}`} aria-pressed={r.slug === slug} onClick={() => open(r.slug)} data-testid={`pol-chip-${r.slug}`}>
            {names[r.slug]}
            <span className={`polb-dot ${r.state}`} aria-hidden="true" />
          </button>
        ))}
      </div>

      <section className="a2-sc a2-mt12" aria-labelledby="pol-h" data-testid="pol-card">
        <div className="polb-head">
          <h2 className="a2-h3" id="pol-h">
            {names[slug]}
          </h2>
          {pill(row.state)}
        </div>
        <p className="a2-xs a2-mute" data-testid="pol-meta">
          {row.lastEditedAt ? fill('lastEdited', { when: when(row.lastEditedAt), by: row.lastEditedBy ?? w['someone']! }) : w['neverEdited']}
          {' · '}
          {row.state === 'draft' ? (
            <span data-testid="pol-url-off">{fill('notLive', { path: row.path })}</span>
          ) : (
            <a href={`${shopLang === 'bn' ? '/bn' : ''}${row.path}`} target="_blank" rel="noopener noreferrer" data-testid="pol-url">
              {row.path}
            </a>
          )}
        </p>
        {row.existing ? <p className="a2-xs a2-mute polb-mt6">{w['sharedNote']}</p> : null}

        <div className="polb-grid">
          <div className="polb-edit">
            {(['en', 'bn'] as const).map((l) => (
              <div key={l} className="polb-lang">
                {(['title', 'lede', 'body'] as const).map((f) => field(f, l))}
              </div>
            ))}
          </div>
          <aside className="polb-prev" aria-label={w['preview']} data-testid="pol-preview">
            <div className="polb-prevbar">
              <b className="a2-sm">{w['preview']}</b>
              <div className="a2-seg" role="group" aria-label={w['previewLang']}>
                {(['en', 'bn'] as const).map((l) => (
                  <button key={l} type="button" className={lang === l ? 'on' : undefined} aria-pressed={lang === l} onClick={() => setLang(l)} data-testid={`pol-prev-${l}`}>
                    {l === 'en' ? 'EN' : 'বাং'}
                  </button>
                ))}
              </div>
            </div>
            <div className="polb-page" lang={lang}>
              <h3>{title}</h3>
              {lede ? <p className="polb-lede">{lede}</p> : null}
              {blocks.length ? (
                blocks.map((b, i) => (b.kind === 'h' ? <h4 key={i}>{b.text}</h4> : b.kind === 'p' ? <p key={i}>{b.text}</p> : <ul key={i}>{b.items.map((x, j) => <li key={j}>{x}</li>)}</ul>))
              ) : (
                <p className="a2-mute" data-testid="pol-prev-empty">
                  {w['previewEmpty']}
                </p>
              )}
            </div>
            <p className="a2-xs a2-mute">{w['previewHelp']}</p>
          </aside>
        </div>

        {err ? (
          <p className="a2-bad" role="alert" data-testid="pol-err">
            {err}
          </p>
        ) : null}
        {canEdit ? (
          <div className="polb-bar">
            <button type="button" className="a2-btn" disabled={busy || !dirty} onClick={onSave} data-testid="pol-save">
              {busy ? w['saving'] : w['saveDraft']}
            </button>
            <button type="button" className="a2-btn pri" disabled={busy || (!dirty && !row.draft)} onClick={onPublish} data-testid="pol-publish">
              {w['publish']}
            </button>
            {dirty ? <span className="a2-xs a2-mute">{w['unsavedShort']}</span> : null}
          </div>
        ) : (
          <p className="a2-xs a2-mute">{w['readOnly']}</p>
        )}
      </section>

      <section className="a2-sc a2-mt12" aria-labelledby="pol-hist" data-testid="pol-history">
        <h2 className="a2-h3" id="pol-hist">
          {w['history']}
        </h2>
        <p className="a2-xs a2-mute">{w['historyHelp']}</p>
        {row.versions.length ? (
          <ul className="polb-list">
            {row.versions.map((v) => (
              <li key={v.version} className="polb-ver" data-testid={`pol-ver-${v.version}`}>
                <div className="polb-vtext">
                  <b>{fill('version', { v: v.version })}</b> <span className={`a2-pill ${v.status === 'PUBLISHED' ? 'ok' : v.status === 'DRAFT' ? 'warn' : ''}`}>{w[`vs.${v.status}`]}</span>
                  <span className="a2-xs a2-mute polb-block">
                    {when(v.at)} · {v.by ?? w['someone']} · {v.source === 'settings' ? w['src.settings'] : v.source === 'restore' ? fill('src.restore', { v: v.restoredFrom ?? 0 }) : w['src.edit']}
                  </span>
                </div>
                {canEdit && v.status !== 'DRAFT' ? (
                  <button type="button" className="a2-btn" disabled={busy} onClick={() => onRestore(v)} data-testid={`pol-restore-${v.version}`}>
                    {w['restore']}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="a2-sm" data-testid="pol-nohist">
            {w['noHistory']}
          </p>
        )}
      </section>
    </div>
  );
}
