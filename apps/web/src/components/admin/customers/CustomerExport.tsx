'use client';
// S14 · PR 299 — "Export" on Customers › All customers (demo 97u-adm2-customers.js: "Personal data export — logged with
// your name and reason; retention rules apply"). Shown only when the owner turned the export on and the person holds
// `customers.export`. A press opens one box: why (required), then "Download CSV" sends the list's own view, search,
// filter, sort and segment to the customers API, which writes the file under the retention rule and logs it; the file
// is saved by the browser. A refusal (too many people, switched off, no key) is shown in words from the page's messages.
import { useId, useState, type FormEvent } from 'react';
import { cusError } from '@/lib/admin-customers/words';
import { t, type Dict } from '@/lib/i18n';
import { ShellIcon } from '../shell/ShellIcon';
import { showToast } from '@/components/admin/lumen/Toast';

export interface ExportQuery {
  view?: string;
  q?: string;
  source?: string;
  sort?: string;
  segment?: string;
  district?: string;
}

/** `limits`: the reason's shortest and longest (the service's own, @extas/customers EXPORT_REASON). */
export function CustomerExport({ dict: d, query, limits: REASON }: { dict: Dict; query: ExportQuery; limits: { min: number; max: number } }) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const ready = reason.trim().length >= REASON.min;

  const go = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setMsg(null);
    const body = { ...Object.fromEntries(Object.entries(query).filter(([, v]) => v)), reason: reason.trim() };
    try {
      const res = await fetch('/api/admin/customers/export', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string; details?: string[]; data?: { count?: number; maxRows?: number } };
        setMsg({ ok: false, text: data.error === 'EXPORT_TOO_LARGE' ? t(d, 'cus.exp.tooMany', { n: String(data.data?.count ?? ''), max: String(data.data?.maxRows ?? '') }) : cusError(d, data.error ?? 'default', (data.details ?? []).join(', ')) });
        return;
      }
      const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'customers.csv';
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
      showToast({ text: t(d, 'cus.exp.done', { n: res.headers.get('x-rows') ?? '0' }), tone: 'ok' });
      setReason('');
      setOpen(false);
    } catch {
      setMsg({ ok: false, text: cusError(d, 'network') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="a2-mt12" data-testid="cus-export">
      {open ? (
        <form className="a2-card tight" onSubmit={go}>
          <label className="a2-sm" htmlFor={`${uid}-r`}>
            <b>{t(d, 'cus.exp.why')}</b>
          </label>
          <input id={`${uid}-r`} className="a2-inp a2-mt6" style={{ width: '100%' }} value={reason} minLength={REASON.min} maxLength={REASON.max} placeholder={t(d, 'cus.exp.whyPlaceholder')} onChange={(e) => setReason(e.target.value)} data-testid="cus-export-reason" autoFocus />
          <p className="a2-xs a2-mute a2-mt6">{t(d, 'cus.exp.rule')}</p>
          <div className="a2-gap8 a2-mt12">
            <button type="submit" className="a2-btn pri" disabled={!ready || busy} data-testid="cus-export-go">
              <ShellIcon name="dl" size={14} />
              {t(d, busy ? 'cus.exp.busy' : 'cus.exp.go')}
            </button>
            <button type="button" className="a2-btn" onClick={() => setOpen(false)} disabled={busy}>
              {t(d, 'cus.exp.cancel')}
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="a2-btn" onClick={() => setOpen(true)} data-testid="cus-export-open">
          <ShellIcon name="dl" size={14} />
          {t(d, 'cus.exp.open')}
        </button>
      )}
      {msg ? (
        <p className="a2-xs a2-mt6" role={msg.ok ? 'status' : 'alert'} style={msg.ok ? undefined : { color: 'var(--bad)' }} data-testid="cus-export-msg">
          {msg.text}
        </p>
      ) : null}
    </div>
  );
}
