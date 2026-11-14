'use client';
// S28 · PR 713 — AI Center › Training's small forms and buttons, every one `POST /api/admin/ai/training/instructions {action, base, ...}` (the
// same "plain inline form + runCall + router.refresh()" shape as LearningEngineControls.tsx). `base` is the version the page was
// drawn with; if someone saved first the server says STALE, the toast says so, and a refresh shows their version.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { runCall, withBody, type LmCall } from '@/lib/admin-lumen/safety';
import { showToast } from '@/components/admin/lumen/Toast';

const CALL: LmCall = { method: 'POST', url: '/api/admin/ai/training/instructions' };

export interface ScopeOption {
  key: string;
  label: string;
}

function useAct(base: string, failed: string, done: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const act = async (body: Record<string, unknown>): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    const ok = await runCall(withBody(CALL, { ...body, base }));
    setBusy(false);
    if (!ok) {
      showToast({ text: failed, tone: 'bad' });
      return false;
    }
    showToast({ text: done, tone: 'ok' });
    router.refresh();
    return true;
  };
  return { busy, act };
}

export function TrainingAddForm({ scopes, base, texts: x }: { scopes: readonly ScopeOption[]; base: string; texts: { agent: string; text: string; placeholder: string; add: string; done: string; failed: string; max: number } }) {
  const { busy, act } = useAct(base, x.failed, x.done);
  const [agent, setAgent] = useState(scopes[0]?.key ?? 'all');
  const [text, setText] = useState('');
  const go = async () => {
    if (!text.trim()) return;
    if (await act({ action: 'add', agent, text: text.trim() })) setText('');
  };
  return (
    <div className="tr-form" data-testid="training-add">
      <label className="a2-sm" htmlFor="tr-agent">
        {x.agent}
      </label>
      <select id="tr-agent" className="a2-sel" value={agent} disabled={busy} onChange={(e) => setAgent(e.target.value)} data-testid="training-agent">
        {scopes.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </select>
      <label className="a2-sm" htmlFor="tr-text">
        {x.text}
      </label>
      <textarea id="tr-text" className="a2-inp" rows={3} maxLength={x.max} placeholder={x.placeholder} value={text} disabled={busy} onChange={(e) => setText(e.target.value)} data-testid="training-text" />
      <div>
        <button type="button" className="a2-btn pri" disabled={busy || !text.trim()} onClick={() => void go()} data-testid="training-add-go">
          {x.add}
        </button>
      </div>
    </div>
  );
}

export function TrainingRemoveButton({ agent, text, base, texts: x }: { agent: string; text: string; base: string; texts: { remove: string; label: string; done: string; failed: string } }) {
  const { busy, act } = useAct(base, x.failed, x.done);
  return (
    <button type="button" className="a2-btn sm ghost" disabled={busy} aria-label={`${x.label}: ${text}`} onClick={() => void act({ action: 'remove', agent, text })} data-testid="training-remove">
      {x.remove}
    </button>
  );
}

export function ForbiddenAddForm({ base, texts: x }: { base: string; texts: { text: string; placeholder: string; add: string; done: string; failed: string; max: number } }) {
  const { busy, act } = useAct(base, x.failed, x.done);
  const [text, setText] = useState('');
  const go = async () => {
    if (!text.trim()) return;
    if (await act({ action: 'addForbidden', text: text.trim() })) setText('');
  };
  return (
    <div className="tr-inline" data-testid="training-forbidden-add">
      <input className="a2-inp" aria-label={x.text} maxLength={x.max} placeholder={x.placeholder} value={text} disabled={busy} onChange={(e) => setText(e.target.value)} data-testid="training-forbidden-text" />
      <button type="button" className="a2-btn sm ghost" disabled={busy || !text.trim()} onClick={() => void go()} data-testid="training-forbidden-go">
        {x.add}
      </button>
    </div>
  );
}

export function ForbiddenRemoveButton({ text, base, texts: x }: { text: string; base: string; texts: { label: string; done: string; failed: string } }) {
  const { busy, act } = useAct(base, x.failed, x.done);
  return (
    <button type="button" className="tr-chipx" disabled={busy} aria-label={`${x.label}: ${text}`} onClick={() => void act({ action: 'removeForbidden', text })} data-testid="training-forbidden-remove">
      <span aria-hidden="true">×</span>
    </button>
  );
}

export function RestoreButton({ versionId, no, base, texts: x }: { versionId: string; no: number; base: string; texts: { restore: string; label: string; done: string; failed: string } }) {
  const { busy, act } = useAct(base, x.failed, x.done);
  return (
    <button type="button" className="a2-btn sm" disabled={busy} aria-label={`${x.label} ${no}`} onClick={() => void act({ action: 'restore', versionId })} data-testid={`training-restore-${no}`}>
      {x.restore}
    </button>
  );
}
