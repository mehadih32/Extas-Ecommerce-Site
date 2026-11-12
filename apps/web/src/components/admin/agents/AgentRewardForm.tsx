'use client';
// S15 · PR 577 (C10.4) — "Give a reward": a short label and an optional note, logged as the agent's own work-log
// entry (`outcome: 'reward'`) through `POST /api/admin/agents/:key {action: 'reward'}` (`ai.control`). The page
// reruns server-side on success (Next's own router refresh), so the new reward shows without a second fetch here.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { runCall, type LmCall } from '@/lib/admin-lumen/safety';
import { showToast } from '@/components/admin/lumen/Toast';

export function AgentRewardForm({ agentKey, labels }: { agentKey: string; labels: { label: string; note: string; give: string; given: string; failed: string } }) {
  const router = useRouter();
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const give = async () => {
    if (busy || !label.trim()) return;
    const call: LmCall = { method: 'POST', url: `/api/admin/agents/${agentKey}`, body: { action: 'reward', label: label.trim(), note: note.trim() || undefined } };
    setBusy(true);
    const ok = await runCall(call);
    setBusy(false);
    if (!ok) {
      showToast({ text: labels.failed, tone: 'bad' });
      return;
    }
    showToast({ text: labels.given, tone: 'ok' });
    setLabel('');
    setNote('');
    router.refresh();
  };

  return (
    <div className="ag-inline" data-testid={`agent-reward-${agentKey}`}>
      <input className="a2-inp" placeholder={labels.label} value={label} disabled={busy} onChange={(e) => setLabel(e.target.value)} data-testid={`agent-reward-label-${agentKey}`} />
      <input className="a2-inp" placeholder={labels.note} value={note} disabled={busy} onChange={(e) => setNote(e.target.value)} data-testid={`agent-reward-note-${agentKey}`} />
      <button type="button" className="a2-btn sm ghost" disabled={busy || !label.trim()} onClick={() => void give()} data-testid={`agent-reward-give-${agentKey}`}>
        {labels.give}
      </button>
    </div>
  );
}
