'use client';
// S15 · PR 304 (C1.2) — the Control room's own pause/resume switch on one agent card. One tap through the admin's
// own API (`ai.control`, audited server-side); pause and resume are reversible shop actions
// (lib/admin-lumen/safety.ts), so the toast offers Undo. Drawn only for someone who holds `ai.control`; everyone
// else sees the plain status pill instead (built by the page, not this file).
import { useState } from 'react';
import { runCall, withBody, type LmCall } from '@/lib/admin-lumen/safety';
import { showToast } from '@/components/admin/lumen/Toast';

const CALL: LmCall = { method: 'POST', url: '/api/admin/ai' };

export function AgentSwitch({ agentKey, on, label, pausedText, resumedText, failedText }: { agentKey: string; on: boolean; label: string; pausedText: string; resumedText: string; failedText: string }) {
  const [enabled, setEnabled] = useState(on);
  const [busy, setBusy] = useState(false);

  const flip = async () => {
    if (busy) return;
    const next = !enabled;
    setBusy(true);
    const ok = await runCall(withBody(CALL, { key: agentKey, enabled: next }));
    setBusy(false);
    if (!ok) {
      showToast({ text: failedText, tone: 'bad' });
      return;
    }
    setEnabled(next);
    showToast({
      text: next ? resumedText : pausedText,
      undo: {
        kind: next ? 'pause' : 'resume',
        run: async () => {
          const u = await runCall(withBody(CALL, { key: agentKey, enabled: !next }));
          if (u) setEnabled(!next);
          return u;
        },
      },
    });
  };

  return (
    <button type="button" role="switch" aria-checked={enabled} aria-label={label} className={`lm-sw${enabled ? ' on' : ''}`} onClick={flip} disabled={busy} data-testid={`ai-agent-sw-${agentKey}`}>
      <span aria-hidden="true" />
    </button>
  );
}
