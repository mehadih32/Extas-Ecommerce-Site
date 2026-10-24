'use client';
// S08 · PR 179–181 — a button that asks the admin API for a PDF (stickers, a handover sheet, a picking list) and opens it
// in a new tab to print. The tab is opened at the press (so the browser does not block it) and gets the PDF when it is
// ready; when the browser blocks it anyway, the PDF is downloaded instead. A refusal is shown in words from the page's
// messages (`ful.err.<code>`; for stickers each parcel's reason `ful.sticker.problem.<code>`), never the server's own.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { fulError } from '@/lib/admin-fulfil/words';
import { t, type Dict } from '@/lib/i18n';

export interface PdfButtonProps {
  dict: Dict;
  url: string;
  method?: 'GET' | 'POST';
  body?: Record<string, unknown>;
  label: string;
  busyLabel?: string;
  tone?: 'pri' | 'ghost' | '';
  size?: 'sm' | 'lg' | '';
  testId?: string;
  disabled?: boolean;
  /** Reload the page's data after the PDF is made (print counts changed). */
  refresh?: boolean;
  /** The file name when the PDF is downloaded instead. */
  fileName?: string;
}

type Refused = { orderNumber?: string; problem?: string }[];

export function PdfButton({ dict, url, method = 'POST', body, label, busyLabel, tone = '', size = 'sm', testId, disabled, refresh = true, fileName = 'document.pdf' }: PdfButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const go = async () => {
    setMsg(null);
    setBusy(true);
    const tab = window.open('', '_blank');
    try {
      const res = await fetch(url, { method, credentials: 'same-origin', cache: 'no-store', headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
      if (res.ok && (res.headers.get('content-type') ?? '').includes('application/pdf')) {
        const href = URL.createObjectURL(await res.blob());
        if (tab && !tab.closed) tab.location.href = href;
        else {
          const a = document.createElement('a');
          a.href = href;
          a.download = fileName;
          a.click();
          setMsg({ ok: true, text: t(dict, 'ful.err.popup') });
        }
        if (refresh) router.refresh();
        return;
      }
      tab?.close();
      const data = (await res.json().catch(() => ({}))) as { error?: string; details?: string[]; data?: { refused?: Refused } };
      const refused = data.data?.refused;
      const fields = refused?.length ? refused.map((r) => `${r.orderNumber ?? ''} (${t(dict, `ful.sticker.problem.${r.problem ?? ''}`)})`).join(', ') : (data.details ?? []).join(', ');
      setMsg({ ok: false, text: fulError(dict, data.error, fields) });
      if (refresh && refused?.length) router.refresh();
    } catch {
      tab?.close();
      setMsg({ ok: false, text: fulError(dict, 'network') });
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="a2-stack" style={{ gap: 6 }}>
      <button type="button" className={`a2-btn ${size} ${tone}`.trim()} onClick={go} disabled={busy || disabled} data-testid={testId}>
        {busy ? (busyLabel ?? label) : label}
      </button>
      {msg ? (
        <span className={`a2-xs ${msg.ok ? 'a2-mute' : ''}`} role={msg.ok ? 'status' : 'alert'} style={msg.ok ? undefined : { color: 'var(--bad)' }}>
          {msg.text}
        </span>
      ) : null}
    </span>
  );
}
