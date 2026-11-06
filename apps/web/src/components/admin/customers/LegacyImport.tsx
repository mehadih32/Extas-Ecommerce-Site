'use client';
// S14 · PR 535 — Customers › More › Import old customers (demo V12.4 97u-adm2-customers.js CUS-06): choose the old shop's
// order list (CSV, read in the browser and sent as text; the file itself is never kept), see the preview — which column
// is which, what each status word means, how dates are written, and the counts (new customers, already here by phone, the
// same old order twice, brought in before, bad numbers) — change a choice and the preview is read again, then import
// after a confirm step. The past imports below, each with "Undo this import" (archived, never deleted). Importing and
// undoing need `customers.import` (the API checks it again and audits it). Words: `cus.imp.*`.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import type { LegacyField, LegacyImportScreen, LegacyOutcome, LegacyPreview } from '@extas/customers';
import { cusError } from '@/lib/admin-customers/words';
import { t, type Dict } from '@/lib/i18n';
import { showToast } from '@/components/admin/lumen/Toast';

/** The screen as the page passes it (dates as ISO text). */
export type ImportScreenProps = Omit<LegacyImportScreen, 'imports'> & { imports: (Omit<LegacyImportScreen['imports'][number], 'createdAt' | 'undoneAt'> & { createdAt: string; undoneAt: string | null })[] };

const FIELDS: readonly LegacyField[] = ['phone', 'name', 'address', 'orderedAt', 'total', 'status', 'ref'];
const OUTCOMES: readonly LegacyOutcome[] = ['delivered', 'returned', 'cancelled', 'other'];
const COUNTS = ['rows', 'toImport', 'newPeople', 'matched', 'sameInFile', 'importedBefore', 'badPhone', 'noDate'] as const;

type Choices = Pick<LegacyPreview, 'mapping' | 'dateOrder'> & { statuses: Record<string, LegacyOutcome> };

