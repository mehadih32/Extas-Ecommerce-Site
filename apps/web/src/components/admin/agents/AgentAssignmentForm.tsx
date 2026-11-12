'use client';
// S15 · PR 577 (C10.4) — "Assign task": a title, an optional description and an optional due date, through
// `POST /api/admin/agents/:key {action: 'assign'}` (`ai.control`). The page rerenders server-side on success.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { runCall, type LmCall } from '@/lib/admin-lumen/safety';
import { showToast } from '@/components/admin/lumen/Toast';

export function AgentAssignmentForm({ agentKey, labels }: { agentKey: string; labels: { title: string; description: string; due: string; assign: string; assigned: string; failed: string } }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [busy, setBusy] = useState(false);

  const assign = async () => {
    if (busy || !title.trim()) return;
    const call: LmCall = { method: 'POST', url: `/api/admin/agents/${agentKey}`, body: { action: 'assign', title: title.trim(), description: description.trim() || undefined, dueAt: dueAt || undefined } };
    setBusy(true);
    const ok = await runCall(call);
    setBusy(false);
    if (!ok) {
      showToast({ text: labels.failed, tone: 'bad' });
      return;
    }
    showToast({ text: labels.assigned, tone: 'ok' });
    setTitle('');
    setDescription('');
    setDueAt('');
    router.refresh();
  };

  return (
    <div className="ag-assign" data-testid={`agent-assign-${agentKey}`}>
      <input className="a2-inp" placeholder={labels.title} value={title} disabled={busy} onChange={(e) => setTitle(e.target.value)} data-testid={`agent-assign-title-${agentKey}`} />
      <div className="ag-inline">
        <input className="a2-inp" placeholder={labels.description} value={description} disabled={busy} onChange={(e) => setDescription(e.target.value)} data-testid={`agent-assign-desc-${agentKey}`} />
        <input type="date" className="a2-inp ag-date" aria-label={labels.due} value={dueAt} disabled={busy} onChange={(e) => setDueAt(e.target.value)} data-testid={`agent-assign-due-${agentKey}`} />
        <button type="button" className="a2-btn sm ghost" disabled={busy || !title.trim()} onClick={() => void assign()} data-testid={`agent-assign-go-${agentKey}`}>
          {labels.assign}
        </button>
      </div>
    </div>
  );
}
