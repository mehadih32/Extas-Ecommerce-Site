'use client';
// PR 936 — AI Center › AI agents: "Keep on when AI is off", six switches for the cheap system checks that must never stop (prototype v5
// m-ai.js renderAgents). They post the whole set to `/api/admin/ai/limits` (`ai.control`, setting `ai.keepOnFeatures`, kept in the settings
// history). A change is reversible, so the toast offers Undo. These switches never let an AI model run while AI is off.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { runCall, withBody, type LmCall } from '@/lib/admin-lumen/safety';
import { showToast } from '@/components/admin/lumen/Toast';

const CALL: LmCall = { method: 'POST', url: '/api/admin/ai/limits' };

export interface KeepOnTexts {
  saved: string;
  failed: string;
}

export function KeepOnFeatures({ value, features, canControl, texts }: { value: Record<string, boolean>; features: { key: string; label: string }[]; canControl: boolean; texts: KeepOnTexts }) {
  const router = useRouter();
  const [on, setOn] = useState<Record<string, boolean>>(value);
  const [busy, setBusy] = useState(false);

  const flip = async (key: string) => {
    if (busy || !canControl) return;
    const prev = on;
    const next = { ...on, [key]: !on[key] };
    setBusy(true);
    const ok = await runCall(withBody(CALL, { keepOn: next }));
    setBusy(false);
    if (!ok) {
      showToast({ text: texts.failed, tone: 'bad' });
      return;
    }
    setOn(next);
    router.refresh();
    showToast({
      text: texts.saved,
      undo: {
        kind: 'setting.switch',
        run: async () => {
          const u = await runCall(withBody(CALL, { keepOn: prev }));
          if (u) {
            setOn(prev);
            router.refresh();
          }
          return u;
        },
      },
    });
  };

  return (
    <div className="ai-kf" data-testid="ai-keepon-features">
      {features.map((f) => (
        <div key={f.key} className="ai-kf-row">
          <span className="a2-sm">{f.label}</span>
          <button type="button" role="switch" aria-checked={Boolean(on[f.key])} aria-label={f.label} className={`lm-sw${on[f.key] ? ' on' : ''}`} onClick={() => void flip(f.key)} disabled={busy || !canControl} data-testid={`ai-kf-${f.key}`}>
            <span aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