export function LegacyImport({ dict: d, screen, locale, timeZone }: { dict: Dict; screen: ImportScreenProps; locale: string; timeZone: string }) {
  const router = useRouter();
  const uid = useId();
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [prev, setPrev] = useState<LegacyPreview | null>(null);
  const [busy, setBusy] = useState<'read' | 'import' | 'undo' | null>(null);
  const [ask, setAsk] = useState<string | null>(null); // 'import', or an import's id to undo
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const w = (k: string, p?: Record<string, string | number>) => t(d, `cus.imp.${k}`, p);
  const n = (x: number) => new Intl.NumberFormat(locale, { numberingSystem: 'latn' }).format(x);
  const day = new Intl.DateTimeFormat(locale, { timeZone, numberingSystem: 'latn', dateStyle: 'medium' });
  const can = screen.enabled && screen.canImport;
  const hintsOf = (keys: readonly string[]) => Object.fromEntries(keys.map((k) => [k, w(`hint.${k}`).split(',').map((s) => s.trim()).filter(Boolean)]));

  const post = async <T,>(url: string, payload: unknown): Promise<T | null> => {
    setMsg(null);
    try {
      const res = await fetch(url, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const data = (await res.json().catch(() => ({ ok: false }))) as { ok?: boolean; error?: string; details?: string[] } & Record<string, unknown>;
      if (!data.ok) {
        setMsg({ ok: false, text: cusError(d, data.error, (data.details ?? []).join(', ')) });
        return null;
      }
      return data as T;
    } catch {
      setMsg({ ok: false, text: cusError(d, 'network') });
      return null;
    }
  };

  const read = async (f: { name: string; text: string }, choices: Choices | null) => {
    setBusy('read');
    // the admin's words guess the columns on the first read and any status word not chosen yet (a new status column)
    const payload = { fileName: f.name, csv: f.text, hints: { fields: hintsOf(FIELDS), outcomes: hintsOf(OUTCOMES.filter((o) => o !== 'other')) }, ...(choices ?? {}) };
    const r = await post<{ preview: LegacyPreview }>('/api/admin/customers/import/preview', payload);
    if (r) setPrev(r.preview);
    setBusy(null);
  };

  const choose = async (list: FileList | null) => {
    const picked = list?.[0];
    if (!picked) return;
    setPrev(null);
    setAsk(null);
    const f = { name: picked.name, text: await picked.text() };
    setFile(f);
    await read(f, null);
  };

  const choicesOf = (p: LegacyPreview): Choices => ({ mapping: p.mapping, dateOrder: p.dateOrder, statuses: Object.fromEntries(p.statuses.map((s) => [s.text, s.outcome])) });
  const change = (next: Partial<Choices>) => {
    if (!file || !prev) return;
    setAsk(null);
    void read(file, { ...choicesOf(prev), ...next });
  };

  const doImport = async () => {
    if (!file || !prev) return;
    setBusy('import');
    const r = await post<{ result: { counts: LegacyPreview['counts'] } }>('/api/admin/customers/import', { fileName: file.name, csv: file.text, ...choicesOf(prev), confirm: true });
    setBusy(null);
    setAsk(null);
    if (!r) return;
    const c = r.result.counts;
    showToast({ text: w('done', { n: n(c.toImport), people: n(c.newPeople), matched: n(c.matched) }), tone: 'ok' });
    setPrev(null);
    setFile(null);
    router.refresh();
  };

  const doUndo = async (id: string) => {
    setBusy('undo');
    const r = await post<{ result: { records: number; profilesArchived: number; profilesKept: number } }>(`/api/admin/customers/import/${id}/undo`, {});
    setBusy(null);
    setAsk(null);
    if (!r) return;
    showToast({ text: w('undoDone', { records: n(r.result.records), archived: n(r.result.profilesArchived), kept: n(r.result.profilesKept) }), tone: 'ok' });
    router.refresh();
  };

  const select = (id: string, label: string, value: string, options: { value: string; label: string }[], on: (v: string) => void, testId: string) => (
    <span className="a2-stack" style={{ gap: 4 }}>
      <label className="a2-xs a2-mute" htmlFor={id}>
        {label}
      </label>
      <select id={id} className="a2-sel" value={value} disabled={!!busy} onChange={(e) => on(e.target.value)} data-testid={testId}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  );

  const note = msg ? (
    <p className="a2-xs a2-mt12" role={msg.ok ? 'status' : 'alert'} style={msg.ok ? undefined : { color: 'var(--bad)' }} data-testid="imp-msg">
      {msg.text}
    </p>
  ) : null;

  const preview = prev ? (
    <section className="a2-card" data-testid="imp-preview">
      <h2 className="a2-h3">{w('prev.title', { file: prev.fileName })}</h2>
      <div className="a2-hist a2-mt12" data-testid="imp-counts">
        {COUNTS.map((k) => (
          <div key={k} data-k={k}>
            <b>{n(prev.counts[k])}</b>
            <span>{w(`count.${k}`)}</span>
          </div>
        ))}
      </div>
      <h3 className="a2-sm a2-mt12">{w('prev.columns')}</h3>
      <div className="a2-imp-grid a2-mt6">
        {FIELDS.map((f) =>
          select(
            `${uid}-f-${f}`,
            w(`field.${f}`),
            prev.mapping[f] === null ? '' : String(prev.mapping[f]),
            [{ value: '', label: w('field.none') }, ...prev.header.map((h, i) => ({ value: String(i), label: h || `#${i + 1}` }))],
            (v) => change({ mapping: { ...prev.mapping, [f]: v === '' ? null : Number(v) } }),
            `imp-map-${f}`,
          ),
        )}
        {select(
          `${uid}-date`,
          w('dateOrder.label'),
          prev.dateOrder,
          (['dmy', 'mdy'] as const).map((o) => ({ value: o, label: w(`dateOrder.${o}`) })),
          (v) => change({ dateOrder: v as Choices['dateOrder'] }),
          'imp-date',
        )}
      </div>
      {!prev.ready ? (
        <p className="a2-xs a2-mt6" role="alert" style={{ color: 'var(--bad)' }}>
          {w('prev.needPhone')}
        </p>
      ) : null}
      {prev.statuses.length ? (
        <>
          <h3 className="a2-sm a2-mt12">{w('prev.statuses')}</h3>
          <div className="a2-imp-grid a2-mt6">
            {prev.statuses.map((s, i) =>
              select(
                `${uid}-s-${i}`,
                `${s.text} · ${w('prev.statusRows', { n: n(s.rows) })}`,
                s.outcome,
                OUTCOMES.map((o) => ({ value: o, label: w(`outcome.${o}`) })),
                (v) => change({ statuses: { ...choicesOf(prev).statuses, [s.text]: v as LegacyOutcome } }),
                `imp-status-${i}`,
              ),
            )}
          </div>
        </>
      ) : null}
      {prev.badLines.length ? <p className="a2-xs a2-mute a2-mt12">{w('prev.badLines', { lines: prev.badLines.join(', ') })}</p> : null}
      <h3 className="a2-sm a2-mt12">{w('prev.sample')}</h3>
      <div className="a2-stack a2-mt6" style={{ gap: 6 }}>
        {prev.sample.map((r) => (
          <div key={r.line} className="a2-imp-row" data-fate={r.fate}>
            <span className="a2-stack" style={{ gap: 2, minWidth: 0 }}>
              <b className="a2-sm">{r.name ?? w('past.unknown')}</b>
              <span className="a2-xs a2-mute">
                {w('prev.line', { n: r.line })} · {r.phone?.text ?? '—'} · {r.orderedAt ? day.format(new Date(r.orderedAt)) : w('prev.noDate')} · {w(`outcome.${r.outcome}`)}
              </span>
            </span>
            <span className={`a2-pill ${r.fate === 'new' ? 'info' : r.fate === 'matched' ? 'ok' : r.fate === 'badPhone' ? 'warn' : 'line'}`}>{w(`fate.${r.fate}`)}</span>
          </div>
        ))}
      </div>
      <p className="a2-sm a2-mt12">{w('prev.never')}</p>
      {busy === 'read' ? <p className="a2-xs a2-mute a2-mt6">{w('prev.reading')}</p> : null}
      {ask === 'import' ? (
        <div className="a2-imp-ask a2-mt12" data-testid="imp-ask">
          <p className="a2-sm">{w('confirm', { n: n(prev.counts.toImport), file: prev.fileName, people: n(prev.counts.newPeople), matched: n(prev.counts.matched) })}</p>
          <span className="a2-gap8 a2-mt6" style={{ display: 'flex', flexWrap: 'wrap' }}>
            <button type="button" className="a2-btn pri" disabled={!!busy} onClick={doImport} data-testid="imp-yes">
              {busy === 'import' ? w('going') : w('go', { n: n(prev.counts.toImport) })}
            </button>
            <button type="button" className="a2-btn" disabled={!!busy} onClick={() => setAsk(null)}>
              {t(d, 'cus.grade.cancel')}
            </button>
          </span>
        </div>
      ) : (
        <span className="a2-gap8 a2-mt12" style={{ display: 'flex', flexWrap: 'wrap' }}>
          <button type="button" className="a2-btn pri" disabled={!!busy || !prev.ready || !prev.counts.toImport} onClick={() => setAsk('import')} data-testid="imp-go">
            {w('go', { n: n(prev.counts.toImport) })}
          </button>
        </span>
      )}
    </section>
  ) : null;

  const past = (
    <section className="a2-card" data-testid="imp-past">
      <h2 className="a2-h3">{w('past.title')}</h2>
      <div className="a2-stack a2-mt12" style={{ gap: 8 }}>
        {screen.imports.length === 0 ? <p className="a2-xs a2-mute">{w('past.none')}</p> : null}
        {screen.imports.map((x) => (
          <div key={x.id} className="a2-imp-row" data-testid="imp-past-row" data-undone={x.undoneAt ? '1' : undefined}>
            <span className="a2-stack" style={{ gap: 2, minWidth: 0 }}>
              <b className="a2-sm a2-imp-name">{x.fileName ?? w('past.unknown')}</b>
              <span className="a2-xs a2-mute">{w('past.line', { when: day.format(new Date(x.createdAt)), by: x.by ?? w('past.unknown') })}</span>
              <span className="a2-xs a2-mute">{w('past.counts', { rows: n(x.rowsTotal), imported: n(x.rowsImported), dups: n(x.duplicates), people: n(x.newPeople), matched: n(x.matched) })}</span>
              {x.undoneAt ? <span className="a2-xs">{w('past.undone', { when: day.format(new Date(x.undoneAt)) })}</span> : null}
              {ask === x.id ? (
                <span className="a2-imp-ask a2-mt6">
                  <span className="a2-sm">{w('undoConfirm')}</span>
                  <span className="a2-gap8 a2-mt6" style={{ display: 'flex', flexWrap: 'wrap' }}>
                    <button type="button" className="a2-btn pri" disabled={!!busy} onClick={() => doUndo(x.id)} data-testid="imp-undo-yes">
                      {w('undo')}
                    </button>
                    <button type="button" className="a2-btn" disabled={!!busy} onClick={() => setAsk(null)}>
                      {t(d, 'cus.grade.cancel')}
                    </button>
                  </span>
                </span>
              ) : null}
            </span>
            {screen.canImport && !x.undoneAt && ask !== x.id ? (
              <button type="button" className="a2-btn" disabled={!!busy} onClick={() => setAsk(x.id)} data-testid="imp-undo">
                {w('undo')}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );

  return (
    <div className="a2-stack a2-mt12" style={{ gap: 12 }}>
      <div className="a2-row a2-r2" style={{ alignItems: 'start' }}>
        <section className="a2-card" data-testid="imp-upload">
          <h2 className="a2-h3">{w('upload.title')}</h2>
          <p className="a2-xs a2-mute a2-mt6">{w('upload.hint')}</p>
          <p className="a2-xs a2-mute a2-mt6">{w('upload.limit', { n: n(screen.maxRows) })}</p>
          {can ? (
            <span className="a2-gap8 a2-mt12" style={{ display: 'flex', flexWrap: 'wrap' }}>
              <label className="a2-btn pri" htmlFor={`${uid}-file`} aria-disabled={!!busy || undefined}>
                {busy === 'read' && !prev ? w('upload.reading') : file ? w('another') : w('upload.choose')}
              </label>
              <input
                id={`${uid}-file`}
                className="a2-imp-file"
                type="file"
                accept=".csv,text/csv"
                disabled={!!busy}
                onChange={(e) => {
                  void choose(e.target.files);
                  e.target.value = '';
                }}
                data-testid="imp-file"
              />
            </span>
          ) : null}
          {note}
        </section>
        {past}
      </div>
      {preview}
    </div>
  );
}
