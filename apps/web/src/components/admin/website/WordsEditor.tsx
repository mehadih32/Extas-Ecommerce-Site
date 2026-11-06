'use client';
// S02 · PR 78 — Website › Words & language: one page of the shop's words. Each row shows the word's key and where it is
// used, the shop's and the owner's word in English and Bengali; "Change" opens the owner's two boxes (empty = the
// shop's word), Save and "Back to the shop's word". A save sends only that word with the version the page was read at
// (PUT /api/admin/website/dictionary, `website.words.write`; the API checks everything again). The file card downloads
// every word as CSV; its import sends the whole file and reloads the page. Words: messages/admin-words.<lang>.json.
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import type { WordRow } from '@/lib/website/words';

const API = '/api/admin/website/dictionary';

export interface WordsEditorWords {
  en: string;
  bn: string;
  shopWord: string;
  yours: string;
  changed: string;
  untr: string;
  change: string;
  ownEn: string;
  ownBn: string;
  emptyHelp: string;
  slotsHelp: string;
  save: string;
  saving: string;
  saved: string;
  back: string;
  backDone: string;
  err: Record<string, string>;
}

type Msg = { ok: boolean; text: string } | null;
type Own = { en: string; bn: string };

async function put(payload: Record<string, unknown>): Promise<{ ok: boolean; error?: string; details?: (string | number)[]; version?: string; changed?: string[]; saved?: Record<string, { en?: string; bn?: string }> }> {
  try {
    const res = await fetch(API, { method: 'PUT', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    const a = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.ok && a.ok) return a as never;
    const error = typeof a.error === 'string' ? a.error : res.status === 403 ? 'forbidden' : res.status === 401 ? 'unauthorized' : 'other';
    return { ok: false, error, details: Array.isArray(a.details) ? (a.details as (string | number)[]) : [] };
  } catch {
    return { ok: false, error: 'network' };
  }
}

/** The refusal in words; a refused `key.en` / `key.bn` is named with its language. */
const errText = (err: Record<string, string>, code: string | undefined, details: (string | number)[] = [], langs?: Record<'en' | 'bn', string>) =>
  (err[code ?? 'other'] ?? err.other ?? '').replace('{details}', details.map((d) => (langs ? String(d).replace(/\.(en|bn)$/, (_, l: 'en' | 'bn') => ` (${langs[l]})`) : d)).join(', '));
const slotsOf = (s: string) => [...new Set([...s.matchAll(/\{\w+\}/g)].map((m) => m[0]))];

interface RowProps {
  row: WordRow;
  where: string;
  canEdit: boolean;
  version: string;
  setVersion: (v: string) => void;
  w: WordsEditorWords;
}

function WordItem({ row, where, canEdit, version, setVersion, w }: RowProps) {
  const [own, setOwn] = useState<Own>(row.own);
  const [draft, setDraft] = useState<Own>(row.own);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const changed = !!(own.en || own.bn);
  const slots = slotsOf(row.byDefault.en);
  const id = `wd-${row.key.replace(/\./g, '-')}`;

  async function save(next: Own, done: string) {
    setBusy(true);
    setMsg(null);
    const a = await put({ version, words: { [row.key]: next } });
    setBusy(false);
    if (!a.ok) return setMsg({ ok: false, text: errText(w.err, a.error, a.details, { en: w.en, bn: w.bn }) });
    const s = a.saved?.[row.key] ?? {};
    const saved = { en: s.en ?? '', bn: s.bn ?? '' };
    setOwn(saved);
    setDraft(saved);
    if (a.version) setVersion(a.version);
    setMsg({ ok: true, text: done });
  }

  const shown = (lang: 'en' | 'bn') => (
    <div className="wdb-lang" lang={lang}>
      <span className="a2-xs a2-mute">{lang === 'en' ? w.en : w.bn}</span>
      <span className="a2-sm wdb-text" data-testid={`wd-show-${lang}`}>
        {own[lang] || row.byDefault[lang]}
      </span>
      {own[lang] ? (
        <span className="a2-xs a2-mute wdb-text">
          {w.shopWord}: {row.byDefault[lang]}
        </span>
      ) : null}
    </div>
  );

  return (
    <li className="wdb-row" data-testid="wd-row" data-key={row.key}>
      <div className="wdb-head">
        <code className="a2-xs wdb-key">{row.key}</code>
        <span className="a2-xs a2-mute">{where}</span>
        {changed ? (
          <span className="a2-pill g" data-testid="wd-changed">
            {w.changed}
          </span>
        ) : null}
        {row.untranslated && !(own.bn || own.en) ? <span className="a2-pill warn">{w.untr}</span> : null}
      </div>
      <div className="wdb-langs">
        {shown('en')}
        {shown('bn')}
      </div>
      {canEdit ? (
        <details className="a2-more-opts wdb-fold" data-testid="wd-fold">
          <summary className="a2-sm">{w.change}</summary>
          <div className="wdb-form">
            {(['en', 'bn'] as const).map((lang) => (
              <div className="a2-fld" key={lang}>
                <label className="a2-lbl" htmlFor={`${id}-${lang}`}>
                  {lang === 'en' ? w.ownEn : w.ownBn}
                </label>
                <textarea
                  id={`${id}-${lang}`}
                  className="a2-ta"
                  lang={lang}
                  rows={2}
                  maxLength={300}
                  value={draft[lang]}
                  placeholder={row.byDefault[lang]}
                  onChange={(e) => setDraft({ ...draft, [lang]: e.target.value })}
                  data-testid={`wd-in-${lang}`}
                />
              </div>
            ))}
            <p className="a2-xs a2-mute">
              {w.emptyHelp}
              {slots.length ? ` ${w.slotsHelp.replace('{slots}', slots.join(' '))}` : ''}
            </p>
            <div className="wdb-bar">
              <button type="button" className="a2-btn pri" disabled={busy || (draft.en === own.en && draft.bn === own.bn)} onClick={() => void save(draft, w.saved)} data-testid="wd-save">
                {busy ? w.saving : w.save}
              </button>
              <button type="button" className="a2-btn" disabled={busy || !changed} onClick={() => void save({ en: '', bn: '' }, w.backDone)} data-testid="wd-back">
                {w.back}
              </button>
            </div>
          </div>
        </details>
      ) : null}
      {msg ? (
        <p className="a2-xs wdb-msg" role={msg.ok ? 'status' : 'alert'} style={msg.ok ? undefined : { color: 'var(--bad)' }} data-testid="wd-msg">
          {msg.text}
        </p>
      ) : null}
    </li>
  );
}

export interface WordsImportWords {
  title: string;
  sub: string;
  exportHref: string;
  exportLabel: string;
  importLabel: string;
  importPick: string;
  importGo: string;
  importing: string;
  imported: string;
  importNone: string;
}

interface Props {
  rows: WordRow[];
  version: string;
  canEdit: boolean;
  where: Record<string, string>;
  w: WordsEditorWords;
  /** The "Words as a file" card (export for everyone who sees the page, import with `website.words.write`). */
  file: WordsImportWords;
  /** The list card's heading and notes. */
  head: ReactNode;
  /** Drawn under the list, in its card (the page links). */
  children?: ReactNode;
}

/**
 * The list of one page of words and the file card. Every save answers the new version of the saved words, which the
 * next save (a row or an import) sends; after an import the page reloads and the rows show the new words.
 */
export function WordsEditor({ rows, version: read, canEdit, where, w, file, head, children }: Props) {
  const router = useRouter();
  const [version, setVersion] = useState(read);
  const [seen, setSeen] = useState(read);
  if (read !== seen) {
    setSeen(read);
    setVersion(read);
  }
  const [csv, setCsv] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  async function bring() {
    if (!csv) return;
    setBusy(true);
    setMsg(null);
    const a = await put({ version, csv: await csv.text() });
    setBusy(false);
    if (!a.ok) return setMsg({ ok: false, text: errText(w.err, a.error, a.details) });
    const n = a.changed?.length ?? 0;
    if (a.version) setVersion(a.version);
    setMsg({ ok: true, text: n ? file.imported.replace('{n}', String(n)) : file.importNone });
    router.refresh();
  }

  return (
    <>
      <section className="a2-sc a2-mt12" aria-labelledby="wd-h" data-testid="wd-card">
        {head}
        <ul className="wdb-list" data-testid="wd-list">
        {rows.map((r) => (
          <WordItem key={`${r.key}:${read}`} row={r} where={where[r.group] ?? r.group} canEdit={canEdit} version={version} setVersion={setVersion} w={w} />
        ))}
        </ul>
        {children}
      </section>
      <section className="a2-sc a2-mt12" aria-labelledby="wd-file-h" data-testid="wd-file-card">
        <h2 className="a2-h3" id="wd-file-h">
          {file.title}
        </h2>
        <p className="a2-xs a2-mute wdb-mt6">{file.sub}</p>
        <div className="wdb-bar">
          <a className="a2-btn" href={file.exportHref} download data-testid="wd-export">
            {file.exportLabel}
          </a>
        </div>
        {canEdit ? (
          <div className="wdb-import">
            <h3 className="a2-sm">{file.importLabel}</h3>
            <label className="a2-lbl" htmlFor="wd-file">
              {file.importPick}
            </label>
            <input id="wd-file" type="file" accept=".csv,text/csv" className="wdb-file" onChange={(e) => setCsv(e.target.files?.[0] ?? null)} data-testid="wd-file" />
            <div className="wdb-bar">
              <button type="button" className="a2-btn" disabled={busy || !csv} onClick={() => void bring()} data-testid="wd-import">
                {busy ? file.importing : file.importGo}
              </button>
            </div>
            {msg ? (
              <p className="a2-xs wdb-msg" role={msg.ok ? 'status' : 'alert'} style={msg.ok ? undefined : { color: 'var(--bad)' }} data-testid="wd-import-msg">
                {msg.text}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>
    </>
  );
}
