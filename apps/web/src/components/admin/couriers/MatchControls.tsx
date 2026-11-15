'use client';
// parity F4 · PR 849 — the "What to match" card of the prototype's Match courier account: the Courier choice, the Period chips
// (the months back, as links) and "Courier statement": the CSV file the courier sent. The file is read in the browser and sent
// to the statement import (`POST /api/admin/payments/settlements`, `payments.settle`): every line is matched with our parcels,
// nothing is paid and no money moves from here. The same file twice is one statement (the import keys it by the file's hash).
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { showToast } from '@/components/admin/lumen/Toast';
import { t, type Dict } from '@/lib/i18n';

export interface MatchCourier {
  id: string;
  name: string;
}

export function MatchControls({
  dict,
  couriers,
  courierId,
  months,
  month,
  canUpload,
}: {
  dict: Dict;
  couriers: readonly MatchCourier[];
  courierId: string;
  /** The months to pick, newest first, as `YYYY-MM`. */
  months: readonly string[];
  month: string;
  canUpload: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const c = (k: string, v?: Record<string, string | number>) => t(dict, `cr.z.${k}`, v);

  const choose = async (f: File | undefined) => {
    setMsg(null);
    if (!f) return setFile(null);
    setFile({ name: f.name, text: await f.text() });
  };
  const upload = async () => {
    if (!file) return setMsg({ ok: false, text: c('csvFirst') });
    if (!window.confirm(c('csvConfirm', { file: file.name }))) return;
    setBusy(true);
    setMsg(null);
    let data: { ok?: boolean; error?: string; settlement?: { lines?: unknown[]; matched?: number; mismatched?: number; late?: number } } = { ok: false, error: 'other' };
    try {
      const res = await fetch('/api/admin/payments/settlements', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ courierAccountId: courierId, reference: file.name.slice(0, 120), csv: file.text }),
      });
      data = (await res.json().catch(() => data)) as typeof data;
    } catch {
      data = { ok: false, error: 'network' };
    }
    setBusy(false);
    if (!data.ok) {
      const k = `cr.z.csvErr.${data.error ?? 'other'}`;
      const text = t(dict, k);
      return setMsg({ ok: false, text: text === k ? c('csvErr.other') : text });
    }
    const s = data.settlement;
    const total = s?.lines?.length ?? 0;
    const bad = (s?.mismatched ?? 0) + (s?.late ?? 0);
    setMsg({ ok: true, text: c('csvDone', { n: total, ok: s?.matched ?? Math.max(0, total - bad), bad }) });
    showToast({ text: c('csvToast'), tone: 'ok' });
    setFile(null);
    if (input.current) input.current.value = '';
    router.refresh();
  };

  const go = (cid: string, ym: string) => router.push(`/admin/delivery/couriers/${cid}/statement?month=${ym}`);
  return (
    <section className="a2-card a2-mt12" data-testid="statement-match">
      <h2 className="a2-h3">{c('whatToMatch')}</h2>
      <div className="a2-mt6" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
        <div>
          <label className="a2-lbl" htmlFor="match-courier">
            {c('courier')}
          </label>
          <select id="match-courier" className="a2-sel" value={courierId} onChange={(e) => go(e.target.value, month)} data-testid="match-courier">
            {couriers.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className="a2-lbl" id="match-period">
            {c('period')}
          </span>
          <span className="a2-seg" role="group" aria-labelledby="match-period" data-testid="match-period">
            {months.map((ym) => (
              <button key={ym} type="button" className={ym === month ? 'on' : ''} aria-pressed={ym === month} onClick={() => go(courierId, ym)} style={{ minHeight: 44 }}>
                {ym}
              </button>
            ))}
          </span>
        </div>
        <div>
          <span className="a2-lbl" id="match-src">
            {c('statementSrc')}
          </span>
          {canUpload ? (
            <div aria-labelledby="match-src">
              <input ref={input} type="file" accept=".csv,text/csv" className="a2-inp" aria-label={c('csvChoose')} onChange={(e) => void choose(e.target.files?.[0])} data-testid="match-file" />
              <span className="a2-gap8 a2-mt6" style={{ flexWrap: 'wrap' }}>
                <button type="button" className="a2-btn pri" onClick={upload} disabled={busy || !file} style={{ minHeight: 44 }} data-testid="match-go">
                  {busy ? c('matching') : c('matchNow')}
                </button>
                <span className="a2-xs a2-mute">{file ? `✓ ${file.name}` : c('csvChoose')}</span>
              </span>
            </div>
          ) : (
            <p className="a2-xs a2-mute">{c('csvNoRight')}</p>
          )}
        </div>
      </div>
      {msg ? (
        <p className="a2-xs a2-mt6" role={msg.ok ? 'status' : 'alert'} style={msg.ok ? undefined : { color: 'var(--bad)' }}>
          {msg.text}
        </p>
      ) : null}
    </section>
  );
}
