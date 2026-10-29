'use client';
// S08 · PR 179–181 — a button that asks the admin API for a PDF (stickers, a handover sheet, a picking list) and opens it
// in a new tab to print. The tab is opened at the press (so the browser does not block it) and gets the PDF when it is
// ready; when the browser blocks it anyway, the PDF is downloaded instead. A refusal is shown in words from the page's
// messages (`ful.err.<code>`; for stickers each parcel's reason `ful.sticker.problem.<code>`), never the server's own.
//
// PR 180: each press carries a key (`keyed`), kept until the PDF arrives, so pressing again after a lost answer gets
// the same print back instead of counting it twice; a reprint the server asks a reason for (REASON_REQUIRED) opens a
// short field, and the same press goes again with the reason.
// PR 407: the invoice's chat copy is a picture (image/jpeg): it opens and downloads the same way.
import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';
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
  /** Send a press key (`requestKey`) kept until the PDF arrives: the same press is never counted twice. */
  keyed?: boolean;
}

type Refused = { orderNumber?: string; problem?: string }[];

const newKey = (): string => {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
};

export function PdfButton({ dict, url, method = 'POST', body, label, busyLabel, tone = '', size = 'sm', testId, disabled, refresh = true, fileName = 'document.pdf', keyed = false }: PdfButtonProps) {
  const router = useRouter();
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  const press = useRef<{ key: string; what: string } | null>(null);
  const go = async () => {
    if (asking && reason.trim().length < 3) {
      setMsg({ ok: false, text: t(dict, 'ful.reprint.short') });
      return;
    }
    setMsg(null);
    setBusy(true);
    const what = JSON.stringify(body ?? null);
    if (keyed && press.current?.what !== what) press.current = { key: newKey(), what };
    const sent = body ? { ...body, ...(keyed && press.current ? { requestKey: press.current.key } : {}), ...(asking ? { reason: reason.trim() } : {}) } : undefined;
    const tab = window.open('', '_blank');
    try {
      const res = await fetch(url, { method, credentials: 'same-origin', cache: 'no-store', headers: sent ? { 'content-type': 'application/json' } : undefined, body: sent ? JSON.stringify(sent) : undefined });
      const type = res.headers.get('content-type') ?? '';
      if (res.ok && (type.includes('application/pdf') || type.startsWith('image/'))) {
        press.current = null;
        setAsking(false);
        setReason('');
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
      if (data.error === 'REASON_REQUIRED') {
        setAsking(true);
        setMsg({ ok: true, text: t(dict, 'ful.reprint.ask', { orders: (data.details ?? []).join(', ') }) });
        return;
      }
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
      {asking ? (
        <span className="a2-stack" style={{ gap: 4 }}>
          <label className="a2-xs a2-mute" htmlFor={`${id}-r`}>
            {t(dict, 'ful.reprint.label')}
          </label>
          <input id={`${id}-r`} className="a2-inp" value={reason} maxLength={200} placeholder={t(dict, 'ful.reprint.placeholder')} onChange={(e) => setReason(e.target.value)} data-testid="reprint-reason" />
        </span>
      ) : null}
      <span className="a2-gap8">
        <button type="button" className={`a2-btn ${size} ${tone}`.trim()} onClick={go} disabled={busy || disabled} data-testid={testId}>
          {busy ? (busyLabel ?? label) : asking ? t(dict, 'ful.reprint.go') : label}
        </button>
        {asking ? (
          <button type="button" className="a2-btn sm ghost" onClick={() => { setAsking(false); setMsg(null); }} disabled={busy}>
            {t(dict, 'ful.cancel')}
          </button>
        ) : null}
      </span>
      {msg ? (
        <span className={`a2-xs ${msg.ok ? 'a2-mute' : ''}`} role={msg.ok ? 'status' : 'alert'} style={msg.ok ? undefined : { color: 'var(--bad)' }}>
          {msg.text}
        </span>
      ) : null}
    </span>
  );
}
