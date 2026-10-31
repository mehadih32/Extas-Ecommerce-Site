'use client';
// S18 · PR 386 — "Send to Cloudflare" on Settings › Sign-in & security › Cloudflare protection: writes the saved plan's
// rules to Cloudflare (the mock while practising), then reads the page again so "At Cloudflare" shows the result.
// The words come from the page; the API checks `security.write` again.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { call } from '../api';

export interface EdgeSendTexts {
  send: string;
  sending: string;
  sent: string;
  err: Record<string, string>;
}

export function EdgeSend({ url, texts: x, disabled }: { url: string; texts: EdgeSendTexts; disabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);

  async function send() {
    setBusy(true);
    setSaid(null);
    const a = await call('POST', url, { action: 'send' });
    setBusy(false);
    if (a.status === 200) {
      setSaid({ text: x.sent, bad: false });
      router.refresh();
      return;
    }
    const code = a.status === 0 ? 'network' : (a.data.error ?? 'other');
    setSaid({ text: x.err[code] ?? x.err.other ?? code, bad: true });
  }

  return (
    <div className="a2-gap8">
      <button type="button" className="a2-btn pri" disabled={busy || disabled} onClick={send} data-testid="edge-send">
        {busy ? x.sending : x.send}
      </button>
      <span className={`a2-sm${said?.bad ? '' : ' a2-mute'}`} role="status" aria-live="polite" data-testid="edge-send-status">
        {said?.text ?? ''}
      </span>
    </div>
  );
}
