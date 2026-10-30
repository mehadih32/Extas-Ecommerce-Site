'use client';
// CN-028 · PR 615, 616 — the one client part of the Money → Books pages that changes something: a button that opens a
// small form in place (a warning line, then the fields), sends one command to the books API and reloads the page's data.
// A money field is typed in taka and sent in minor units (the page passes the currency's digits); a PIN field is a
// password box that is never kept, logged or shown again (it is cleared after every try). The button is locked while it
// sends, so a double tap is one record. Every refusal is shown in words from the page's messages (`bk.err.<code>`).
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { bkError } from '@/lib/admin-books/words';
import { t, type Dict } from '@/lib/i18n';

export interface BooksField {
  /** The body key it is sent as. */
  name: string;
  label: string;
  kind: 'text' | 'date' | 'money' | 'pin' | 'select';
  /** Required; for text, at least this many letters. */
  min?: number;
  value?: string;
  options?: { value: string; label: string }[];
  maxLength?: number;
}

export interface BooksFormProps {
  dict: Dict;
  url: string;
  label: string;
  busyLabel: string;
  sendLabel: string;
  fields: BooksField[];
  /** Fixed values sent with the fields. */
  body?: Record<string, unknown>;
  /** A line shown above the fields (what will happen). */
  warn?: string;
  /** The currency's minor digits, for money fields. */
  digits?: number;
  tone?: 'pri' | 'bad' | 'ghost' | '';
  testId?: string;
  done?: string;
}

const toMinor = (text: string, digits: number): number | null => {
  const m = /^\s*(\d{1,13})(?:[.,](\d{0,6}))?\s*$/.exec(text);
  if (!m) return null;
  const frac = (m[2] ?? '').padEnd(digits, '0').slice(0, digits);
  return Number(m[1]) * 10 ** digits + Number(frac || '0');
};

export function BooksForm({ dict, url, label, busyLabel, sendLabel, fields, body, warn, digits = 2, tone = 'pri', testId, done }: BooksFormProps) {
  const router = useRouter();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.name, f.value ?? ''])));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const clearPins = () => setVals((v) => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fields.find((f) => f.name === k)?.kind === 'pin' ? '' : x])));

  const send = async () => {
    const out: Record<string, unknown> = { ...(body ?? {}) };
    const bad: string[] = [];
    for (const f of fields) {
      const raw = (vals[f.name] ?? '').trim();
      if (f.kind === 'money') {
        const minor = raw ? toMinor(raw, digits) : null;
        if (minor === null || minor <= 0) bad.push(f.label);
        else out[f.name] = minor;
      } else if (raw.length < (f.min ?? 0) || (f.min && !raw)) bad.push(f.label);
      else if (raw) out[f.name] = raw;
    }
    if (bad.length) {
      setMsg({ ok: false, text: bkError(dict, 'INVALID_INPUT', bad.join(', ')) });
      return;
    }
    setBusy(true);
    setMsg(null);
    let status = 0;
    let data: { ok?: boolean; error?: string; details?: string[] } = {};
    try {
      const res = await fetch(url, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'content-type': 'application/json' }, body: JSON.stringify(out) });
      status = res.status;
      data = (await res.json().catch(() => ({ ok: false, error: 'default' }))) as typeof data;
    } catch {
      status = 0;
    }
    setBusy(false);
    clearPins();
    if (!data.ok) {
      setMsg({ ok: false, text: status === 0 ? bkError(dict, 'network') : bkError(dict, data.error, (data.details ?? []).join(', ')) });
      return;
    }
    setOpen(false);
    setVals(Object.fromEntries(fields.map((f) => [f.name, f.value ?? ''])));
    if (done) setMsg({ ok: true, text: done });
    router.refresh();
  };

  return (
    <span className="a2-stack" style={{ gap: 6 }}>
      {open ? (
        <span className="a2-stack" style={{ gap: 8 }} data-testid={testId ? `${testId}-panel` : undefined}>
          {warn ? <span className="a2-xs a2-note">{warn}</span> : null}
          {fields.map((f) => (
            <span key={f.name} className="a2-stack" style={{ gap: 4 }}>
              <label className="a2-xs a2-mute" htmlFor={`${id}-${f.name}`}>
                {f.label}
              </label>
              {f.kind === 'select' ? (
                <select id={`${id}-${f.name}`} className="a2-sel" value={vals[f.name] ?? ''} onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })}>
                  {(f.options ?? []).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={`${id}-${f.name}`}
                  className="a2-inp"
                  type={f.kind === 'date' ? 'date' : f.kind === 'pin' ? 'password' : 'text'}
                  inputMode={f.kind === 'money' ? 'decimal' : f.kind === 'pin' ? 'numeric' : undefined}
                  autoComplete={f.kind === 'pin' ? 'off' : undefined}
                  value={vals[f.name] ?? ''}
                  maxLength={f.maxLength ?? (f.kind === 'pin' ? 12 : 500)}
                  onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })}
                  data-testid={testId ? `${testId}-${f.name}` : undefined}
                />
              )}
            </span>
          ))}
        </span>
      ) : null}
      <span className="a2-gap8">
        {open ? (
          <>
            <button type="button" className={`a2-btn sm ${tone}`.trim()} onClick={send} disabled={busy} data-testid={testId ? `${testId}-yes` : undefined}>
              {busy ? busyLabel : sendLabel}
            </button>
            <button
              type="button"
              className="a2-btn sm ghost"
              onClick={() => {
                setOpen(false);
                clearPins();
              }}
              disabled={busy}
            >
              {t(dict, 'bk.cancel')}
            </button>
          </>
        ) : (
          <button type="button" className={`a2-btn sm ${tone}`.trim()} onClick={() => setOpen(true)} data-testid={testId}>
            {label}
          </button>
        )}
      </span>
      {msg ? (
        <span className={`a2-xs ${msg.ok ? 'a2-mute' : ''}`} role={msg.ok ? 'status' : 'alert'} style={msg.ok ? undefined : { color: 'var(--bad)' }}>
          {msg.text}
        </span>
      ) : null}
    </span>
  );
}
