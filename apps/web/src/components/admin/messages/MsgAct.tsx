'use client';
// S14 · PR 291, 292, 298, 505 — the small client part of the Messages pages: a button that sends one command to the
// Messages API and reloads the page's data, with an optional question first and its words after (by the answer's
// `outcome`, when it has one). The server page hands words and addresses only, never a function (a server page cannot
// pass one to a client part). Every refusal is shown in the page's own words (`msg.err.<code>`).
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { call } from '@/components/admin/api';
import { msgError } from '@/lib/admin-messages/i18n';
import type { Dict } from '@/lib/i18n';

export interface MsgActProps {
  dict: Dict;
  url: string;
  method?: 'POST' | 'PUT' | 'PATCH';
  body?: Record<string, unknown>;
  label: string;
  busyLabel?: string;
  /** Asked before sending (a plain yes/no). */
  ask?: string;
  /** Words after it worked: by the answer's `<outcomeOf>.outcome` (e.g. SENT, FAILED), else `ok`. */
  done?: Record<string, string>;
  /** The part of the answer that carries `outcome`. */
  outcomeOf?: string;
  tone?: 'pri' | 'bad' | 'ghost' | '';
  testId?: string;
}

const GOOD = new Set(['ok', 'SENT']);

export function MsgAct({ dict, url, method = 'POST', body, label, busyLabel, ask, done, outcomeOf, tone = '', testId }: MsgActProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const go = async () => {
    if (ask && !window.confirm(ask)) return;
    setBusy(true);
    setMsg(null);
    const a = await call(method, url, body ?? {});
    setBusy(false);
    if (!a.data.ok) {
      setMsg({ ok: false, text: a.status === 0 ? msgError(dict, 'network') : msgError(dict, a.data.error, (a.data.details ?? []).join(', ')) });
      return;
    }
    const outcome = (outcomeOf ? (a.data[outcomeOf] as { outcome?: string } | undefined)?.outcome : undefined) ?? 'ok';
    const words = done ? (done[outcome] ?? done.ok ?? null) : null;
    if (words) setMsg({ ok: GOOD.has(outcome), text: words });
    router.refresh();
  };
  return (
    <span className="a2-stack" style={{ gap: 4 }}>
      <button type="button" className={`a2-btn sm ${tone}`.trim()} onClick={go} disabled={busy} data-testid={testId}>
        {busy ? (busyLabel ?? label) : label}
      </button>
      {msg ? (
        <span className="a2-xs" role={msg.ok ? 'status' : 'alert'} style={msg.ok ? undefined : { color: 'var(--bad)' }}>
          {msg.text}
        </span>
      ) : null}
    </span>
  );
}
