'use client';
// S20 · PR 408 (Blueprint B2.4) — the "Print check" card on Orders › Packing & print › Print run: one press draws every
// document at every size in the owner's settings from sample words (POST /api/admin/packing/stickers/check) and shows,
// for each, its pages and whether it prints right or which rule it breaks. Nothing is printed or counted. Words from the
// page's messages (`ful.check.*`).
import { useState } from 'react';
import { t, type Dict } from '@/lib/i18n';

interface Row {
  doc: string;
  size: string;
  pages: number;
  problems: string[];
}

export function PrintCheck({ dict, url, sizeLabel, testId }: { dict: Dict; url: string; sizeLabel: Record<string, string>; testId: string }) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ edgeMm: number; rows: Row[] } | null>(null);
  const [err, setErr] = useState(false);
  const w = (k: string, v?: Record<string, string | number>) => t(dict, `ful.check.${k}`, v);
  const run = async () => {
    setBusy(true);
    setErr(false);
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      const j = (await r.json()) as { ok: boolean; edgeMm: number; rows: Row[] };
      if (!r.ok || !j.ok) throw new Error(String(r.status));
      setRes({ edgeMm: j.edgeMm, rows: j.rows });
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  };
  const ok = res ? res.rows.filter((r) => !r.problems.length).length : 0;
  return (
    <section className="a2-card a2-mt12" aria-label={w('h')} data-testid={testId}>
      <div className="a2-between">
        <div>
          <h2 className="a2-h4">{w('h')}</h2>
          <p className="a2-xs a2-mute a2-mt6">{w('d')}</p>
        </div>
        <div className="a2-cmds">
          <button type="button" className="a2-btn sm" onClick={run} disabled={busy} data-testid={`${testId}-run`}>
            {busy ? w('running') : res ? w('again') : w('run')}
          </button>
        </div>
      </div>
      {err ? (
        <p className="a2-xs a2-mt6" role="alert" style={{ color: 'var(--bad)' }}>
          {w('err')}
        </p>
      ) : null}
      {res ? (
        <>
          <p className="a2-xs a2-mt12" data-testid={`${testId}-summary`}>
            <b>{ok === res.rows.length ? w('allOk') : ''}</b> {w('summary', { ok, all: res.rows.length, edge: res.edgeMm })}
          </p>
          <div className="a2-tblw a2-mt6">
            <table className="a2-tbl">
              <thead>
                <tr>
                  <th>{w('col.doc')}</th>
                  <th>{w('col.size')}</th>
                  <th className="r">{w('col.pages')}</th>
                  <th>{w('col.result')}</th>
                </tr>
              </thead>
              <tbody>
                {res.rows.map((r) => (
                  <tr key={`${r.doc}-${r.size}`} data-testid={`${testId}-row`} data-ok={r.problems.length ? '0' : '1'}>
                    <td className="a2-tdh">
                      <b>{w(`doc.${r.doc}`)}</b>
                    </td>
                    <td data-l={w('col.size')}>{sizeLabel[r.size] ?? r.size}</td>
                    <td className="r" data-l={w('col.pages')}>
                      <span className="a2-num">{r.pages}</span>
                    </td>
                    <td data-l={w('col.result')}>{r.problems.length ? <span style={{ color: 'var(--bad)' }}>{r.problems.map((p) => w(`problem.${p}`)).join(' · ')}</span> : <span className="a2-pill ok">{w('ok')}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}
