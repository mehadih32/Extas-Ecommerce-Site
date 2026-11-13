'use client';
// S15 · PR 317 (C3.2) — Approve/Reject on one pending request (`POST /api/admin/ai/approvals {id, decision, note?}`,
// `ai.control`). A decision is permanent (CLAUDE.md's "never without the owner's written OK" for money, refunds,
// COD, prices, discounts, blocking and deletion — this page's own tap *is* that written OK), so there is no Undo
// here, unlike a pause/resume switch or a preset pick elsewhere in AI 360. After a tap the whole page refreshes
// (`router.refresh()`, the same pattern `CostBookPresetButton.tsx` already uses) since the card moves from the
// waiting list to the decision history, not just one field changing in place.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { runCall, withBody, type LmCall } from '@/lib/admin-lumen/safety';
import { showToast } from '@/components/admin/lumen/Toast';

const CALL: LmCall = { method: 'POST', url: '/api/admin/ai/approvals' };

export function ApprovalDecideButtons({
  id,
  noteLabel,
  notePlaceholder,
  approveLabel,
  rejectLabel,
  approvedText,
  rejectedText,
  failedText,
}: {
  id: string;
  noteLabel: string;
  notePlaceholder: string;
  approveLabel: string;
  rejectLabel: string;
  approvedText: string;
  rejectedText: string;
  failedText: string;
}) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);

  const decide = async (decision: 'approve' | 'reject') => {
    if (busy) return;
    setBusy(decision);
    const ok = await runCall(withBody(CALL, { id, decision, note: note.trim() || null }));
    setBusy(null);
    if (!ok) {
      showToast({ text: failedText, tone: 'bad' });
      return;
    }
    showToast({ text: decision === 'approve' ? approvedText : rejectedText });
    router.refresh();
  };

  return (
    <div className="ai-ap-decide" data-testid={`ai-approval-decide-${id}`}>
      <label className="ai-ap-note">
        <span className="a2-xs a2-mute">{noteLabel}</span>
        <input type="text" value={note} placeholder={notePlaceholder} data-testid={`ai-approval-note-${id}`} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="ai-ap-btns">
        <button type="button" className="a2-btn" disabled={busy !== null} data-testid={`ai-approval-approve-${id}`} onClick={() => decide('approve')}>
          {approveLabel}
        </button>
        <button type="button" className="a2-btn a2-ghost" disabled={busy !== null} data-testid={`ai-approval-reject-${id}`} onClick={() => decide('reject')}>
          {rejectLabel}
        </button>
      </div>
    </div>
  );
}
