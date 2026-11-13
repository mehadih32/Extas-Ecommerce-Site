'use client';
// S15 · PR 580 (Blueprint C2.4 — "90/95/98% of the best model") — one job's own quality bar, one of three fixed
// options, never a free-typed number (CLAUDE.md rule 1). `POST /api/admin/ai/models {jobKey, barPercent}`
// (`ai.control`), audited server-side, a no-op on a double tap.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { runCall, withBody, type LmCall } from '@/lib/admin-lumen/safety';
import { showToast } from '@/components/admin/lumen/Toast';

const CALL: LmCall = { method: 'POST', url: '/api/admin/ai/models' };

export function QualityBarChips({ jobKey, value, options, label, changedText, failedText }: { jobKey: string; value: number; options: readonly number[]; label: string; changedText: (pct: number) => string; failedText: string }) {
  const router = useRouter();
  const [current, setCurrent] = useState(value);
  const [busy, setBusy] = useState(false);

  const pick = async (pct: number) => {
    if (busy || pct === current) return;
    setBusy(true);
    const ok = await runCall(withBody(CALL, { jobKey, barPercent: pct }));
    setBusy(false);
    if (!ok) {
      showToast({ text: failedText, tone: 'bad' });
      return;
    }
    setCurrent(pct);
    showToast({ text: changedText(pct) });
    router.refresh(); // the bar change moves every candidate's own pass/fail and the job's own suggestion
  };

  return (
    <div className="a2-chips" role="group" aria-label={label} data-testid={`models-bar-${jobKey}`}>
      {options.map((pct) => (
        <button key={pct} type="button" className={`a2-chipt${pct === current ? ' on' : ''}`} aria-pressed={pct === current} disabled={busy} onClick={() => pick(pct)}>
          {pct}%
        </button>
      ))}
    </div>
  );
}
