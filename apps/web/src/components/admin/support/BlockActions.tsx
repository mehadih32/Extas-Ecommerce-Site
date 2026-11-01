'use client';
// S22 · PR 434 — the support block list on a conversation (Blueprint B4.12): for a person allowed to block
// (`support.block`, the owner's unless he gives it; the list switched on), a fold "Block this person" with the reason
// and a confirm press; on a blocked chat, "Take off the block list". The person's messages are kept (nothing deleted);
// their chats move to the inbox's Blocked view. The server checks the permission, the switch and the chat's version.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { call } from '../api';

export interface BlockTexts {
  fold: string;
  reason: string;
  reasonHelp: string;
  block: string;
  confirm: string;
  unblock: string;
  blocked: string;
  unblocked: string;
  err: Record<string, string>;
}

export function BlockActions({ url, version, blocked, maxChars, texts: x }: { url: string; version: string; blocked: boolean; maxChars: number; texts: BlockTexts }) {
  const router = useRouter();
  const id = useId();
  const [reason, setReason] = useState('');
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);

  async function post(action: 'block' | 'unblock') {
    setBusy(true);
    const a = await call('POST', url, action === 'block' ? { action, reason, version } : { action, version });
    setBusy(false);
    if (a.status === 200) {
      setSaid({ text: action === 'block' ? x.blocked : x.unblocked, bad: false });
      setSure(false);
      router.refresh();
      return;
    }
    const code = a.status === 0 ? 'network' : (a.data.error ?? 'other');
    if (code === 'STALE') router.refresh();
    setSaid({ text: x.err[code] ?? x.err.other ?? code, bad: true });
  }

  const status = said ? (
    <p className={`a2-sm a2-mt6${said.bad ? '' : ' a2-mute'}`} role="status" aria-live="polite" data-testid="support-block-said">
      {said.text}
    </p>
  ) : null;

  if (blocked)
    return (
      <div data-testid="support-block">
        <button type="button" className="a2-btn" disabled={busy} onClick={() => void post('unblock')} data-testid="support-unblock">
          {x.unblock}
        </button>
        {status}
      </div>
    );
  return (
    <details className="sp-block" data-testid="support-block">
      <summary className="a2-sm">{x.fold}</summary>
      <label className="a2-xs a2-mute sp-fu-lbl" htmlFor={`${id}-r`}>
        {x.reason}
      </label>
      <input id={`${id}-r`} className="a2-inp" value={reason} maxLength={maxChars} onChange={(e) => setReason(e.target.value)} data-testid="support-block-reason" />
      <p className="a2-xs a2-mute a2-mt6">{x.reasonHelp}</p>
      <div className="sp-acts a2-mt6">
        {sure ? (
          <button type="button" className="a2-btn badf" disabled={busy || !reason.trim()} onClick={() => void post('block')} data-testid="support-block-confirm">
            {x.confirm}
          </button>
        ) : (
          <button type="button" className="a2-btn" disabled={busy || !reason.trim()} onClick={() => setSure(true)} data-testid="support-block-go">
            {x.block}
          </button>
        )}
      </div>
      {status}
    </details>
  );
}
