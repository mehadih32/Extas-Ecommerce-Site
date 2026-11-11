'use client';
// S15 · PR 305 (C1.3) — one agent's "keep running even when the AI master switch is off". One tap through the
// admin's own API (`POST /api/admin/ai {key, keepOnWhenMasterOff}`, `ai.control`, audited server-side); reversible,
// so the toast offers Undo, the same pattern as AgentSwitch and MasterSwitch. Drawn only for someone who holds
// `ai.control`; everyone else sees the plain "kept on" pill instead (built by the page, not this file).
import { useState } from 'react';
import { runCall, withBody, type LmCall } from '@/lib/admin-lumen/safety';
import { showToast } from '@/components/admin/lumen/Toast';

const CALL: LmCall = { method: 'POST', url: '/api/admin/ai' };

export function KeepOnSwitch({ agentKey, on, label, onText, offText, failedText }: { agentKey: string; on: boolean; label: string; onText: string; offText: string; failedText: string }) {
  const [keepOn, setKeepOn] = useState(on);
  const [busy, setBusy] = useState(false);

  const flip = async () => {
    if (busy) return;
    const next = !keepOn;
    setBusy(true);
    const ok = await runCall(withBody(CALL, { key: agentKey, keepOnWhenMasterOff: next }));
    setBusy(false);
    if (!ok) {
      showToast({ text: failedText, tone: 'bad' });
      return;
    }
    setKeepOn(next);
    showToast({
      text: next ? onText : offText,
      undo: {
        kind: next ? 'pause' : 'resume',
        run: async () => {
          const u = await runCall(withBody(CALL, { key: agentKey, keepOnWhenMasterOff: !next }));
          if (u) setKeepOn(!next);
          return u;
        },
      },
    });
  };

  return (
    <button type="button" role="switch" aria-checked={keepOn} aria-label={label} className={`lm-sw ai-keepsw${keepOn ? ' on' : ''}`} onClick={flip} disabled={busy} data-testid={`ai-agent-keep-${agentKey}`}>
      <span aria-hidden="true" />
    </button>
  );
}
