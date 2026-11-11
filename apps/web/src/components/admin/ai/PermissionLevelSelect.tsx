'use client';
// S15 · PR 318 (C3.2) — one cell of the permission matrix: what one agent may do with one resource (decide alone,
// only propose, or not touch). A plain `<select>` of the three levels; one change through the admin's own API
// (`POST /api/admin/ai/permissions {agentKey, resource, level}`, `ai.control`, audited server-side), with the same
// Undo-offering toast every other admin-ai switch here uses. Drawn only for someone who holds `ai.control`;
// everyone else sees the plain level as text (built by the page, not this file).
import { useState } from 'react';
import { runCall, withBody, type LmCall } from '@/lib/admin-lumen/safety';
import { showToast } from '@/components/admin/lumen/Toast';

const CALL: LmCall = { method: 'POST', url: '/api/admin/ai/permissions' };

export interface PermissionLevelOption {
  value: string;
  label: string;
}

export function PermissionLevelSelect({
  agentKey,
  resource,
  level,
  options,
  label,
  changedText,
  failedText,
}: {
  agentKey: string;
  resource: string;
  level: string;
  options: PermissionLevelOption[];
  label: string;
  changedText: string;
  failedText: string;
}) {
  const [value, setValue] = useState(level);
  const [busy, setBusy] = useState(false);

  const pick = async (next: string) => {
    if (busy || next === value) return;
    const prev = value;
    setBusy(true);
    const ok = await runCall(withBody(CALL, { agentKey, resource, level: next }));
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
          const u = await runCall(withBody(CALL, { agentKey, resource, level: prev }));
          if (u) setValue(prev);
          return u;
        },
      },
    });
  };

  return (
    <select
      aria-label={label}
      className="a2-sel ai-permsel"
      data-testid={`ai-perm-${agentKey}-${resource}`}
      value={value}
      disabled={busy}
      onChange={(e) => pick(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
