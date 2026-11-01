'use client';
// S22 · PR 427 — who is writing, set by hand beside a conversation (`support.identity`): type the chat's number (the
// customer with that number is linked), "Not this customer" (the link goes), "Not the same person" (this chat leaves
// the person it was put with). Each press carries the conversation's version; a chat changed in between is read again
// and said so. The server checks the permission again; nothing here sends a message or changes an order.
import { phoneNormalizeBD } from '@extas/delivery/phone';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { call } from '../api';

export interface IdentityTexts {
  phone: string;
  phoneHelp: string;
  phoneSave: string;
  unlink: string;
  split: string;
  saved: string;
  badPhone: string;
  err: Record<string, string>;
}

export function IdentityActions({ url, version, linked, together, texts: x }: { url: string; version: string; linked: boolean; together: boolean; texts: IdentityTexts }) {
  const id = useId();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState('');
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);

  async function post(payload: Record<string, unknown>) {
    setBusy(true);
    const a = await call('POST', url, { ...payload, version });
    setBusy(false);
    if (a.status === 200) {
      setSaid({ text: x.saved, bad: false });
      setPhone('');
      router.refresh();
      return;
    }
    const code = a.status === 0 ? 'network' : (a.data.error ?? 'other');
    if (code === 'STALE') router.refresh();
    setSaid({ text: x.err[code] ?? x.err.other ?? code, bad: true });
  }

  function savePhone() {
    // the same normaliser the server uses: a mistyped number is said here, before anything is sent
    if (!phoneNormalizeBD(phone).ok) {
      setSaid({ text: x.badPhone, bad: true });
      return;
    }
    void post({ action: 'phone', phone });
  }

  return (
    <div className="a2-stack" style={{ gap: 10 }} data-testid="support-identity-actions">
      <div className="sp-acts">
        <label className="a2-lbl" htmlFor={`${id}-phone`} style={{ flexBasis: '100%' }}>
          {x.phone}
        </label>
        <input
          id={`${id}-phone`}
          className="a2-inp"
          inputMode="tel"
          autoComplete="off"
          value={phone}
          disabled={busy}
          onChange={(e) => setPhone(e.target.value)}
          aria-describedby={`${id}-help`}
          data-testid="support-identity-phone"
          style={{ flex: '1 1 160px', minWidth: 0 }}
        />
        <button type="button" className="a2-btn" disabled={busy || !phone.trim()} onClick={savePhone} data-testid="support-identity-phone-save">
          {x.phoneSave}
        </button>
        <p className="a2-xs a2-mute" id={`${id}-help`} style={{ flexBasis: '100%', margin: 0 }}>
          {x.phoneHelp}
        </p>
      </div>
      {linked || together ? (
        <div className="sp-acts">
          {linked ? (
            <button type="button" className="a2-btn" disabled={busy} onClick={() => void post({ action: 'unlink' })} data-testid="support-identity-unlink">
              {x.unlink}
            </button>
          ) : null}
          {together ? (
            <button type="button" className="a2-btn" disabled={busy} onClick={() => void post({ action: 'split' })} data-testid="support-identity-split">
              {x.split}
            </button>
          ) : null}
        </div>
      ) : null}
      <p className={`a2-sm${said?.bad ? '' : ' a2-mute'}`} role="status" aria-live="polite">
        {said?.text ?? ''}
      </p>
    </div>
  );
}
