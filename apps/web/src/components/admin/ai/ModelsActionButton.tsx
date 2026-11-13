'use client';
// S15 · PR 580 — one small action against `/api/admin/ai/models` (`ai.control`): Re-test now/all, Accept/Accept
// all. No Undo here (unlike a switch or a model pick): a re-test only writes a fresh, honest reading of today's
// catalogue and routing policy (nothing to "undo" back to), and Accept is reversed the same way as any other model
// change — pick another one, or Accept the next suggestion — same spirit as `CostBookPresetButton.tsx`.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { runCall, withBody, type LmCall } from '@/lib/admin-lumen/safety';
import { showToast } from '@/components/admin/lumen/Toast';

const CALL: LmCall = { method: 'POST', url: '/api/admin/ai/models' };

export function ModelsActionButton({
  payload,
  label,
  busyLabel,
  toastText,
  failedText,
  variant = 'ghost',
  testId,
  disabled,
}: {
  payload: Record<string, unknown>;
  label: string;
  busyLabel?: string;
  toastText?: string;
  failedText: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  testId: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (busy || disabled) return;
    setBusy(true);
    const ok = await runCall(withBody(CALL, payload));
    setBusy(false);
    if (!ok) {
      showToast({ text: failedText, tone: 'bad' });
      return;
    }
    if (toastText) showToast({ text: toastText });
    router.refresh();
  };

  const cls = ['a2-btn', 'sm', variant === 'primary' ? 'pri' : variant === 'ghost' ? 'a2-ghost' : ''].filter(Boolean).join(' ');
  return (
    <button type="button" className={cls} data-testid={testId} disabled={busy || disabled} onClick={run}>
      {busy && busyLabel ? busyLabel : label}
    </button>
  );
}
