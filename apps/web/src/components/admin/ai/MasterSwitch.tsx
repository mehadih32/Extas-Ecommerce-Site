'use client';
// S15 · PR 305 (C1.3) — the business-wide AI master switch, on the Control room banner itself. One tap through the
// admin's own API (`POST /api/admin/ai {master}`, `ai.control`, audited server-side as a SettingChange); turning AI
// on or off is reversible (no money moves, nothing is deleted), so the toast offers Undo, the same pattern as
// AgentSwitch. Drawn only for someone who holds `ai.control`; everyone else sees the "Owner only" pill instead
// (built by the page, not this file).
import { useState } from 'react';
import { runCall, withBody, type LmCall } from '@/lib/admin-lumen/safety';
import { showToast } from '@/components/admin/lumen/Toast';

const CALL: LmCall = { method: 'POST', url: '/api/admin/ai' };

export function MasterSwitch({ on, label, onText, offText, failedText }: { on: boolean; label: string; onText: string; offText: string; failedText: string }) {
  const [enabled, setEnabled] = useState(on);
  const [busy, setBusy] = useState(false);

  const flip = async () => {
    if (busy) return;
    const next = !enabled;
    setBusy(true);
    const ok = await runCall(withBody(CALL, { master: next }));
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
          const u = await runCall(withBody(CALL, { master: !next }));
          if (u) setEnabled(!next);
          return u;
        },
      },
    });
  };

  return (
    <button type="button" role="switch" aria-checked={enabled} aria-label={label} className={`lm-sw${enabled ? ' on' : ''}`} onClick={flip} disabled={busy} data-testid="ai-master-sw">
      <span aria-hidden="true" />
    </button>
  );
}
