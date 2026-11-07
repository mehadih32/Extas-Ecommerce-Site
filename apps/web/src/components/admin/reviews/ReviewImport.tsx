'use client';
// PR 65 follow-up 232 — Products › Reviews › More options › "Import older reviews": pick a CSV file, "Check the file"
// (a dry run: every row checked, nothing saved), then "Import N reviews". Each imported review waits in To check like
// any other (never published by the import, never marked verified). Shown only to someone with `reviews.write`; the
// API checks again. The file is read in this browser and sent as text; nothing is uploaded anywhere else.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { showToast } from '@/components/admin/lumen/Toast';
import { t, type Dict } from '@/lib/i18n';

interface Row {
  line: number;
  ok: boolean;
  problems: string[];
  product: string | null;
  rating: number | null;
}
interface Result {
  dryRun: boolean;
  rows: Row[];
  ready: number;
  created: number;
  ignoredColumns: string[];
}

/** How many rows of the check are listed (the rest are counted). */
const SHOWN = 50; // hardcode-ok: a screen length, not a business number

export function ReviewImport({ dict: d }: { dict: Dict }) {
  const router = useRouter();
  const uid = useId();
  const [csv, setCsv] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function send(dryRun: boolean) {
    if (csv === null) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch('/api/admin/reviews/import', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ csv, dryRun }) });
      const data = (await r.json().catch(() => ({ ok: false }))) as { ok?: boolean; error?: string; details?: string[]; result?: Result };
      if (!data.ok || !data.result) return setErr(t(d, 'rev.imp.failed', { code: [data.error ?? String(r.status), ...(data.details ?? [])].join(' · ') }));
      setRes(data.result);
      if (!dryRun) {
        showToast({ text: t(d, 'rev.imp.done', { n: String(data.result.created) }), tone: 'ok' });
        setCsv(null);
        setName('');
        router.refresh();
      }
    } catch {
      setErr(t(d, 'rev.imp.failed', { code: 'network' }));
    } finally {
      setBusy(false);
    }
  }

  const bad = res ? res.rows.filter((r) => !r.ok) : [];
  return (
    <section className="a2-card rev-imp" data-testid="review-import">
      <h2 className="a2-h3">{t(d, 'rev.imp.h')}</h2>
      <p className="a2-sm a2-mute">{t(d, 'rev.imp.d')}</p>
      <p className="a2-xs a2-mute">
        <code>{t(d, 'rev.imp.cols')}</code>
      </p>
      <div className="lm-fl">
        <label htmlFor={`${uid}-f`}>{t(d, 'rev.imp.file')}</label>
        <input
          id={`${uid}-f`}
          className="lm-inp"
          type="file"
          accept=".csv,text/csv"
          disabled={busy}
          data-testid="review-import-file"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            setRes(null);
            setErr(null);
            setName(f?.name ?? '');
            setCsv(f ? await f.text() : null);
          }}
        />
      </div>
      <div className="rev-acts">
        <button type="button" className="a2-btn" disabled={busy || csv === null} onClick={() => send(true)} data-action="import-check">
          {t(d, 'rev.imp.check')}
        </button>
        {res?.dryRun && res.ready > 0 && csv !== null ? (
          <button type="button" className="a2-btn pri" disabled={busy} onClick={() => send(false)} data-action="import-go">
            {t(d, 'rev.imp.go', { n: String(res.ready) })}
          </button>
        ) : null}
      </div>
      {err ? (
        <p className="a2-xs" role="alert" style={{ color: 'var(--lm-bad)' }}>
          {err}
        </p>
      ) : null}
      {res ? (
        <div className="a2-sm" role="status" data-testid="review-import-result">
          <p>{res.dryRun ? t(d, 'rev.imp.checked', { file: name, ready: String(res.ready), bad: String(bad.length) }) : t(d, 'rev.imp.done', { n: String(res.created) })}</p>
          {res.ignoredColumns.length ? <p className="a2-xs a2-mute">{t(d, 'rev.imp.ignored', { cols: res.ignoredColumns.join(', ') })}</p> : null}
          {bad.length ? (
            <ul className="rev-imp-bad">
              {bad.slice(0, SHOWN).map((r) => (
                <li key={r.line} className="a2-xs">
                  {t(d, 'rev.imp.line', { line: String(r.line) })} · {r.problems.map((p) => t(d, `rev.imp.p.${p}`)).join(' · ')}
                </li>
              ))}
              {bad.length - SHOWN > 0 ? <li className="a2-xs a2-mute">{t(d, 'rev.imp.more', { n: String(bad.length - SHOWN) })}</li> : null}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
