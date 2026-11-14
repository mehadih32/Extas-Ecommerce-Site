'use client';
// S15 · PR 582 — the one shared "strong agent memory" switch (`ai.memory.enabled`, off by default, CLAUDE.md
// rule 1), shown on every agent's own Memory card since there is no separate settings page for it yet. One tap
// through `POST /api/admin/agents/:key/memory {action: 'toggle', enabled}` (`ai.control`); reversible, so the toast
// offers Undo, the same pattern `MasterSwitch` (PR 305) already uses.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { runCall, withBody, type LmCall } from '@/lib/admin-lumen/safety';
import { showToast } from '@/components/admin/lumen/Toast';

export function AgentMemorySwitch({ agentKey, on, label, onText, offText, failedText }: { agentKey: string; on: boolean; label: string; onText: string; offText: string; failedText: string }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(on);
  const [busy, setBusy] = useState(false);
  const url = `/api/admin/agents/${agentKey}/memory`;

  const flip = async () => {
    if (busy) return;
    const next = !enabled;
    const call: LmCall = { method: 'POST', url };
    setBusy(true);
    const ok = await runCall(withBody(call, { action: 'toggle', enabled: next }));
    setBusy(false);
    if (!ok) {
      showToast({ text: failedText, tone: 'bad' });
      return;
    }
    setEnabled(next);
    showToast({
      text: next ? onText : offText,
      undo: {
        kind: next ? 'pause' : 'resume',
        run: async () => {
          const u = await runCall(withBody(call, { action: 'toggle', enabled: !next }));
          if (u) setEnabled(!next);
          return u;
        },
      },
    });
    router.refresh();
  };

  return (
    <button type="button" role="switch" aria-checked={enabled} aria-label={label} className={`lm-sw${enabled ? ' on' : ''}`} onClick={flip} disabled={busy} data-testid={`agent-memory-sw-${agentKey}`}>
      <span aria-hidden="true" />
    </button>
  );
}
