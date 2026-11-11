'use client';
// S15 · PR 309 (C1.6) — one agent's own monthly spend cap: a plain amount field in the store's own currency, major
// units (the owner types "500", never minor units); empty is "no cap" (off, the default). Edits a local draft and
// commits it on a "Save" button that only appears once something changed, through the admin's own API
// (`POST /api/admin/ai {key, monthlyCapMinor}`, `ai.control`, audited server-side, `setting.switch` so the toast
// offers Undo). Drawn only for someone who holds `ai.control`; everyone else sees the plain amount as text (built
// by the page, not this file).
import { useState } from 'react';
import { toMajor, toMinor, type Money } from '@/components/admin/products/model';
import { runCall, withBody, type LmCall } from '@/lib/admin-lumen/safety';
import { showToast } from '@/components/admin/lumen/Toast';

const CALL: LmCall = { method: 'POST', url: '/api/admin/ai' };

export function CapInput({
  agentKey,
  capMinor,
  money,
  label,
  saveLabel,
  savedText,
  failedText,
  invalidText,
}: {
  agentKey: string;
  capMinor: number | null;
  money: Money;
  label: string;
  saveLabel: string;
  savedText: string;
  failedText: string;
  invalidText: string;
}) {
  const [saved, setSaved] = useState(toMajor(capMinor, money));
  const [text, setText] = useState(saved);
  const [busy, setBusy] = useState(false);

  const dirty = text !== saved;

  const save = async () => {
    if (busy) return;
    const minor = toMinor(text, money);
    if (minor === undefined) {
      showToast({ text: invalidText, tone: 'bad' });
      return;
    }
    if (minor !== null && minor < 1) {
      showToast({ text: invalidText, tone: 'bad' });
      return;
    }
    const prevMinor = toMinor(saved, money) ?? null;
    setBusy(true);
    const ok = await runCall(withBody(CALL, { key: agentKey, monthlyCapMinor: minor }));
    setBusy(false);
    if (!ok) {
      showToast({ text: failedText, tone: 'bad' });
      return;
    }
    setSaved(text);
    showToast({
      text: savedText,
      undo: {
        kind: 'setting.switch',
        run: async () => {
          const u = await runCall(withBody(CALL, { key: agentKey, monthlyCapMinor: prevMinor }));
          if (u) {
            const back = toMajor(prevMinor, money);
            setSaved(back);
            setText(back);
          }
          return u;
        },
      },
    });
  };

  return (
    <div className="ai-cap" data-testid={`ai-agent-cap-${agentKey}`}>
      <input
        type="text"
        inputMode="decimal"
        aria-label={label}
        className="a2-sel ai-capin"
        data-testid={`ai-agent-cap-input-${agentKey}`}
        value={text}
        disabled={busy}
        onChange={(e) => setText(e.target.value)}
      />
      {dirty ? (
        <button type="button" className="a2-btn sm pri" disabled={busy} onClick={() => void save()} data-testid={`ai-agent-cap-save-${agentKey}`}>
          {saveLabel}
        </button>
      ) : null}
    </div>
  );
}
