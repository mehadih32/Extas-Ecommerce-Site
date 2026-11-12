'use client';
// S15 · PR 321 (C1.7 "Skill library") — the Blueprint's own on/off per skill card: one tap through the admin's own
// API (`ai.skills.write`, audited server-side). Only drawn for an `approved` skill (the page decides that); an
// unapproved or rejected one shows the plain status pill instead (built by the page, not this file).
import { useState } from 'react';
import { runCall, withBody, type LmCall } from '@/lib/admin-lumen/safety';
import { showToast } from '@/components/admin/lumen/Toast';

const CALL: LmCall = { method: 'POST', url: '/api/admin/ai/skills' };

export function SkillEnableSwitch({ id, on, label, onText, offText, failedText }: { id: string; on: boolean; label: string; onText: string; offText: string; failedText: string }) {
  const [enabled, setEnabled] = useState(on);
  const [busy, setBusy] = useState(false);

  const flip = async () => {
    if (busy) return;
    const next = !enabled;
    setBusy(true);
    const ok = await runCall(withBody(CALL, { action: 'enable', id, enabled: next }));
    setBusy(false);
    if (!ok) {
      showToast({ text: failedText, tone: 'bad' });
      return;
    }
    setEnabled(next);
    showToast({ text: next ? onText : offText });
  };

  return (
    <button type="button" role="switch" aria-checked={enabled} aria-label={label} className={`lm-sw${enabled ? ' on' : ''}`} onClick={flip} disabled={busy} data-testid={`ai-sk-enable-${id}`}>
      <span aria-hidden="true" />
    </button>
  );
}
