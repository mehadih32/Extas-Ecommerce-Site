'use client';
// S22 · PR 425 — the buttons beside a conversation: mark it solved, waiting for the customer or open again; take it,
// let it go, or (with `support.assign`) give it to someone who may reply. Each press carries the conversation's
// version: a conversation changed in between is read again and said so. The server checks every permission again.
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { call } from '../api';

export interface SideTexts {
  state: string;
  solve: string;
  wait: string;
  reopen: string;
  owner: string;
  take: string;
  letGo: string;
  give: string;
  giveGo: string;
  nobody: string;
  saved: string;
  err: Record<string, string>;
}

export function SideActions({
  base,
  version,
  status,
  assignedId,
  me,
  canReply,
  canAssign,
  staff,
  texts: x,
}: {
  base: string;
  version: string;
  status: 'OPEN' | 'WAITING' | 'SOLVED';
  assignedId: string | null;
  me: string | null;
  canReply: boolean;
  canAssign: boolean;
  staff: { id: string; name: string }[];
  texts: SideTexts;
}) {
  const id = useId();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [to, setTo] = useState(assignedId ?? '');
  const [said, setSaid] = useState<{ text: string; bad: boolean } | null>(null);
  if (!canReply) return null;

  async function post(path: 'status' | 'assign', payload: Record<string, unknown>) {
    setBusy(true);
    const a = await call('POST', `${base}/${path}`, { ...payload, version });
    setBusy(false);
    if (a.status === 200) {
      setSaid({ text: x.saved, bad: false });
      router.refresh();
      return;
    }
    const code = a.status === 0 ? 'network' : (a.data.error ?? 'other');
    if (code === 'STALE') router.refresh();
    setSaid({ text: x.err[code] ?? x.err.other ?? code, bad: true });
  }

  return (
    <div className="a2-stack" style={{ gap: 10 }} data-testid="support-actions">
      <div className="sp-acts" role="group" aria-label={x.state}>
        {status !== 'SOLVED' ? (
          <button type="button" className="a2-btn pri" disabled={busy} onClick={() => void post('status', { status: 'SOLVED' })} data-testid="support-solve">
            {x.solve}
          </button>
        ) : null}
        {status === 'OPEN' ? (
          <button type="button" className="a2-btn" disabled={busy} onClick={() => void post('status', { status: 'WAITING' })} data-testid="support-wait">
            {x.wait}
          </button>
        ) : null}
        {status !== 'OPEN' ? (
          <button type="button" className="a2-btn" disabled={busy} onClick={() => void post('status', { status: 'OPEN' })} data-testid="support-reopen">
            {x.reopen}
          </button>
        ) : null}
      </div>
      <div className="sp-acts" role="group" aria-label={x.owner}>
        {!assignedId && me ? (
          <button type="button" className="a2-btn" disabled={busy} onClick={() => void post('assign', { staffId: me })} data-testid="support-take">
            {x.take}
          </button>
        ) : null}
        {assignedId && assignedId === me ? (
          <button type="button" className="a2-btn" disabled={busy} onClick={() => void post('assign', { staffId: null })} data-testid="support-letgo">
            {x.letGo}
          </button>
        ) : null}
      </div>
      {canAssign && staff.length ? (
        <div className="sp-acts">
          <label className="a2-lbl" htmlFor={`${id}-to`} style={{ flexBasis: '100%' }}>
            {x.give}
          </label>
          <select id={`${id}-to`} className="a2-sel" value={to} disabled={busy} onChange={(e) => setTo(e.target.value)} data-testid="support-give-to" style={{ flex: '1 1 160px', minWidth: 0 }}>
            <option value="">{x.nobody}</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button type="button" className="a2-btn" disabled={busy || to === (assignedId ?? '')} onClick={() => void post('assign', { staffId: to || null })} data-testid="support-give">
            {x.giveGo}
          </button>
        </div>
      ) : null}
      <p className={`a2-sm${said?.bad ? '' : ' a2-mute'}`} role="status" aria-live="polite">
        {said?.text ?? ''}
      </p>
    </div>
  );
}
