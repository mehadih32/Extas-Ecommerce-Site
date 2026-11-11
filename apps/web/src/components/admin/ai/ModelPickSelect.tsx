'use client';
// S15 · PR 307 (C1.5) — one agent's model pick. A plain `<select>` of the practice writer plus the four PR 306
// connections (an un-Tested one shown but disabled, so the owner sees it exists without being able to point an
// agent at a connection that would only fall back anyway); one change through the admin's own API
// (`POST /api/admin/ai {key, provider}`, `ai.control`, audited server-side, `setting.switch` so the toast offers
// Undo). Drawn only for someone who holds `ai.control`; everyone else sees the plain pick as text (built by the
// page, not this file).
import { useState } from 'react';
import { runCall, withBody, type LmCall } from '@/lib/admin-lumen/safety';
import { showToast } from '@/components/admin/lumen/Toast';

const CALL: LmCall = { method: 'POST', url: '/api/admin/ai' };

export interface ModelPickOption {
  /** `null` is the practice writer. */
  value: string | null;
  label: string;
  ready: boolean;
}

export function ModelPickSelect({
  agentKey,
  selected,
  options,
  label,
  changedText,
  failedText,
  notReadyText,
}: {
  agentKey: string;
  selected: string | null;
  options: ModelPickOption[];
  label: string;
  changedText: string;
  failedText: string;
  notReadyText: string;
}) {
  const [value, setValue] = useState(selected);
  const [busy, setBusy] = useState(false);

  const pick = async (next: string | null) => {
    if (busy || next === value) return;
    const opt = options.find((o) => o.value === next);
    if (opt && !opt.ready) {
      showToast({ text: notReadyText, tone: 'bad' });
      return;
    }
    const prev = value;
    setBusy(true);
    const ok = await runCall(withBody(CALL, { key: agentKey, provider: next }));
    setBusy(false);
    if (!ok) {
      showToast({ text: failedText, tone: 'bad' });
      return;
    }
    setValue(next);
    showToast({
      text: changedText,
      undo: {
        kind: 'setting.switch',
        run: async () => {
          const u = await runCall(withBody(CALL, { key: agentKey, provider: prev }));
          if (u) setValue(prev);
          return u;
        },
      },
    });
  };

  return (
    <select
      aria-label={label}
      className="a2-sel ai-modelsel"
      data-testid={`ai-agent-model-${agentKey}`}
      value={value ?? ''}
      disabled={busy}
      onChange={(e) => pick(e.target.value === '' ? null : e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value ?? 'mock'} value={o.value ?? ''} disabled={!o.ready}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
