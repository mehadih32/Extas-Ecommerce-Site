'use client';
// S15 · PR 580 — the Model picks page's own feature switch (`ai.modelAutoSuggest.enabled`, off by default). Same
// shape as `MasterSwitch.tsx`: one tap through `POST /api/admin/ai/models {enabled}` (`ai.control`, audited
// server-side), reversible, so the toast offers Undo.
import { useState } from 'react';
import { runCall, withBody, type LmCall } from '@/lib/admin-lumen/safety';
import { showToast } from '@/components/admin/lumen/Toast';

const CALL: LmCall = { method: 'POST', url: '/api/admin/ai/models' };

export function ModelAutoSuggestSwitch({ on, label, onText, offText, failedText }: { on: boolean; label: string; onText: string; offText: string; failedText: string }) {
  const [enabled, setEnabled] = useState(on);
  const [busy, setBusy] = useState(false);

  const flip = async () => {
    if (busy) return;
    const next = !enabled;
    setBusy(true);
    const ok = await runCall(withBody(CALL, { enabled: next }));
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
          const u = await runCall(withBody(CALL, { enabled: !next }));
          if (u) setEnabled(!next);
          return u;
        },
      },
    });
  };

  return (
    <button type="button" role="switch" aria-checked={enabled} aria-label={label} className={`lm-sw${enabled ? ' on' : ''}`} onClick={flip} disabled={busy} data-testid="models-suggest-sw">
      <span aria-hidden="true" />
    </button>
  );
}
