'use client';
// S15 · PR 583 (C10.2) — one open investigation's own actions: Close (`POST /api/admin/ai/agents-chief/close {id}`)
// and, when a real agent was named, Warn (`POST /api/admin/ai/agents-chief/warn {agentKey, why, investigationId}`,
// "goes into the appraisal" per the demo's own copy) — both `ai.control`, both reversible only in the sense that
// closing never deletes anything and a warning is itself the permanent record (never undone by a toast, the same
// reasoning `ApprovalDecideButtons.tsx` already gives for a decision). `router.refresh()` afterwards, same pattern.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { runCall, withBody, type LmCall } from '@/lib/admin-lumen/safety';
import { showToast } from '@/components/admin/lumen/Toast';

const CLOSE_CALL: LmCall = { method: 'POST', url: '/api/admin/ai/agents-chief/close' };
const WARN_CALL: LmCall = { method: 'POST', url: '/api/admin/ai/agents-chief/warn' };

export function InvestigationRowActions({
  id,
  agentKey,
  why,
  closed,
  closeLabel,
  warnLabel,
  closedText,
  warnedText,
  failedText,
}: {
  id: string;
  agentKey: string | null;
  why: string;
  closed: boolean;
  closeLabel: string;
  warnLabel: string;
  closedText: string;
  warnedText: string;
  failedText: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<'close' | 'warn' | null>(null);

  const close = async () => {
    if (busy) return;
    setBusy('close');
    const ok = await runCall(withBody(CLOSE_CALL, { id }));
    setBusy(null);
    if (!ok) {
      showToast({ text: failedText, tone: 'bad' });
      return;
    }
    showToast({ text: closedText });
    router.refresh();
  };

  const warn = async () => {
    if (busy || !agentKey) return;
    setBusy('warn');
    const ok = await runCall(withBody(WARN_CALL, { agentKey, why, investigationId: id }));
    setBusy(null);
    if (!ok) {
      showToast({ text: failedText, tone: 'bad' });
      return;
    }
    showToast({ text: warnedText });
    router.refresh();
  };

  return (
    <div className="ac-row-act" data-testid={`chief-inv-act-${id}`}>
      {agentKey ? (
        <button type="button" className="a2-btn a2-ghost a2-sm" disabled={busy !== null} data-testid={`chief-inv-warn-${id}`} onClick={() => void warn()}>
          {warnLabel}
        </button>
      ) : null}
      {!closed ? (
        <button type="button" className="a2-btn a2-ghost a2-sm" disabled={busy !== null} data-testid={`chief-inv-close-${id}`} onClick={() => void close()}>
          {closeLabel}
        </button>
      ) : null}
    </div>
  );
}
