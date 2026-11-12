'use client';
// S15 · PR 577 — marks one assignment done (`POST /api/admin/agents/:key {action: 'complete', assignmentId}`,
// `ai.control`); a double tap is a no-op on the server, so this never needs its own guard against clicking twice
// beyond disabling itself while busy.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { runCall, type LmCall } from '@/lib/admin-lumen/safety';
import { showToast } from '@/components/admin/lumen/Toast';

export function CompleteAssignmentButton({ agentKey, assignmentId, label, doneText, failedText }: { agentKey: string; assignmentId: string; label: string; doneText: string; failedText: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const complete = async () => {
    if (busy) return;
    const call: LmCall = { method: 'POST', url: `/api/admin/agents/${agentKey}`, body: { action: 'complete', assignmentId } };
    setBusy(true);
    const ok = await runCall(call);
    setBusy(false);
    if (!ok) {
      showToast({ text: failedText, tone: 'bad' });
      return;
    }
    showToast({ text: doneText, tone: 'ok' });
    router.refresh();
  };

  return (
    <button type="button" className="a2-btn sm ghost" disabled={busy} onClick={() => void complete()} data-testid={`agent-assign-done-${assignmentId}`}>
      {label}
    </button>
  );
}
